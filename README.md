# Strobi

Strobi is a small Windows desktop creature. She lives on the desk, notices when you are there, looks toward you, and can answer out loud — all on the machine, with no account and no cloud.

This is not Avatar Lab. Avatar Lab is a browser studio for authoring procedural avatars. Strobi is a separate always-on-top companion that only reuses that SVG engine.

## What she does

- Transparent, undecorated, always-on-top window you can drag around the desk
- Tray icon to show, hide, toggle tracking, toggle voice, or quit
- Local webcam face tracking (MediaPipe Face Landmarker; prefers an HD Pro Webcam C920)
- Gaze follows the mouse first, then your face, then idles
- Sleeps after you leave, wakes when you come back
- Looks along a drag; shaking the window makes her dizzy and she says « Arrête ! »
- Local French voice (Piper `fr_FR-siwis-medium`, Windows SAPI fallback)
- Local speech recognition and short keyword answers (« qui es-tu », « tu es là », the time, stop talking)

No webcam frame, microphone audio, or utterance is uploaded.

## Run

Requirements: Node.js 22.12+, pnpm 10, Rust/Cargo, [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the C++ workload, Windows 10/11.

```bash
cd companion
pnpm install
pnpm test
pnpm tauri:dev
```

The first install copies the MediaPipe WASM runtime and downloads the Face Landmarker model into `companion/public/models/` (gitignored). Piper downloads its French voice into `companion/models/` on first use.

Without the Windows C++ toolchain you can still preview the character in a browser:

```bash
cd companion
pnpm dev
```

Open [http://localhost:1420](http://localhost:1420). Transparency, the tray, and always-on-top need `pnpm tauri:dev`.

Leave the Studio (`pnpm dev` at the repo root) closed while the companion uses the camera.

## Layout

| Path | Role |
| --- | --- |
| `companion/` | Tauri 2 app: window, tray, perception, gaze, voice, Q&A |
| `src/features/avatar/` | Procedural SVG engine Strobi renders with |
| `src/features/studio/defaultStudioDocument.json` | Bundled avatar **Strobi** |

Behavior and gaze are unit-tested without a camera or a window (`cd companion && pnpm test`).

## Privacy

Tracking, speech recognition, and TTS stay on the device. There is no backend, no analytics, and no account. Clearing the companion window position only forgets where she sat on the desk.

## License

GNU Affero General Public License v3.0. The procedural engine originated in [Bible Strong Avatar Lab](https://github.com/smontlouis/bible-strong-avatar-lab). See `LICENSE`.
