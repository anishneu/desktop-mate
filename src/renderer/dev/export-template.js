// Dev tool (`npm run export-template`): renders the vector placeholder as a parts
// set — full-canvas PNGs, a parts.json and a labeled guide image — so there is a
// working example of the format to copy and trace over.
(function () {
  const S = 3; // canvas px per placeholder unit
  const SS = 2; // supersampling for smooth edges
  const W = 600;
  const H = 750;
  const FEET = [300, 700];
  const toCanvas = (x, y) => [FEET[0] + x * S, FEET[1] + y * S];

  // Renders a display object (positioned in feet space, plus an offset) to a data URL.
  function render(renderer, obj, offset = [0, 0]) {
    const root = new PIXI.Container();
    root.position.set(FEET[0] * SS, FEET[1] * SS);
    root.scale.set(S * SS);
    const holder = root.addChild(new PIXI.Container());
    holder.position.set(...offset);
    holder.addChild(obj);
    return renderScene(renderer, root, SS);
  }

  function renderScene(renderer, scene, scale) {
    const rt = PIXI.RenderTexture.create({ width: W * scale, height: H * scale });
    renderer.render(scene, { renderTexture: rt, clear: true });
    const big = renderer.plugins.extract.canvas(rt);
    rt.destroy(true);
    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(big, 0, 0, W, H);
    return out.toDataURL('image/png');
  }

  async function exportTemplate(app, api) {
    const r = app.renderer;
    const av = new DM.PlaceholderAvatar();
    const head = [av.head.x, av.head.y];
    const pos = (o) => toCanvas(o.x, o.y);
    const pivots = {
      neck: pos(av.head),
      shoulderLeft: pos(av.armL),
      shoulderRight: pos(av.armR),
      hipLeft: pos(av.legL),
      hipRight: pos(av.legR),
    };
    const { EYES, MOUTH } = DM.PlaceholderAvatar;
    const toCanvasHead = ([x, y]) => toCanvas(head[0] + x, head[1] + y);

    // Render the guide first, while the avatar is still assembled.
    av.update(0, DM.pose('idle', 0, 0, { facing: 1 }), { facing: 1, cursor: { x: -1e4, y: -1e4 } });
    const guide = new PIXI.Container();
    const bg = guide.addChild(new PIXI.Graphics());
    bg.beginFill(0xf4f1fb).drawRect(0, 0, W, H).endFill();
    bg.lineStyle(1, 0xd9ccff).moveTo(0, FEET[1]).lineTo(W, FEET[1]);
    av.view.position.set(...FEET);
    av.view.scale.set(S);
    guide.addChild(av.view);
    const marks = guide.addChild(new PIXI.Graphics());
    const label = (text, [x, y], dx) => {
      const t = guide.addChild(new PIXI.Text(text, { fontFamily: 'Segoe UI', fontSize: 13, fontWeight: '600', fill: 0x3b2a4a }));
      t.anchor.set(dx < 0 ? 1 : 0, 0.5);
      t.position.set(x + dx, y);
      marks.lineStyle(1, 0x3b2a4a, 0.5).moveTo(x, y).lineTo(x + dx * 0.9, y);
    };
    const points = { ...pivots, feet: FEET };
    const sides = { neck: 60, shoulderLeft: -90, shoulderRight: 90, hipLeft: -110, hipRight: 110, feet: 90 };
    for (const [name, p] of Object.entries(points)) {
      marks.lineStyle(2, 0xffffff).beginFill(0xff3d7f).drawCircle(p[0], p[1], 6).endFill();
      label(`${name} [${p.map(Math.round).join(', ')}]`, p, sides[name]);
    }
    const title = guide.addChild(new PIXI.Text('Pivot guide: joints in canvas pixels (600 × 750)', { fontFamily: 'Segoe UI', fontSize: 15, fontWeight: '700', fill: 0x3b2a4a }));
    title.position.set(16, 14);
    const files = { 'GUIDE.png': renderScene(r, guide, 1) };

    // Parts, each on its own full-size canvas.
    const parts = {
      hairBack: av.hairBack, legLeft: av.legL, legRight: av.legR, torso: av.torso,
      armLeft: av.armL, armRight: av.armR,
    };
    const names = {};
    for (const [name, obj] of Object.entries(parts)) {
      obj.rotation = 0;
      files[(names[name] = `${name}.png`)] = render(r, obj);
    }
    files[(names.head = 'head.png')] = render(r, av.face, head);
    files[(names.hairFront = 'hairFront.png')] = render(r, av.bangs, head);

    // Face variants.
    const face = (draw) => {
      const g = new PIXI.Graphics();
      draw(g);
      return render(r, g, head);
    };
    const eyes = { open: [1, 'neutral'], closed: [0, 'sleepy'], happy: [1, 'happy'] };
    const mouth = { closed: [0, 'neutral'], smile: [0, 'happy'], open: [0.45, 'neutral'], wide: [1, 'neutral'] };
    const eyeFiles = {};
    const mouthFiles = {};
    for (const [k, [open, mood]] of Object.entries(eyes)) {
      files[(eyeFiles[k] = `eyes_${k}.png`)] = face((g) => DM.face.drawEyes(g, EYES, 1, open, mood, 0, 0));
    }
    for (const [k, [m, mood]] of Object.entries(mouth)) {
      files[(mouthFiles[k] = `mouth_${k}.png`)] = face((g) => DM.face.drawMouth(g, MOUTH, 1, m, mood));
    }

    const spec = {
      height: 225,
      feet: FEET,
      pivots,
      parts: names,
      face: {
        mode: 'sprites',
        eyes: eyeFiles,
        mouth: mouthFiles,
        drawn: {
          eyeLeft: toCanvasHead(EYES[0]),
          eyeRight: toCanvasHead(EYES[1]),
          mouth: toCanvasHead(MOUTH),
          eyeWidth: 18 * S,
          iris: '#5a3fa0',
        },
      },
      facesLeft: false,
    };
    const round = (k, v) => (typeof v === 'number' ? Math.round(v) : v);
    for (const [name, data] of Object.entries(files)) api.exportFile(name, data);
    const json = JSON.stringify(spec, round, 2).replace(/\[\s+(-?\d+),\s+(-?\d+)\s+\]/g, '[$1, $2]');
    api.exportFile('parts.json', `${json}\n`);
    api.exportDone();
  }

  window.DM = Object.assign(window.DM || {}, { exportTemplate });
})();
