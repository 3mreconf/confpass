use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};
use once_cell::sync::Lazy;
use axum::{
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use tower_http::cors::{Any, CorsLayer};
use serde_json::json;
use std::time::{SystemTime, UNIX_EPOCH, Duration};
use std::path::PathBuf;
use std::fs;
use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use pbkdf2::pbkdf2_hmac;
use sha2::Sha256;
use std::env;
use rand::RngCore;
use base64::{Engine as _, engine::general_purpose};
use zeroize::{Zeroize, ZeroizeOnDrop};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PasswordEntry {
    pub id: String,
    pub title: String,
    pub username: String,
    pub password: String,
    pub url: Option<String>,
    pub notes: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub category: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultState {
    entries: HashMap<String, PasswordEntry>,
    master_password_hash: Option<String>,
    vault_locked: bool,
    auto_lock_timeout: Option<u64>,
    failed_attempts: u32,
    last_attempt_time: Option<SystemTime>,
    rate_limit_window: Duration,
    encryption_salt: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct VaultData {
    entries: Vec<PasswordEntry>,
    master_password_hash: String,
    encryption_salt: String,
}

#[derive(Debug)]
enum VaultError {
    Locked,
    NotFound,
    InvalidInput(String),
    RateLimited,
    InternalError(String),
}

impl std::fmt::Display for VaultError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            VaultError::Locked => write!(f, "Kasa kilitli"),
            VaultError::NotFound => write!(f, "Kayıt bulunamadı"),
            VaultError::InvalidInput(msg) => write!(f, "Geçersiz giriş: {}", msg),
            VaultError::RateLimited => write!(f, "Çok fazla deneme. Lütfen bekleyin."),
            VaultError::InternalError(msg) => write!(f, "İç hata: {}", msg),
        }
    }
}

fn get_state() -> Result<MutexGuard<'static, VaultState>, VaultError> {
    VAULT_STATE.lock().map_err(|_| VaultError::InternalError("Mutex lock failed".to_string()))
}

fn get_state_mut() -> Result<MutexGuard<'static, VaultState>, VaultError> {
    VAULT_STATE.lock().map_err(|_| VaultError::InternalError("Mutex lock failed".to_string()))
}

fn validate_input(input: &str, min_len: usize, max_len: usize, field_name: &str) -> Result<(), VaultError> {
    let len = input.len();
    if len < min_len {
        return Err(VaultError::InvalidInput(format!("{} en az {} karakter olmalı", field_name, min_len)));
    }
    if len > max_len {
        return Err(VaultError::InvalidInput(format!("{} en fazla {} karakter olabilir", field_name, max_len)));
    }
    Ok(())
}

fn check_rate_limit(state: &mut VaultState) -> Result<(), VaultError> {
    const MAX_ATTEMPTS: u32 = 5;
    
    let now = SystemTime::now();
    
    if let Some(last_attempt) = state.last_attempt_time {
        if let Ok(elapsed) = now.duration_since(last_attempt) {
            if elapsed > state.rate_limit_window {
                state.failed_attempts = 0;
                state.last_attempt_time = None;
            } else if state.failed_attempts >= MAX_ATTEMPTS {
                return Err(VaultError::RateLimited);
            }
        }
    } else if state.failed_attempts >= MAX_ATTEMPTS {
        return Err(VaultError::RateLimited);
    }
    
    Ok(())
}

impl Default for VaultState {
    fn default() -> Self {
        Self {
            entries: HashMap::new(),
            master_password_hash: None,
            vault_locked: true,
            auto_lock_timeout: Some(300),
            failed_attempts: 0,
            last_attempt_time: None,
            rate_limit_window: Duration::from_secs(300),
            encryption_salt: None,
        }
    }
}

static VAULT_STATE: Lazy<Mutex<VaultState>> = Lazy::new(|| {
    Mutex::new(VaultState::default())
});

#[derive(ZeroizeOnDrop)]
struct SecurePassword(String);

impl SecurePassword {
    fn new(password: String) -> Self {
        SecurePassword(password)
    }
    
    fn as_str(&self) -> &str {
        &self.0
    }
}

impl Zeroize for SecurePassword {
    fn zeroize(&mut self) {
        self.0.zeroize();
    }
}

impl Clone for SecurePassword {
    fn clone(&self) -> Self {
        SecurePassword(self.0.clone())
    }
}

static MASTER_PASSWORD: Lazy<Mutex<Option<SecurePassword>>> = Lazy::new(|| Mutex::new(None));

// Global AppHandle for HTTP server to emit events
static APP_HANDLE: Lazy<Mutex<Option<tauri::AppHandle>>> = Lazy::new(|| Mutex::new(None));

fn set_app_handle(handle: tauri::AppHandle) {
    if let Ok(mut app_handle) = APP_HANDLE.lock() {
        *app_handle = Some(handle);
    }
}

fn get_app_handle() -> Option<tauri::AppHandle> {
    APP_HANDLE.lock().ok().and_then(|h| h.clone())
}

fn get_vault_path() -> Result<PathBuf, String> {
    let app_data_dir = if cfg!(windows) {
        env::var("APPDATA")
            .map(PathBuf::from)
            .map_err(|_| "APPDATA environment variable bulunamadı".to_string())?
            .join("ConfPass")
    } else if cfg!(target_os = "macos") {
        let home = env::var("HOME")
            .map_err(|_| "HOME environment variable bulunamadı".to_string())?;
        PathBuf::from(home).join("Library").join("Application Support").join("ConfPass")
    } else {
        let home = env::var("HOME")
            .map_err(|_| "HOME environment variable bulunamadı".to_string())?;
        PathBuf::from(home).join(".config").join("confpass")
    };
    
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Directory oluşturulamadı: {}", e))?;
    Ok(app_data_dir.join("vault.dat"))
}

fn derive_encryption_key(master_password: &str, salt: &[u8]) -> [u8; 32] {
    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(master_password.as_bytes(), salt, 100000, &mut key);
    key
}

fn encrypt_vault_data(data: &str, master_password: &str, salt: &[u8]) -> Result<String, String> {
    let key = derive_encryption_key(master_password, salt);
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("Cipher oluşturulamadı: {}", e))?;
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    
    let ciphertext = cipher.encrypt(&nonce, data.as_bytes())
        .map_err(|e| format!("Şifreleme hatası: {}", e))?;
    
    let mut encrypted = nonce.to_vec();
    encrypted.extend_from_slice(&ciphertext);
    
    Ok(general_purpose::STANDARD.encode(&encrypted))
}

fn decrypt_vault_data(encrypted_data: &str, master_password: &str, salt: &[u8]) -> Result<String, String> {
    let encrypted_bytes = match general_purpose::STANDARD.decode(encrypted_data) {
        Ok(bytes) => bytes,
        Err(e) => return Err(format!("Base64 decode hatası: {}", e)),
    };
    
    if encrypted_bytes.len() < 12 {
        return Err("Geçersiz şifreli veri uzunluğu".to_string());
    }
    
    let nonce = Nonce::from_slice(&encrypted_bytes[..12]);
    let ciphertext = &encrypted_bytes[12..];
    
    let key = derive_encryption_key(master_password, salt);
    let cipher = match Aes256Gcm::new_from_slice(&key) {
        Ok(c) => c,
        Err(e) => return Err(format!("Cipher oluşturulamadı: {}", e)),
    };
    
    let plaintext = match cipher.decrypt(nonce, ciphertext) {
        Ok(pt) => pt,
        Err(_) => return Err("Decrypt hatası: Yanlış şifre veya bozuk veri".to_string()),
    };
    
    match String::from_utf8(plaintext) {
        Ok(s) => Ok(s),
        Err(e) => Err(format!("UTF-8 decode hatası: {}", e)),
    }
}

fn save_vault_to_disk(state: &VaultState, master_password: &str) -> Result<(), String> {
    let vault_path = get_vault_path()?;
    let vault_dir = vault_path.parent()
        .ok_or_else(|| "Vault path parent bulunamadı".to_string())?;
    
    fs::create_dir_all(&vault_dir)
        .map_err(|e| format!("Vault dizini oluşturulamadı: {}", e))?;
    
    let salt_path = vault_dir.join("vault.salt");
    
    let salt = if let Some(ref stored_salt) = state.encryption_salt {
        general_purpose::STANDARD.decode(stored_salt)
            .map_err(|e| format!("Salt decode hatası: {}", e))?
    } else {
        let mut new_salt = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut new_salt);
        let salt_b64 = general_purpose::STANDARD.encode(&new_salt);
        
        fs::write(&salt_path, &salt_b64)
            .map_err(|e| format!("Salt dosyası yazılamadı: {}", e))?;
        
        new_salt.to_vec()
    };
    
    if !salt_path.exists() {
        let salt_b64 = general_purpose::STANDARD.encode(&salt);
        fs::write(&salt_path, &salt_b64)
            .map_err(|e| format!("Salt dosyası yazılamadı: {}", e))?;
    }
    
    let entries_vec: Vec<PasswordEntry> = state.entries.values().cloned().collect();
    let vault_data = VaultData {
        entries: entries_vec,
        master_password_hash: state.master_password_hash.clone()
            .ok_or_else(|| "Master password hash bulunamadı".to_string())?,
        encryption_salt: general_purpose::STANDARD.encode(&salt),
    };
    
    let json_data = serde_json::to_string(&vault_data)
        .map_err(|e| format!("JSON serialize hatası: {}", e))?;
    
    let encrypted = encrypt_vault_data(&json_data, master_password, &salt)?;
    
    use std::fs::File;
    use std::io::Write;
    let mut file = File::create(&vault_path)
        .map_err(|e| format!("Dosya açma hatası: {} (Path: {:?})", e, vault_path))?;
    file.write_all(encrypted.as_bytes())
        .map_err(|e| format!("Dosya yazma hatası: {}", e))?;
    file.sync_all()
        .map_err(|e| format!("Dosya senkronizasyon hatası: {}", e))?;
    
    Ok(())
}

fn load_vault_from_disk(master_password: &str) -> Result<VaultState, String> {
    let vault_path = match get_vault_path() {
        Ok(p) => p,
        Err(e) => return Err(format!("Vault path hatası: {}", e)),
    };
    
    if !vault_path.exists() {
        return Err("Vault dosyası bulunamadı".to_string());
    }
    
    let salt_path = match vault_path.parent() {
        Some(p) => p.join("vault.salt"),
        None => return Err("Vault path parent bulunamadı".to_string()),
    };
    
    let salt = if salt_path.exists() {
        let salt_b64 = match fs::read_to_string(&salt_path) {
            Ok(s) => s,
            Err(e) => return Err(format!("Salt dosyası okunamadı: {}", e)),
        };
        match general_purpose::STANDARD.decode(&salt_b64.trim()) {
            Ok(s) => s,
            Err(e) => return Err(format!("Salt decode hatası: {}", e)),
        }
    } else {
        return Ok(VaultState::default());
    };
    
    if salt.len() != 32 {
        return Err("Geçersiz salt uzunluğu".to_string());
    }
    
    let encrypted_data = match fs::read_to_string(&vault_path) {
        Ok(d) => d,
        Err(e) => return Err(format!("Dosya okuma hatası: {}", e)),
    };
    
    if encrypted_data.trim().is_empty() {
        return Err("Vault dosyası boş".to_string());
    }
    
    let decrypted_json = match decrypt_vault_data(&encrypted_data, master_password, &salt) {
        Ok(d) => d,
        Err(e) => return Err(format!("Decrypt hatası: {}", e)),
    };
    
    let vault_data: VaultData = match serde_json::from_str(&decrypted_json) {
        Ok(d) => d,
        Err(e) => return Err(format!("JSON parse hatası: {}", e)),
    };
    
    let mut entries = HashMap::with_capacity(vault_data.entries.len());
    for entry in vault_data.entries {
        entries.insert(entry.id.clone(), entry);
    }
    
    Ok(VaultState {
        entries,
        master_password_hash: Some(vault_data.master_password_hash),
        vault_locked: true,
        auto_lock_timeout: Some(300),
        failed_attempts: 0,
        last_attempt_time: None,
        rate_limit_window: Duration::from_secs(300),
        encryption_salt: Some(general_purpose::STANDARD.encode(&salt)),
    })
}

