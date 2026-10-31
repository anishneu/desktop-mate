# Desktop Mate: Animated AI Desktop Companion

A desktop pet that lives on your screen: it wanders the taskbar, climbs the screen edges, naps when it's tired, reacts to your cursor, and runs small tasks you type to it.

**Status: the behavior engine, desktop window, three avatar types (paper-doll parts, Live2D, vector placeholder), the fire-cat character, the command box and Windows packaging are implemented and working.**

The companion is a transparent, click-through window that *is* the character. It moves around the desktop by moving the window, so the rest of the screen is untouched. The design separates deciding from drawing:

- **The brain** is a pure-JavaScript state machine with no Electron imports. It owns physics, needs and cursor reactions, and is unit-tested on its own.
- **The renderer** turns the brain's current animation name into a pose for whichever avatar is loaded.
- **The task layer** is a small tool registry. It uses the same shape as LLM function calling, so a language model can be dropped in later without touching the tools.

The bundled character, a black cat with a flame on its head, was made entirely from free AI-generated images. Each image was cut into layers, and the joints are animated in code, so no frames were hand-drawn and no rigging software was used.

Author: Anish Kuila

![The fire cat in each of its poses](docs/screenshots/poses.png)

## Table of contents
- [What it does](#what-it-does)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Scale](#scale)
- [Install](#install)
- [Quickstart](#quickstart)
- [Making your own character](#making-your-own-character)
- [Project structure](#project-structure)
- [Command reference](#command-reference)
- [Limitations](#limitations)

## What it does

```
          ┌──────────── cursor position, drag events, typed commands ────────────┐
          ▼                                                                      │
 [Main process, 60 Hz tick] ──▶ [Brain: events → cursor reactions → state update → bounds]
  (src/main/main.js)              (src/core/brain.js + states.js, pure JS)
          │                                   │
          │                                   ▼  snapshot {state, anim, facing, x, y}
          │                         window.setBounds(x, y)  ←  the window *is* the character
          ▼
 [Renderer] ──▶ DM.pose(anim) ──▶ [Avatar: parts | Live2D | placeholder] ──▶ hit test ──▶ click-through on/off
  (src/renderer/)  (bob, lean, limbs,     (picks a pose drawing per animation,
                    eyes, mouth, emote)    swings limbs, sways tail, flickers flame)

 Typed command ──▶ [Task registry: parse(text) → run(args, ctx)] ──▶ speech bubble / behavior / browser
                    (src/main/tasks.js)
```

**On launch** the cat drops in from the top of the screen, lands, and waves hello. From then on it lives on its own:

- **Autonomous behavior:** it walks along the taskbar, sits, heads to a screen edge and climbs it, then hangs there for a while. It either climbs a little way down head first, leaps off away from the wall, lands on its feet and strolls on, or lets go and falls.
- **Getting tired:** an energy need drains while it's awake. As energy drops it gives the odd standing yawn and eventually curls up to sleep for a few minutes. After waking it stays up for at least 3 minutes. Going to sleep always runs: lying down drowsy, dozing off, curling up with a yawn, then sleep. When it's rested, or when you click it, it wakes up in steps: curled and drowsy with a couple of slow blinks, lying up, a big yawn, a long stretch, then back to sitting. The lying, dozing, yawning and stretching drawings are edits of the idle drawing, so the head stays the same size the whole way through, and the tail hangs over the taskbar where it reaches lower than the paws.

**It reacts to your cursor:**

| Interaction | What happens |
|---|---|
| Fast swipe straight at the cat | Startled (arched back, hissing), then often runs away from the cursor. On a wall, it falls off. Moving the mouse around beside it doesn't scare it, and it won't startle again for 15 seconds. |
| Cursor moving around it | Nothing: it stays the way it's facing and only its eyes follow. Its tail keeps swishing on its own. |
| Cursor resting nearby | Walks over to it, curious |
| Cursor resting on the cat | Stays put and smiles (^ ^ eyes) while its tail waves in a curly S, the root half one way and the tip half the other. It no longer turns round as the cursor moves across it. |
| Rub the cursor over its head | Happy: ^ ^ eyes, a smile, a heart, blushing cheeks and a warm glow |
| Click | One click at a time: happy, with blushing cheeks, a warm glow and a bigger flame. Wakes it up if asleep. |
| Click over and over | It gets cross: puffs up, glares, glows red, holds its tail stiff and straight, and meows (right-click → **Sounds** to mute). More clicks keep it cross a little longer; it calms down a few seconds after you stop. |
| Drag and release | Dangles from the scruff, swinging as you move it, then is thrown with your mouse's speed |
| Circle the cursor round its head (about twice) | Gets dizzy right where it sits: spiral eyes spinning, a ring of stars, the head wobbling and a paw lifting to keep its balance. Then it comes round, dazed, and carries on. Rubbing back and forth over its head is still a pat. |
| Swing it round in circles, then let go | Lands dizzy: spiral eyes spinning, stars round its head, head wobbling. Then it shakes it off, sits there dazed for a moment and carries on. |
| Double-click or **Ctrl+Alt+M** | Opens the command box |
| Right-click | Menu: talk, focus (25 or 50 min, or stop the running one), actions (walk, sit, yawn, sleep, climb, cheer), toggle wandering, nap-when-away and sounds, quit |
| Leave the PC for 5 minutes (or lock it) | Curls up and sleeps until you're back, then wakes with a stretch and says how long you were away. Turn it off with right-click → **Nap when I'm away**. |

**Each animation uses its own drawing** (see the image above). All drawings are generated images of the same character:

- **Walking:** a side view whose four legs swing in a diagonal gait. It blinks as it walks, eases into its stride, and turns in steps through a front-standing and a three-quarter view (also when it turns round to walk the other way).
- **Running:** a two-drawing gallop that alternates stretched and gathered, with the body rising in the stretch and dropping as it gathers, in step with the drawings.
- **Climbing:** the two front paws and two back legs alternate as it climbs. Climbing down has its own head-first drawing, facing straight down with its flame trailing behind and its legs walking. It stops, coils up, then the two gallop drawings make the leap and the landing, and it strolls on.
- **Other poses:** startled, dangling, falling, landing, waving, yawning, lying down, dozing, sleeping, the four-step wake-up, dizzy after a spin (four drawings), dizzy where it sits (three), shaking it off and the two dazed recoveries each have their own drawing.
- **Turning:** going from facing you to side-on (and back) steps through a front-standing and a three-quarter drawing, all edits of one image so the body stays the same size.
- **Moods without new drawings:** blush, an orange or red glow and angry brows are drawn in code. Drawings with open eyes (walking, climbing, clinging, climbing down, lying, running, dangling and the dazed recoveries) blink with a closed-eye overlay. The spiral eyes on the dizzy drawings are cut out and spun.

Every drawing also gets procedural motion so it never looks frozen:

| Part | Motion |
|---|---|
| Tail | sways: wags when happy, flails when falling, barely moves when asleep. On the front view it's the drawn tail straightened into one strip and bent smoothly along a curve every frame (a rope), so it's one continuous piece with no joints. It swings over the cat's back, centred on straight up, from one side to the other and back; the rest of the tail trails the base, so it bends into an S, and at each end the curl flips over from the root to the tip, so it always curls outward. Its motion settings are in `parts.json` (`tailMotion`). |
| Flame | flickers, calms while sleeping, flares when startled, grows when happy, burns red and wild when cross |
| Whole body | bounces, sways, breathes, or trembles depending on the pose |
| Dangling drawing | swings from the top like a pendulum, following how fast you drag it |

**The command box** understands a small set of tasks: focus sessions (`focus 25`), timers and reminders (`timer 5 min tea`, `remind me at 3pm to call mom`, `remind me every 30 min to drink water`), random picks (`pick pizza or sushi`, `flip a coin`, `roll 2d6`), the time, web searches, opening links, and behaviors (`sleep`, `walk`, `climb`, `dance`). Replies appear in a speech bubble above the cat. Each tool has a `parse` step and a `run` step, and side effects only happen through a context object (`say`, `behave`, `openExternal`, `setTimer`, `startFocus`, …). That keeps the tools testable and is the hook for routing free-form text through an LLM later.

## Tech stack

| Area | Technology | Used for |
|---|---|---|
| Runtime | **Electron 41** (Node.js 20+, Chromium) | The transparent, frameless, always-on-top window; `app://` protocol; IPC between main and renderer; menus, shortcuts, packaging target |
| Language | **JavaScript** (CommonJS in main and core, plain scripts in the renderer) | Everything; no build step or bundler |
| Rendering | **PixiJS 6.5** (WebGL) | The paper-doll rig: sprites on joint containers, dissolves that stretch between drawings' outlines, glow, blush and brow overlays |
| Live2D | **pixi-live2d-display 0.4** with the **Cubism 4** core | The optional Live2D avatar (core and models downloaded separately) |
| Browser APIs | **Canvas 2D**, **Web Audio**, `Image.decode()` | Trimming layers at load, the glow gradient, and the synthesized meow (no audio files) |
| Behavior | Pure JS state machine (`src/core/`) | Physics, needs, cursor reactions; no Electron imports, so it runs under Node |
| Tests | **`node:test`** + `node:assert` | 37 tests: the brain with a seeded RNG, the command parser, and timers and focus sessions with mocked timers |
| Packaging | **electron-builder 26** | NSIS installer and portable exe for Windows |
| CI/CD | **GitHub Actions** | Syntax check and tests on Ubuntu and Windows; tagged releases build and publish both executables |
| Character art | **Google Gemini** (image generation) | Every drawing of the fire cat, generated as edits of one image so the character stays consistent |
| Asset prep | **Python 3** with **NumPy**, **SciPy** and **Pillow** (offline) | Cutting the images into layers: background removal, limb and tail separation, flame extraction, blink and spiral-eye overlays. Not needed to run or build the app. |

## Architecture

| Layer | Technology | Status |
|---|---|---|
| Desktop window | Electron: one transparent, frameless, always-on-top (`screen-saver` level) window, 340 × 400, hidden from the taskbar. It moves with `setBounds` every tick, and the size is passed each time so Windows DPI scaling can't drift it. | Implemented |
| Floor | Every pose stands on its paws at the same height. The window hangs 24 px below the feet (`window.overhang` in `character.json`), over the taskbar, so a tail lying on the floor in front of the cat drapes over the taskbar instead of lifting the pose. | Implemented |
| Click-through | `setIgnoreMouseEvents(true, { forward: true })`, toggled by a per-frame hit test against the cursor position sent with each tick. It works while the window slides under a still cursor. | Implemented |
| File serving | A privileged `app://` protocol serves the project root (with a path-traversal guard), so Live2D's loaders work with web security on | Implemented |
| Behavior engine | Pure JS state machine: 29 states, each with `anim`, `surface` (floor / wall / air), `interruptible`, `enter` and `update` | Implemented |
| Physics | Gravity, air drag, wall bounce, throws from the mouse's speed, falling when a floor or wall disappears (taskbar moved, display unplugged) | Implemented |
| Screen bounds | The renderer reports how far the current drawing reaches (`mate:extent`), and the brain keeps all of it on screen: wide poses ease in from an edge, climbing stops below the top of the screen, and wall poses stay flush with the edge | Implemented |
| Needs | Energy drains while awake and refills while asleep, which biases the next choice toward yawning and sleeping | Implemented |
| Cursor reactions | Startle on a fast swipe, petting on the head, curiosity and approach to a resting cursor, waking on a jiggle, a click versus a flurry of clicks, swinging it round on a drag (dizzy) | Implemented |
| Procedural poses | `pose.js` produces bob, squash, lean, sit, head tilt, limb angles, eyes, mood, mouth and emote for every animation name; all avatars read it | Implemented |
| Parts avatar | Full-canvas PNG layers, auto-trimmed at load, on joint pivots. Supports per-animation pose drawings (timed and looping), four-legged gaits, tail sway, flame flicker, sprite or code-drawn faces, an open-mouth frame swap, blink overlays, spinning parts, blush, brows and glow, multi-step turns, and soft joint stubs so swinging limbs never show a cut. | Implemented |
| Live2D avatar | pixi-live2d-display with Cubism 4: motion groups mapped per animation, eye and mouth parameters driven from the pose, cursor focus | Implemented (needs a model and the Cubism core; see Limitations) |
| Placeholder avatar | A vector chibi used whenever the configured avatar fails to load | Implemented |
| Task layer | Tool registry `{ name, description, parse, run }` with the same shape as LLM function calling | Implemented (regex parsing) |
| Tests | `node --test`: the brain run with a seeded RNG (20 simulated minutes, drag, throw, click, click flurry, spin and dizzy, swipe, petting, sleep and wake, climb down, greeting) plus the task parser | Implemented |
| CI/CD | GitHub Actions: syntax check and tests on Ubuntu and Windows for every push and PR. A `v*` tag builds the Windows installer and portable exe and attaches them to a GitHub release. | Implemented |
| Packaging | electron-builder: NSIS installer and portable exe. Source art (`source*.jpg`) is excluded from the build. | Implemented |

## Scale

Counted directly from the codebase, not estimated:

| Metric | Count |
|---|---|
| Behavior states | 32 |
| Animation names | 29 |
| Avatar types | 3 (parts, Live2D, placeholder) |
| AI-generated source images for the fire cat | 33 (all in use) |
| Pose drawings (per-animation rigs) | 25, plus 2 turn steps |
| PNG layers in the fire cat | 104 |
| Cursor reactions | 6, plus click, click flurry, drag/throw and spin |
| Task tools | 15 (`help`, `focus`, `focus_status`, `stop_focus`, `set_timer`, `remind_at`, `list_timers`, `cancel_timers`, `pick`, `flip_coin`, `roll_dice`, `get_time`, `open_url`, `web_search`, `behave`) |
| IPC channels | 12 |
| Automated tests | 37, across 3 files |
| CI workflows | 2 (CI, release) |
| Build targets | 2 (NSIS installer, portable exe) |

## Install

Requires Node 20+ and Windows 10/11. macOS should work, since the window code is cross-platform, but it hasn't been tested.

```bash
git clone https://github.com/anishneu/desktop-mate.git
cd desktop-mate
npm install
```

## Quickstart

```bash
npm start
```

The fire cat drops onto your taskbar and waves. Running `npm start` again replaces a copy that's already running, so you always see the current code. Right-click it for the menu, or press **Ctrl+Alt+M** to type a command.

Run the tests:

```bash
npm test
```

Check a pose without waiting for it to happen. This launches the app, takes a picture of the window, saves it as `snapshot.png` and quits:

```bash
npm run snapshot -- --state=sleep
```

- `--state=` forces a behavior state once the cat has landed.
- `--delay=300` (milliseconds after forcing) catches short states like `land`.
- `--anim=climb` shows an animation's drawing whatever the state, which is useful for wall and air poses.
- `--frames=12 --every=100` saves a burst of pictures instead of one, to check motion.

Build the Windows installer and portable exe into `dist/`:

```bash
npm run dist
```

To publish a release, push a tag like `v0.2.0`. The release workflow builds both executables and attaches them to a GitHub release.

**Using a Live2D model instead:**
1. Download the Cubism SDK for Web from live2d.com.
2. Copy `Core/live2dcubismcore.min.js` to `assets/vendor/`.
3. Copy a model, for example `Samples/Resources/Hiyori/`, to `assets/models/Hiyori/`.
4. Set `"avatar": "live2d"` in `assets/character.json`.

## Making your own character

No drawing skills or subscriptions are needed:

1. Generate one front-facing image with a free image generator.
2. Cut it into a few layers in Photopea, GIMP or Krita.
3. Write a `parts.json` with the joint positions.
4. For better animation, generate more drawings of the same character, one per pose (walking, sleeping, climbing and so on), and list them under `poses`.

[docs/PARTS.md](docs/PARTS.md) has the full workflow: example prompts, how to cut layers, the `parts.json` format, face modes, pose drawings, four-legged gaits, tails, flames and open-mouth frames. `assets/parts/template/` is a minimal example and `assets/parts/fire-cat/` is the full one.

## Project structure

```
desktop-mate/
├── package.json                 Scripts (start, snapshot, test, dist) + electron-builder config
├── .github/workflows/
│   ├── ci.yml                    Syntax check + tests on Ubuntu and Windows
│   └── release.yml               v* tag → Windows installer + portable exe on a GitHub release
├── assets/
│   ├── character.json            Which avatar to load, window and hitbox size, tuning, Live2D motion map
│   ├── parts/
│   │   ├── template/             The vector chibi exported as parts, with GUIDE.png (joint diagram)
│   │   └── fire-cat/             The fire cat: parts.json, 104 PNG layers, source_*.jpg (not packaged)
│   ├── models/                   Live2D models (git-ignored; see its README)
│   └── vendor/                   Live2D Cubism core (git-ignored; not redistributable)
├── src/
│   ├── core/                     Behavior engine, no Electron imports
│   │   ├── brain.js              Physics, needs, events, cursor reactions, autonomous choice
│   │   └── states.js             The state table
│   ├── main/
│   │   ├── main.js               Window, 60 Hz tick, app:// protocol, IPC, menu, shortcut, snapshot tool
│   │   ├── schedule.js           Timers, reminders and focus sessions
│   │   └── tasks.js              Tool registry for typed commands
│   ├── preload/
│   │   └── preload.js            The IPC bridge exposed to the page as window.mate
│   └── renderer/
│       ├── index.html            Page + CSP
│       ├── renderer.js           Pixi stage, avatar loading with fallback, click-through, drag, bubble, prompt, meow
│       ├── style.css
│       ├── avatar/
│       │   ├── pose.js           Procedural pose for every animation name
│       │   ├── tail-rope.js      The smooth swishing tail (a rope), shared with the tail tuner
│       │   ├── parts-avatar.js   Paper-doll rig: pose drawings, turns, gaits, tail, flame, faces, blush, glow, spinners
│       │   ├── live2d-avatar.js  Live2D model driver
│       │   ├── placeholder-avatar.js  Vector chibi fallback
│       │   ├── face.js           Code-drawn anime eyes and mouth, blinking, gaze
│       │   └── fx.js             Emotes above the head (♥, zzz, !, hi!, MEOW!, 💢)
│       └── dev/
│           └── export-template.js  `npm run export-template`: writes the parts template
├── test/
│   ├── brain.test.js             Behavior engine (seeded RNG)
│   └── tasks.test.js             Command parsing
├── docs/
│   ├── ARCHITECTURE.md           Stack choices, asset pipeline, state machine diagram, roadmap
│   ├── PARTS.md                  Making a parts avatar from AI art
│   └── screenshots/
└── LICENSE
```

## Command reference

Type these into the command box (double-click the cat or press **Ctrl+Alt+M**):

| Command | What it does |
|---|---|
| `help` | Lists what it understands |
| `time` | Says the current time |
| `focus` / `focus 50` / `focus 50 with a 10 min break` | Starts a focus session (25 min with a 5 min break by default). The cat naps on the taskbar while you work, wakes with a stretch when the break starts, and meows when the break is over. |
| `time left` / `stop focus` | How long is left of the session or break / ends it |
| `timer 5 min tea` | Sets a timer of up to 24 hours. The cat tells you when it's done. |
| `remind me in 10 min to stretch` | Same as a timer, with a reminder |
| `remind me at 3pm to call mom` | A reminder at a time of day (`15:30` works too; without am/pm it's whichever comes first) |
| `remind me every 30 min to drink water` | Repeats until you cancel it |
| `timers` / `cancel timers` | Lists what's pending / cancels all timers and reminders |
| `pick pizza, sushi or tacos` | Picks one for you (also `choose between …`) |
| `flip a coin` / `roll` / `roll a d20` / `roll 2d6` | Coin flips and dice |
| `search cute cats` | Opens a DuckDuckGo search in your browser |
| `open https://…` | Opens an http/https link in your browser |
| `sleep` / `nap` | Yawns, then sleeps |
| `walk` / `wander` | Walks somewhere |
| `sit` | Sits down |
| `climb` | Heads to a screen edge (usually the nearer one) and climbs it |
| `dance` / `jump` | Cheers |

## Limitations

- **Few in-between frames:** pose drawings swap in a short dissolve (about 0.2 s) while each stretches towards the other's outline, so the swap reads as the body moving, but this is not true frame-by-frame in-betweening. Only the turn and a few sequences (waking up, dizzy, landing, the gallop) have in-between drawings. Each pose is one drawing whose limbs, tail and body move; nothing changes shape the way a frame-by-frame animation would.
- **Mostly fixed faces:** the front-facing drawing changes expression. The other drawings keep the face they were drawn with, apart from blinking, the yawn's open-mouth frame and the dizzy drawings' spinning eyes.
- **Different proportions:** the AI-generated poses don't share exact proportions. Each pose is scaled so its head roughly matches the idle drawing's, and the gallop's stretched drawing just fits the 340 px window.
- **Screen edges only:** the cat walks the taskbar and climbs the screen edges, not the tops of other windows. That needs Win32 window enumeration and is on the [roadmap](docs/ARCHITECTURE.md).
- **No language model yet:** commands are matched by regular expressions, so phrasing outside those patterns isn't understood. The tool registry is already shaped for LLM function calling, but no model is wired in.
- **Live2D needs your own files:** the Live2D path hasn't been tested with a real model in this repository. The Cubism core and sample models can't be redistributed, so they have to be downloaded separately.
- **Windows-focused:** it's built and tested on Windows 11. macOS and Linux are untested.
- **No settings UI:** there's no settings window, tray icon or start-with-Windows option yet. Settings live in `assets/character.json`.
- **Partial test coverage:** the tests cover the behavior engine and the command parser, not the renderer. Rendering is checked with the snapshot tool.

## License

MIT — see [LICENSE](LICENSE).
