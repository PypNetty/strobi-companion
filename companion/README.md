# Strobi

Petit compagnon Windows. Elle vit sur le bureau, détecte ta présence en local, te regarde, et peut répondre à voix haute.

Ce n’est pas le Studio d’édition. L’application dans ce dossier consomme le moteur SVG déjà présent à la racine du dépôt (`src/features/avatar/`), sans l’interface Avatar Lab.

Le README du dépôt décrit le produit. Ici : comment lancer l’app.

## Lancer

Prérequis :

- Node.js 22.12+
- pnpm 10
- Rust / Cargo
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the C++ workload (`link.exe`)
- Windows 10/11

```bash
cd companion
pnpm install
pnpm test
pnpm tauri:dev
```

Le premier `pnpm install` copie le runtime WASM MediaPipe et télécharge le modèle Face Landmarker (`public/models/`). Piper télécharge la voix `fr_FR-siwis-medium` dans `models/` au premier usage. Aucune frame webcam ni audio n’est envoyé.

Sans la chaîne C++ Windows, tu peux déjà prévisualiser le personnage dans le navigateur :

```bash
pnpm dev
```

Ouvre [http://localhost:1420](http://localhost:1420). Le fond transparent, le tray et `always_on_top` nécessitent `pnpm tauri:dev`.

Ferme le Studio (`pnpm dev` à la racine) tant que Strobi utilise la caméra.

## Tray

- Afficher / masquer
- Activer / désactiver le face tracking
- Activer / désactiver la voix
- Quitter

La caméra peut aussi être coupée depuis le bandeau au survol.

## Architecture

```text
Webcam → Face Landmarker → Perception → Behavior Engine → Gaze Controller → Avatar runtime SVG
Micro → reconnaissance locale → intents (et Ollama si installé) → Piper / SAPI
```

Le tracker ne déplace pas les pupilles. Il publie une présence et une position `-1…1`. Le regard est lissé (souris > visage > idle). Un drag oriente le regard ; une secousse la rend étourdie.

La logique de comportement, du regard et des intents est testable sans caméra :

```bash
pnpm test
```
