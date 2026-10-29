# Making a parts avatar (AI art friendly)

A parts avatar is a paper doll: one character image cut into a few PNG layers. The app rotates the layers at their joints with the same procedural animations as the built-in chibi, so you never draw animation frames.

`assets/parts/template/` is a complete working example (the built-in chibi exported as parts). Open `GUIDE.png` in it to see every joint, and copy the folder to start your own. `assets/parts/fire-cat/` is a second example: an AI image cut into a head, body, tail and flame with eye and mouth variants, plus a side-view walk drawing with four swinging legs and a curled-up sleep drawing (see step 6).

## 1. Generate the character

Use any free image generator. Ask for one image in a pose that's easy to cut:

> Full-body chibi anime girl, 2.5 heads tall, standing straight, facing the viewer, arms slightly away from the body, legs slightly apart, flat cel shading, clean outlines, plain white background. Lavender hair with a pink ribbon, navy sailor dress.

- **Arms away from the body** and **legs apart** mean fewer hidden areas to patch after cutting.
- In the same chat, ask for variants of the *same image*: "eyes closed", "happy closed eyes ^ ^", "mouth open". You'll cut the eyes and mouth out of these. Or ask for "a blank face with no eyes or mouth" and let the app draw them (see step 4).
- The bigger the image, the better. 1000–3000 px tall is ideal. The app scales it down.

## 2. Cut it into layers (Photopea, GIMP or Krita, all free)

1. Open the image and remove the background. In Photopea: **Select → Remove BG**, or the magic wand on the white background, then Delete.
2. For each part, duplicate the full layer and erase everything except that part, or lasso the part and use **Layer via Cut**. **Never move or crop a layer.** Every part must stay exactly where it was on the full canvas. That's what lets the app line them up without any positioning.
3. Export each layer as a PNG of the **whole canvas**: hide all other layers, then **File → Export As → PNG**. Turn off "trim" if the export dialog offers it.