#[tauri::command]
fn unlock_vault(mut master_password: String) -> Result<bool, String> {
    validate_input(&master_password, 8, 128, "Ana şifre").map_err(|e| e.to_string())?;
    
    let vault_path = get_vault_path()?;
    let vault_exists = vault_path.exists();
    
    if !vault_exists {
        let mut state = get_state_mut().map_err(|e| e.to_string())?;
        
        check_rate_limit(&mut state).map_err(|e| e.to_string())?;
        
        use argon2::password_hash::{PasswordHasher, SaltString};
        use argon2::Argon2;
        use rand::rngs::OsRng;
        
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();
        let hash = argon2
            .hash_password(master_password.as_bytes(), &salt)
            .map_err(|e| format!("Hash error: {}", e))?;
        
        state.master_password_hash = Some(hash.to_string());
        state.vault_locked = false;
        state.failed_attempts = 0;
        state.last_attempt_time = None;
        
        {
            let mut master_pwd = MASTER_PASSWORD.lock().unwrap();
            *master_pwd = Some(SecurePassword::new(master_password.clone()));
        }
        
        let state_snapshot = VaultState {
            entries: state.entries.clone(),
            master_password_hash: state.master_password_hash.clone(),
            vault_locked: state.vault_locked,
            auto_lock_timeout: state.auto_lock_timeout,
            failed_attempts: state.failed_attempts,
            last_attempt_time: state.last_attempt_time,
            rate_limit_window: state.rate_limit_window,
            encryption_salt: state.encryption_salt.clone(),
        };
        drop(state);
        
        save_vault_to_disk(&state_snapshot, &master_password)?;

        // [SÜPER YAMA] İlk kurulumda da şifreyi kaydet
        #[cfg(windows)]
        {
            if let Ok(entry) = keyring::Entry::new("ConfPass", "master_password") {
                let _ = entry.set_password(&master_password);
            }
        }

        master_password.zeroize();
        return Ok(true);
    }
    
    let loaded_state = match load_vault_from_disk(&master_password) {
        Ok(state) => state,
        Err(e) => {
            let mut state = get_state_mut().map_err(|e| e.to_string())?;
            if e.contains("Decrypt hatası") || e.contains("decrypt") || e.contains("Şifre çözme") || e.contains("decrypt") {
                state.failed_attempts += 1;
                state.last_attempt_time = Some(SystemTime::now());
                return Err("Yanlış ana şifre".to_string());
            }
            state.failed_attempts += 1;
            state.last_attempt_time = Some(SystemTime::now());
            return Err(format!("Vault yüklenemedi: {}", e));
        }
    };
    
    let mut state = get_state_mut().map_err(|e| e.to_string())?;
    check_rate_limit(&mut state).map_err(|e| e.to_string())?;
    
    use argon2::password_hash::{PasswordHash, PasswordVerifier};
    use argon2::Argon2;
    
    let stored_hash = loaded_state.master_password_hash.as_ref()
        .ok_or_else(|| {
            state.failed_attempts += 1;
            state.last_attempt_time = Some(SystemTime::now());
            "Hash bulunamadı".to_string()
        })?;
    
    let parsed_hash = match PasswordHash::new(stored_hash) {
        Ok(h) => h,
        Err(e) => {
            state.failed_attempts += 1;
            state.last_attempt_time = Some(SystemTime::now());
            return Err(format!("Hash parse hatası: {}", e));
        }
    };
    
    let argon2 = Argon2::default();
    match argon2.verify_password(master_password.as_bytes(), &parsed_hash) {
        Ok(()) => {
            state.entries = loaded_state.entries;
            state.master_password_hash = loaded_state.master_password_hash;
            state.encryption_salt = loaded_state.encryption_salt;
            state.vault_locked = false;
            state.failed_attempts = 0;
            state.last_attempt_time = None;
            
            drop(state);

            // [SÜPER YAMA] Şifre doğrulandığı an Windows Kasasına yaz
            #[cfg(windows)]
            {
                match keyring::Entry::new("ConfPass", "master_password") {
                    Ok(entry) => {
                        println!("[DEBUG] Windows Kasasına yazılıyor...");
                        if let Err(e) = entry.set_password(&master_password) {
                            eprintln!("[ERROR] Windows Kasasına yazılamadı: {}", e);
                        } else {
                            println!("[SUCCESS] Windows Kasasına yazıldı!");
                        }
                    },
                    Err(e) => eprintln!("[ERROR] Keyring girişi oluşturulamadı: {}", e),
                }
            }

            {
                let mut master_pwd = MASTER_PASSWORD.lock().unwrap();
                *master_pwd = Some(SecurePassword::new(master_password.clone()));
            }
            master_password.zeroize();
            
            Ok(true)
        }
        Err(_) => {
            state.failed_attempts += 1;
            state.last_attempt_time = Some(SystemTime::now());
            Err("Yanlış ana şifre".to_string())
        }
    }
}

#[tauri::command]
fn lock_vault() -> Result<(), String> {
    let mut state = get_state_mut().map_err(|e| e.to_string())?;
    
    let master_pwd = MASTER_PASSWORD.lock()
        .map_err(|_| "Master password lock hatası".to_string())?;
    
    if let Some(ref pwd) = *master_pwd {
        save_vault_to_disk(&state, pwd.as_str())
            .map_err(|e| format!("Kilitlenmeden önce kaydetme hatası: {}", e))?;
    }
    drop(master_pwd);
    
    state.vault_locked = true;
    
    {
        let mut master_pwd = MASTER_PASSWORD.lock().unwrap();
        if let Some(mut pwd) = master_pwd.take() {
            pwd.zeroize();
        }
    }
    
    Ok(())
}

#[tauri::command]
fn is_vault_locked() -> Result<bool, String> {
    let vault_path = get_vault_path()?;
    if !vault_path.exists() {
        return Ok(true);
    }
    
    let master_pwd = MASTER_PASSWORD.lock().map_err(|_| "Lock hatası".to_string())?;
    if master_pwd.is_none() {
        return Ok(true);
    }
    
    let state = get_state().map_err(|e| e.to_string())?;
    Ok(state.vault_locked)
}

#[tauri::command]
fn add_password_entry(
    title: String,
    username: String,
    password: String,
    url: Option<String>,
    notes: Option<String>,
    category: String,
) -> Result<PasswordEntry, String> {
    let mut state = get_state_mut().map_err(|e| e.to_string())?;
    
    if state.vault_locked {
        return Err(VaultError::Locked.to_string());
    }
    
    validate_input(&title, 1, 200, "Başlık").map_err(|e| e.to_string())?;
    
    const VALID_CATEGORIES: &[&str] = &["accounts", "bank_cards", "documents", "addresses", "notes", "passkeys", "authenticator"];
    if !VALID_CATEGORIES.contains(&category.as_str()) {
        return Err("Geçersiz kategori".to_string());
    }
    
    if category != "notes" && category != "passkeys" && category != "authenticator" && category != "addresses" && category != "documents" {
        validate_input(&username, 1, 200, "Kullanıcı adı").map_err(|e| e.to_string())?;
        validate_input(&password, 1, 500, "Şifre").map_err(|e| e.to_string())?;
    }
    
    if let Some(ref url_str) = url {
        if !url_str.is_empty() {
            if !url_str.starts_with("http://") && !url_str.starts_with("https://") {
                return Err("URL http:// veya https:// ile başlamalı".to_string());
            }
            validate_input(url_str, 1, 500, "URL").map_err(|e| e.to_string())?;
        }
    }
    
    if let Some(ref notes_str) = notes {
        validate_input(notes_str, 0, 5000, "Notlar").map_err(|e| e.to_string())?;
    }
    
    let id = format!("entry_{}", uuid::Uuid::new_v4());
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("Time error: {}", e))?
        .as_secs() as i64;
    
    let entry = PasswordEntry {
        id: id.clone(),
        title: title.trim().to_string(),
        username: username.trim().to_string(),
        password,
        url: url.map(|u| u.trim().to_string()).filter(|u| !u.is_empty()),
        notes: notes.map(|n| n.trim().to_string()).filter(|n| !n.is_empty()),
        created_at: now,
        updated_at: now,
        category,
    };
    
    let entry_clone = entry.clone();
    state.entries.insert(id, entry);
    
    let pwd_string = {
        let master_pwd = MASTER_PASSWORD.lock()
            .map_err(|_| "Master password lock hatası".to_string())?;
        
        let pwd = master_pwd.as_ref()
            .ok_or_else(|| "Master password bulunamadı. Lütfen kasa kilidini açın.".to_string())?;
        
        pwd.as_str().to_string()
    };
    
    save_vault_to_disk(&state, &pwd_string)
        .map_err(|e| format!("Kayıt kaydedilemedi: {}", e))?;
    
    Ok(entry_clone)
}

#[tauri::command]
fn get_password_entries() -> Result<Vec<PasswordEntry>, String> {
    let state = get_state().map_err(|e| e.to_string())?;
    
    if state.vault_locked {
        return Err(VaultError::Locked.to_string());
    }
    
    let mut entries: Vec<PasswordEntry> = state.entries.values().cloned().collect();
    entries.sort_unstable_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(entries)
}

#[tauri::command]
fn get_password_entry(id: String) -> Result<PasswordEntry, String> {
    let state = get_state().map_err(|e| e.to_string())?;
    
    if state.vault_locked {
        return Err(VaultError::Locked.to_string());
    }
    
    state.entries
        .get(&id)
        .cloned()
        .ok_or_else(|| VaultError::NotFound.to_string())
}

