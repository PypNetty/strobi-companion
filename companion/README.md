# Desktop Companion

Petit compagnon Windows local. Il vit sur le bureau, cligne des yeux, s’endort si personne n’est là, et regarde approximativement vers vous via un face tracking **100 % local**.

Ce n’est pas le Studio d’édition. L’application consomme le moteur procédural déjà présent dans `src/features/` (géométrie, expressions, animations, clignements, mouvement ambient, `eyeOffset`).

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

Le premier `pnpm install` copie le runtime WASM MediaPipe et télécharge le modèle Face Landmarker en local (`public/models/`). Aucune frame webcam n’est envoyée ni stockée.

Sans la chaîne C++ Windows, tu peux déjà prévisualiser le personnage dans le navigateur :

```bash
pnpm dev
```

Ouvre [http://localhost:1420](http://localhost:1420). Le fond transparent, le tray et `always_on_top` nécessitent `pnpm tauri:dev`.

## Tray

- Afficher / masquer
- Activer / désactiver le face tracking
- Quitter

La caméra peut aussi être coupée immédiatement depuis le bandeau qui apparaît au survol.

## Architecture

```text
Webcam → Face Landmarker → Perception → Behavior Engine → Gaze Controller → Avatar runtime SVG
```

Le tracker ne déplace pas les pupilles. Il publie seulement une présence et une position normalisée `-1…1`. Le regard est lissé, avec inertie, délai de réaction et regards ailleurs occasionnels. Déplacer la fenêtre (glisser le compagnon) oriente le regard dans le sens du mouvement, puis le curseur et le visage sont recalculés par rapport à la nouvelle position écran.

La voix est 100 % locale (`speechSynthesis` + micro). Le webview peut bloquer la synthèse tant qu’il n’y a pas eu de clic : le premier clic sur le compagnon débloque la voix. Les répliques sont rares (salut, présence, déplacement, micro) avec un cooldown, sans file d’attente bavarde.

La logique de comportement est testable sans caméra et sans renderer :

```bash
pnpm test
```
