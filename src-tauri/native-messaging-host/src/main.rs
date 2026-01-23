use std::io::{self, Read, Write};
use std::sync::Mutex;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
struct Message {
    #[serde(rename = "type")]
    message_type: String,
    url: Option<String>,
    data: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct PasswordEntry {
    id: String,
    title: String,
    username: String,
    password: String,
    url: Option<String>,
    notes: Option<String>,
    created_at: i64,
    updated_at: i64,
    category: String,
}

static VAULT_STATE: Lazy<Mutex<HashMap<String, PasswordEntry>>> = Lazy::new(|| {
    Mutex::new(HashMap::new())
});

fn read_message() -> Result<Message, Box<dyn std::error::Error>> {
    let mut buffer = vec![0u8; 4];
    io::stdin().read_exact(&mut buffer)?;
    
    let length = u32::from_le_bytes([buffer[0], buffer[1], buffer[2], buffer[3]]) as usize;
    
    let mut message_buffer = vec![0u8; length];
    io::stdin().read_exact(&mut message_buffer)?;
    
    let message: Message = serde_json::from_slice(&message_buffer)?;
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

fn find_password_by_url(url: &str) -> Option<PasswordEntry> {
    let state = VAULT_STATE.lock().unwrap();
    let url_lower = url.to_lowercase();
    
    for entry in state.values() {
        if let Some(entry_url) = &entry.url {
            if entry_url.to_lowercase().contains(&url_lower) {
                return Some(entry.clone());
            }
        }
    }
    
    None
}

fn save_password(data: serde_json::Value) -> Result<(), Box<dyn std::error::Error>> {
    let mut state = VAULT_STATE.lock().unwrap();
    
    let url = data.get("url").and_then(|v| v.as_str()).unwrap_or("");
    let username = data.get("username").and_then(|v| v.as_str()).unwrap_or("");
    let password = data.get("password").and_then(|v| v.as_str()).unwrap_or("");
    let title = data.get("title").and_then(|v| v.as_str()).unwrap_or("Web Site");
    
    let id = format!("entry_{}", uuid::Uuid::new_v4());
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    
    let entry = PasswordEntry {
        id: id.clone(),
        title: title.to_string(),
        username: username.to_string(),
        password: password.to_string(),
        url: Some(url.to_string()),
        notes: None,
        created_at: now,
        updated_at: now,
        category: "accounts".to_string(),
    };
    
    state.insert(id, entry);
    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    loop {
        match read_message() {
            Ok(message) => {
                match message.message_type.as_str() {
                    "get_password" => {
                        if let Some(url) = message.url {
                            if let Some(entry) = find_password_by_url(&url) {
                                let response = serde_json::json!({
                                    "type": "password_found",
                                    "data": {
                                        "username": entry.username,
                                        "password": entry.password,
                                        "title": entry.title
                                    }
                                });
                                send_message(&response)?;
                            } else {
                                let response = serde_json::json!({
                                    "type": "password_not_found"
                                });
                                send_message(&response)?;
                            }
                        }
                    }
                    "save_password" => {
                        if let Some(data) = message.data {
                            if let Err(e) = save_password(data) {
                                eprintln!("Error saving password: {}", e);
                            }
                            let response = serde_json::json!({
                                "type": "password_saved",
                                "success": true
                            });
                            send_message(&response)?;
                        }
                    }
                    "ping" => {
                        let response = serde_json::json!({
                            "type": "pong"
                        });
                        send_message(&response)?;
                    }
                    _ => {
                        let response = serde_json::json!({
                            "type": "error",
                            "message": "Unknown message type"
                        });
                        send_message(&response)?;
                    }
                }
            }
            Err(e) => {
                if e.to_string().contains("UnexpectedEof") {
                    break;
                }
                eprintln!("Error reading message: {}", e);
                break;
            }
        }
    }
    
    Ok(())
}
