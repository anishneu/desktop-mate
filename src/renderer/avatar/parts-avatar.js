// Paper-doll avatar built from PNG parts, e.g. AI-generated art cut into layers.
// Every part is exported at the full size of the original canvas (transparent
// everywhere else), so parts.json only names the files and the joint pivots in
// canvas pixels. The same procedural poses as the placeholder drive the rig.
// Optional "poses" swap in other drawings (a side view, a curled-up sleep) for
// some animations; each is a rig of its own. See docs/PARTS.md.
(function () {
  const LIMBS = { legLeft: 'hipLeft', legRight: 'hipRight', armLeft: 'shoulderLeft', armRight: 'shoulderRight' };
  const HEAD_PARTS = ['hairBack', 'head', 'hairFront'];
  // Extra parts that animate on their own: `tail` sways behind the body and
  // `flame` (fire, sparkles, an antenna) flickers on top of the head.
  const EXTRAS = { tail: 'tail', flame: 'flame' };
  // Tail sway [speed rad/s, amplitude rad] by animation; otherwise mood "happy" wags.
  const TAIL = {
    walk: [5, 0.14], run: [9, 0.2], sleep: [0.8, 0.04], sit: [1.2, 0.06], yawn: [1, 0.05],
    fall: [12, 0.25], dragged: [12, 0.22], startled: [14, 0.25], climb: [4, 0.12], cling: [2, 0.1], greet: [3, 0.07], wake: [2.5, 0.12],
  };
  const QUADRUPED_SWING = 0.6; // four legs swing less than two
  const TURN_TIME = 0.18; // seconds a transition pose shows
  // Limb swing for pose drawings (the main drawing follows pose.js instead):
  // [speed rad/s, {limb: amplitude rad}, {limb: rest offset rad}]; limbs alternate
  // by the amplitude's sign.
  const GAIT = {
    climb: [7, { armL: 0.22, legL: -0.28, legR: 0.28 }],
    cling: [2, { armL: 0.04, legL: 0.06, legR: -0.06 }],
    greet: [9, { armR: 0.26 }, { armR: 0.12 }], // waves outward, never behind the head
  };
  // Extra whole-body motion so single drawings don't look frozen. `top` swings
  // the drawing from its top (held by the scruff) instead of from the feet.
  const sin = Math.sin;
  const MOTION = {
    climb: (T) => ({ y: -Math.abs(sin(T * 7)) * 4, rot: sin(T * 7) * 0.03 }),
    descend: (T) => ({ y: Math.abs(sin(T * 8)) * 3, rot: sin(T * 8) * 0.04 }),
    cling: (T) => ({ sy: 1 + sin(T * 2.2) * 0.015, rot: sin(T * 1.1) * 0.025 }),
    fall: (T) => ({ rot: sin(T * 13) * 0.14, sx: 1 + sin(T * 9) * 0.04, sy: 1 - sin(T * 9) * 0.04 }),
    dragged: (T, p, vx) => ({ top: true, rot: Math.max(-0.5, Math.min(0.5, -vx * 0.0005)) + sin(T * 2.6) * 0.07 }),
    startled: (T) => ({ x: sin(T * 55) * 1.5, sy: 1 + Math.abs(sin(T * 12)) * 0.03 }),
    run: (T) => ({ y: -Math.abs(sin(T * 11)) * 9, rot: sin(T * 11) * 0.07 }),
    yawn: (T) => MOTION.sleep(T), // same breathing, so yawning into sleep is seamless
    wake: (T, p) => ({ sx: 1 + p.mouth * 0.04, sy: 1 - p.mouth * 0.03 }),
    sleep: (T) => ({ sx: 1 - sin(T * 1.2) * 0.01, sy: 1 + sin(T * 1.2) * 0.02 }),
    greet: (T) => ({ y: -Math.abs(sin(T * 4.5)) * 3 }),
  };

  // Loads a full-canvas PNG and crops it to its visible pixels.
  async function loadTrimmed(url) {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new Error(`could not load ${url}`);
    }
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (data[(y * c.width + x) * 4 + 3] <= 8) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) throw new Error(`${url} is fully transparent`);
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    out.getContext('2d').drawImage(c, x0, y0, w, h, 0, 0, w, h);
    return { texture: PIXI.Texture.from(out), x: x0, y: y0, w, h, canvas: [img.width, img.height] };
  }

  const hex = (v, fallback) => (typeof v === 'string' ? parseInt(v.replace('#', ''), 16) : fallback);

  // Builds one rig (the main drawing or a pose) into its own container.
  async function buildRig(spec, base, label, isPose = false) {
    const file = (name) => new URL(name, base).href;
    const parts = spec.parts || {};
    const pivots = spec.pivots || {};
    const face = spec.face || { mode: 'none' };
    const fail = (msg) => { throw new Error(`${label}: ${msg}`); };
    if (!spec.feet) fail('needs "feet": [x, y]');
    for (const [part, pivot] of Object.entries({ ...LIMBS, ...EXTRAS })) {
      if (parts[part] && !pivots[pivot]) fail(`"${part}" needs pivots.${pivot}`);
    }
    if (HEAD_PARTS.some((p) => parts[p]) && !pivots.neck) fail('head parts need pivots.neck');

    // Load every image in parallel.
    const load = (entries) => Promise.all(entries.map(async ([k, f]) => [k, await loadTrimmed(file(f))]));
    const variants = (group) => Object.entries((face.mode === 'sprites' && face[group]) || {});
    const [img, eyes, mouth] = (await Promise.all([
      load(Object.entries(parts)), load(variants('eyes')), load(variants('mouth')),
    ])).map(Object.fromEntries);
    if (!Object.keys(img).length) fail('lists no parts');

    // Scale so the art's visible height matches spec.height on screen.
    const all = [...Object.values(img), ...Object.values(eyes), ...Object.values(mouth)];
    const feet = spec.feet;
    const top = Math.min(...all.map((i) => i.y));
    const s = (spec.height || 220) / (feet[1] - top);
    const neck = pivots.neck || feet;
    const hip = pivots.hipLeft || pivots.hipRight;
    const rig = {
      view: new PIXI.Container(),
      quadruped: !!spec.quadruped,
      still: !!spec.still,
      facesLeft: !!spec.facesLeft,
      headTop: (top - feet[1]) * s,
      halfWidth: Math.max(...all.map((i) => Math.max(feet[0] - i.x, i.x + i.w - feet[0]))) * s * 0.8,
      sitDrop: hip && !spec.quadruped ? (feet[1] - hip[1]) * s * 0.9 : 0,
      headY: (neck[1] - feet[1]) * s - 40,
      faceMode: face.mode,
    };

    // A joint: a container at the pivot (in its parent's space) holding the sprite.
    const at = ([x, y], origin) => [(x - origin[0]) * s, (y - origin[1]) * s];
    const sprite = (i, pivot) => {
      const sp = new PIXI.Sprite(i.texture);
      sp.scale.set(s);
      sp.position.set((i.x - pivot[0]) * s, (i.y - pivot[1]) * s);
      return sp;
    };
    const joint = (pivot, origin, i) => {
      const c = new PIXI.Container();
      c.position.set(...at(pivot, origin));
      if (i) c.addChild(sprite(i, pivot));
      return c;
    };

    rig.tail = joint(pivots.tail || feet, feet, img.tail);
    rig.hairBack = joint(neck, feet, img.hairBack);
    rig.legL = joint(pivots.hipLeft || feet, feet, img.legLeft);
    rig.legR = joint(pivots.hipRight || feet, feet, img.legRight);
    const torso = joint(feet, feet, img.torso);
    rig.armL = joint(pivots.shoulderLeft || feet, feet, img.armLeft);
    rig.armR = joint(pivots.shoulderRight || feet, feet, img.armRight);
    rig.head = joint(neck, feet, img.head);
    // In pose drawings (and a quadruped's front legs) the limbs go behind the
    // body, which keeps a stub of each joint so the cut never shows.
    const limbs = rig.quadruped || isPose
      ? [rig.armL, rig.armR, rig.legL, rig.legR, torso]
      : [rig.legL, rig.legR, torso, rig.armL, rig.armR];
    rig.view.addChild(rig.tail, rig.hairBack, ...limbs, rig.head);
    // `open`: the same drawing with the mouth open, swapped in while the
    // animation's mouth is open (yawning, talking).
    if (img.open) rig.openFrame = rig.view.addChild(joint(feet, feet, img.open));

    // Face: sprite variants, code-drawn eyes and mouth, or nothing (baked into the art).
    if (face.mode === 'sprites') {
      // One sprite per variant, stacked in a layer on the head; only one is visible.
      const layer = (images) => {
        const v = { layer: new PIXI.Container(), map: {}, shown: null };
        for (const [k, i] of Object.entries(images)) {
          v.map[k] = v.layer.addChild(sprite(i, neck));
          v.map[k].visible = false;
        }
        rig.head.addChild(v.layer);
        return v;
      };
      rig.eyeSprites = layer(eyes);
      rig.mouthSprites = layer(mouth);
      rig.lookShift = (spec.height || 220) * 0.012;
    } else if (face.mode === 'drawn') {
      const d = face.drawn || {};
      if (!d.eyeLeft || !d.eyeRight || !d.mouth) fail('drawn face needs eyeLeft, eyeRight and mouth');
      rig.eyes = new PIXI.Graphics();
      rig.mouth = new PIXI.Graphics();
      rig.head.addChild(rig.eyes, rig.mouth);
      rig.drawn = {
        eyes: [at(d.eyeLeft, neck), at(d.eyeRight, neck)],
        mouth: at(d.mouth, neck),
        k: ((d.eyeWidth || 18) / 18) * s,
        colors: { ...DM.face.COLORS, iris: hex(d.iris, DM.face.COLORS.iris), line: hex(d.line, DM.face.COLORS.line) },
      };
    }
    if (img.hairFront) rig.head.addChild(sprite(img.hairFront, neck));
    // The flame is a copy of art that is also in head.png (or torso.png), so it
    // only ever grows: the original underneath stays covered.
    if (img.flame) {
      rig.flame = img.head ? rig.head.addChild(joint(pivots.flame, neck, img.flame))
        : rig.view.addChild(joint(pivots.flame, feet, img.flame));
    }
    return rig;
  }

  function show(v, name) {
    if (v.shown === name) return;
    if (v.shown) v.map[v.shown].visible = false;
    if (name) v.map[name].visible = true;
    v.shown = name;
  }

  class PartsAvatar {
    constructor(url) {
      this.url = url;
      this.view = new PIXI.Container();
      this.root = new PIXI.Container(); // mirrored for facing
      this.body = new PIXI.Container(); // bob / squash / lean, pivot at the feet
      this.view.addChild(this.root);
      this.root.addChild(this.body);
      this.look = { x: 0, y: 0 };
      this.blink = DM.face.blinker();
      this.faceKey = '';
      this.tailPhase = 0;
      this.vx = 0;
      this.lastX = null;
      this.T = 0;
    }

    async load() {
      const base = new URL(this.url, location.href);
      const spec = await (await fetch(base)).json();
      const poses = spec.poses || [];
      const rigs = await Promise.all([
        buildRig(spec, base, 'parts.json'),
        ...poses.map((p, i) => buildRig(p, base, `parts.json poses[${i}]`, true)),
      ]);
      this.main = rigs[0];
      this.byAnim = {};
      poses.forEach((p, i) => { for (const a of p.anims || []) this.byAnim[a] = rigs[i + 1]; });
      // A transition pose (e.g. a three-quarter turn) flashes when entering or leaving its anims.
      const t = poses.findIndex((p) => p.transition);
      this.turn = t < 0 ? null : { rig: rigs[t + 1], anims: new Set(poses[t].transition), until: 0 };
      this.prevAnim = null;
      for (const r of rigs) {
        r.view.visible = r === this.main;
        this.body.addChild(r.view);
      }
      this.rig = this.main;
      this.fx = new DM.FxLayer(this.view);
    }

    setAnim() {} // procedural, like the placeholder

    update(dt, p, s) {
      this.T += dt;
      const turn = this.turn;
      if (turn && this.prevAnim && s.anim !== this.prevAnim
        && turn.anims.has(s.anim) !== turn.anims.has(this.prevAnim)) turn.until = this.T + TURN_TIME;
      this.prevAnim = s.anim;
      const rig = turn && this.T < turn.until ? turn.rig : this.byAnim[s.anim] || this.main;
      if (rig !== this.rig) {
        this.rig.view.visible = false;
        rig.view.visible = true;
        this.rig = rig;
        this.faceKey = '';
      }
      const facing = (s.facing || 1) * (rig.facesLeft ? -1 : 1);
      this.root.scale.x = facing;
      // A `still` pose (curled up asleep) keeps its place: no bob, squash or lean.
      this.body.y = rig.still ? 0 : p.bob + p.sit * rig.sitDrop;
      this.body.scale.set(rig.still ? 1 : 2 - p.squash, rig.still ? 1 : p.squash);
      this.body.rotation = rig.still ? 0 : p.lean;
      // Window speed, for the dangling swing.
      if (this.lastX !== null && dt > 0) this.vx += ((s.x - this.lastX) / dt - this.vx) * Math.min(1, dt * 8);
      this.lastX = s.x;
      if (rig !== this.main) {
        const m = (MOTION[s.anim] || (() => ({})))(this.T, p, this.vx);
        const pivotY = m.top ? rig.headTop : 0;
        rig.view.pivot.set(0, pivotY);
        rig.view.position.set(m.x || 0, pivotY + (m.y || 0));
        rig.view.rotation = m.rot || 0;
        rig.view.scale.set(m.sx || 1, m.sy || 1);
      }
      const gait = rig !== this.main && !rig.quadruped && GAIT[s.anim];
      if (gait) {
        const w = Math.sin(this.T * gait[0]);
        for (const limb of ['armL', 'armR', 'legL', 'legR']) {
          rig[limb].rotation = w * (gait[1][limb] || 0) + (gait[2]?.[limb] || 0);
        }
      } else if (rig.quadruped) {
        // Diagonal gait: each back leg moves with the opposite front leg.
        rig.legL.rotation = rig.armR.rotation = -p.legL * QUADRUPED_SWING;
        rig.legR.rotation = rig.armL.rotation = -p.legR * QUADRUPED_SWING;
      } else {
        rig.legL.rotation = -p.legL;
        rig.legR.rotation = -p.legR;
        rig.armL.rotation = p.armL;
        rig.armR.rotation = -p.armR;
      }
      rig.head.rotation = rig.hairBack.rotation = p.headTilt;
      const [speed, amp] = TAIL[s.anim] || (p.mood === 'happy' ? [10, 0.22] : [1.6, 0.08]);
      this.tailPhase += speed * dt;
      rig.tail.rotation = Math.sin(this.tailPhase) * amp - p.lean * 0.5;
      if (rig.openFrame) {
        // A quick (~0.1 s) dissolve between the two frames as the mouth opens and closes.
        const t = Math.min(1, Math.max(0, (p.mouth - 0.15) / 0.2));
        rig.openFrame.alpha = t * t * (3 - 2 * t);
      }
      if (rig.flame) {
        const k = s.anim === 'sleep' ? 0.4 : p.mood === 'surprised' ? 1.8 : 1;
        const t = this.T;
        rig.flame.scale.set(
          1 + k * 0.015 * (1 + Math.sin(t * 7.3 + 1)),
          1 + k * (0.04 + 0.025 * Math.sin(t * 9.1) + 0.012 * Math.sin(t * 23.7)),
        );
      }

      const look = DM.face.gaze(this.look, dt, s.cursor, [this.view.x, this.view.y + this.body.y + rig.headY], facing);
      const open = p.eyes ?? this.blink(dt);

      if (rig.faceMode === 'sprites') {
        const e = rig.eyeSprites.map;
        const eye = p.mood === 'happy' ? (e.happy ? 'happy' : 'closed')
          : open < 0.35 ? 'closed'
          : p.mood === 'surprised' && e.surprised ? 'surprised'
          : 'open';
        show(rig.eyeSprites, e[eye] ? eye : e.open ? 'open' : null);
        rig.eyeSprites.layer.position.set(look.x * rig.lookShift, look.y * rig.lookShift * 0.6);

        const m = rig.mouthSprites.map;
        const mouth = p.mouth > 0.6 && m.wide ? 'wide'
          : p.mouth > 0.12 && m.open ? 'open'
          : p.mood === 'happy' && m.smile ? 'smile'
          : 'closed';
        show(rig.mouthSprites, m[mouth] ? mouth : null);
      } else if (rig.faceMode === 'drawn') {
        const key = [open.toFixed(2), p.mood, look.x.toFixed(2), look.y.toFixed(2), p.mouth.toFixed(2)].join('|');
        if (key !== this.faceKey) {
          this.faceKey = key;
          const d = rig.drawn;
          DM.face.drawEyes(rig.eyes, d.eyes, d.k, open, p.mood, look.x, look.y, d.colors);
          DM.face.drawMouth(rig.mouth, d.mouth, d.k, p.mouth, p.mood, d.colors);
        }
      }
      this.fx.update(p.fx, this.body.y + rig.headTop, this.T);
    }

    // x, y in window coordinates
    hitTest(x, y) {
      const dx = x - this.view.x;
      const dy = y - (this.view.y + this.body.y);
      return Math.abs(dx) < this.rig.halfWidth && dy < 4 && dy > this.rig.headTop;
    }
  }

  window.DM = Object.assign(window.DM || {}, { PartsAvatar });
})();
