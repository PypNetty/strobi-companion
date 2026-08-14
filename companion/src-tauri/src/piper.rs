use std::fs;
use std::io::Write;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const PIPER_ZIP: &str =
    "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip";
const VOICE_ONNX: &str = "https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx?download=true";
const VOICE_JSON: &str = "https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx.json?download=true";
const VOICE_NAME: &str = "fr_FR-siwis-medium";

#[derive(Clone, Debug)]
pub struct PiperReady {
    pub exe: PathBuf,
    pub model: PathBuf,
}

#[derive(Clone)]
pub struct PiperTts {
    inner: Arc<Mutex<PiperInner>>,
}

#[derive(Default)]
struct PiperInner {
    search_dirs: Vec<PathBuf>,
    ready: Option<PiperReady>,
    installing: bool,
}

impl PiperTts {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(PiperInner::default())),
        }
    }

    pub fn configure(&self, search_dirs: Vec<PathBuf>) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.search_dirs = search_dirs;
            inner.ready = find_piper(&inner.search_dirs);
        }
    }

    pub fn is_ready(&self) -> bool {
        self.inner
            .lock()
            .ok()
            .and_then(|inner| inner.ready.clone())
            .is_some()
    }

    pub fn ensure_installed(&self) {
        let mut inner = match self.inner.lock() {
            Ok(inner) => inner,
            Err(_) => return,
        };
        if inner.ready.is_some() || inner.installing {
            return;
        }
        inner.installing = true;
        let dirs = inner.search_dirs.clone();
        drop(inner);
        let shared = Arc::clone(&self.inner);
        thread::spawn(move || {
            let install_dir = dirs
                .iter()
                .find(|dir| !dir.components().any(|part| part.as_os_str() == "src-tauri"))
                .cloned()
                .unwrap_or_else(|| std::env::temp_dir().join("strobi-models"));
            let ready = install_piper(&install_dir).ok().or_else(|| find_piper(&dirs));
            if let Ok(mut inner) = shared.lock() {
                inner.ready = ready;
                inner.installing = false;
            }
        });
    }

    pub fn synthesize(&self, text: &str) -> Result<PathBuf, String> {
        let ready = self
            .inner
            .lock()
            .map_err(|error| error.to_string())?
            .ready
            .clone()
            .ok_or_else(|| "piper not ready".to_string())?;
        synthesize_wav(&ready, text)
    }
}

fn find_piper(dirs: &[PathBuf]) -> Option<PiperReady> {
    dirs.iter().find_map(|dir| find_in_dir(dir))
}

fn find_in_dir(root: &Path) -> Option<PiperReady> {
    if !root.exists() {
        return None;
    }
    let exe = find_named(root, "piper.exe", 4)?;
    let preferred = [
        format!("{VOICE_NAME}.onnx"),
        "fr_FR-siwis-low.onnx".into(),
        "fr_FR-upmc-medium.onnx".into(),
    ];
    let mut model = None;
    for name in preferred {
        if let Some(path) = find_named(root, &name, 4) {
            model = Some(path);
            break;
        }
    }
    let model = model.or_else(|| find_onnx(root, 4))?;
    let json = model.with_extension("onnx.json");
    if !json.exists() {
        return None;
    }
    Some(PiperReady { exe, model })
}

fn find_named(root: &Path, name: &str, depth: usize) -> Option<PathBuf> {
    if depth == 0 {
        return None;
    }
    let candidate = root.join(name);
    if candidate.is_file() {
        return Some(candidate);
    }
    let entries = fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_named(&path, name, depth - 1) {
                return Some(found);
            }
        }
    }
    None
}

fn find_onnx(root: &Path, depth: usize) -> Option<PathBuf> {
    if depth == 0 {
        return None;
    }
    let entries = fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if let Some(name) = path.file_name().and_then(|value| value.to_str()) {
                if name.starts_with("fr_FR-") && name.ends_with(".onnx") {
                    return Some(path);
                }
            }
        } else if path.is_dir() {
            if let Some(found) = find_onnx(&path, depth - 1) {
                return Some(found);
            }
        }
    }
    None
}

fn install_piper(dir: &Path) -> Result<PiperReady, String> {
    fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    let zip = dir.join("piper_windows_amd64.zip");
    download(PIPER_ZIP, &zip)?;
    unzip(&zip, dir)?;
    let onnx = dir.join(format!("{VOICE_NAME}.onnx"));
    let json = dir.join(format!("{VOICE_NAME}.onnx.json"));
    download(VOICE_ONNX, &onnx)?;
    download(VOICE_JSON, &json)?;
    find_in_dir(dir).ok_or_else(|| "piper files missing after install".into())
}

fn download(url: &str, dest: &Path) -> Result<(), String> {
    if dest.is_file() && dest.metadata().map(|meta| meta.len() > 1024).unwrap_or(false) {
        return Ok(());
    }
    let tmp = dest.with_extension("part");
    let status = Command::new("curl.exe")
        .args(["-L", "--fail", "--retry", "2", "--max-time", "180", "-o"])
        .arg(&tmp)
        .arg(url)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|error| error.to_string())?;
    if !status.success() {
        let _ = fs::remove_file(&tmp);
        return Err(format!("download failed: {url}"));
    }
    fs::rename(&tmp, dest).map_err(|error| error.to_string())
}

fn unzip(zip: &Path, dest: &Path) -> Result<(), String> {
    let dest_arg = dest.to_string_lossy().replace('\'', "''");
    let zip_arg = zip.to_string_lossy().replace('\'', "''");
    let status = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            &format!("Expand-Archive -LiteralPath '{zip_arg}' -DestinationPath '{dest_arg}' -Force"),
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|error| error.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("unzip piper failed".into())
    }
}

fn synthesize_wav(ready: &PiperReady, text: &str) -> Result<PathBuf, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("empty text".into());
    }
    let dir = std::env::temp_dir();
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or(Duration::from_millis(1))
        .as_millis();
    let output = dir.join(format!("strobi-{stamp}.wav"));
    let cwd = ready.exe.parent().unwrap_or_else(|| Path::new("."));
    let mut child = Command::new(&ready.exe)
        .current_dir(cwd)
        .args([
            "-m",
            &ready.model.to_string_lossy(),
            "--output_file",
            &output.to_string_lossy(),
            "--sentence_silence",
            "0.12",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| error.to_string())?;
    {
        let mut stdin = child.stdin.take().ok_or_else(|| "piper stdin".to_string())?;
        stdin
            .write_all(trimmed.as_bytes())
            .map_err(|error| error.to_string())?;
        stdin.write_all(b"\n").map_err(|error| error.to_string())?;
    }
    let status = child.wait().map_err(|error| error.to_string())?;
    if !status.success() || !output.is_file() {
        let _ = fs::remove_file(&output);
        return Err("piper failed".into());
    }
    Ok(output)
}

pub fn model_search_dirs(data_dir: Option<PathBuf>) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let bundled = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../models");
    dirs.push(bundled);
    if let Ok(cwd) = std::env::current_dir() {
        if !cwd.ends_with("src-tauri") {
            dirs.push(cwd.join("models"));
        }
    }
    if let Some(data) = data_dir {
        dirs.push(data.join("models"));
    }
    dirs
}
