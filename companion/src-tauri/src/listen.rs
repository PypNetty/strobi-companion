use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const HOST_READY_TIMEOUT: Duration = Duration::from_secs(45);

const HOST_SCRIPT: &str = r#"
$ErrorActionPreference = 'Continue'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Add-Type -AssemblyName System.Speech
Add-Type -AssemblyName System.Windows.Forms

$ListenHostSource = @'
using System;
using System.Collections.Concurrent;
using System.Globalization;
using System.Speech.Recognition;
using System.Text;
using System.Threading;

public static class ListenHost {
  static readonly ConcurrentQueue<string> Commands = new ConcurrentQueue<string>();
  static readonly object Gate = new object();
  static SpeechRecognitionEngine engine;
  static volatile bool paused;
  static volatile bool running;
  static volatile bool quit;
  static volatile bool needRestart;
  public static volatile bool Finished;
  static string lastHeard = "";
  static int lastHeardAt;

  public static string Boot() {
    try {
      var installed = SpeechRecognitionEngine.InstalledRecognizers();
      if (installed == null || installed.Count == 0) return "E norecog";
      RecognizerInfo chosen = null;
      foreach (RecognizerInfo info in installed) {
        if (info.Culture != null && info.Culture.Name.StartsWith("fr", StringComparison.OrdinalIgnoreCase)) {
          chosen = info;
          break;
        }
      }
      if (chosen == null) chosen = installed[0];
      engine = new SpeechRecognitionEngine(chosen);
      try {
        engine.SetInputToDefaultAudioDevice();
      } catch {
        return "E mic";
      }
      engine.BabbleTimeout = TimeSpan.FromSeconds(2);
      engine.InitialSilenceTimeout = TimeSpan.FromSeconds(5);
      engine.EndSilenceTimeout = TimeSpan.FromMilliseconds(650);
      LoadGrammars(engine, chosen.Culture);
      engine.SpeechDetected += (s, e) => Write("D");
      engine.SpeechRecognized += (s, e) => {
        if (paused) return;
        if (e == null || e.Result == null) return;
        if (e.Result.Confidence < 0.18f) return;
        var text = e.Result.Text;
        if (string.IsNullOrWhiteSpace(text)) return;
        if (IsDuplicate(text)) return;
        var conf = e.Result.Confidence.ToString("0.00", CultureInfo.InvariantCulture);
        Write("R " + conf + " " + ToHex(text.Trim()));
      };
      engine.RecognizeCompleted += (s, e) => {
        running = false;
        if (!quit && !paused) needRestart = true;
      };
      StartStdinReader();
      StartAsync();
      return "ok";
    } catch {
      return "E start";
    }
  }

  static bool IsDuplicate(string text) {
    var folded = text.Trim().ToLowerInvariant();
    var now = Environment.TickCount;
    if (folded == lastHeard && unchecked(now - lastHeardAt) < 1200) return true;
    lastHeard = folded;
    lastHeardAt = now;
    return false;
  }

  static GrammarBuilder Cultured(CultureInfo culture) {
    var builder = new GrammarBuilder();
    if (culture != null) builder.Culture = culture;
    return builder;
  }

  static void LoadPhraseGrammar(SpeechRecognitionEngine host, CultureInfo culture, string name, int priority, params string[] phrases) {
    var choices = new Choices();
    foreach (var phrase in phrases) choices.Add(phrase);
    var builder = Cultured(culture);
    builder.Append(choices);
    host.LoadGrammar(new Grammar(builder) { Name = name, Priority = priority });
  }

  static void LoadPrefixGrammar(SpeechRecognitionEngine host, CultureInfo culture, string name, int priority, string[] prefixes, string[] tails) {
    var prefix = new Choices(prefixes);
    var tail = new Choices(tails);
    var builder = Cultured(culture);
    builder.Append(prefix);
    builder.Append(tail);
    host.LoadGrammar(new Grammar(builder) { Name = name, Priority = priority });
  }

  static void LoadPrefixDictation(SpeechRecognitionEngine host, CultureInfo culture, string name, int priority, string[] prefixes) {
    try {
      var prefix = new Choices(prefixes);
      var builder = Cultured(culture);
      builder.Append(prefix);
      builder.AppendDictation();
      host.LoadGrammar(new Grammar(builder) { Name = name, Priority = priority });
    } catch {}
  }

