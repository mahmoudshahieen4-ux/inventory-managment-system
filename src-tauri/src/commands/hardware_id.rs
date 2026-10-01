//! Stable per-install hardware identifier command.

use std::path::Path;

use tauri::{AppHandle, Manager};
use uuid::Uuid;

const HARDWARE_ID_FILE: &str = "hardware-id";

fn is_valid_hardware_id(value: &str) -> bool {
    value.len() == 8 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn read_hardware_id(path: &Path) -> Option<String> {
    let value = std::fs::read_to_string(path).ok()?;
    let normalized = value.trim().to_ascii_uppercase();
    is_valid_hardware_id(&normalized).then_some(normalized)
}

/// Returns the same opaque 8-character ID for this application installation.
#[tauri::command]
#[specta::specta]
pub fn get_hardware_id(app: AppHandle) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to get app data directory: {error}"))?;
    std::fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("Failed to create app data directory: {error}"))?;

    let id_path = app_data_dir.join(HARDWARE_ID_FILE);
    if let Some(machine_id) = read_hardware_id(&id_path) {
        return Ok(machine_id);
    }

    let machine_id = Uuid::new_v4().simple().to_string()[..8].to_ascii_uppercase();
    let temporary_path = id_path.with_extension("tmp");
    std::fs::write(&temporary_path, &machine_id)
        .map_err(|error| format!("Failed to save hardware ID: {error}"))?;

    if let Err(error) = std::fs::rename(&temporary_path, &id_path) {
        if let Some(existing_id) = read_hardware_id(&id_path) {
            let _ = std::fs::remove_file(&temporary_path);
            return Ok(existing_id);
        }
        let _ = std::fs::remove_file(&temporary_path);
        return Err(format!("Failed to persist hardware ID: {error}"));
    }

    Ok(machine_id)
}

#[cfg(test)]
mod tests {
    use super::is_valid_hardware_id;

    #[test]
    fn accepts_eight_hexadecimal_characters() {
        assert!(is_valid_hardware_id("A1B2C3D4"));
    }

    #[test]
    fn rejects_invalid_hardware_id_values() {
        assert!(!is_valid_hardware_id("A1B2C3"));
        assert!(!is_valid_hardware_id("A1B2C3D!"));
    }
}
