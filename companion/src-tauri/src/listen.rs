use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::sync::{Arc, Mutex};
use std::thread;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const HOST_SCRIPT: &str = r#"
$ErrorActionPreference = 'Continue'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Add-Type -AssemblyName System.Speech

function Convert-Hex([string]$text) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($text)
  -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

function New-Recognizer {
  $installed = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
  $fr = $installed | Where-Object { $_.Culture.Name -like 'fr*' } | Select-Object -First 1
  if ($fr) { return New-Object System.Speech.Recognition.SpeechRecognitionEngine($fr) }
  return New-Object System.Speech.Recognition.SpeechRecognitionEngine
}

$engine = New-Recognizer
try {
  $engine.SetInputToDefaultAudioDevice()
} catch {
  [Console]::Out.WriteLine('E mic')
  [Console]::Out.Flush()
  exit 1
}
$engine.BabbleTimeout = [TimeSpan]::FromSeconds(1)
$engine.InitialSilenceTimeout = [TimeSpan]::FromSeconds(4)
$engine.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(700)

try {
  $phrases = New-Object System.Speech.Recognition.Choices
  @(
    'comment tu t''appelles',
    'qui es-tu',
    'ça va',
    'comment ça va',
    'comment tu vas',
    'tu me vois',
    'tu es là',
    'il est quelle heure',
    'quelle heure est-il',
    'bonne nuit',
    'arrête',
    'stop',
    'bonjour',
    'coucou',
    'salut'
  ) | ForEach-Object { [void]$phrases.Add($_) }
  $builder = New-Object System.Speech.Recognition.GrammarBuilder
  $builder.Append($phrases)
  $engine.LoadGrammar((New-Object System.Speech.Recognition.Grammar $builder))
} catch {}

try {
  $engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
} catch {}

Register-ObjectEvent -InputObject $engine -EventName SpeechDetected -Action {
  [Console]::Out.WriteLine('D')
  [Console]::Out.Flush()
} | Out-Null

Register-ObjectEvent -InputObject $engine -EventName SpeechRecognized -Action {
  $result = $EventArgs.Result
  if (-not $result) { return }
  if ($result.Confidence -lt 0.22) { return }
  $text = $result.Text
  if ([string]::IsNullOrWhiteSpace($text)) { return }
  $bytes = [Text.Encoding]::UTF8.GetBytes($text)
  $hex = -join ($bytes | ForEach-Object { $_.ToString('x2') })
  $conf = [math]::Round($result.Confidence, 2)
  [Console]::Out.WriteLine("R $conf $hex")
  [Console]::Out.Flush()
} | Out-Null

$engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
[Console]::Out.WriteLine('ok')
[Console]::Out.Flush()

try {
  while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    if ($line -eq 'Q') { break }
    if ($line -eq 'P') {
      try { $engine.RecognizeAsyncStop() } catch {}
      [Console]::Out.WriteLine('ok')
      [Console]::Out.Flush()
      continue
    }
    if ($line -eq 'L') {
      try { $engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple) } catch {}
      [Console]::Out.WriteLine('ok')
      [Console]::Out.Flush()
    }
  }
} finally {
  try { $engine.RecognizeAsyncStop() } catch {}
  try { $engine.Dispose() } catch {}
}
"#;

#[derive(Clone, Serialize)]
pub struct TranscriptPayload {
    pub text: String,
    pub confidence: f32,
}

pub struct ListenEngine {
    inner: Mutex<ListenInner>,
    app: Mutex<Option<AppHandle>>,
}

struct ListenInner {
    worker: Option<ListenWorker>,
    paused: bool,
}

struct ListenWorker {
    child: Child,
    stdin: ChildStdin,
}