#[tauri::command]
fn update_password_entry(
    id: String,
    title: Option<String>,
    username: Option<String>,
    password: Option<String>,
    url: Option<String>,
    notes: Option<String>,
    category: Option<String>,
) -> Result<PasswordEntry, String> {
    let mut state = get_state_mut().map_err(|e| e.to_string())?;
    
    if state.vault_locked {
        return Err(VaultError::Locked.to_string());
    }
    
    let entry = state.entries.get_mut(&id)
        .ok_or_else(|| VaultError::NotFound.to_string())?;
    
    if let Some(t) = title {
        validate_input(&t, 1, 200, "Başlık").map_err(|e| e.to_string())?;
        entry.title = t.trim().to_string();
    }
    if let Some(u) = username {
        if entry.category != "notes" && entry.category != "passkeys" && entry.category != "authenticator" && entry.category != "addresses" && entry.category != "documents" {
            validate_input(&u, 1, 200, "Kullanıcı adı").map_err(|e| e.to_string())?;
        }
        entry.username = u.trim().to_string();
    }
    if let Some(p) = password {
        if entry.category != "notes" && entry.category != "passkeys" && entry.category != "authenticator" && entry.category != "addresses" && entry.category != "documents" {
            validate_input(&p, 1, 500, "Şifre").map_err(|e| e.to_string())?;
        }
        entry.password = p;
    }
    if let Some(u) = url {
        if !u.trim().is_empty() {
            if !u.trim().starts_with("http://") && !u.trim().starts_with("https://") {
                return Err("URL http:// veya https:// ile başlamalı".to_string());
            }
            validate_input(&u, 1, 500, "URL").map_err(|e| e.to_string())?;
            entry.url = Some(u.trim().to_string());
        } else {
            entry.url = None;
        }
    }
    if let Some(n) = notes {
        if !n.trim().is_empty() {
            validate_input(&n, 0, 5000, "Notlar").map_err(|e| e.to_string())?;
            entry.notes = Some(n.trim().to_string());
        } else {
            entry.notes = None;
        }
    }
    if let Some(c) = category {
        const VALID_CATEGORIES: &[&str] = &["accounts", "bank_cards", "documents", "addresses", "notes", "passkeys", "authenticator"];
        if !VALID_CATEGORIES.contains(&c.as_str()) {
            return Err("Geçersiz kategori".to_string());
        }
        entry.category = c;
    }
    
    entry.updated_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("Time error: {}", e))?
        .as_secs() as i64;
    
    let entry_clone = entry.clone();
    
    let pwd_string = {
        let master_pwd = MASTER_PASSWORD.lock()
            .map_err(|_| "Master password lock hatası".to_string())?;
        
        let pwd = master_pwd.as_ref()
            .ok_or_else(|| "Master password bulunamadı. Lütfen kasa kilidini açın.".to_string())?;
        
        pwd.as_str().to_string()
    };
    
    save_vault_to_disk(&state, &pwd_string)
        .map_err(|e| format!("Güncelleme kaydedilemedi: {}", e))?;
    
    Ok(entry_clone)
}

#[tauri::command]
fn delete_password_entry(id: String) -> Result<(), String> {
    let mut state = get_state_mut().map_err(|e| e.to_string())?;
    
    if state.vault_locked {
        return Err(VaultError::Locked.to_string());
    }
    
    state.entries.remove(&id)
        .ok_or_else(|| VaultError::NotFound.to_string())?;
    
    let pwd_string = {
        let master_pwd = MASTER_PASSWORD.lock()
            .map_err(|_| "Master password lock hatası".to_string())?;
        
        let pwd = master_pwd.as_ref()
            .ok_or_else(|| "Master password bulunamadı. Lütfen kasa kilidini açın.".to_string())?;
        
        pwd.as_str().to_string()
    };
    
    save_vault_to_disk(&state, &pwd_string)
        .map_err(|e| format!("Silme işlemi kaydedilemedi: {}", e))?;

    Ok(())
}

#[tauri::command]
fn soft_delete_authenticator(id: String) -> Result<(), String> {
    let mut state = get_state_mut().map_err(|e| e.to_string())?;

    if state.vault_locked {
        return Err(VaultError::Locked.to_string());
    }

    let entry = state.entries.get_mut(&id)
        .ok_or_else(|| VaultError::NotFound.to_string())?;

    // Move to trash by changing category
    if entry.category == "authenticator" {
        entry.category = "authenticator_trash".to_string();
    } else {
        return Err("Bu giriş bir kimlik doğrulayıcı değil".to_string());
    }

    let pwd_string = {
        let master_pwd = MASTER_PASSWORD.lock()
            .map_err(|_| "Master password lock hatası".to_string())?;

        let pwd = master_pwd.as_ref()
            .ok_or_else(|| "Master password bulunamadı".to_string())?;

        pwd.as_str().to_string()
    };

    save_vault_to_disk(&state, &pwd_string)
        .map_err(|e| format!("İşlem kaydedilemedi: {}", e))?;

    Ok(())
}

#[tauri::command]
fn restore_authenticator(id: String) -> Result<(), String> {
    let mut state = get_state_mut().map_err(|e| e.to_string())?;

    if state.vault_locked {
        return Err(VaultError::Locked.to_string());
    }

    let entry = state.entries.get_mut(&id)
        .ok_or_else(|| VaultError::NotFound.to_string())?;

    // Restore from trash
    if entry.category == "authenticator_trash" {
        entry.category = "authenticator".to_string();
    } else {
        return Err("Bu giriş çöp kutusunda değil".to_string());
    }

    let pwd_string = {
        let master_pwd = MASTER_PASSWORD.lock()
            .map_err(|_| "Master password lock hatası".to_string())?;

        let pwd = master_pwd.as_ref()
            .ok_or_else(|| "Master password bulunamadı".to_string())?;

        pwd.as_str().to_string()
    };

    save_vault_to_disk(&state, &pwd_string)
        .map_err(|e| format!("İşlem kaydedilemedi: {}", e))?;

    Ok(())
}

#[tauri::command]
fn permanently_delete_authenticator(id: String) -> Result<(), String> {
    let mut state = get_state_mut().map_err(|e| e.to_string())?;

    if state.vault_locked {
        return Err(VaultError::Locked.to_string());
    }

    // Only allow permanent deletion from trash
    let entry = state.entries.get(&id)
        .ok_or_else(|| VaultError::NotFound.to_string())?;

    if entry.category != "authenticator_trash" {
        return Err("Kalıcı silme sadece çöp kutusundan yapılabilir".to_string());
    }

    state.entries.remove(&id);

    let pwd_string = {
        let master_pwd = MASTER_PASSWORD.lock()
            .map_err(|_| "Master password lock hatası".to_string())?;

        let pwd = master_pwd.as_ref()
            .ok_or_else(|| "Master password bulunamadı".to_string())?;

        pwd.as_str().to_string()
    };

    save_vault_to_disk(&state, &pwd_string)
        .map_err(|e| format!("Silme işlemi kaydedilemedi: {}", e))?;

    Ok(())
}

#[tauri::command]
fn soft_delete_passkey(id: String) -> Result<(), String> {
    let mut state = get_state_mut().map_err(|e| e.to_string())?;

    if state.vault_locked {
        return Err(VaultError::Locked.to_string());
    }

    let entry = state.entries.get_mut(&id)
        .ok_or_else(|| VaultError::NotFound.to_string())?;

    // Move to trash by changing category
    if entry.category == "passkeys" {
        entry.category = "passkeys_trash".to_string();
    } else {
        return Err("Bu giriş bir geçiş anahtarı değil".to_string());
    }

    let pwd_string = {
        let master_pwd = MASTER_PASSWORD.lock()
            .map_err(|_| "Master password lock hatası".to_string())?;

        let pwd = master_pwd.as_ref()
            .ok_or_else(|| "Master password bulunamadı".to_string())?;

        pwd.as_str().to_string()
    };

    save_vault_to_disk(&state, &pwd_string)
        .map_err(|e| format!("İşlem kaydedilemedi: {}", e))?;

    Ok(())
}

#[tauri::command]
fn restore_passkey(id: String) -> Result<(), String> {
    let mut state = get_state_mut().map_err(|e| e.to_string())?;

    if state.vault_locked {
        return Err(VaultError::Locked.to_string());
    }

    let entry = state.entries.get_mut(&id)
        .ok_or_else(|| VaultError::NotFound.to_string())?;

    // Restore from trash
    if entry.category == "passkeys_trash" {
        entry.category = "passkeys".to_string();
    } else {
        return Err("Bu giriş çöp kutusunda değil".to_string());
    }

    let pwd_string = {
        let master_pwd = MASTER_PASSWORD.lock()
            .map_err(|_| "Master password lock hatası".to_string())?;

        let pwd = master_pwd.as_ref()
            .ok_or_else(|| "Master password bulunamadı".to_string())?;

        pwd.as_str().to_string()
    };

    save_vault_to_disk(&state, &pwd_string)
        .map_err(|e| format!("İşlem kaydedilemedi: {}", e))?;

    Ok(())
}

#[tauri::command]
fn permanently_delete_passkey(id: String) -> Result<(), String> {
    let mut state = get_state_mut().map_err(|e| e.to_string())?;

    if state.vault_locked {
        return Err(VaultError::Locked.to_string());
    }

    // Only allow permanent deletion from trash
    let entry = state.entries.get(&id)
        .ok_or_else(|| VaultError::NotFound.to_string())?;

    if entry.category != "passkeys_trash" {
        return Err("Kalıcı silme sadece çöp kutusundan yapılabilir".to_string());
    }

    state.entries.remove(&id);

    let pwd_string = {
        let master_pwd = MASTER_PASSWORD.lock()
            .map_err(|_| "Master password lock hatası".to_string())?;

        let pwd = master_pwd.as_ref()
            .ok_or_else(|| "Master password bulunamadı".to_string())?;

        pwd.as_str().to_string()
    };

    save_vault_to_disk(&state, &pwd_string)
        .map_err(|e| format!("Silme işlemi kaydedilemedi: {}", e))?;

    Ok(())
}