  static void LoadGrammars(SpeechRecognitionEngine host, CultureInfo culture) {
    var colors = new string[] {
      "orange", "rouge", "bleu", "bleue", "rose", "vert", "verte",
      "violet", "violette", "jaune", "noir", "noire", "blanc", "blanche"
    };
    var shapePrefixes = new string[] {
      "un", "une", "en",
      "sois un", "sois une", "soit un", "soit une",
      "deviens un", "deviens une", "devient un", "devient une",
      "comme un", "comme une",
      "change toi en", "changes toi en", "fais toi en",
      "transforme toi en"
    };
    LoadPhraseGrammar(host, culture, "talk", 120,
      "comment tu t'appelles", "qui es-tu", "qui es tu", "ca va", "ça va",
      "comment ça va", "comment ca va", "comment tu vas", "tu me vois",
      "tu es là", "tu es la", "tu m'entends", "tu m entends",
      "il est quelle heure", "quelle heure est-il", "bonne nuit",
      "arrête", "arrete", "stop", "tais toi", "silence",
      "bonjour", "coucou", "salut", "hello", "bonsoir",
      "rire", "sourire", "colère", "colere", "en colère", "en colere",
      "triste", "surprise", "dodo", "fais dodo", "joyeuse", "joyeux",
      "reviens à ta couleur", "reviens a ta couleur", "couleur normale",
      "reviens à toi", "reviens a toi", "redeviens strobi", "redeviens Strobi"
    );
    LoadPrefixGrammar(host, culture, "color", 124,
      new string[] { "sois", "soit", "deviens", "couleur" },
      colors);
    LoadPrefixDictation(host, culture, "shape-dictation", 132, shapePrefixes);
    try {
      var free = new DictationGrammar() { Name = "dictation", Weight = 1.0f, Priority = 40 };
      host.LoadGrammar(free);
    } catch {}
  }

  public static void Pump() {
    string command;
    while (Commands.TryDequeue(out command)) {
      if (command == "Q") { Stop(); return; }
      if (command == "P") Pause();
      else if (command == "L") Resume();
    }
    if (needRestart && !paused && !running && !quit) {
      needRestart = false;
      StartAsync();
    }
  }

  static void Pause() {
    paused = true;
    needRestart = false;
    Cancel();
  }

  static void Resume() {
    paused = false;
    if (!running) StartAsync();
  }

  public static void Stop() {
    quit = true;
    paused = true;
    needRestart = false;
    Cancel();
    lock (Gate) {
      if (engine != null) {
        try { engine.Dispose(); } catch {}
        engine = null;
      }
    }
    running = false;
    Finished = true;
  }

  static void StartAsync() {
    lock (Gate) {
      if (quit || paused || running || engine == null) return;
      try {
        engine.RecognizeAsync(RecognizeMode.Multiple);
        running = true;
      } catch {
        needRestart = true;
      }
    }
  }

  static void Cancel() {
    lock (Gate) {
      if (engine == null) return;
      try { engine.RecognizeAsyncCancel(); } catch {}
    }
  }

  static void StartStdinReader() {
    var thread = new Thread(() => {
      try {
        string line;
        while ((line = Console.In.ReadLine()) != null) {
          Commands.Enqueue(line);
          if (line == "Q") break;
        }
      } catch {}
    });
    thread.IsBackground = true;
    thread.Start();
  }

  static string ToHex(string text) {
    var bytes = Encoding.UTF8.GetBytes(text);
    var builder = new StringBuilder(bytes.Length * 2);
    foreach (var value in bytes) builder.Append(value.ToString("x2"));
    return builder.ToString();
  }

  static void Write(string line) {
    try {
      Console.Out.WriteLine(line);
      Console.Out.Flush();
    } catch {}
  }
}
'@

function Install-ListenHost {
  $speechAsm = [System.Speech.Recognition.SpeechRecognitionEngine].Assembly.Location
  $dll = Join-Path $env:TEMP 'companion-stt-host-v11.dll'
  if (Test-Path $dll) {
    try {
      [void][Reflection.Assembly]::LoadFrom($dll)
      [void][ListenHost].Name
      return
    } catch {}
  }
  $refs = @($speechAsm, 'System.dll', 'System.Core.dll')
  try {
    Add-Type -TypeDefinition $ListenHostSource -ReferencedAssemblies $refs -OutputAssembly $dll -OutputType Library
    [void][Reflection.Assembly]::LoadFrom($dll)
  } catch {
    try {
      Add-Type -TypeDefinition $ListenHostSource -ReferencedAssemblies $refs
    } catch {
      [Console]::Out.WriteLine('E compile')
      [Console]::Out.Flush()
      exit 1
    }
  }
}

try {
  Install-ListenHost
} catch {
  [Console]::Out.WriteLine('E compile')
  [Console]::Out.Flush()
  exit 1
}

$ready = [ListenHost]::Boot()
[Console]::Out.WriteLine($ready)
[Console]::Out.Flush()
if ($ready -ne 'ok') { exit 1 }

try {
  while (-not [ListenHost]::Finished) {
    [ListenHost]::Pump()
    [System.Windows.Forms.Application]::DoEvents()
    Start-Sleep -Milliseconds 25
  }
} finally {
  try { [ListenHost]::Stop() } catch {}
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
    dead: Arc<AtomicBool>,
}

struct ListenWorker {
    child: Child,
    stdin: ChildStdin,
    dead: Arc<AtomicBool>,
}

