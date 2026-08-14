mod brain;
mod listen;
mod piper;
mod speech;

use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager, PhysicalPosition};

#[derive(Serialize, Deserialize, Default)]
struct WindowPosition {
    x: i32,
    y: i32,
}

#[derive(Serialize)]
struct VoiceStack {
    tts: String,
    brain: String,
    model: Option<String>,
    listening: bool,
}

fn position_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    fs::create_dir_all(&dir).ok()?;
    Some(dir.join("window-position.json"))
}

fn save_position(app: &tauri::AppHandle, x: i32, y: i32) {
    let Some(path) = position_path(app) else { return };
    let payload = WindowPosition { x, y };
    if let Ok(json) = serde_json::to_string(&payload) {
        let _ = fs::write(path, json);
    }
}

fn restore_position(app: &tauri::AppHandle) -> Option<PhysicalPosition<i32>> {
    let path = position_path(app)?;
    let json = fs::read_to_string(path).ok()?;
    let payload: WindowPosition = serde_json::from_str(&json).ok()?;
    Some(PhysicalPosition::new(payload.x, payload.y))
}

fn toggle_window(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("companion") else { return };
    match window.is_visible() {
        Ok(true) => {
            let _ = window.hide();
            let _ = app.emit("companion://visibility", false);
        }
        _ => {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
            let _ = app.emit("companion://visibility", true);
        }
    }
}

#[tauri::command]
fn voice_stack(
    speech: tauri::State<speech::SpeechEngine>,
    listen: tauri::State<Arc<listen::ListenEngine>>,
) -> VoiceStack {
    let brain = brain::status();
    VoiceStack {
        tts: if speech.piper_ready() {
            "piper".into()
        } else {
            "sapi".into()
        },
        brain: brain.brain.into(),
        model: brain.model,
        listening: listen.is_running(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(speech::SpeechEngine::new())
        .manage(Arc::new(listen::ListenEngine::new()))
        .invoke_handler(tauri::generate_handler![
            speech::speak,
            speech::stop_speaking,
            listen::start_listening,
            listen::stop_listening,
            listen::pause_listening,
            listen::resume_listening,
            brain::answer,
            voice_stack,
        ])
        .setup(|app| {
            let data_dir = app.path().app_data_dir().ok();
            app.state::<speech::SpeechEngine>()
                .configure(piper::model_search_dirs(data_dir));
            app.state::<Arc<listen::ListenEngine>>()
                .attach(app.handle().clone());

            if let Some(window) = app.get_webview_window("companion") {
                if let Some(position) = restore_position(app.handle()) {
                    let _ = window.set_position(position);
                }
            }

            let show = MenuItem::with_id(app, "toggle-window", "Afficher / masquer", true, None::<&str>)?;
            let tracking = MenuItem::with_id(
                app,
                "toggle-tracking",
                "Activer / désactiver le face tracking",
                true,
                None::<&str>,
            )?;
            let voice = MenuItem::with_id(
                app,
                "toggle-voice",
                "Activer / désactiver la voix",
                true,
                None::<&str>,
            )?;
            let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &tracking, &voice, &quit])?;

            let mut tray = TrayIconBuilder::new()
                .tooltip("Strobi")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle-window" => toggle_window(app),
                    "toggle-tracking" => {
                        let _ = app.emit("companion://toggle-tracking", ());
                    }
                    "toggle-voice" => {
                        let _ = app.emit("companion://toggle-voice", ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                });

            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }

            tray.build(app)?;

            let handle = app.handle().clone();
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(900));
                let engine = handle.state::<speech::SpeechEngine>();
                let _ = engine.speak("Coucou, je suis Strobi.".to_string());
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Moved(position) = event {
                save_position(window.app_handle(), position.x, position.y);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running the desktop companion");
}