| File | Required? | Contains |
|---|---|---|
| `torso.png` | **yes**, the minimum | Body and dress (or the whole character, to start simple) |
| `head.png` | recommended | Face and ears (without the front hair if you have `hairFront`) |
| `hairBack.png` | optional | Hair behind the body. Rotates with the head. |
| `hairFront.png` | optional | Bangs, drawn on top of the eyes |
| `armLeft.png`, `armRight.png` | optional | Each whole arm with its hand |
| `legLeft.png`, `legRight.png` | optional | Each whole leg with its shoe |
| `tail.png` | optional | A tail, drawn behind the body. Sways on its own, faster when walking, wags when happy. Needs `pivots.tail` (the tail's base). |
| `flame.png` | optional | Fire, sparkles or an antenna on the head that flickers. Leave the same art in `head.png` too: the flame only ever grows, so the copy underneath stays covered. Needs `pivots.flame` (its base). |
| `open.png` | optional, for poses | The same drawing with the mouth open (generate it as an edit of the closed one so nothing else moves). It replaces the drawing while the animation's mouth is open, e.g. yawning. |
| `tailRope` (generated; main drawing only) | optional | The tail as one strip to bend smoothly at run time: `{"texture": "tail_rope.png", "points": […], "turns": […], "heading": h}`, made by straightening `tail.png` along its centre line from `pivots.tail` (behind the body) to the tip. `tailMotion` sets how it swishes (`speed`, `range`, `lean`, `hold`, `mode`, `curl`, `lag`, `mirror`, `drag`, `ripple`, `rspeed`; see `tail-rope.js` for the defaults). It replaces the other tail options. |
| `tailSweep` (`true`; main drawing only) | optional | The tail swings 180° over the back, from one side of the body to the other and back, fast like a cat's. Put `pivots.tail` behind the middle of the body, low down, so the tail's root stays hidden as it swings; on the far side it is mirrored, so its tip curls outward. Cut `tail.png` from an edit of the main image that only redraws the tail. With `tailSegments` it bends as it swings: the rest of the tail trails the base (an S), and at each end the curl flips over from the root to the tip. |
| `tailPoses` (a list; with `tailSegments`) | optional | Shapes for the segmented tail to glide between, low to high and back: each is `[root turn, then each joint's turn]` in radians relative to the tail as drawn, and the first is all zeros (the drawing). The fire cat's were traced from drawings that only move the tail, so the tail keeps its own look. While it flows through them, the tail also sweeps behind the body to the other side and back (mirrored about the feet), so put `feet[0]` on the body's middle. Without it the tail sways in a travelling S-wave. |
| `tailSegments` (a list, not a part; main drawing only) | optional | The tail cut into a chain, root first: `[{"part": "tail_seg1.png", "at": [x, y]}, …]`, where `at` is the joint each segment bends at (the first is `pivots.tail`). Let each segment reach a few px back under the one before it, so a bend never opens a gap. More, shorter segments bend more smoothly (the fire cat uses 12). It replaces `tail.png` on screen, is posed as an S-wave travelling from root to tip (most of the drawn curl is cancelled first; the tip keeps its own). |
| `spin` (a list, not a part) | optional, for poses | Discs that turn in place, such as spiral eyes: `{"part": "eye.png", "at": [x, y], "squash": [sx, sy], "speed": 5}`. Draw the disc round, centered on `at`. `squash` makes it oval again on screen, so it turns inside an oval eye. `speed` is in radians per second. |
| `blink.png` | optional, for poses | Closed eyes painted over a drawing whose eyes are part of the body (e.g. a side-on walk). It shows while the cat blinks. |
| `eyes_open.png`, `eyes_closed.png`, `eyes_happy.png` (`eyes_surprised.png` optional) | for sprite faces | Both eyes, cut from the variant images |
| `mouth_closed.png`, `mouth_open.png`, `mouth_wide.png`, `mouth_smile.png` | for sprite faces | The mouth, cut from the variant images |

"Left" and "right" mean **as you look at the picture**.

Tips:
- **Leave extra at the joints.** Keep a little of the shoulder at the top of each arm and a little of the thigh at the top of each leg, so no gap appears when they swing.
- **Patch holes left behind.** Once an arm is cut out, the torso behind it may have a hole. Paint over it with a nearby color, or use Photopea's **Spot Healing Brush**. It won't show much, because the arm covers it most of the time.
- **Start small.** A single `torso.png` with the whole character already works: it bobs, squashes, leans and jumps. Add parts one at a time.

## 3. Write `parts.json`

Copy `assets/parts/template/` to `assets/parts/<your-name>/`, replace the PNGs, and edit `parts.json`:

```json
{
  "height": 225,
  "feet": [300, 700],
  "pivots": {
    "neck": [300, 388],
    "shoulderLeft": [243, 418],
    "shoulderRight": [357, 418],
    "hipLeft": [270, 568],
    "hipRight": [330, 568]
  },
  "parts": { "torso": "torso.png", "head": "head.png", "armLeft": "armLeft.png", "...": "..." },
  "face": { "mode": "sprites", "eyes": { "open": "eyes_open.png", "...": "..." }, "mouth": { "...": "..." } },
  "facesLeft": false
}
```

- **Coordinates are canvas pixels** of your full image. In Photopea, open **Window → Info** and hover over a point to read its x, y.
- **`feet`** is the point between the soles, where the character stands on the taskbar.
- **`neck`** is where the head turns: the bottom-center of the chin. Shoulders and hips are where each arm and leg would rotate. Look at the template's `GUIDE.png` for examples.
- **`height`** is the on-screen height in pixels. The app scales the art to fit. Keep it around 200–240 for the default 300×400 window.
- Delete parts and pivots you don't use. Each limb needs only its own pivot.
- **`facesLeft`:** set this to `true` if the art faces left. Most front-facing art leaves it `false`.

## 4. Choose how the face works

| `face.mode` | Use when | Notes |
|---|---|---|
| `"sprites"` | You cut eye and mouth variants | Matches the art style exactly. The app picks open, closed or happy eyes, and closed, open, wide or smile mouths. |
| `"drawn"` | The face art is blank | The app draws animated anime eyes and a mouth. Set `face.drawn.eyeLeft`, `eyeRight` and `mouth` (centers in canvas px), plus `eyeWidth` (px) and optionally `iris`/`line` colors as `"#rrggbb"`. |
| `"none"` | The face is baked into `head.png` | No blinking or expressions, only the body animates. |

Optional, with any mode: `face.blush` lists the two cheek centers (`[[x, y], [x, y]]`, with `blushSize` as the radius in px) for pink cheeks when happy, and `face.brows` lists one line per eye (`[outerX, outerY, innerX, innerY]`) for angry brows. A brow covers the top of the eye with `face.fur` and draws its edge in `face.lid` (both `"#rrggbb"`).

## 5. Switch the app to your character

In `assets/character.json`:

```json
"avatar": "parts",
"parts": "/assets/parts/<your-name>/parts.json"
```

Then check the poses without waiting for them:

```bash
npm run snapshot -- --state=yawn
```

Try `sit`, `sleep`, `walk`, `happy` and `startled` too. Add `--delay=300` to catch short states like `land`. Wall and air states fall back to the floor when forced there, so check their art with `--anim=climb` instead, which shows an animation whatever the state. If something is wrong with the files, the app falls back to the built-in chibi and prints why in the terminal, for example `parts.json: "armLeft" needs pivots.shoulderLeft`.

If your character is much wider or taller than the template on screen, also adjust `hitbox` in `character.json`. The behavior engine uses it for the head and for where wall poses meet the screen edge. Everything else is kept on screen from the drawing's own size, which the parts avatar reports as it changes.

To regenerate the template folder from the built-in chibi:

```bash
npm run export-template
```

## 6. Extra drawings for some animations (poses)

One front-facing image can't walk convincingly or curl up to sleep. Generate more drawings of the same character (upload the first image and ask for "the same character walking, side view" or "curled up asleep") and list them under `poses` in `parts.json`. Each pose is a rig of its own with the same fields as the top level (`height`, `feet`, `pivots`, `parts`, optional `face`, `facesLeft`), plus:

```json
"poses": [
  { "anims": ["walk", "run"], "quadruped": true, "height": 220, "feet": [478, 891],
    "pivots": { "hipLeft": [290, 775], "shoulderLeft": [610, 770], "tail": [335, 612] },
    "parts": { "torso": "walk_body.png", "legLeft": "walk_legLeft.png", "armLeft": "walk_armLeft.png", "tail": "walk_tail.png" } },
  { "anims": ["sleep"], "height": 179, "feet": [512, 840], "parts": { "torso": "sleep_body.png" } }
]
```

- **`anims`**: the animations that show this drawing instead of the main one: `idle`, `walk`, `run`, `sit`, `yawn`, `sleep`, `climb`, `cling`, `descend` (climbing down a wall head first), `fall`, `land`, `dragged`, `startled`, `happy`, `greet` (the wave hello after launch), `wake` (the stretch after sleeping) or `talk`. Going to sleep always plays `yawn` first.
- **Limbs in a pose** (`armLeft`, `armRight`, `legLeft`, `legRight`, `tail`, each with its pivot) swing on their own in `climb`, `cling` and `greet`, and every pose drawing gets some whole-body motion (bounce, sway, breathing, a dangling swing) so a single image doesn't look frozen.
- **`from`, `to`, `loop`** (seconds): several poses can share one animation. `from`/`to` say when in the animation each one shows (e.g. a brace for the first 0.12 s of `land`, then the splat), and `loop` repeats that timing, which turns two drawings into a cycle (a gallop with `"loop": 0.36`, one drawing `"to": 0.18`, the other `"from": 0.18`).
- **`transition`** (instead of `anims`): a pose such as a three-quarter turn that plays for a moment whenever the companion starts or stops one of the listed animations, e.g. `"transition": ["walk", "run"]`. Several transition poses play in order of their `step` (0 = nearest the front view), forwards when turning to the side and backwards when turning to face you. Turning round while side-on goes back towards the front and out the other way. Draw them as edits of one image so the body stays the same size and in the same place.
- **Wall poses** (`climb`, `cling`, `descend`) are drawn with the wall on the right. Put `feet[0]` 75 screen px (half the hitbox width) left of where the wall is in the image, so the paws touch the screen edge. The app mirrors the drawing for the left wall.
- **`height`**: pick it so the character looks the same size as the main drawing, not necessarily the same height (a sleeping cat is shorter).
- **`still`**: keep the drawing in place, with no bob, squash or lean (a curled-up sleeper), apart from slow breathing.
- **`quadruped`**: for four-legged side views. `legLeft`/`legRight` are the back legs and `armLeft`/`armRight` the front legs; all four go behind the body and swing in a diagonal gait. Cut each leg straight across at the knee, put its pivot on that cut line, and leave about 40 px of the leg above the cut (hidden behind the body) so a swing never opens a gap.
- A side view faces right unless `facesLeft` is set; the app mirrors it when walking left.

