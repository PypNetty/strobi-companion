use std::io::{BufRead, BufReader, Write};
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use crate::piper::PiperTts;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const SPEAK_TIMEOUT: Duration = Duration::from_secs(15);

const HOST_SCRIPT: &str = r#"
$ErrorActionPreference = 'Continue'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Add-Type -AssemblyName System.Speech

function New-Voice {
  $voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $fr = $voice.GetInstalledVoices() | Where-Object {
    $_.VoiceInfo.Culture.Name -like 'fr*' -or $_.VoiceInfo.Name -match 'Hortense|Julie|Denise'
  } | Select-Object -First 1
  if ($fr) { $voice.SelectVoice($fr.VoiceInfo.Name) }
  $voice.Rate = 1
  return $voice
}

$speak = New-Voice
try {
  while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    if ($line -eq 'Q') { break }
    if ($line -eq 'X') {
      try { $speak.SpeakAsyncCancelAll() } catch {}
      try { if ($script:player) { $script:player.Stop() } } catch {}
      [Console]::Out.WriteLine('ok')
      [Console]::Out.Flush()
      continue
    }
    if ($line.StartsWith('P ')) {
      $hex = $line.Substring(2)
      $bytes = New-Object byte[] ($hex.Length / 2)
      for ($i = 0; $i -lt $bytes.Length; $i++) {
        $bytes[$i] = [Convert]::ToByte($hex.Substring($i * 2, 2), 16)
      }
      $path = [Text.Encoding]::UTF8.GetString($bytes)
      $played = $false
      try {
        $script:player = New-Object System.Media.SoundPlayer
        $script:player.SoundLocation = $path
        $script:player.Load()
        $script:player.PlaySync()
        $played = $true
      } catch {}
      if ($played) {
        [Console]::Out.WriteLine('ok')
      } else {
        [Console]::Out.WriteLine('err')
      }
      [Console]::Out.Flush()
      continue
    }
    if (-not $line.StartsWith('S ')) { continue }
    $hex = $line.Substring(2)
    $bytes = New-Object byte[] ($hex.Length / 2)
    for ($i = 0; $i -lt $bytes.Length; $i++) {
      $bytes[$i] = [Convert]::ToByte($hex.Substring($i * 2, 2), 16)
    }
    $text = [Text.Encoding]::UTF8.GetString($bytes)
    try {
      $speak.Speak($text)
    } catch {
      try { $speak.Dispose() } catch {}
      $speak = New-Voice
      $speak.Speak($text)
    }
    try { $speak.Dispose() } catch {}
    $speak = New-Voice
    [Console]::Out.WriteLine('ok')
    [Console]::Out.Flush()
  }
} finally {
  try { $speak.Dispose() } catch {}
}
"#;

pub struct SpeechEngine {
    inner: Mutex<EngineInner>,
    piper: PiperTts,
}

struct EngineInner {
    worker: Option<Worker>,
}

struct Worker {
    child: Child,
    stdin: ChildStdin,
    lines: Receiver<String>,
}

impl Default for SpeechEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl SpeechEngine {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(EngineInner { worker: None }),
            piper: PiperTts::new(),
        }
    }

    pub fn configure(&self, search_dirs: Vec<std::path::PathBuf>) {
        self.piper.configure(search_dirs);
        self.piper.ensure_installed();
    }

    pub fn piper_ready(&self) -> bool {
        self.piper.is_ready()
    }

    pub fn speak(&self, text: String) -> Result<(), String> {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return Ok(());
        }
        if self.piper.is_ready() {
            if let Ok(wav) = self.piper.synthesize(trimmed) {
                let played = self.play_wav(&wav);
                let _ = std::fs::remove_file(&wav);
                if played.is_ok() {
                    return played;
                }
            }
        }
        let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
        match inner.speak_once(trimmed) {
            Ok(()) => Ok(()),
            Err(_) => {
                inner.drop_worker();
                inner.speak_once(trimmed)
            }
        }
    }

    fn play_wav(&self, path: &std::path::Path) -> Result<(), String> {
        let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
        match inner.play_once(path) {
            Ok(()) => Ok(()),
            Err(_) => {
                inner.drop_worker();
                inner.play_once(path)
            }
        }
    }

    pub fn stop(&self) -> Result<(), String> {
        let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
        inner.stop();
        Ok(())
    }
}

