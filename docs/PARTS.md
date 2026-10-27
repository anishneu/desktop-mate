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

Try `sit`, `sleep`, `walk`, `happy`, `climb` and `startled` too. If something is wrong with the files, the app falls back to the built-in chibi and prints why in the terminal, for example `parts.json: "armLeft" needs pivots.shoulderLeft`.

If your character is much wider or taller than the template on screen, also adjust `hitbox` in `character.json`. The behavior engine uses it to find the screen edges and the head.

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

- **`anims`**: the animations that show this drawing instead of the main one: `idle`, `walk`, `run`, `sit`, `yawn`, `sleep`, `climb`, `cling`, `fall`, `land`, `dragged`, `startled`, `happy` or `talk`.
- **`height`**: pick it so the character looks the same size as the main drawing, not necessarily the same height (a sleeping cat is shorter).
- **`quadruped`**: for four-legged side views. `legLeft`/`legRight` are the back legs and `armLeft`/`armRight` the front legs; all four go behind the body and swing in a diagonal gait. Cut each leg straight across at the knee, put its pivot on that cut line, and leave about 40 px of the leg above the cut (hidden behind the body) so a swing never opens a gap.
- A side view faces right unless `facesLeft` is set; the app mirrors it when walking left.