#[tauri::command]
fn generate_password(
    length: u32,
    include_uppercase: bool,
    include_lowercase: bool,
    include_numbers: bool,
    include_symbols: bool,
) -> Result<String, String> {
    let charset = {
        let mut chars = String::with_capacity(100);
        if include_lowercase {
            chars.push_str("abcdefghijklmnopqrstuvwxyz");
        }
        if include_uppercase {
            chars.push_str("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
        }
        if include_numbers {
            chars.push_str("0123456789");
        }
        if include_symbols {
            chars.push_str("!@#$%^&*()_+-=[]{}|;:,.<>?");
        }
        
        if chars.is_empty() {
            return Err("At least one character type must be selected".to_string());
        }
        
        chars
    };
    
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let charset_bytes = charset.as_bytes();
    let password: String = (0..length)
        .map(|_| {
            let idx = rng.gen_range(0..charset_bytes.len());
            charset_bytes[idx] as char
        })
        .collect();
    
    Ok(password)
}

#[tauri::command]
fn check_password_strength(password: String) -> Result<serde_json::Value, String> {
    let mut score = 0;
    let mut feedback = Vec::with_capacity(5);
    let len = password.len();
    let mut has_uppercase = false;
    let mut has_lowercase = false;
    let mut has_numeric = false;
    let mut has_symbol = false;
    
    for ch in password.chars() {
        if ch.is_uppercase() {
            has_uppercase = true;
        }
        if ch.is_lowercase() {
            has_lowercase = true;
        }
        if ch.is_numeric() {
            has_numeric = true;
        }
        if "!@#$%^&*()_+-=[]{}|;:,.<>?".contains(ch) {
            has_symbol = true;
        }
    }
    
    if len >= 8 {
        score += 1;
    } else {
        feedback.push("Password should be at least 8 characters long".to_string());
    }
    
    if has_uppercase {
        score += 1;
    } else {
        feedback.push("Add uppercase letters".to_string());
    }
    
    if has_lowercase {
        score += 1;
    } else {
        feedback.push("Add lowercase letters".to_string());
    }
    
    if has_numeric {
        score += 1;
    } else {
        feedback.push("Add numbers".to_string());
    }
    
    if has_symbol {
        score += 1;
    } else {
        feedback.push("Add special characters".to_string());
    }
    
    if len >= 12 {
        score += 1;
    }
    
    let strength = match score {
        0..=2 => "Zayıf",
        3..=4 => "Orta",
        5..=6 => "Güçlü",
        _ => "Çok Güçlü",
    };
    
    Ok(serde_json::json!({
        "score": score,
        "strength": strength,
        "feedback": feedback
    }))
}

#[tauri::command]
fn find_password_by_url(url: String) -> Result<Option<PasswordEntry>, String> {
    let state = get_state().map_err(|e| e.to_string())?;
    
    if state.vault_locked {
        return Err(VaultError::Locked.to_string());
    }
    
    if url.trim().is_empty() {
        return Err(VaultError::InvalidInput("URL boş olamaz".to_string()).to_string());
    }
    
    let url_lower = url.trim().to_lowercase();
    let url_domain = extract_domain(&url_lower);
    
    let matching_entry = state.entries.values()
        .find(|entry| {
            entry.url.as_ref().map_or(false, |entry_url| {
                let entry_url_lower = entry_url.to_lowercase();
                entry_url_lower.contains(&url_lower) || 
                url_domain.as_ref().map_or(false, |domain| entry_url_lower.contains(domain))
            })
        });
    
    Ok(matching_entry.cloned())
}

fn extract_domain(url: &str) -> Option<String> {
    url.strip_prefix("http://")
        .or_else(|| url.strip_prefix("https://"))
        .or_else(|| url.strip_prefix("www."))
        .and_then(|s| s.split('/').next())
        .map(|s| s.to_lowercase())
}

#[tauri::command]
fn export_vault() -> Result<String, String> {
    let state = get_state().map_err(|e| e.to_string())?;
    
    if state.vault_locked {
        return Err(VaultError::Locked.to_string());
    }
    
    let entries: Vec<&PasswordEntry> = state.entries.values().collect();
    let export_data = serde_json::json!({
        "version": "1.0",
        "exported_at": SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| format!("Time error: {}", e))?
            .as_secs(),
        "entry_count": entries.len(),
        "entries": entries
    });
    
    serde_json::to_string_pretty(&export_data)
        .map_err(|e| format!("Export error: {}", e))
}

#[tauri::command]
fn import_vault(json_data: String) -> Result<u32, String> {
    let mut state = get_state_mut().map_err(|e| e.to_string())?;
    
    if state.vault_locked {
        return Err(VaultError::Locked.to_string());
    }
    
    if json_data.trim().is_empty() {
        return Err(VaultError::InvalidInput("Import data boş olamaz".to_string()).to_string());
    }
    
    let parsed: serde_json::Value = serde_json::from_str(&json_data)
        .map_err(|e| format!("JSON parse error: {}", e))?;
    
    let entries: Vec<PasswordEntry> = if let Some(entries_array) = parsed.get("entries") {
        serde_json::from_value(entries_array.clone())
            .map_err(|e| format!("Entries parse error: {}", e))?
    } else if parsed.is_array() {
        serde_json::from_value(parsed)
            .map_err(|e| format!("Array parse error: {}", e))?
    } else {
        return Err("Geçersiz import formatı".to_string());
    };
    
    let mut imported_count = 0;
    let mut skipped_count = 0;
    
    for entry in entries {
        if entry.id.trim().is_empty() {
            skipped_count += 1;
            continue;
        }
        
        if state.entries.contains_key(&entry.id) {
            skipped_count += 1;
            continue;
        }
        
        if entry.title.trim().is_empty() || entry.username.trim().is_empty() {
            skipped_count += 1;
            continue;
        }
        
        state.entries.insert(entry.id.clone(), entry);
        imported_count += 1;
    }
    
    if imported_count == 0 && skipped_count > 0 {
        return Err(format!("Hiçbir kayıt import edilemedi. {} kayıt atlandı.", skipped_count));
    }
    
    if let Ok(master_pwd) = MASTER_PASSWORD.lock() {
        if let Some(ref pwd) = *master_pwd {
            if let Err(e) = save_vault_to_disk(&state, pwd.as_str()) {
                eprintln!("Import sonrası kaydetme hatası: {}", e);
            }
        }
    }
    
    Ok(imported_count)
}

async fn start_http_server() {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let router = Router::new()
        .route("/ping", get(|| async { Json(json!({"status": "ok"})) }))
        .route("/get_password", post(get_password_handler))
        .route("/save_password", post(save_password_handler))
        .route("/passkey_detected", post(passkey_detected_handler))
        .route("/save_passkey", post(save_passkey_handler))
        .route("/get_passkeys", post(get_passkeys_handler))
        .route("/update_passkey_counter", post(update_passkey_counter_handler))
        .route("/focus_window", post(focus_window_handler))
        .route("/get_passwords_for_site", post(get_passwords_for_site_handler))
        .route("/get_totp_code", post(get_totp_code_handler))
        .layer(cors);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:1421").await;
    if let Ok(listener) = listener {
        let _ = axum::serve(listener, router).await;
    }
}

