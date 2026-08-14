mod brain;
mod listen;
mod piper;
mod speech;

use std::fs;
use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize};

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

fn clamp_to_visible(
    window: &tauri::WebviewWindow,
    position: PhysicalPosition<i32>,
) -> PhysicalPosition<i32> {
    let Ok(monitors) = window.available_monitors() else {
        return position;
    };
    let size = window
        .outer_size()
        .unwrap_or(PhysicalSize::new(280, 320));
    let width = size.width as i32;
    let height = size.height as i32;
    let on_screen = monitors.iter().any(|monitor| {
        let origin = monitor.position();
        let area = monitor.size();
        let right = origin.x + area.width as i32;
        let bottom = origin.y + area.height as i32;
        position.x + width > origin.x
            && position.x < right
            && position.y + height > origin.y
            && position.y < bottom
    });
    if on_screen {
        return position;
    }
    if let Ok(Some(primary)) = window.primary_monitor() {
        let origin = primary.position();
        let area = primary.size();
        return PhysicalPosition::new(
            origin.x + (area.width as i32 - width).max(0) / 2,
            origin.y + (area.height as i32 - height).max(0) / 2,
        );
    }
    position
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
                    let _ = window.set_position(clamp_to_visible(&window, position));
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