impl EngineInner {
    fn speak_once(&mut self, text: &str) -> Result<(), String> {
        self.ensure_worker()?;
        let worker = self.worker.as_mut().ok_or("tts worker missing")?;
        worker.drain();
        worker.send(&format!("S {}", hex_encode(text)))?;
        match worker.wait_ok(SPEAK_TIMEOUT) {
            Ok(()) => Ok(()),
            Err(error) => {
                self.drop_worker();
                Err(error)
            }
        }
    }

    fn play_once(&mut self, path: &std::path::Path) -> Result<(), String> {
        self.ensure_worker()?;
        let worker = self.worker.as_mut().ok_or("tts worker missing")?;
        worker.drain();
        worker.send(&format!("P {}", hex_encode(path.to_string_lossy().as_ref())))?;
        match worker.wait_ok(SPEAK_TIMEOUT) {
            Ok(()) => Ok(()),
            Err(error) => {
                self.drop_worker();
                Err(error)
            }
        }
    }

    fn ensure_worker(&mut self) -> Result<(), String> {
        if let Some(worker) = self.worker.as_mut() {
            if worker.alive() {
                return Ok(());
            }
        }
        self.worker = Some(Worker::spawn()?);
        Ok(())
    }

    fn stop(&mut self) {
        self.drop_worker();
    }

    fn drop_worker(&mut self) {
        if let Some(mut worker) = self.worker.take() {
            worker.kill();
        }
    }
}

impl Worker {
    fn spawn() -> Result<Self, String> {
        let script = script_path()?;
        std::fs::write(&script, HOST_SCRIPT).map_err(|error| error.to_string())?;
        let mut child = Command::new("powershell")
            .args([
                "-NoProfile",
                "-STA",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                script.to_str().ok_or("tts script path")?,
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|error| error.to_string())?;
        let stdin = child.stdin.take().ok_or("tts stdin")?;
        let stdout = child.stdout.take().ok_or("tts stdout")?;
        let (tx, lines) = mpsc::channel();
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
        Ok(Self {
            child,
            stdin,
            lines,
        })
    }

    fn drain(&mut self) {
        while self.lines.try_recv().is_ok() {}
    }

    fn alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }

    fn send(&mut self, line: &str) -> Result<(), String> {
        writeln!(self.stdin, "{line}").map_err(|error| error.to_string())?;
        self.stdin.flush().map_err(|error| error.to_string())
    }

    fn wait_ok(&mut self, timeout: Duration) -> Result<(), String> {
        loop {
            match self.lines.recv_timeout(timeout) {
                Ok(line) if line.eq_ignore_ascii_case("ok") => return Ok(()),
                Ok(line) if line.eq_ignore_ascii_case("err") => return Err("tts play failed".into()),
                Ok(_) => continue,
                Err(RecvTimeoutError::Timeout) => return Err("tts timeout".into()),
                Err(RecvTimeoutError::Disconnected) => return Err("tts worker exited".into()),
            }
        }
    }

    fn kill(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn script_path() -> Result<PathBuf, String> {
    Ok(std::env::temp_dir().join("companion-tts-host.ps1"))
}

fn hex_encode(text: &str) -> String {
    text.as_bytes().iter().map(|byte| format!("{byte:02x}")).collect()
}

#[tauri::command]
pub fn speak(engine: tauri::State<SpeechEngine>, text: String) -> Result<(), String> {
    engine.speak(text)
}

#[tauri::command]
pub fn stop_speaking(engine: tauri::State<SpeechEngine>) -> Result<(), String> {
    engine.stop()
}