async fn get_password_handler(
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let url = match payload.get("url").and_then(|v| v.as_str()) {
        Some(u) if !u.trim().is_empty() => u.to_string(),
        _ => return Err(StatusCode::BAD_REQUEST),
    };
    
    let result = tokio::task::spawn_blocking(move || {
        let state = match get_state() {
            Ok(s) => s,
            Err(_) => return Err("State access error"),
        };
        
        if state.vault_locked {
            return Err("Vault is locked");
        }
        
        let url_lower = url.trim().to_lowercase();
        let url_domain = extract_domain(&url_lower);
        
        let matching_entry = state.entries.values()
            .find(|entry| {
                entry.url.as_ref().map_or(false, |entry_url| {
                    let entry_url_lower = entry_url.to_lowercase();
                    entry_url_lower.contains(&url_lower) || 
                    url_domain.as_ref().map_or(false, |domain| entry_url_lower.contains(domain))
                })
            });
        
        if let Some(entry) = matching_entry {
            return Ok(json!({
                "username": entry.username,
                "password": entry.password,
                "title": entry.title
            }));
        }
        
        Err("No matching entry found")
    }).await;
    
    match result {
        Ok(Ok(data)) => Ok(Json(json!({"success": true, "data": data}))),
        Ok(Err(msg)) => Ok(Json(json!({"success": false, "error": msg}))),
        Err(e) => {
            eprintln!("Task error: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn save_password_handler(
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let result = tokio::task::spawn_blocking(move || {
        let mut state = match get_state_mut() {
            Ok(s) => s,
            Err(e) => return Err(e.to_string()),
        };
        
        if state.vault_locked {
            return Err("Kasa kilitli".to_string());
        }
        
        let url = payload.get("url").and_then(|v| v.as_str()).unwrap_or("").trim();
        let username = payload.get("username").and_then(|v| v.as_str()).unwrap_or("").trim();
        let password = payload.get("password").and_then(|v| v.as_str()).unwrap_or("");
        let title = payload.get("title").and_then(|v| v.as_str()).unwrap_or("Web Site").trim();
        
        if username.is_empty() {
            return Err("Kullanıcı adı gerekli".to_string());
        }
        
        if password.is_empty() {
            return Err("Şifre gerekli".to_string());
        }
        
        if let Err(e) = validate_input(username, 1, 200, "Kullanıcı adı") {
            return Err(e.to_string());
        }
        
        if let Err(e) = validate_input(password, 1, 500, "Şifre") {
            return Err(e.to_string());
        }
        
        if !url.is_empty() {
            if !url.starts_with("http://") && !url.starts_with("https://") {
                return Err("URL http:// veya https:// ile başlamalı".to_string());
            }
            if let Err(e) = validate_input(url, 1, 500, "URL") {
                return Err(e.to_string());
            }
        }
        
        let id = format!("entry_{}", uuid::Uuid::new_v4());
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| format!("Time error: {}", e))?
            .as_secs() as i64;
        
        let entry = PasswordEntry {
            id: id.clone(),
            title: title.to_string(),
            username: username.to_string(),
            password: password.to_string(),
            url: if url.is_empty() { None } else { Some(url.to_string()) },
            notes: None,
            created_at: now,
            updated_at: now,
            category: "accounts".to_string(),
        };
        
        state.entries.insert(id, entry);
        
        let pwd_string = {
            let master_pwd = MASTER_PASSWORD.lock()
                .map_err(|_| "Master password lock hatası".to_string())?;
            
            let pwd = master_pwd.as_ref()
                .ok_or_else(|| "Master password bulunamadı. Lütfen kasa kilidini açın.".to_string())?;
            
            pwd.as_str().to_string()
        };
        
        save_vault_to_disk(&state, &pwd_string)
            .map_err(|e| format!("Browser extension kaydetme hatası: {}", e))?;
        
        Ok(())
    }).await;
    
    match result {
        Ok(Ok(_)) => Ok(Json(json!({"success": true}))),
        Ok(Err(msg)) => Ok(Json(json!({"success": false, "error": msg}))),
        Err(e) => {
            eprintln!("Task error: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn passkey_detected_handler(
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    use tauri::Emitter;

    eprintln!("[Passkey HTTP] Received passkey detection: {:?}", payload);

    let action = payload.get("action").and_then(|v| v.as_str()).unwrap_or("");
    let rp_id = payload.get("rpId").and_then(|v| v.as_str()).unwrap_or("");
    let rp_name = payload.get("rpName").and_then(|v| v.as_str()).unwrap_or("");
    let user_name = payload.get("userName").and_then(|v| v.as_str()).unwrap_or("");
    let user_display_name = payload.get("userDisplayName").and_then(|v| v.as_str()).unwrap_or("");
    let credential_id = payload.get("credentialId").and_then(|v| v.as_str()).unwrap_or("");
    let url = payload.get("url").and_then(|v| v.as_str()).unwrap_or("");

    // Only process "created" actions (new passkey registration), not "used" (login)
    if action != "created" {
        eprintln!("[Passkey HTTP] Ignoring action '{}' (only 'created' is processed)", action);
        return Ok(Json(json!({"success": true, "message": "Action ignored (not a creation)"})));
    }

    if rp_id.is_empty() || user_name.is_empty() {
        eprintln!("[Passkey HTTP] Missing required fields");
        return Ok(Json(json!({"success": false, "error": "Missing required fields"})));
    }

    // Create passkey info to send to frontend
    let passkey_info = json!({
        "rpId": rp_id,
        "rpName": rp_name,
        "userName": user_name,
        "userDisplayName": user_display_name,
        "credentialId": credential_id,
        "url": url,
        "timestamp": SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0)
    });

    // Emit event to frontend
    if let Some(app_handle) = get_app_handle() {
        match app_handle.emit("passkey-detected", passkey_info.clone()) {
            Ok(_) => {
                eprintln!("[Passkey HTTP] Event emitted successfully to frontend");
                Ok(Json(json!({"success": true, "message": "Passkey detected and notified"})))
            }
            Err(e) => {
                eprintln!("[Passkey HTTP] Failed to emit event: {:?}", e);
                Ok(Json(json!({"success": false, "error": format!("Failed to emit event: {}", e)})))
            }
        }
    } else {
        eprintln!("[Passkey HTTP] App handle not available");
        Ok(Json(json!({"success": false, "error": "App handle not available"})))
    }
}

// ========== Passkey Storage ==========

#[derive(Debug, Serialize, Deserialize, Clone)]
struct StoredPasskey {
    credential_id: String,
    private_key: String,
    rp_id: String,
    rp_name: String,
    user_id: String,
    user_name: String,
    user_display_name: String,
    counter: u32,
    created_at: i64,
}

fn get_passkeys_path() -> Result<PathBuf, String> {
    let app_data_dir = if cfg!(windows) {
        env::var("APPDATA")
            .map(PathBuf::from)
            .map_err(|_| "APPDATA not found".to_string())?
            .join("ConfPass")
    } else {
        let home = env::var("HOME").map_err(|_| "HOME not found".to_string())?;
        PathBuf::from(home).join(".config").join("confpass")
    };

    fs::create_dir_all(&app_data_dir).map_err(|e| format!("Failed to create dir: {}", e))?;
    Ok(app_data_dir.join("passkeys.json"))
}

fn load_passkeys() -> Result<Vec<StoredPasskey>, String> {
    let path = get_passkeys_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&path).map_err(|e| format!("Read error: {}", e))?;
    serde_json::from_str(&content).map_err(|e| format!("Parse error: {}", e))
}

fn save_passkeys(passkeys: &[StoredPasskey]) -> Result<(), String> {
    let path = get_passkeys_path()?;
    let content = serde_json::to_string_pretty(passkeys).map_err(|e| format!("Serialize error: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("Write error: {}", e))
}

async fn save_passkey_handler(
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    use tauri::Emitter;

    eprintln!("[Passkey Storage] Saving new passkey: {:?}", payload);

    let credential_id = payload.get("credentialId").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let private_key = payload.get("privateKey").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let rp_id = payload.get("rpId").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let rp_name = payload.get("rpName").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let user_id = payload.get("userId").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let user_name = payload.get("userName").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let user_display_name = payload.get("userDisplayName").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let counter = payload.get("counter").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
    let created_at = payload.get("createdAt").and_then(|v| v.as_i64()).unwrap_or_else(|| {
        SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
    });

    // Clone values needed for blocking task and event
    let rp_id_clone = rp_id.clone();
    let rp_name_clone = rp_name.clone();
    let user_name_clone = user_name.clone();
    let user_display_name_clone = user_display_name.clone();

    let result = tokio::task::spawn_blocking(move || {
        let passkey = StoredPasskey {
            credential_id: credential_id.clone(),
            private_key,
            rp_id: rp_id.clone(),
            rp_name: rp_name.clone(),
            user_id: user_id.clone(),
            user_name: user_name.clone(),
            user_display_name: user_display_name.clone(),
            counter,
            created_at,
        };

        if passkey.credential_id.is_empty() || passkey.private_key.is_empty() {
            return Err("Missing required fields".to_string());
        }

        let mut passkeys = load_passkeys().unwrap_or_default();

        // Check for duplicate
        if passkeys.iter().any(|p| p.credential_id == passkey.credential_id) {
            return Err("Passkey already exists".to_string());
        }

        passkeys.push(passkey);
        save_passkeys(&passkeys)?;

        eprintln!("[Passkey Storage] Passkey saved to passkeys.json. Total: {}", passkeys.len());

        // Also add to vault entries for UI display
        let mut state = get_state_mut().map_err(|e| e.to_string())?;

        if !state.vault_locked {
            // Create passkey data for notes field (like manual passkeys)
            let passkey_data = json!({
                "username": user_name,
                "email": if user_display_name.contains('@') { Some(user_display_name.clone()) } else { None::<String> },
                "domain": rp_id.clone(),
                "credentialId": credential_id
            });

            let entry_id = format!("entry_{}", uuid::Uuid::new_v4());
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|e| format!("Time error: {}", e))?
                .as_secs() as i64;

            // Create URL from rpId
            let url = if rp_id.starts_with("http://") || rp_id.starts_with("https://") {
                rp_id.clone()
            } else {
                format!("https://{}", rp_id)
            };

            // Get title from rpName or rpId
            let title = if !rp_name.is_empty() {
                rp_name
            } else {
                rp_id.split('.').next().unwrap_or(&rp_id).to_string()
            };

            let entry = PasswordEntry {
                id: entry_id.clone(),
                title,
                username: user_name,
                password: String::new(), // Passkeys don't have passwords
                url: Some(url),
                notes: Some(passkey_data.to_string()),
                created_at: now,
                updated_at: now,
                category: "passkeys".to_string(),
            };

            state.entries.insert(entry_id, entry);

            // Save vault to disk
            let pwd_string = {
                let master_pwd = MASTER_PASSWORD.lock()
                    .map_err(|_| "Master password lock error".to_string())?;

                match master_pwd.as_ref() {
                    Some(pwd) => pwd.as_str().to_string(),
                    None => return Ok(()), // Can't save without master password, but passkey is in passkeys.json
                }
            };

            if let Err(e) = save_vault_to_disk(&state, &pwd_string) {
                eprintln!("[Passkey Storage] Warning: Could not save to vault: {}", e);
            } else {
                eprintln!("[Passkey Storage] Passkey also added to vault entries");
            }
        } else {
            eprintln!("[Passkey Storage] Vault is locked, passkey saved only to passkeys.json");
        }

        Ok(())
    }).await;

    match result {
        Ok(Ok(_)) => {
            // Emit event to frontend to show notification
            if let Some(app_handle) = get_app_handle() {
                let passkey_info = json!({
                    "rpId": rp_id_clone,
                    "rpName": rp_name_clone,
                    "userName": user_name_clone,
                    "userDisplayName": user_display_name_clone,
                    "timestamp": SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0)
                });

                if let Err(e) = app_handle.emit("passkey-saved", passkey_info) {
                    eprintln!("[Passkey Storage] Failed to emit passkey-saved event: {}", e);
                } else {
                    eprintln!("[Passkey Storage] passkey-saved event emitted to frontend");
                }
            }

            Ok(Json(json!({"success": true})))
        }
        Ok(Err(msg)) => Ok(Json(json!({"success": false, "error": msg}))),
        Err(e) => {
            eprintln!("[Passkey Storage] Task error: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn get_passkeys_handler(
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let rp_id = payload.get("rpId").and_then(|v| v.as_str()).unwrap_or("").to_string();

    eprintln!("[Passkey Storage] Getting passkeys for rpId: {}", rp_id);

    let result = tokio::task::spawn_blocking(move || {
        let passkeys = load_passkeys().unwrap_or_default();

        let matching: Vec<_> = passkeys
            .into_iter()
            .filter(|p| p.rp_id == rp_id || rp_id.is_empty())
            .map(|p| json!({
                "credentialId": p.credential_id,
                "privateKey": p.private_key,
                "rpId": p.rp_id,
                "rpName": p.rp_name,
                "userId": p.user_id,
                "userName": p.user_name,
                "userDisplayName": p.user_display_name,
                "counter": p.counter,
                "createdAt": p.created_at
            }))
            .collect();

        eprintln!("[Passkey Storage] Found {} passkeys", matching.len());
        matching
    }).await;

    match result {
        Ok(passkeys) => Ok(Json(json!({"success": true, "passkeys": passkeys}))),
        Err(e) => {
            eprintln!("[Passkey Storage] Task error: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn update_passkey_counter_handler(
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let credential_id = payload.get("credentialId").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let counter = payload.get("counter").and_then(|v| v.as_u64()).unwrap_or(0) as u32;

    eprintln!("[Passkey Storage] Updating counter for {}: {}", credential_id, counter);

    let result = tokio::task::spawn_blocking(move || {
        let mut passkeys = load_passkeys()?;

        if let Some(passkey) = passkeys.iter_mut().find(|p| p.credential_id == credential_id) {
            passkey.counter = counter;
            save_passkeys(&passkeys)?;
            Ok(())
        } else {
            Err("Passkey not found".to_string())
        }
    }).await;

    match result {
        Ok(Ok(_)) => Ok(Json(json!({"success": true}))),
        Ok(Err(msg)) => Ok(Json(json!({"success": false, "error": msg}))),
        Err(e) => {
            eprintln!("[Passkey Storage] Task error: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

// ========== End Passkey Storage ==========

async fn focus_window_handler() -> Result<Json<serde_json::Value>, StatusCode> {
    use tauri::Manager;

    if let Some(app_handle) = get_app_handle() {
        if let Some(window) = app_handle.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
            return Ok(Json(json!({"success": true})));
        }
    }
    Ok(Json(json!({"success": false, "error": "Window not found"})))
}

async fn get_passwords_for_site_handler(
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let url = match payload.get("url").and_then(|v| v.as_str()) {
        Some(u) if !u.trim().is_empty() => u.to_string(),
        _ => return Ok(Json(json!({"success": false, "passwords": []}))),
    };

    let result = tokio::task::spawn_blocking(move || {
        let state = match get_state() {
            Ok(s) => s,
            Err(_) => return Err("State access error"),
        };

        if state.vault_locked {
            return Err("Vault is locked");
        }

        let url_lower = url.trim().to_lowercase();
        let url_domain = extract_domain(&url_lower);

        let matching_entries: Vec<_> = state.entries.values()
            .filter(|entry| {
                entry.url.as_ref().map_or(false, |entry_url| {
                    let entry_url_lower = entry_url.to_lowercase();
                    let entry_domain = extract_domain(&entry_url_lower);

                    // Match by domain
                    url_domain.as_ref().map_or(false, |search_domain| {
                        entry_domain.as_ref().map_or(false, |ed| {
                            ed.contains(search_domain) || search_domain.contains(ed)
                        })
                    })
                })
            })
            .map(|entry| json!({
                "id": entry.id,
                "title": entry.title,
                "username": entry.username,
                "password": entry.password,
                "url": entry.url
            }))
            .collect();

        Ok(matching_entries)
    }).await;

    match result {
        Ok(Ok(passwords)) => Ok(Json(json!({"success": true, "passwords": passwords}))),
        Ok(Err(msg)) => Ok(Json(json!({"success": false, "error": msg, "passwords": []}))),
        Err(e) => {
            eprintln!("Task error: {}", e);
            Ok(Json(json!({"success": false, "passwords": []})))
        }
    }
}

async fn get_totp_code_handler(
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let domain = payload.get("domain").and_then(|v| v.as_str()).unwrap_or("").to_string();

    eprintln!("[TOTP HTTP] Getting TOTP code for domain: {}", domain);

    let result = tokio::task::spawn_blocking(move || {
        let state = match get_state() {
            Ok(s) => s,
            Err(_) => return Err("State access error".to_string()),
        };

        if state.vault_locked {
            return Err("Vault is locked".to_string());
        }

        let domain_lower = domain.to_lowercase();

        for entry in state.entries.values() {
            if entry.category != "authenticator" {
                continue;
            }

            let entry_domain = entry.url.as_ref()
                .map(|u| extract_domain(&u.to_lowercase()))
                .flatten()
                .unwrap_or_default();

            let issuer_match = entry.title.to_lowercase().contains(&domain_lower) ||
                               domain_lower.contains(&entry.title.to_lowercase());

            let domain_match = !entry_domain.is_empty() && 
                              (entry_domain.contains(&domain_lower) || domain_lower.contains(&entry_domain));

            if issuer_match || domain_match {
                if let Some(ref notes) = entry.notes {
                    if let Ok(auth_data) = serde_json::from_str::<serde_json::Value>(notes) {
                        if let Some(secret) = auth_data.get("secret").and_then(|s| s.as_str()) {
                            match generate_totp_code_internal(secret) {
                                Ok(code) => {
                                    eprintln!("[TOTP HTTP] Generated code for {}", entry.title);
                                    return Ok(json!({
                                        "code": code,
                                        "issuer": entry.title,
                                        "account": entry.username
                                    }));
                                }
                                Err(e) => {
                                    eprintln!("[TOTP HTTP] Error generating code: {}", e);
                                }
                            }
                        }
                    }
                }

                if !entry.password.is_empty() {
                    match generate_totp_code_internal(&entry.password) {
                        Ok(code) => {
                            return Ok(json!({
                                "code": code,
                                "issuer": entry.title,
                                "account": entry.username
                            }));
                        }
                        Err(e) => {
                            eprintln!("[TOTP HTTP] Error generating code from password: {}", e);
                        }
                    }
                }
            }
        }

        Err("No authenticator found for this domain".to_string())
    }).await;

    match result {
        Ok(Ok(data)) => Ok(Json(json!({"success": true, "data": data}))),
        Ok(Err(msg)) => Ok(Json(json!({"success": false, "error": msg}))),
        Err(e) => {
            eprintln!("[TOTP HTTP] Task error: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

fn generate_totp_code_internal(secret: &str) -> Result<String, String> {
    use totp_lite::{totp_custom, Sha1};
    
    let cleaned_secret = secret.replace(" ", "").replace("-", "").to_uppercase();
    
    let secret_bytes = match base32::decode(base32::Alphabet::RFC4648 { padding: false }, &cleaned_secret) {
        Some(bytes) if !bytes.is_empty() => bytes,
        _ => {
            match base64::engine::general_purpose::STANDARD.decode(secret) {
                Ok(bytes) if !bytes.is_empty() => bytes,
                _ => return Err("Geçersiz TOTP secret formatı".to_string()),
            }
        }
    };
    
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Zaman hatası: {}", e))?
        .as_secs();
    
    let code = totp_custom::<Sha1>(
        30,
        6,
        secret_bytes.as_slice(),
        timestamp,
    );
    
    Ok(code)
}

use base32;
use chrono;

#[derive(Debug, Serialize, Deserialize)]
struct AppSettings {
    minimize_to_tray: bool,
    auto_start: bool,
    auto_lock_timeout: u64,
    #[serde(default)]
    use_biometric: bool,
    #[serde(default)]
    stream_protection: bool,
}

fn get_settings_path() -> Result<PathBuf, String> {
    let app_data_dir = if cfg!(windows) {
        env::var("APPDATA")
            .map(PathBuf::from)
            .map_err(|_| "APPDATA environment variable bulunamadı".to_string())?
            .join("ConfPass")
    } else if cfg!(target_os = "macos") {
        let home = env::var("HOME")
            .map_err(|_| "HOME environment variable bulunamadı".to_string())?;
        PathBuf::from(home).join("Library").join("Application Support").join("ConfPass")
    } else {
        let home = env::var("HOME")
            .map_err(|_| "HOME environment variable bulunamadı".to_string())?;
        PathBuf::from(home).join(".config").join("confpass")
    };
    
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Directory oluşturulamadı: {}", e))?;
    Ok(app_data_dir.join("settings.json"))
}

#[tauri::command]
fn get_settings() -> Result<AppSettings, String> {
    let settings_path = get_settings_path()?;
    
    if !settings_path.exists() {
        return Ok(AppSettings {
            minimize_to_tray: false,
            auto_start: false,
            auto_lock_timeout: 300,
            use_biometric: false,
            stream_protection: false,
        });
    }
    
    let content = fs::read_to_string(&settings_path)
        .map_err(|e| format!("Ayarlar dosyası okunamadı: {}", e))?;
    
    let settings: AppSettings = serde_json::from_str(&content)
        .map_err(|e| format!("Ayarlar parse edilemedi: {}", e))?;
    
    Ok(settings)
}

fn save_settings(settings: &AppSettings) -> Result<(), String> {
    let settings_path = get_settings_path()?;
    let json = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Ayarlar serialize edilemedi: {}", e))?;
    
    fs::write(&settings_path, json)
        .map_err(|e| format!("Ayarlar kaydedilemedi: {}", e))?;
    
    Ok(())
}

#[tauri::command]
fn set_minimize_to_tray(enabled: bool) -> Result<(), String> {
    let mut settings = get_settings()?;
    settings.minimize_to_tray = enabled;
    save_settings(&settings)?;
    Ok(())
}

#[tauri::command]
fn set_auto_start(enabled: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        use winreg::enums::*;
        use winreg::RegKey;
        
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let path = r"Software\Microsoft\Windows\CurrentVersion\Run";
        let (key, _) = hkcu.create_subkey(path)
            .map_err(|e| format!("Registry key oluşturulamadı: {}", e))?;
        
        if enabled {
            let exe_path = std::env::current_exe()
                .map_err(|e| format!("Exe path bulunamadı: {}", e))?;
            let exe_path_str = exe_path.to_string_lossy().to_string();
            key.set_value("ConfPass", &exe_path_str)
                .map_err(|e| format!("Auto-start kaydedilemedi: {}", e))?;
        } else {
            let _ = key.delete_value("ConfPass");
        }
    }
    
    #[cfg(not(windows))]
    {
        return Err("Auto-start sadece Windows'ta destekleniyor".to_string());
    }
    
    let mut settings = get_settings()?;
    settings.auto_start = enabled;
    save_settings(&settings)?;
    Ok(())
}

#[tauri::command]
fn set_auto_lock_timeout(timeout: u64) -> Result<(), String> {
    let mut settings = get_settings()?;
    settings.auto_lock_timeout = timeout;
    save_settings(&settings)?;
    
    let mut state = get_state_mut().map_err(|e| e.to_string())?;
    state.auto_lock_timeout = if timeout > 0 { Some(timeout) } else { None };
    
    Ok(())
}

#[tauri::command]
fn set_use_biometric(enabled: bool) -> Result<(), String> {
    let mut settings = get_settings()?;
    settings.use_biometric = enabled;
    save_settings(&settings)?;
    
    if enabled {
        // If vault is already unlocked, save password to keyring immediately
        #[cfg(windows)]
        {
            let master_pwd_guard = MASTER_PASSWORD.lock().map_err(|_| "Lock error")?;
            if let Some(ref pwd) = *master_pwd_guard {
                if let Ok(entry) = keyring::Entry::new("ConfPass", "master_password") {
                    let _ = entry.set_password(pwd.as_str());
                }
            }
        }
    } else {
        // Clear from keyring if disabled
        #[cfg(windows)]
        {
            let entry = keyring::Entry::new("ConfPass", "master_password").map_err(|e| e.to_string())?;
            let _ = entry.delete_password();
        }
    }

    Ok(())
}

// ============================================================================
// STREAM PROTECTION (Yayın/Ekran Paylaşımı Koruması)
// ============================================================================

// Global state for stream protection
static STREAM_PROTECTION_ACTIVE: Lazy<Mutex<bool>> = Lazy::new(|| Mutex::new(false));
static STREAMING_DETECTED: Lazy<Mutex<bool>> = Lazy::new(|| Mutex::new(false));

// Yayın/ekran paylaşımı yapan uygulamaları algıla
#[cfg(windows)]
fn detect_streaming_apps() -> Vec<String> {
    use windows::Win32::System::ProcessStatus::{EnumProcesses, GetModuleBaseNameW};
    use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ};
    use windows::Win32::Foundation::CloseHandle;

    let streaming_apps = [
        "obs64.exe", "obs32.exe", "obs.exe",
        "streamlabs obs.exe", "slobs.exe",
        "discord.exe",
        "xsplit.exe", "xsplit.broadcaster.exe", "xsplit.gamecaster.exe",
        "nvidia share.exe", "nvcontainer.exe",
        "gamebar.exe", "gamebarpresencewriter.exe",
        "zoom.exe",
        "teams.exe", "ms-teams.exe",
        "skype.exe",
        "webex.exe",
        "googlemeetpwa.exe",
        "streamelements obs live.exe",
        "twitch studio.exe", "twitchstudio.exe",
        "wirecast.exe",
        "vmix64.exe", "vmix.exe",
        "screenpal.exe", "screencastify.exe",
        "loom.exe",
        "bandicam.exe",
        "camtasia.exe",
        "anydesk.exe",
        "teamviewer.exe",
        "rustdesk.exe",
        "parsec.exe",
    ];

    let mut detected = Vec::new();
    let mut processes: [u32; 2048] = [0; 2048];
    let mut bytes_returned: u32 = 0;

    unsafe {
        if EnumProcesses(
            processes.as_mut_ptr(),
            (processes.len() * std::mem::size_of::<u32>()) as u32,
            &mut bytes_returned,
        ).is_ok() {
            let num_processes = bytes_returned as usize / std::mem::size_of::<u32>();

            for &pid in &processes[..num_processes] {
                if pid == 0 {
                    continue;
                }

                if let Ok(handle) = OpenProcess(
                    PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
                    false,
                    pid,
                ) {
                    let mut name_buf: [u16; 260] = [0; 260];
                    let len = GetModuleBaseNameW(handle, None, &mut name_buf);
                    let _ = CloseHandle(handle);

                    if len > 0 {
                        let name = String::from_utf16_lossy(&name_buf[..len as usize]).to_lowercase();

                        for app in &streaming_apps {
                            if name == *app || name.contains(&app.replace(".exe", "")) {
                                if !detected.contains(&name) {
                                    detected.push(name.clone());
                                }
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    detected
}

#[cfg(not(windows))]
fn detect_streaming_apps() -> Vec<String> {
    Vec::new()
}

// Pencereyi ekran yakalamasından gizle (SetWindowDisplayAffinity)
#[cfg(windows)]
fn set_window_capture_protection(hwnd: isize, protect: bool) -> Result<(), String> {
    use windows::Win32::UI::WindowsAndMessaging::{SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WDA_NONE};
    use windows::Win32::Foundation::HWND;

    let affinity = if protect {
        WDA_EXCLUDEFROMCAPTURE
    } else {
        WDA_NONE
    };

    unsafe {
        SetWindowDisplayAffinity(HWND(hwnd as *mut std::ffi::c_void), affinity)
            .map_err(|e| format!("SetWindowDisplayAffinity hatası: {}", e))?;
    }

    Ok(())
}

#[cfg(not(windows))]
fn set_window_capture_protection(_hwnd: isize, _protect: bool) -> Result<(), String> {
    Err("Stream protection sadece Windows'ta destekleniyor".to_string())
}

#[tauri::command]
fn set_stream_protection(enabled: bool, window: tauri::Window) -> Result<(), String> {
    let mut settings = get_settings()?;
    settings.stream_protection = enabled;
    save_settings(&settings)?;

    // Update global state
    if let Ok(mut active) = STREAM_PROTECTION_ACTIVE.lock() {
        *active = enabled;
    }

    #[cfg(windows)]
    {
        if let Ok(hwnd) = window.hwnd() {
            let hwnd_value = hwnd.0 as isize;

            if enabled {
                // Check if streaming apps are running
                let streaming_apps = detect_streaming_apps();
                if !streaming_apps.is_empty() {
                    set_window_capture_protection(hwnd_value, true)?;
                    if let Ok(mut detected) = STREAMING_DETECTED.lock() {
                        *detected = true;
                    }
                }
            } else {
                // Disable protection
                set_window_capture_protection(hwnd_value, false)?;
                if let Ok(mut detected) = STREAMING_DETECTED.lock() {
                    *detected = false;
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
fn get_stream_protection_status() -> Result<serde_json::Value, String> {
    let settings = get_settings()?;
    let streaming_apps = detect_streaming_apps();

    let is_streaming = !streaming_apps.is_empty();
    let is_protected = STREAMING_DETECTED.lock()
        .map(|d| *d)
        .unwrap_or(false);

    Ok(serde_json::json!({
        "enabled": settings.stream_protection,
        "streaming_detected": is_streaming,
        "protected": is_protected,
        "detected_apps": streaming_apps
    }))
}

#[tauri::command]
fn check_streaming_apps() -> Result<Vec<String>, String> {
    Ok(detect_streaming_apps())
}

// Stream monitoring thread'i başlat
fn start_stream_monitor(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        use tauri::Manager;
        use tauri::Emitter;

        let mut last_streaming_state = false;

        loop {
            std::thread::sleep(std::time::Duration::from_secs(2));

            // Check if stream protection is enabled
            let protection_enabled = STREAM_PROTECTION_ACTIVE.lock()
                .map(|a| *a)
                .unwrap_or(false);

            if !protection_enabled {
                // If protection was active but now disabled, remove protection
                if last_streaming_state {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        #[cfg(windows)]
                        {
                            if let Ok(hwnd) = window.hwnd() {
                                let _ = set_window_capture_protection(hwnd.0 as isize, false);
                            }
                        }
                    }
                    last_streaming_state = false;
                    if let Ok(mut detected) = STREAMING_DETECTED.lock() {
                        *detected = false;
                    }
                }
                continue;
            }

            let streaming_apps = detect_streaming_apps();
            let is_streaming = !streaming_apps.is_empty();

            if is_streaming != last_streaming_state {
                last_streaming_state = is_streaming;

                if let Some(window) = app_handle.get_webview_window("main") {
                    #[cfg(windows)]
                    {
                        if let Ok(hwnd) = window.hwnd() {
                            let _ = set_window_capture_protection(hwnd.0 as isize, is_streaming);
                        }
                    }

                    if let Ok(mut detected) = STREAMING_DETECTED.lock() {
                        *detected = is_streaming;
                    }

                    // Emit event to frontend
                    let _ = window.emit("stream-protection-changed", serde_json::json!({
                        "streaming_detected": is_streaming,
                        "protected": is_streaming,
                        "detected_apps": streaming_apps
                    }));

                    eprintln!("[Stream Protection] Streaming {} - Apps: {:?}",
                        if is_streaming { "detected" } else { "stopped" },
                        streaming_apps
                    );
                }
            }
        }
    });
}

#[tauri::command]
fn generate_totp_code(secret: String) -> Result<String, String> {
    use totp_lite::{totp_custom, Sha1};
    
    let cleaned_secret = secret.replace(" ", "").replace("-", "").to_uppercase();
    
    let secret_bytes = match base32::decode(base32::Alphabet::RFC4648 { padding: false }, &cleaned_secret) {
        Some(bytes) if !bytes.is_empty() => bytes,
        _ => {
            match base64::engine::general_purpose::STANDARD.decode(&secret) {
                Ok(bytes) if !bytes.is_empty() => bytes,
                _ => return Err("Geçersiz TOTP secret formatı".to_string()),
            }
        }
    };
    
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Zaman hatası: {}", e))?
        .as_secs();
    
    let code = totp_custom::<Sha1>(
        30,
        6,
        secret_bytes.as_slice(),
        timestamp,
    );
    
    Ok(code)
}

#[tauri::command]
fn generate_totp_qr_code(secret: String, issuer: String, account: String) -> Result<String, String> {
    use qrcode::QrCode;
    
    let otp_url = format!("otpauth://totp/{}:{}?secret={}&issuer={}&algorithm=SHA1&digits=6&period=30",
        issuer, account, secret, issuer);
    
    let qr = QrCode::new(otp_url.as_bytes())
        .map_err(|e| format!("QR kod oluşturulamadı: {}", e))?;
    
    let image = qr.render::<image::Rgb<u8>>()
        .max_dimensions(200, 200)
        .build();
    
    let mut buffer = Vec::new();
    {
        use image::ImageEncoder;
        let encoder = image::codecs::png::PngEncoder::new(&mut buffer);
        let width = image.width();
        let height = image.height();
        let raw = image.into_raw();
        encoder.write_image(
            &raw,
            width,
            height,
            image::ExtendedColorType::Rgb8,
        ).map_err(|e| format!("PNG encode hatası: {}", e))?;
    }
    
    Ok(base64::engine::general_purpose::STANDARD.encode(&buffer))
}

#[tauri::command]
fn reset_vault() -> Result<(), String> {
    let vault_path = get_vault_path()?;
    let vault_dir = vault_path.parent()
        .ok_or_else(|| "Vault path parent bulunamadı".to_string())?;
    
    let salt_path = vault_dir.join("vault.salt");
    
    if vault_path.exists() {
        fs::remove_file(&vault_path)
            .map_err(|e| format!("Vault dosyası silinemedi: {}", e))?;
    }
    
    if salt_path.exists() {
        fs::remove_file(&salt_path)
            .map_err(|e| format!("Salt dosyası silinemedi: {}", e))?;
    }
    
    let mut state = get_state_mut().map_err(|e| e.to_string())?;
    state.entries.clear();
    state.master_password_hash = None;
    state.encryption_salt = None;
    state.vault_locked = true;
    state.failed_attempts = 0;
    state.last_attempt_time = None;
    
    {
        let mut master_pwd = MASTER_PASSWORD.lock().unwrap();
        *master_pwd = None;
    }
    
    Ok(())
}

#[tauri::command]
fn reset_vault_with_password(mut master_password: String) -> Result<(), String> {
    use argon2::password_hash::{PasswordHash, PasswordVerifier};
    use argon2::Argon2;
    use zeroize::Zeroize;

    validate_input(&master_password, 8, 128, "Ana şifre").map_err(|e| e.to_string())?;

    let vault_path = get_vault_path()?;
    if !vault_path.exists() {
        master_password.zeroize();
        return Err("Kasa bulunamadı".to_string());
    }

    // Load vault to verify password
    let loaded_state = match load_vault_from_disk(&master_password) {
        Ok(state) => state,
        Err(e) => {
            master_password.zeroize();
            if e.contains("Decrypt hatası") || e.contains("decrypt") || e.contains("Şifre çözme") {
                return Err("Yanlış ana şifre".to_string());
            }
            return Err(format!("Vault doğrulanamadı: {}", e));
        }
    };

    // Verify password hash
    let stored_hash = loaded_state.master_password_hash.as_ref()
        .ok_or_else(|| {
            master_password.zeroize();
            "Hash bulunamadı".to_string()
        })?;

    let parsed_hash = PasswordHash::new(stored_hash).map_err(|e| {
        master_password.zeroize();
        format!("Hash parse hatası: {}", e)
    })?;

    if Argon2::default().verify_password(master_password.as_bytes(), &parsed_hash).is_err() {
        master_password.zeroize();
        return Err("Yanlış ana şifre".to_string());
    }

    master_password.zeroize();

    // Password verified, now reset everything
    let vault_dir = vault_path.parent()
        .ok_or_else(|| "Vault path parent bulunamadı".to_string())?;

    let salt_path = vault_dir.join("vault.salt");
    let activity_log_path = vault_dir.join("activity_log.json");
    let settings_path = vault_dir.join("settings.json");

    // Delete all vault files
    if vault_path.exists() {
        fs::remove_file(&vault_path)
            .map_err(|e| format!("Vault dosyası silinemedi: {}", e))?;
    }

    if salt_path.exists() {
        fs::remove_file(&salt_path)
            .map_err(|e| format!("Salt dosyası silinemedi: {}", e))?;
    }

    if activity_log_path.exists() {
        let _ = fs::remove_file(&activity_log_path);
    }

    if settings_path.exists() {
        let _ = fs::remove_file(&settings_path);
    }

    // Clear in-memory state
    let mut state = get_state_mut().map_err(|e| e.to_string())?;
    state.entries.clear();
    state.master_password_hash = None;
    state.encryption_salt = None;
    state.vault_locked = true;
    state.failed_attempts = 0;
    state.last_attempt_time = None;

    {
        let mut master_pwd = MASTER_PASSWORD.lock().unwrap();
        *master_pwd = None;
    }

    Ok(())
}

#[tauri::command]
async fn check_password_breach(password: String) -> Result<serde_json::Value, String> {
    use sha1::{Sha1, Digest};
    
    let mut hasher = Sha1::new();
    hasher.update(password.as_bytes());
    let hash = hasher.finalize();
    let hash_hex = format!("{:x}", hash);
    let prefix = &hash_hex[..5];
    let suffix = &hash_hex[5..].to_uppercase();
    
    let url = format!("https://api.pwnedpasswords.com/range/{}", prefix);
    let client = reqwest::Client::new();
    let response = client.get(&url)
        .header("User-Agent", "ConfPass-PasswordManager")
        .header("Add-Padding", "true")
        .send()
        .await
        .map_err(|e| format!("API isteği başarısız: {}", e))?;

    // Check response status
    if !response.status().is_success() {
        return Err(format!("API hatası: {}", response.status()));
    }
    
    let text = response.text()
        .await
        .map_err(|e| format!("Yanıt okunamadı: {}", e))?;
    
    let breached = text.lines()
        .any(|line| line.starts_with(suffix));
    
    let count = if breached {
        text.lines()
            .find(|line| line.starts_with(suffix))
            .and_then(|line| line.split(':').nth(1))
            .and_then(|c| c.parse::<u64>().ok())
            .unwrap_or(0)
    } else {
        0
    };
    
    Ok(serde_json::json!({
        "breached": breached,
        "count": count
    }))
}

#[tauri::command]
async fn check_email_breach(email: String) -> Result<serde_json::Value, String> {
    // XposedOrNot API - Free, no API key required
    let url = format!("https://api.xposedornot.com/v1/check-email/{}", email);

    let client = reqwest::Client::new();
    let response = client.get(&url)
        .header("User-Agent", "ConfPass-PasswordManager")
        .send()
        .await
        .map_err(|e| format!("API isteği başarısız: {}", e))?;

    let status = response.status();

    // 404 means email not found in breaches (good!)
    if status.as_u16() == 404 {
        return Ok(serde_json::json!({
            "breached": false,
            "breaches": [],
            "count": 0
        }));
    }

    if !status.is_success() {
        return Err(format!("API hatası: {}", status));
    }

    let data: serde_json::Value = response.json()
        .await
        .map_err(|e| format!("JSON parse hatası: {}", e))?;

    // XposedOrNot returns breaches array
    let breaches = data.get("breaches")
        .and_then(|b| b.as_array())
        .map(|arr| arr.iter()
            .filter_map(|v| v.as_str())
            .map(|s| s.to_string())
            .collect::<Vec<String>>())
        .unwrap_or_default();

    let count = breaches.len();

    Ok(serde_json::json!({
        "breached": count > 0,
        "breaches": breaches,
        "count": count
    }))
}

#[tauri::command]
fn add_password_history(entry_id: String, old_password: String) -> Result<(), String> {
    let state = get_state().map_err(|e| e.to_string())?;
    
    if !state.entries.contains_key(&entry_id) {
        return Err("Entry bulunamadı".to_string());
    }
    
    let history_path = get_vault_path()?
        .parent()
        .ok_or_else(|| "Vault path parent bulunamadı".to_string())?
        .join("history.json");
    
    let mut history: std::collections::HashMap<String, Vec<serde_json::Value>> = if history_path.exists() {
        let content = fs::read_to_string(&history_path)
            .map_err(|e| format!("History okunamadı: {}", e))?;
        serde_json::from_str(&content)
            .unwrap_or_default()
    } else {
        std::collections::HashMap::new()
    };
    
    let entry_history = history.entry(entry_id).or_insert_with(Vec::new);
    entry_history.push(serde_json::json!({
        "password": old_password,
        "changed_at": chrono::Utc::now().timestamp()
    }));
    
    if entry_history.len() > 10 {
        entry_history.remove(0);
    }
    
    let json = serde_json::to_string_pretty(&history)
        .map_err(|e| format!("History serialize edilemedi: {}", e))?;
    
    fs::write(&history_path, json)
        .map_err(|e| format!("History kaydedilemedi: {}", e))?;
    
    Ok(())
}

#[tauri::command]
fn get_password_history(entry_id: String) -> Result<Vec<serde_json::Value>, String> {
    let history_path = get_vault_path()?
        .parent()
        .ok_or_else(|| "Vault path parent bulunamadı".to_string())?
        .join("history.json");
    
    if !history_path.exists() {
        return Ok(Vec::new());
    }
    
    let content = fs::read_to_string(&history_path)
        .map_err(|e| format!("History okunamadı: {}", e))?;
    
    let history: std::collections::HashMap<String, Vec<serde_json::Value>> = serde_json::from_str(&content)
        .map_err(|e| format!("History parse edilemedi: {}", e))?;
    
    Ok(history.get(&entry_id).cloned().unwrap_or_default())
}

#[tauri::command]
fn log_activity(action: String, entry_id: Option<String>, details: Option<String>) -> Result<(), String> {
    let activity_path = get_vault_path()?
        .parent()
        .ok_or_else(|| "Vault path parent bulunamadı".to_string())?
        .join("activity.json");
    
    let mut activities: Vec<serde_json::Value> = if activity_path.exists() {
        let content = fs::read_to_string(&activity_path)
            .map_err(|e| format!("Activity okunamadı: {}", e))?;
        serde_json::from_str(&content)
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    
    activities.push(serde_json::json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "entry_id": entry_id,
        "action": action,
        "timestamp": chrono::Utc::now().timestamp(),
        "details": details
    }));
    
    if activities.len() > 1000 {
        activities.remove(0);
    }
    
    let json = serde_json::to_string_pretty(&activities)
        .map_err(|e| format!("Activity serialize edilemedi: {}", e))?;
    
    fs::write(&activity_path, json)
        .map_err(|e| format!("Activity kaydedilemedi: {}", e))?;
    
    Ok(())
}

#[tauri::command]
fn get_activity_log(limit: Option<usize>) -> Result<Vec<serde_json::Value>, String> {
    let activity_path = get_vault_path()?
        .parent()
        .ok_or_else(|| "Vault path parent bulunamadı".to_string())?
        .join("activity.json");
    
    if !activity_path.exists() {
        return Ok(Vec::new());
    }
    
    let content = fs::read_to_string(&activity_path)
        .map_err(|e| format!("Activity okunamadı: {}", e))?;
    
    let mut activities: Vec<serde_json::Value> = serde_json::from_str(&content)
        .map_err(|e| format!("Activity parse edilemedi: {}", e))?;
    
    activities.reverse();
    
    if let Some(limit) = limit {
        activities.truncate(limit);
    }
    
    Ok(activities)
}

#[tauri::command]
async fn check_biometric_available() -> Result<bool, String> {
    #[cfg(windows)]
    {
        use windows::Security::Credentials::UI::{UserConsentVerifier, UserConsentVerifierAvailability};
        match UserConsentVerifier::CheckAvailabilityAsync() {
            Ok(op) => match op.get() {
                Ok(result) => Ok(result == UserConsentVerifierAvailability::Available),
                Err(_) => Ok(false),
            },
            Err(_) => Ok(false),
        }
    }
    #[cfg(not(windows))]
    {
        Ok(false)
    }
}

#[tauri::command]
async fn biometric_authenticate(reason: String, window: tauri::Window) -> Result<bool, String> {
    #[cfg(windows)]
    {
        use windows::Security::Credentials::UI::{UserConsentVerifier, UserConsentVerificationResult};
        use windows::core::HSTRING;

        // Minimize the window so Windows Hello appears in front
        let was_visible = window.is_visible().unwrap_or(true);
        let _ = window.minimize();

        // Small delay to ensure window is minimized
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        let result = match UserConsentVerifier::RequestVerificationAsync(&HSTRING::from(reason)) {
            Ok(op) => match op.get() {
                Ok(result) => Ok(result == UserConsentVerificationResult::Verified),
                Err(_) => Ok(false),
            },
            Err(_) => Ok(false),
        };

        // Restore the window after authentication
        if was_visible {
            let _ = window.unminimize();
            let _ = window.set_focus();
        }

        result
    }
    #[cfg(not(windows))]
    {
        let _ = reason;
        let _ = window;
        Ok(false)
    }
}

#[tauri::command]
async fn unlock_vault_biometric(window: tauri::Window) -> Result<bool, String> {
    let settings = get_settings()?;
    if !settings.use_biometric {
        return Err("Biyometrik giriş devre dışı".to_string());
    }

    let authenticated = biometric_authenticate("Kasa kilidini açmak için kimlik doğrulaması gerekiyor".to_string(), window).await?;
    if !authenticated {
        return Err("Kimlik doğrulama başarısız".to_string());
    }

    #[cfg(windows)]
    {
        let entry = keyring::Entry::new("ConfPass", "master_password").map_err(|e| format!("Anahtar deposu hatası: {}", e))?;
        let password = entry.get_password().map_err(|e| {
            eprintln!("[Keyring Error] Şifre okunamadı: {}", e);
            format!("Kayıtlı ana şifre bulunamadı (Hata: {}). Lütfen bir kez şifrenizle manuel giriş yapın.", e)
        })?;
        
        unlock_vault(password)
    }
    #[cfg(not(windows))]
    {
        Err("Biyometrik giriş sadece Windows'ta destekleniyor".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_stronghold::Builder::new(|password| {
            use argon2::password_hash::{PasswordHasher, SaltString};
            use argon2::Argon2;
            use rand::rngs::OsRng;
            
            let salt = SaltString::generate(&mut OsRng);
            let argon2 = Argon2::default();
            argon2.hash_password(password.as_bytes(), &salt)
                .map(|hash| hash.to_string().into_bytes())
                .unwrap_or_default()
        }).build())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            unlock_vault,
            lock_vault,
            is_vault_locked,
            add_password_entry,
            get_password_entries,
            get_password_entry,
            update_password_entry,
            delete_password_entry,
            soft_delete_authenticator,
            restore_authenticator,
            permanently_delete_authenticator,
            soft_delete_passkey,
            restore_passkey,
            permanently_delete_passkey,
            generate_password,
            check_password_strength,
            find_password_by_url,
            export_vault,
            import_vault,
            get_settings,
            set_minimize_to_tray,
            set_auto_start,
            set_auto_lock_timeout,
            generate_totp_code,
            generate_totp_qr_code,
            check_password_breach,
            check_email_breach,
            add_password_history,
            get_password_history,
            log_activity,
            get_activity_log,
            check_biometric_available,
            biometric_authenticate,
            unlock_vault_biometric,
            set_use_biometric,
            reset_vault,
            reset_vault_with_password,
            set_stream_protection,
            get_stream_protection_status,
            check_streaming_apps,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let settings = get_settings().unwrap_or(AppSettings {
                    minimize_to_tray: false,
                    auto_start: false,
                    auto_lock_timeout: 300,
                    use_biometric: false,
                    stream_protection: false,
                });
                
                if settings.minimize_to_tray {
                    api.prevent_close();
                    if let Err(e) = window.hide() {
                        eprintln!("Pencere gizlenemedi: {}", e);
                    }
                }
            }
        })
        .setup(|app| {
            use tauri::tray::{TrayIconBuilder, TrayIconEvent};
            use tauri::menu::{MenuBuilder, MenuItemBuilder};

            let app_handle = app.handle().clone();

            // Store app handle globally for HTTP server to emit events
            set_app_handle(app_handle.clone());
            eprintln!("[App Setup] Global app handle set for passkey detection");

            let app_handle_for_tray = app.handle().clone();
            let app_handle_for_menu = app.handle().clone();
            
            let show_item = MenuItemBuilder::with_id("show", "Göster")
                .build(&app_handle)?;
            let hide_item = MenuItemBuilder::with_id("hide", "Gizle")
                .build(&app_handle)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Çıkış")
                .build(&app_handle)?;
            
            let menu = MenuBuilder::new(&app_handle)
                .items(&[&show_item, &hide_item, &quit_item])
                .build()?;
            
            let icon = app.default_window_icon().unwrap().clone();
            
            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .tooltip("ConfPass - Password Manager")
                .show_menu_on_left_click(false)
                .menu(&menu)
                .on_tray_icon_event(move |_tray_handle, event| {
                    use tauri::Manager;
                    let app = app_handle_for_tray.clone();
                    
                    if let TrayIconEvent::Click { button, button_state, .. } = event {
                        if button == tauri::tray::MouseButton::Left && button_state == tauri::tray::MouseButtonState::Up {
                            if let Some(win) = app.get_webview_window("main") {
                                if let Ok(is_visible) = win.is_visible() {
                                    if is_visible {
                                        let _ = win.hide();
                                    } else {
                                        let _ = win.show();
                                        let _ = win.set_focus();
                                    }
                                }
                            }
                        }
                    }
                })
                .on_menu_event(move |_tray_handle, event| {
                    use tauri::Manager;
                    let app = app_handle_for_menu.clone();
                    
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                        "hide" => {
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.hide();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .build(app)?;
            
            std::thread::spawn(move || {
                if let Ok(rt) = tokio::runtime::Runtime::new() {
                    rt.block_on(start_http_server());
                } else {
                    eprintln!("Failed to create tokio runtime for HTTP server");
                }
            });

            // Passkey detection is now handled via browser extension + HTTP API
            // No need for registry polling anymore

            // Stream protection monitor başlat
            let app_handle_for_stream = app.handle().clone();
            if let Ok(settings) = get_settings() {
                if settings.stream_protection {
                    if let Ok(mut active) = STREAM_PROTECTION_ACTIVE.lock() {
                        *active = true;
                    }
                }
            }
            start_stream_monitor(app_handle_for_stream);
            eprintln!("[App Setup] Stream protection monitor started");

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
