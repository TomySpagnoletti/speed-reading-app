use serde_json::{json, Value};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

const DECISIONS_URL: &str = "https://openrouter.ai/api/alpha/decisions";
const KEY_NAME: &str = "OPENROUTER_API_KEY";

struct Store {
    dir: PathBuf,
    ledger_lock: Mutex<()>,
}

impl Store {
    fn ledger(&self) -> PathBuf {
        self.dir.join("ledger.jsonl")
    }

    fn notes(&self) -> PathBuf {
        self.dir.join("notes.md")
    }
}

fn dotenv_path() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../.env")
}

fn read_key(path: &Path) -> Result<String, String> {
    let content = std::fs::read_to_string(path).map_err(|e| format!("Cannot read {}: {e}", path.display()))?;
    content
        .lines()
        .find_map(|line| line.strip_prefix(KEY_NAME)?.strip_prefix('='))
        .map(|value| value.trim().to_string())
        .ok_or(format!("{KEY_NAME} is missing from {}", path.display()))
}

fn ledger_entry(res: &Value) -> Result<Value, String> {
    let field = |pointer: &str| res.pointer(pointer).cloned().ok_or(format!("Response has no {pointer}"));
    let at = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis() as u64;
    Ok(json!({
        "at": at,
        "id": field("/id")?,
        "model": field("/model")?,
        "input_tokens": field("/usage/input_tokens")?,
        "cost": field("/usage/cost")?,
    }))
}

fn create_parent(path: &Path) -> Result<(), String> {
    let dir = path.parent().ok_or(format!("{} has no parent folder", path.display()))?;
    std::fs::create_dir_all(dir).map_err(|e| format!("Cannot create {}: {e}", dir.display()))
}

fn read_optional(path: &Path) -> Result<String, String> {
    match std::fs::read_to_string(path) {
        Ok(content) => Ok(content),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(format!("Cannot read {}: {e}", path.display())),
    }
}

fn append_entry(path: &Path, entry: &Value) -> Result<(), String> {
    create_parent(path)?;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("Cannot open {}: {e}", path.display()))?;
    writeln!(file, "{entry}").map_err(|e| format!("Cannot write {}: {e}", path.display()))
}

fn totals(path: &Path) -> Result<Value, String> {
    let content = read_optional(path)?;
    let mut calls = 0u64;
    let mut cost = 0f64;
    for line in content.lines() {
        let entry: Value = serde_json::from_str(line).map_err(|e| format!("Corrupt ledger line: {e}"))?;
        calls += 1;
        cost += entry["cost"].as_f64().ok_or("Ledger line has no numeric cost")?;
    }
    Ok(json!({ "calls": calls, "cost": cost }))
}

fn reset(path: &Path) -> Result<(), String> {
    match std::fs::remove_file(path) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(format!("Cannot delete {}: {e}", path.display())),
        _ => Ok(()),
    }
}

#[tauri::command]
async fn decide(client: tauri::State<'_, reqwest::Client>, store: tauri::State<'_, Store>, body: Value) -> Result<Value, String> {
    let key = read_key(&dotenv_path())?;
    let res = client
        .post(DECISIONS_URL)
        .bearer_auth(key)
        .header("X-Title", "SpeedRead")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;
    let status = res.status();
    let text = res.text().await.map_err(|e| format!("Cannot read response: {e}"))?;
    if !status.is_success() {
        return Err(format!("OpenRouter {status}: {text}"));
    }
    let json: Value = serde_json::from_str(&text).map_err(|e| format!("Invalid JSON response: {e}"))?;
    let entry = ledger_entry(&json)?;
    let _guard = store.ledger_lock.lock().map_err(|e| e.to_string())?;
    append_entry(&store.ledger(), &entry)?;
    Ok(json)
}

#[tauri::command]
fn ledger_totals(store: tauri::State<'_, Store>) -> Result<Value, String> {
    let _guard = store.ledger_lock.lock().map_err(|e| e.to_string())?;
    totals(&store.ledger())
}

#[tauri::command]
fn reset_ledger(store: tauri::State<'_, Store>) -> Result<(), String> {
    let _guard = store.ledger_lock.lock().map_err(|e| e.to_string())?;
    reset(&store.ledger())
}

#[tauri::command]
fn load_notes(store: tauri::State<'_, Store>) -> Result<String, String> {
    read_optional(&store.notes())
}

#[tauri::command]
fn save_notes(store: tauri::State<'_, Store>, text: String) -> Result<(), String> {
    let path = store.notes();
    create_parent(&path)?;
    std::fs::write(&path, text).map_err(|e| format!("Cannot write {}: {e}", path.display()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().home_dir()?.join(".speedread");
            app.manage(Store { dir, ledger_lock: Mutex::new(()) });
            Ok(())
        })
        .manage(reqwest::Client::new())
        .invoke_handler(tauri::generate_handler![decide, ledger_totals, reset_ledger, load_notes, save_notes])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn project_dotenv_has_key() {
        assert!(read_key(&dotenv_path()).is_ok());
    }

    #[test]
    fn reads_key_line() {
        let path = std::env::temp_dir().join("speedread_test.env");
        std::fs::write(&path, "FOO=1\nOPENROUTER_API_KEY=test-key\n").unwrap();
        let key = read_key(&path);
        std::fs::remove_file(&path).unwrap();
        assert_eq!(key.unwrap(), "test-key");
    }

    #[test]
    fn ledger_accumulates_and_resets() {
        let path = std::env::temp_dir().join("speedread_test_ledger").join("ledger.jsonl");
        let res = json!({ "id": "gen-1", "model": "typesafe/jev-1.13", "usage": { "input_tokens": 10, "cost": 0.25 } });
        reset(&path).unwrap();
        assert_eq!(totals(&path).unwrap(), json!({ "calls": 0, "cost": 0.0 }));
        append_entry(&path, &ledger_entry(&res).unwrap()).unwrap();
        append_entry(&path, &ledger_entry(&res).unwrap()).unwrap();
        assert_eq!(totals(&path).unwrap(), json!({ "calls": 2, "cost": 0.5 }));
        reset(&path).unwrap();
        assert_eq!(totals(&path).unwrap(), json!({ "calls": 0, "cost": 0.0 }));
        std::fs::remove_dir(path.parent().unwrap()).unwrap();
    }
}
