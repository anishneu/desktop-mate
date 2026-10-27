// Paper-doll avatar built from PNG parts, e.g. AI-generated art cut into layers.
// Every part is exported at the full size of the original canvas (transparent
// everywhere else), so parts.json only names the files and the joint pivots in
// canvas pixels. The same procedural poses as the placeholder drive the rig.
// See docs/PARTS.md for the format and workflow.
(function () {
  const LIMBS = { legLeft: 'hipLeft', legRight: 'hipRight', armLeft: 'shoulderLeft', armRight: 'shoulderRight' };
  const HEAD_PARTS = ['hairBack', 'head', 'hairFront', 'flame'];
  // Extra parts that animate on their own: `tail` sways behind the body and
  // `flame` (fire, sparkles, an antenna) flickers on top of the head.
  const EXTRAS = { tail: 'tail', flame: 'flame' };
  // Tail sway [speed rad/s, amplitude rad] by animation; mood "happy" wags.
  const TAIL = {
    walk: [5, 0.14], run: [9, 0.2], sleep: [0.8, 0.04], sit: [1.2, 0.06], yawn: [1, 0.05],
    fall: [12, 0.25], dragged: [12, 0.22], startled: [14, 0.25], climb: [4, 0.12], cling: [2, 0.1],
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
      this.T = 0;
    }

    async load() {
      const base = new URL(this.url, location.href);
      const spec = await (await fetch(base)).json();
      const file = (name) => new URL(name, base).href;
      const parts = spec.parts || {};
      const pivots = spec.pivots || {};
      const face = spec.face || { mode: 'none' };
      if (!spec.feet) throw new Error('parts.json needs "feet": [x, y]');
      for (const [part, pivot] of Object.entries(LIMBS)) {
        if (parts[part] && !pivots[pivot]) throw new Error(`parts.json: "${part}" needs pivots.${pivot}`);
      }
      for (const [part, pivot] of Object.entries(EXTRAS)) {
        if (parts[part] && !pivots[pivot]) throw new Error(`parts.json: "${part}" needs pivots.${pivot}`);
      }
      if (HEAD_PARTS.some((p) => parts[p]) && !pivots.neck) throw new Error('parts.json: head parts need pivots.neck');

      // Load every image in parallel.
      const jobs = Object.entries(parts).map(async ([k, f]) => [k, await loadTrimmed(file(f))]);
      const variantJobs = (group) => Object.entries((face.mode === 'sprites' && face[group]) || {})
        .map(async ([k, f]) => [k, await loadTrimmed(file(f))]);
      const [img, eyes, mouth] = await Promise.all([
        Promise.all(jobs), Promise.all(variantJobs('eyes')), Promise.all(variantJobs('mouth')),
      ]).then((groups) => groups.map(Object.fromEntries));
      if (!Object.keys(img).length) throw new Error('parts.json lists no parts');

      // Scale so the art's visible height matches spec.height on screen.
      const all = [...Object.values(img), ...Object.values(eyes), ...Object.values(mouth)];
      const feet = spec.feet;
      const top = Math.min(...all.map((i) => i.y));
      const s = (spec.height || 220) / (feet[1] - top);
      this.s = s;
      this.spec = spec;
      this.headTop = (top - feet[1]) * s;
      this.halfWidth = Math.max(...all.map((i) => Math.max(feet[0] - i.x, i.x + i.w - feet[0]))) * s * 0.8;
      const neck = pivots.neck || feet;
      const hip = pivots.hipLeft || pivots.hipRight;
      this.sitDrop = hip ? (feet[1] - hip[1]) * s * 0.9 : 0;
      this.headY = (neck[1] - feet[1]) * s - 40;

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

      this.tail = joint(pivots.tail || feet, feet, img.tail);
      this.hairBack = joint(neck, feet, img.hairBack);
      this.legL = joint(pivots.hipLeft || feet, feet, img.legLeft);
      this.legR = joint(pivots.hipRight || feet, feet, img.legRight);
      const torso = joint(feet, feet, img.torso);
      this.armL = joint(pivots.shoulderLeft || feet, feet, img.armLeft);
      this.armR = joint(pivots.shoulderRight || feet, feet, img.armRight);
      this.head = joint(neck, feet, img.head);
      this.body.addChild(this.tail, this.hairBack, this.legL, this.legR, torso, this.armL, this.armR, this.head);

      // Face: sprite variants, code-drawn eyes and mouth, or nothing (baked into the art).
      this.faceMode = face.mode;
      if (face.mode === 'sprites') {
        this.eyeSprites = this.variants(eyes, neck, sprite);
        this.mouthSprites = this.variants(mouth, neck, sprite);
        this.lookShift = (spec.height || 220) * 0.012;
      } else if (face.mode === 'drawn') {
        const d = face.drawn || {};
        if (!d.eyeLeft || !d.eyeRight || !d.mouth) throw new Error('parts.json: drawn face needs eyeLeft, eyeRight and mouth');
        this.eyes = new PIXI.Graphics();
        this.mouth = new PIXI.Graphics();
        this.head.addChild(this.eyes, this.mouth);
        this.drawn = {
          eyes: [at(d.eyeLeft, neck), at(d.eyeRight, neck)],
          mouth: at(d.mouth, neck),
          k: ((d.eyeWidth || 18) / 18) * s,
          colors: { ...DM.face.COLORS, iris: hex(d.iris, DM.face.COLORS.iris), line: hex(d.line, DM.face.COLORS.line) },
        };
      }
      if (img.hairFront) this.head.addChild(sprite(img.hairFront, neck));
      // The flame is a copy of art that is also in head.png, so it only ever grows:
      // the original underneath stays covered.
      this.flame = img.flame ? this.head.addChild(joint(pivots.flame, neck, img.flame)) : null;
      this.fx = new DM.FxLayer(this.view);
    }

    // One sprite per variant, stacked in a layer on the head; only one is visible.
    variants(images, neck, sprite) {
      const layer = new PIXI.Container();
      const map = {};
      for (const [k, i] of Object.entries(images)) {
        map[k] = layer.addChild(sprite(i, neck));
        map[k].visible = false;
      }
      this.head.addChild(layer);
      return { layer, map, shown: null };
    }

    show(v, name) {
      if (v.shown === name) return;
      if (v.shown) v.map[v.shown].visible = false;
      if (name) v.map[name].visible = true;
      v.shown = name;
    }

    setAnim() {} // procedural, like the placeholder

    update(dt, p, s) {
      this.T += dt;
      const facing = (s.facing || 1) * (this.spec.facesLeft ? -1 : 1);
      this.root.scale.x = facing;
      this.body.y = p.bob + p.sit * this.sitDrop;
      this.body.scale.set(2 - p.squash, p.squash);
      this.body.rotation = p.lean;
      this.legL.rotation = -p.legL;
      this.legR.rotation = -p.legR;
      this.armL.rotation = p.armL;
      this.armR.rotation = -p.armR;
      this.head.rotation = this.hairBack.rotation = p.headTilt;
      const [speed, amp] = p.mood === 'happy' ? [10, 0.22] : TAIL[s.anim] || [1.6, 0.08];
      this.tailPhase = (this.tailPhase || 0) + speed * dt;
      this.tail.rotation = Math.sin(this.tailPhase) * amp - p.lean * 0.5;
      if (this.flame) {
        const k = s.anim === 'sleep' ? 0.4 : p.mood === 'surprised' ? 1.8 : 1;
        const t = this.T;
        this.flame.scale.set(
          1 + k * 0.015 * (1 + Math.sin(t * 7.3 + 1)),
          1 + k * (0.04 + 0.025 * Math.sin(t * 9.1) + 0.012 * Math.sin(t * 23.7)),
        );
      }

      const look = DM.face.gaze(this.look, dt, s.cursor, [this.view.x, this.view.y + this.body.y + this.headY], facing);
      const open = p.eyes ?? this.blink(dt);

      if (this.faceMode === 'sprites') {
        const e = this.eyeSprites.map;
        const eye = p.mood === 'happy' ? (e.happy ? 'happy' : 'closed')
          : open < 0.35 ? 'closed'
          : p.mood === 'surprised' && e.surprised ? 'surprised'
          : 'open';
        this.show(this.eyeSprites, e[eye] ? eye : e.open ? 'open' : null);
        this.eyeSprites.layer.position.set(look.x * this.lookShift, look.y * this.lookShift * 0.6);

        const m = this.mouthSprites.map;
        const mouth = p.mouth > 0.6 && m.wide ? 'wide'
          : p.mouth > 0.12 && m.open ? 'open'
          : p.mood === 'happy' && m.smile ? 'smile'
          : 'closed';
        this.show(this.mouthSprites, m[mouth] ? mouth : null);
      } else if (this.faceMode === 'drawn') {
        const key = [open.toFixed(2), p.mood, look.x.toFixed(2), look.y.toFixed(2), p.mouth.toFixed(2)].join('|');
        if (key !== this.faceKey) {
          this.faceKey = key;
          const d = this.drawn;
          DM.face.drawEyes(this.eyes, d.eyes, d.k, open, p.mood, look.x, look.y, d.colors);
          DM.face.drawMouth(this.mouth, d.mouth, d.k, p.mouth, p.mood, d.colors);
        }
      }
      this.fx.update(p.fx, this.body.y + this.headTop, this.T);
    }

    // x, y in window coordinates
    hitTest(x, y) {
      const dx = x - this.view.x;
      const dy = y - (this.view.y + this.body.y);
      return Math.abs(dx) < this.halfWidth && dy < 4 && dy > this.headTop;
    }
  }

  window.DM = Object.assign(window.DM || {}, { PartsAvatar });
})();
