# desktop-mate

An animated anime/Live2D desktop companion for Windows (and macOS). It wanders along the taskbar, climbs the screen edges, falls when it lets go, yawns and naps when tired, reacts to your cursor, and runs small tasks you type to it.

## Run it

```bash
npm install
npm start
```

It starts with a paper-doll character built from PNG parts (`assets/parts/template/`). To use your own art, including AI-generated art, follow [docs/PARTS.md](docs/PARTS.md).

| Interaction | What happens |
|---|---|
| Fast cursor swipe nearby | Startled, may run away (falls off a wall) |
| Cursor resting nearby | Walks over to it, curious |
| Rub the cursor over the head | Happy |
| Click | Happy (or wakes up) |
| Drag and release | Dangles, then is thrown with your mouse velocity |
| Double-click or **Ctrl+Alt+M** | Command box: `help`, `time`, `timer 5 min tea`, `search …`, `open https://…`, `sleep`, `climb` |
| Right-click | Menu: actions, toggle wandering, quit |

## Use a Live2D model

1. Download the **Cubism SDK for Web** from live2d.com.
2. Copy `Core/live2dcubismcore.min.js` → `assets/vendor/`.
3. Copy `Samples/Resources/Hiyori/` → `assets/models/Hiyori/`.
4. Set `"avatar": "live2d"` in `assets/character.json`, then `npm start`. To use another model, edit the `live2d` section (`model`, `height`, and the `motions` map from animation names to the model's motion groups).

## Develop

```bash
npm test
```

```bash
npm run snapshot -- --state=sleep
```

`npm run dist` builds a Windows installer and portable exe into `dist/`.

**CI/CD:** GitHub Actions runs a syntax check and the tests on Ubuntu and Windows for every push to `main`/`develop` and every PR (`.github/workflows/ci.yml`). Pushing a tag like `v0.2.0` builds the Windows installer and portable exe and attaches them to a GitHub release (`.github/workflows/release.yml`).

The tests cover the behavior engine and the task parser. `snapshot` launches the app, optionally forces a state after landing, saves `snapshot.png`, and quits.

```
src/
  core/        behavior engine: brain.js (physics, needs, events), states.js (state table)
  main/        Electron main: window, tick loop, IPC, menu; tasks.js (tool registry)
  preload/     the IPC bridge exposed as window.mate
  renderer/    Pixi stage, click-through, bubble/prompt; avatar/ (pose, face, placeholder, parts, Live2D); dev/ (template exporter)
assets/        character.json, parts/, models/, vendor/
docs/          ARCHITECTURE.md: stack, asset pipeline, state machine, roadmap; PARTS.md: making a parts avatar
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the asset pipeline and design.
