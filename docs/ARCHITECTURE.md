# Desktop Mate — architecture and pipeline

## 1. Stack choice

| Concern | Choice | Why |
|---|---|---|
| Shell | **Electron** | Transparent, frameless, always-on-top windows with click-through work on Windows and macOS. Node gives the task layer full OS access. |
| Rendering | **PixiJS 6 + pixi-live2d-display 0.4** | The most mature web Live2D runtime: motions, expressions, physics, eye-tracking (`focus`). Pixi 6 is the version it targets. |
| Character | **Live2D Cubism 4/5 model** (`.moc3` + `model3.json`) | Anime look, smooth deformation, cheap at runtime. |
| No-rig option | Parts avatar (`parts-avatar.js`): PNG layers on pivots, driven by `pose.js` | Works with AI-generated art and needs no rigging software. See [PARTS.md](PARTS.md). |
| Fallback | Vector placeholder (`placeholder-avatar.js`) | Used whenever the chosen avatar fails to load. |

Alternatives worth knowing: **Tauri** (much smaller binary; same web renderer code, Rust shell — a good port target later), **Unity + Cubism SDK for Unity** (if you want 3D/VRM or heavy effects), **Spine** (if you want true full-body walk cycles instead of Live2D's deformation-based animation).

## 2. Character asset & animation pipeline

```
Illustration (PSD, parts on separate layers)
  → Cubism Editor: Modeling (ArtMesh, deformers, standard parameters)
  → Cubism Editor: Animation (one .motion3.json per behavior)
  → Export: .moc3 + textures + .model3.json (+ physics3, expressions)
  → assets/models/<Name>/
  → assets/character.json maps animation names → motion groups
```

**Prototype assets.** Download the *Cubism SDK for Web* from live2d.com (accept its license). It contains both pieces you need:
- `Core/live2dcubismcore.min.js` → `assets/vendor/`
- `Samples/Resources/Hiyori/` → `assets/models/Hiyori/`

The samples are under the Live2D Free Material License — fine for learning and personal use; read the terms before shipping or selling anything.

**Production assets.** Commission (or draw) a *full-body chibi* (2–3 heads tall). Full-body matters because this companion walks, climbs and sits; most VTuber models are bust-up and can't. Brief the rigger with:

- **Standard parameter IDs** (`ParamAngleX/Y/Z`, `ParamEyeLOpen`, `ParamEyeLSmile`, `ParamMouthOpenY`, `ParamBodyAngleX/Z`). The code drives these directly for blinking, sleeping, yawning, talking and head tilt.
- **Leg and arm deformers** with parameters for walk swing, sitting and arms-up.
- **One motion group per behavior**, named after the animation names below.
- **Physics** for hair, skirt and ribbon. Dragging and falling look far better with secondary motion.

| Animation name (from brain) | Motion to author | Loop |
|---|---|---|
| `idle` | breathing, small sway | ✓ |
| `walk` / `run` | walk cycle in place (the window does the travelling) | ✓ |
| `sit` | sit down → sitting idle | ✓ |
| `yawn` | stretch + yawn, ~2.5 s | |
| `sleep` | curled up, slow breathing | ✓ |
| `climb` / `cling` | arms up climbing / hanging on | ✓ |
| `fall` / `dragged` | flailing / dangling | ✓ |
| `land` | squash recovery, ~0.35 s | |
| `startled` | jump with surprise | |
| `happy` | cheer / hop | |
| `talk` | gestures (lip sync is driven by code) | ✓ |

Any animation that has no motion mapped still works: the idle motion plays and the procedural pose (`pose.js`) adds bob, lean, squash, eyes and mouth on top.

## 3. Desktop window

- One window, 300×400 DIP, `transparent`, `frame: false`, `skipTaskbar`, `alwaysOnTop('screen-saver')`.
- **The window *is* the character's position.** The main process calls `setBounds` each tick (only when it changed). This is much cheaper than a full-screen overlay and keeps the rest of the desktop untouched.
- **Click-through:** `setIgnoreMouseEvents(true, { forward: true })`. Each frame the renderer hit-tests the cursor position that main sends with every tick, and flips interactivity only over the character or the bubble. This uses tick data rather than `mousemove`, so it stays correct while the window slides under a still cursor.
- **Coordinates:** the brain works in screen DIPs on the work area of the display nearest the character, so the taskbar is the floor, and multiple monitors and DPI scaling just work.
- Files are served over a privileged `app://` protocol, not `file://`, so Live2D's loaders can fetch models with web security left on.

## 4. Behavior state machine (`src/core`)

Pure JS with no Electron imports, so it is unit-tested with `node --test`. Each state is a table entry: `anim`, `surface` (floor / wall / air), `interruptible`, `enter`, `update → next`.

```mermaid
stateDiagram-v2
  [*] --> fall
  fall --> land --> idle
  idle --> walk & sit & toWall & yawn & sleep : chooseNext() weighted by energy
  walk --> idle
  toWall --> climb --> cling
  cling --> climb
  cling --> fall : let go
  cling --> descend --> idle : climb down
  sit --> yawn --> sleep --> wake --> idle
  idle --> approach : cursor resting nearby
  approach --> happy
  idle --> startled : fast swipe
  startled --> flee --> idle
  idle --> happy : petting
  any --> dragged : mouse down
  dragged --> fall : throw
  dragged --> happy : click
```

Each tick runs in priority order:
1. **External events** (drag, say, forced state) are applied immediately.
2. **Cursor reactions** run if the state is interruptible: startle (cursor > 2200 px/s within 160 px; on a wall, startle means falling off), petting (rubbing the head about 1.5 s), curiosity (cursor resting 1.5 s within 480 px), and waking from sleep on a jiggle.
3. **The state's own `update`**, including autonomous choice with `chooseNext()`.
4. **Bounds**: if the floor or wall vanishes (taskbar moved, display unplugged), the companion falls.

**Needs:** `energy` drains while awake and refills while asleep, and it biases the choice toward yawning and sleeping. Add more needs (boredom, hunger, affection) the same way.

## 5. Task layer (`src/main/tasks.js`)

A registry of tools `{ name, description, parse(text) → args | null, run(args, ctx) }`. Today a typed command is matched by the `parse` regexes. The shape is deliberately the same as LLM function calling, so the next step is to send unmatched text to an LLM with these tools declared and route its tool calls back through `run`. Side effects only happen through `ctx` (`say`, `behave`, `openExternal`, `setTimer`), which keeps tools testable and makes permissions easy to audit.

## 6. Roadmap

1. Real Live2D model + motion mapping (see §2).
2. LLM chat with tool calling over the existing registry; streaming replies into the bubble; lip sync from TTS amplitude → `ParamMouthOpenY`.
3. **Window-edge walking:** enumerate top-level windows (Win32 `EnumWindows`/`GetWindowRect`, e.g. through `koffi`) and treat their title bars as extra floors.
4. Ceiling crawling (upside-down `surface: 'ceiling'`).
5. Time-of-day sleepiness; reactions to system events (battery low, new notification, idle user).
6. Settings window, tray icon, autostart, packaging with electron-builder.
