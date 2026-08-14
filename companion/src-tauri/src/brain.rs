use std::fs;
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use serde_json::{json, Value};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const PREFERRED_MODELS: &[&str] = &[
    "llama3.2:1b",
    "qwen2.5:0.5b",
    "qwen2.5:1.5b",
    "phi3:mini",
    "gemma2:2b",
    "llama3.2:3b",
    "qwen2.5:3b",
];

#[derive(Debug, Clone, Default)]
pub struct BrainStatus {
    pub brain: &'static str,
    pub model: Option<String>,
}

#[derive(Deserialize)]
struct GenerateResponse {
    response: Option<String>,
}

pub fn status() -> BrainStatus {
    match pick_model() {
        Some(model) => BrainStatus {
            brain: "ollama",
            model: Some(model),
        },
        None => BrainStatus {
            brain: "keywords",
            model: None,
        },
    }
}

pub fn generate_reply(text: &str, time: &str) -> Result<String, String> {
    let model = pick_model().ok_or_else(|| "ollama missing".to_string())?;
    let prompt = text.trim();
    if prompt.is_empty() {
        return Err("empty prompt".into());
    }
    let system = format!(
        "Tu es Strobi, une petite créature de bureau. Réponds en une seule phrase courte en français. Pas d'emoji, pas de liste, pas d'anglais. Heure locale: {time}."
    );
    let payload = json!({
        "model": model,
        "prompt": prompt,
        "system": system,
        "stream": false,
        "keep_alive": "10m",
        "options": {
            "num_predict": 48,
            "temperature": 0.6,
            "top_p": 0.9
        }
    });
    let raw = post_json("http://127.0.0.1:11434/api/generate", &payload, 12)?;
    let parsed: GenerateResponse =
        serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    let reply = parsed
        .response
        .unwrap_or_default()
        .split('\n')
        .next()
        .unwrap_or_default()
        .trim()
        .to_string();
    if reply.is_empty() {
        return Err("empty reply".into());
    }
    Ok(truncate_sentence(&reply, 180))
}

fn pick_model() -> Option<String> {
    let raw = get_json("http://127.0.0.1:11434/api/tags", 2).ok()?;
    let value: Value = serde_json::from_str(&raw).ok()?;
    let models = value.get("models")?.as_array()?;
    let names: Vec<String> = models
        .iter()
        .filter_map(|entry| entry.get("name")?.as_str().map(ToOwned::to_owned))
        .collect();
    for preferred in PREFERRED_MODELS {
        if let Some(hit) = names.iter().find(|name| {
            name == preferred || name.starts_with(&format!("{preferred}-")) || name.starts_with(preferred)
        }) {
            return Some(hit.clone());
        }
    }
    None
}

fn get_json(url: &str, timeout_secs: u64) -> Result<String, String> {
    curl(&["-sS", "--max-time", &timeout_secs.to_string(), url])
}

fn post_json(url: &str, payload: &Value, timeout_secs: u64) -> Result<String, String> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let file = std::env::temp_dir().join(format!("strobi-ollama-{stamp}.json"));
    fs::write(&file, payload.to_string()).map_err(|error| error.to_string())?;
    let file_arg = format!("@{}", file.display());
    let result = curl(&[
        "-sS",
        "--max-time",
        &timeout_secs.to_string(),
        "-H",
        "Content-Type: application/json",
        "--data-binary",
        &file_arg,
        url,
    ]);
    let _ = fs::remove_file(&file);
    result
}

fn curl(args: &[&str]) -> Result<String, String> {
    let output = Command::new("curl.exe")
        .args(args)
        .stdin(Stdio::null())
        .stderr(Stdio::piped())
        .stdout(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err("curl failed".into());
    }
    String::from_utf8(output.stdout).map_err(|error| error.to_string())
}

fn truncate_sentence(text: &str, max_chars: usize) -> String {
    let trimmed = text.trim();
    let end = trimmed.find(['.', '!', '?']).map(|index| index + 1);
    let first = end.map(|index| trimmed[..index].to_string()).unwrap_or_else(|| trimmed.to_string());
    if first.chars().count() <= max_chars {
        return first;
    }
    first.chars().take(max_chars).collect()
}

#[tauri::command]
pub fn answer(text: String, time: String) -> Result<String, String> {
    generate_reply(&text, &time)
}
