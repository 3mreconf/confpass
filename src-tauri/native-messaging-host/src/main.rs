use std::env;
use std::fs;
use std::io::{self, Read, Write};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

// DEBUG LOGGER
fn log_native(msg: &str) {
    if let Ok(mut file) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open("C:\\Users\\Public\\confpass_native.txt")
    {
        let time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let _ = writeln!(file, "[{}] {}", time, msg);
    }
}

// Unused struct removed to fix compiler warning

fn read_message() -> Result<serde_json::Value, Box<dyn std::error::Error>> {
    let mut buffer = [0u8; 4];
    io::stdin().read_exact(&mut buffer)?;

    let length = u32::from_le_bytes(buffer) as usize;

    let mut message_buffer = vec![0u8; length];
    io::stdin().read_exact(&mut message_buffer)?;

    let message: serde_json::Value = serde_json::from_slice(&message_buffer)?;
    Ok(message)
}

fn send_message(message: &serde_json::Value) -> Result<(), Box<dyn std::error::Error>> {
    let json = serde_json::to_string(message)?;
    let length = json.len() as u32;

    io::stdout().write_all(&length.to_le_bytes())?;
    io::stdout().write_all(json.as_bytes())?;
    io::stdout().flush()?;

    Ok(())
}

fn get_app_data_dir() -> Result<PathBuf, String> {
    if cfg!(windows) {
        env::var("APPDATA")
            .map(PathBuf::from)
            .map_err(|_| "APPDATA environment variable bulunamadı".to_string())
            .map(|p| p.join("ConfPass"))
    } else if cfg!(target_os = "macos") {
        let home =
            env::var("HOME").map_err(|_| "HOME environment variable bulunamadı".to_string())?;
        Ok(PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("ConfPass"))
    } else {
        let home =
            env::var("HOME").map_err(|_| "HOME environment variable bulunamadı".to_string())?;
        Ok(PathBuf::from(home).join(".config").join("confpass"))
    }
}

fn get_auth_token() -> Option<String> {
    let app_dir = get_app_data_dir().ok()?;
    let token_path = app_dir.join("native_auth_token");

    if token_path.exists() {
        fs::read_to_string(token_path).ok()
    } else {
        None
    }
}

fn proxy_to_server(message: &serde_json::Value) -> serde_json::Value {
    let message_type = message
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");

    log_native(&format!("Received message type: {}", message_type));

    // Map message type to endpoint
    let endpoint = match message_type {
        "get_password" => "get_password",
        "save_password" => "save_password",
        "ping" => "ping",
        "get_passwords_for_site" => "get_passwords_for_site",
        "get_passkeys" => "get_passkeys",
        "save_passkey" => "save_passkey",
        "update_passkey_counter" => "update_passkey_counter",
        "get_totp_code" => "get_totp_code",
        "passkey_detected" => "passkey_detected",
        "open_app" => "focus_window",
        "get_cards" => "get_cards",
        "get_addresses" => "get_addresses",
        "check_duplicate" => "check_duplicate",
        "save_entry" => "save_entry",
        _ => message_type,
    };

    let url = format!("http://127.0.0.1:1421/{}", endpoint);
    let token = get_auth_token();

    if token.is_none() {
        log_native("AUTH ERROR: Token not found in proxy_to_server");
        // If ping, we might just return false instead of error
        if endpoint == "ping" {
            return serde_json::json!({ "success": false, "error": "Auth token not found" });
        }
        return serde_json::json!({ "success": false, "error": "Authorization token not found. Please open the App first." });
    }

    log_native(&format!("Proxying to: {}", url));
    // log_native(&format!("Using token: {:?}", token)); // Mask in production if needed

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap_or_else(|_| reqwest::blocking::Client::new());

    let response = client
        .post(&url)
        .header("Authorization", token.unwrap())
        .json(message)
        .send();

    match response {
        Ok(resp) => {
            log_native(&format!("Backend response status: {}", resp.status()));
            if resp.status().is_success() {
                resp.json::<serde_json::Value>()
                    .unwrap_or_else(|_| serde_json::json!({ "success": true }))
            } else {
                let status = resp.status();
                let err_msg = format!("HTTP Error: {}", status);
                log_native(&err_msg);
                serde_json::json!({ "success": false, "error": err_msg })
            }
        }
        Err(e) => {
            let err_msg = format!(
                "Connection to App failed: {}. Make sure ConfPass is running.",
                e
            );
            log_native(&err_msg);
            serde_json::json!({ "success": false, "error": err_msg })
        }
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    loop {
        match read_message() {
            Ok(message) => {
                // log_native(&format!("Read message: {:?}", message));
                let response = proxy_to_server(&message);
                match send_message(&response) {
                    Ok(_) => log_native("Response sent successfully"),
                    Err(e) => log_native(&format!("Failed to send response: {}", e)),
                }
            }
            Err(e) => {
                if e.to_string().contains("UnexpectedEof") {
                    break;
                }
                // Log error to stderr, it won't interfere with stdout
                eprintln!("Error: {}", e);
                break;
            }
        }
    }

    Ok(())
}
