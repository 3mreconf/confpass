use std::io::{self, Read, Write};
use std::process::Command;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct NativeMessage {
    #[serde(rename = "type")]
    message_type: String,
    #[serde(flatten)]
    extra: serde_json::Value,
}

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

fn proxy_to_server(message: &serde_json::Value) -> serde_json::Value {
    let message_type = message.get("type").and_then(|v| v.as_str()).unwrap_or("unknown");
    
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
        _ => message_type,
    };

    let url = format!("http://127.0.0.1:1421/{}", endpoint);
    let payload = serde_json::to_string(message).unwrap_or_default();

    let output = Command::new("curl")
        .arg("-s")
        .arg("-X")
        .arg("POST")
        .arg("-H")
        .arg("Content-Type: application/json")
        .arg("-d")
        .arg(&payload)
        .arg(&url)
        .output();

    match output {
        Ok(out) if out.status.success() => {
            serde_json::from_slice(&out.stdout).unwrap_or_else(|_| {
                serde_json::json!({ "success": true })
            })
        }
        _ => {
            serde_json::json!({ "success": false, "error": "Server connection failed" })
        }
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    loop {
        match read_message() {
            Ok(message) => {
                let response = proxy_to_server(&message);
                send_message(&response)?;
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