impl ListenEngine {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(ListenInner {
                worker: None,
                paused: false,
                dead: Arc::new(AtomicBool::new(true)),
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
        {
            let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
            if inner.worker_alive() {
                inner.paused = false;
                if let Some(worker) = inner.worker.as_mut() {
                    let _ = worker.send("L");
                }
                return Ok(());
            }
            inner.drop_worker();
        }
        let app = self
            .app
            .lock()
            .ok()
            .and_then(|slot| slot.clone())
            .ok_or("app missing")?;
        let worker = ListenWorker::spawn(app)?;
        let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
        if inner.worker_alive() {
            let mut extra = worker;
            extra.kill();
            inner.paused = false;
            return Ok(());
        }
        inner.dead = worker.dead.clone();
        inner.worker = Some(worker);
        inner.paused = false;
        Ok(())
    }

    pub fn pause(&self) -> Result<(), String> {
        let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
        inner.paused = true;
        if let Some(worker) = inner.worker.as_mut() {
            if !worker.dead.load(Ordering::SeqCst) {
                worker.send("P")?;
            }
        }
        Ok(())
    }

    pub fn resume(&self) -> Result<(), String> {
        let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
        inner.paused = false;
        if let Some(worker) = inner.worker.as_mut() {
            if !worker.dead.load(Ordering::SeqCst) {
                worker.send("L")?;
            }
        }
        Ok(())
    }

    pub fn stop(&self) -> Result<(), String> {
        let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
        inner.drop_worker();
        inner.paused = false;
        Ok(())
    }

    pub fn is_running(&self) -> bool {
        let Ok(mut inner) = self.inner.lock() else {
            return false;
        };
        inner.worker_alive() && !inner.paused
    }
}

impl ListenInner {
    fn worker_alive(&mut self) -> bool {
        let Some(worker) = self.worker.as_mut() else {
            return false;
        };
        if worker.dead.load(Ordering::SeqCst) {
            return false;
        }
        match worker.child.try_wait() {
            Ok(None) => true,
            _ => {
                worker.dead.store(true, Ordering::SeqCst);
                false
            }
        }
    }

    fn drop_worker(&mut self) {
        if let Some(mut worker) = self.worker.take() {
            worker.kill();
        }
        self.dead.store(true, Ordering::SeqCst);
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
        if let Err(error) = wait_for_ready(&rx) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
        let dead = Arc::new(AtomicBool::new(false));
        spawn_event_pump(app, rx, dead.clone());
        Ok(Self { child, stdin, dead })
    }

    fn send(&mut self, line: &str) -> Result<(), String> {
        writeln!(self.stdin, "{line}").map_err(|error| error.to_string())?;
        self.stdin.flush().map_err(|error| error.to_string())
    }

    fn kill(&mut self) {
        self.dead.store(true, Ordering::SeqCst);
        let _ = self.send("Q");
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn wait_for_ready(rx: &Receiver<String>) -> Result<(), String> {
    loop {
        match rx.recv_timeout(HOST_READY_TIMEOUT) {
            Ok(line) if line.eq_ignore_ascii_case("ok") => return Ok(()),
            Ok(line) => {
                if let Some(code) = line.strip_prefix("E ") {
                    return Err(listen_error_message(code));
                }
            }
            Err(RecvTimeoutError::Timeout) => {
                return Err("La reconnaissance vocale Windows n’a pas démarré.".into())
            }
            Err(RecvTimeoutError::Disconnected) => {
                return Err("La reconnaissance vocale Windows s’est arrêtée.".into())
            }
        }
    }
}

fn spawn_event_pump(app: AppHandle, rx: Receiver<String>, dead: Arc<AtomicBool>) {
    thread::spawn(move || {
        let mut last_text = String::new();
        let mut last_at = Instant::now()
            .checked_sub(Duration::from_secs(10))
            .unwrap_or_else(Instant::now);
        while let Ok(line) = rx.recv() {
            if line.eq_ignore_ascii_case("ok") || line.is_empty() {
                continue;
            }
            if line == "D" {
                let _ = app.emit("companion://speech-start", ());
                continue;
            }
            if let Some(code) = line.strip_prefix("E ") {
                let _ = app.emit("companion://listen-error", listen_error_message(code));
                continue;
            }
            if let Some(payload) = parse_transcript(&line) {
                let folded = payload.text.trim().to_lowercase();
                let now = Instant::now();
                if folded == last_text && now.duration_since(last_at) < Duration::from_millis(1_200) {
                    continue;
                }
                last_text = folded;
                last_at = now;
                let _ = app.emit("companion://transcript", payload);
            }
        }
        dead.store(true, Ordering::SeqCst);
        let _ = app.emit(
            "companion://listen-error",
            "Écoute locale arrêtée. Je réessaie.".to_string(),
        );
    });
}

fn listen_error_message(code: &str) -> String {
    match code.trim() {
        "mic" => "Micro Windows indisponible. Active le micro dans Paramètres.".into(),
        "norecog" => {
            "Reconnaissance vocale Windows absente. Installe le pack de langue vocale.".into()
        }
        "compile" | "start" => "Écoute locale indisponible.".into(),
        other => format!("Écoute locale : {other}"),
    }
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