impl ListenEngine {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(ListenInner {
                worker: None,
                paused: false,
            }),
            app: Mutex::new(None),
        }
    }

    pub fn attach(&self, app: AppHandle) {
        if let Ok(mut slot) = self.app.lock() {
            *slot = Some(app);
        }
    }

    pub fn start(&self) -> Result<(), String> {
        let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
        if inner.worker.is_some() {
            inner.paused = false;
            if let Some(worker) = inner.worker.as_mut() {
                let _ = worker.send("L");
            }
            return Ok(());
        }
        let app = self
            .app
            .lock()
            .ok()
            .and_then(|slot| slot.clone())
            .ok_or("app missing")?;
        let worker = ListenWorker::spawn(app)?;
        inner.worker = Some(worker);
        inner.paused = false;
        Ok(())
    }

    pub fn pause(&self) -> Result<(), String> {
        let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
        inner.paused = true;
        if let Some(worker) = inner.worker.as_mut() {
            worker.send("P")?;
        }
        Ok(())
    }

    pub fn resume(&self) -> Result<(), String> {
        let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
        inner.paused = false;
        if let Some(worker) = inner.worker.as_mut() {
            worker.send("L")?;
        }
        Ok(())
    }

    pub fn stop(&self) -> Result<(), String> {
        let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
        if let Some(mut worker) = inner.worker.take() {
            let _ = worker.send("Q");
            worker.kill();
        }
        inner.paused = false;
        Ok(())
    }

    pub fn is_running(&self) -> bool {
        self.inner
            .lock()
            .ok()
            .map(|inner| inner.worker.is_some() && !inner.paused)
            .unwrap_or(false)
    }
}

impl ListenWorker {
    fn spawn(app: AppHandle) -> Result<Self, String> {
        let script = script_path()?;
        fs::write(&script, HOST_SCRIPT).map_err(|error| error.to_string())?;
        let mut child = Command::new("powershell")
            .args([
                "-NoProfile",
                "-STA",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                script.to_str().ok_or("listen script path")?,
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|error| error.to_string())?;
        let stdin = child.stdin.take().ok_or("listen stdin")?;
        let stdout = child.stdout.take().ok_or("listen stdout")?;
        let (tx, rx) = mpsc::channel::<String>();
        thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            let mut buffer = String::new();
            while reader.read_line(&mut buffer).ok().is_some_and(|count| count > 0) {
                let line = buffer.trim().to_string();
                buffer.clear();
                if tx.send(line).is_err() {
                    break;
                }
            }
        });
        spawn_event_pump(app, rx);
        Ok(Self { child, stdin })
    }

    fn send(&mut self, line: &str) -> Result<(), String> {
        writeln!(self.stdin, "{line}").map_err(|error| error.to_string())?;
        self.stdin.flush().map_err(|error| error.to_string())
    }

    fn kill(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn spawn_event_pump(app: AppHandle, rx: Receiver<String>) {
    thread::spawn(move || {
        while let Ok(line) = rx.recv() {
            if line.eq_ignore_ascii_case("ok") || line.is_empty() {
                continue;
            }
            if line == "D" {
                let _ = app.emit("companion://speech-start", ());
                continue;
            }
            if let Some(payload) = parse_transcript(&line) {
                let _ = app.emit("companion://transcript", payload);
            }
        }
    });
}

fn parse_transcript(line: &str) -> Option<TranscriptPayload> {
    let rest = line.strip_prefix("R ")?;
    let (conf_raw, hex) = rest.split_once(' ')?;
    let confidence = conf_raw.parse::<f32>().unwrap_or(0.0);
    let text = hex_decode(hex)?;
    let text = text.trim().to_string();
    if text.is_empty() {
        return None;
    }
    Some(TranscriptPayload { text, confidence })
}

fn hex_decode(hex: &str) -> Option<String> {
    if hex.len() % 2 != 0 {
        return None;
    }
    let mut bytes = Vec::with_capacity(hex.len() / 2);
    let chars: Vec<char> = hex.chars().collect();
    for chunk in chars.chunks(2) {
        let value = u8::from_str_radix(&format!("{}{}", chunk[0], chunk[1]), 16).ok()?;
        bytes.push(value);
    }
    String::from_utf8(bytes).ok()
}

fn script_path() -> Result<PathBuf, String> {
    Ok(std::env::temp_dir().join("companion-stt-host.ps1"))
}

#[tauri::command]
pub fn start_listening(engine: tauri::State<Arc<ListenEngine>>) -> Result<(), String> {
    engine.start()
}

#[tauri::command]
pub fn stop_listening(engine: tauri::State<Arc<ListenEngine>>) -> Result<(), String> {
    engine.stop()
}

#[tauri::command]
pub fn pause_listening(engine: tauri::State<Arc<ListenEngine>>) -> Result<(), String> {
    engine.pause()
}

#[tauri::command]
pub fn resume_listening(engine: tauri::State<Arc<ListenEngine>>) -> Result<(), String> {
    engine.resume()
}
