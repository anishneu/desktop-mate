// Chibi stand-in drawn with Pixi vector graphics, so the app runs before any Live2D
// model is installed. It is a simple puppet rig: parts on pivots, posed per frame.
// Origin is at the feet; y grows downward, so the head sits around y = -150.
(function () {
  const { clamp } = DM;
  const C = {
    skin: 0xffe6d5, hair: 0x8a74d6, hairDark: 0x6b55b8, dress: 0x37476b, dressLight: 0x4a5d8a,
    collar: 0xffffff, ribbon: 0xff6f9c, iris: 0x5a3fa0, line: 0x3b2a4a, blush: 0xff9bb0,
    shoe: 0x2b2238, sock: 0xffffff, mouth: 0x9b3550,
  };
  const HEAD_TOP = -212;

  function part(x, y, draw) {
    const g = new PIXI.Graphics();
    g.position.set(x, y);
    if (draw) draw(g);
    return g;
  }

  function drawHairBack(g) {
    g.beginFill(C.hairDark).drawCircle(0, -50, 54).drawRoundedRect(-52, -56, 104, 96, 26).endFill();
  }

  function drawLeg(g) {
    g.beginFill(C.skin).drawRoundedRect(-6, 0, 12, 30, 5).endFill();
    g.beginFill(C.sock).drawRoundedRect(-6, 22, 12, 16, 4).endFill();
    g.beginFill(C.shoe).drawEllipse(2, 40, 9, 4).endFill();
  }

  function drawTorso(g) {
    g.beginFill(C.skin).drawRect(-5, -108, 10, 10).endFill();
    g.beginFill(C.dress).drawPolygon([-15, -100, 15, -100, 31, -38, -31, -38]).endFill();
    g.beginFill(C.dressLight).drawPolygon([-29, -46, 29, -46, 31, -38, -31, -38]).endFill();
    g.beginFill(C.collar).drawPolygon([-14, -100, 14, -100, 0, -86]).endFill();
    g.beginFill(C.ribbon)
      .drawPolygon([0, -88, -9, -94, -9, -82])
      .drawPolygon([0, -88, 9, -94, 9, -82])
      .drawCircle(0, -88, 3)
      .endFill();
  }

  function drawArm(g) {
    g.beginFill(C.dress).drawRoundedRect(-5, -2, 10, 22, 5).endFill();
    g.beginFill(C.skin).drawRoundedRect(-4, 16, 8, 18, 4).drawCircle(0, 35, 5).endFill();
  }

  // Head parts are relative to the neck (head origin), face centered at y = -46.
  function drawFace(g) {
    g.beginFill(C.hair).drawRoundedRect(-52, -60, 12, 62, 6).drawRoundedRect(40, -60, 12, 62, 6).endFill();
    g.beginFill(C.skin).drawCircle(0, -46, 44).endFill();
    g.beginFill(C.blush, 0.55).drawEllipse(-27, -28, 8, 4.5).drawEllipse(27, -28, 8, 4.5).endFill();
  }

  function drawBangs(g) {
    const cap = [];
    for (let a = 180; a <= 360; a += 10) {
      const r = (a * Math.PI) / 180;
      cap.push(50 * Math.cos(r), -48 + 50 * Math.sin(r));
    }
    const fringe = [48, -34, 38, -58, 28, -44, 18, -62, 8, -48, -2, -64, -12, -48, -22, -62, -32, -46, -40, -58, -48, -34];
    g.beginFill(C.hair).drawPolygon(cap.concat(fringe)).endFill();
    g.lineStyle(5, C.hair).moveTo(-2, -96).quadraticCurveTo(16, -118, 2, -124).lineStyle(0);
    g.beginFill(C.ribbon)
      .drawPolygon([36, -88, 24, -100, 22, -80])
      .drawPolygon([36, -88, 50, -98, 50, -78])
      .drawCircle(36, -88, 5)
      .endFill();
  }

  class PlaceholderAvatar {
    constructor() {
      this.view = new PIXI.Container();
      this.root = new PIXI.Container(); // mirrored for facing
      this.body = new PIXI.Container(); // bob / squash / lean, pivot at the feet
      this.view.addChild(this.root);
      this.root.addChild(this.body);

      this.hairBack = part(0, -104, drawHairBack);
      this.legL = part(-10, -44, drawLeg);
      this.legR = part(10, -44, drawLeg);
      this.armL = part(-19, -94, drawArm);
      this.armR = part(19, -94, drawArm);
      this.head = new PIXI.Container();
      this.head.position.set(0, -104);
      this.eyes = new PIXI.Graphics();
      this.mouth = new PIXI.Graphics();
      this.head.addChild(part(0, 0, drawFace), this.eyes, this.mouth, part(0, 0, drawBangs));
      this.body.addChild(this.hairBack, this.legL, this.legR, part(0, 0, drawTorso), this.armL, this.armR, this.head);

      this.fx = new DM.FxLayer(this.view);
      this.look = { x: 0, y: 0 };
      this.blink = { next: 2, t: -1 };
      this.faceKey = '';
      this.T = 0;
    }

    setAnim() {} // fully procedural; nothing to trigger

    update(dt, p, s) {
      this.T += dt;
      const facing = s.facing || 1;
      this.root.scale.x = facing;
      this.body.y = p.bob + p.sit * 40;
      this.body.scale.set(2 - p.squash, p.squash);
      this.body.rotation = p.lean;
      this.legL.rotation = -p.legL;
      this.legR.rotation = -p.legR;
      this.armL.rotation = p.armL;
      this.armR.rotation = -p.armR;
      this.head.rotation = this.hairBack.rotation = p.headTilt;

      // Eyes follow the cursor (window coordinates = stage coordinates).
      const dx = s.cursor.x - this.view.x;
      const dy = s.cursor.y - (this.view.y + this.body.y - 150);
      const far = Math.hypot(dx, dy) > 900;
      const k = 1 - Math.exp(-dt * 8);
      this.look.x += ((far ? 0 : clamp(dx / 250, -1, 1) * facing) - this.look.x) * k;
      this.look.y += ((far ? 0 : clamp(dy / 250, -1, 1)) - this.look.y) * k;

      const open = p.eyes ?? this.blinkOpen(dt);
      const key = [open.toFixed(2), p.mood, this.look.x.toFixed(2), this.look.y.toFixed(2), p.mouth.toFixed(2)].join('|');
      if (key !== this.faceKey) {
        this.faceKey = key;
        this.drawEyes(open, p.mood, this.look.x, this.look.y);
        this.drawMouth(p.mouth, p.mood);
      }
      this.fx.update(p.fx, this.body.y + HEAD_TOP, this.T);
    }

    blinkOpen(dt) {
      const b = this.blink;
      b.next -= dt;
      if (b.next <= 0) {
        b.t = 0;
        b.next = 2 + Math.random() * 4;
      }
      if (b.t < 0) return 1;
      b.t += dt;
      if (b.t > 0.16) {
        b.t = -1;
        return 1;
      }
      return Math.abs(b.t / 0.08 - 1);
    }

    drawEyes(open, mood, lx, ly) {
      const g = this.eyes.clear();
      for (const side of [-1, 1]) {
        const cx = side * 17;
        const cy = -40;
        if (mood === 'happy') {
          g.lineStyle(3, C.line).moveTo(cx - 8, cy + 3).quadraticCurveTo(cx, cy - 8, cx + 8, cy + 3);
        } else if (open < 0.15) {
          g.lineStyle(3, C.line).moveTo(cx - 8, cy).quadraticCurveTo(cx, cy + 5, cx + 8, cy);
        } else {
          const h = 13 * open;
          const ir = mood === 'surprised' ? 5 : 7;
          const ix = cx + lx * 3;
          const iy = cy + ly * 3 * open + 1;
          g.beginFill(0xffffff).drawEllipse(cx, cy, 9, h).endFill();
          g.beginFill(C.iris).drawEllipse(ix, iy, ir, Math.max(1, Math.min(h - 1.5, ir * 1.6))).endFill();
          g.beginFill(C.line).drawEllipse(ix, iy + 1, ir * 0.45, Math.max(0.5, Math.min(h - 3, ir * 0.8))).endFill();
          g.beginFill(0xffffff).drawCircle(ix - 2, iy - h * 0.35, 2.4).endFill();
          g.lineStyle(3, C.line).moveTo(cx - 10, cy - h + 2).quadraticCurveTo(cx, cy - h - 3, cx + 10, cy - h + 2);
        }
        g.lineStyle(0);
      }
    }

    drawMouth(m, mood) {
      const g = this.mouth.clear();
      if (m > 0.08) g.beginFill(C.mouth).drawEllipse(0, -18, 2.5 + m * 4, 1.5 + m * 7).endFill();
      else if (mood === 'sleepy') g.lineStyle(2, C.line).moveTo(-3, -19).lineTo(3, -19);
      else g.lineStyle(2, C.line).moveTo(-5, -20).quadraticCurveTo(0, mood === 'happy' ? -14 : -17, 5, -20);
      g.lineStyle(0);
    }

    // x, y in window coordinates
    hitTest(x, y) {
      const dx = x - this.view.x;
      const dy = y - (this.view.y + this.body.y);
      return Math.abs(dx) < 58 && dy < 4 && dy > HEAD_TOP;
    }
  }

  window.DM = Object.assign(window.DM || {}, { PlaceholderAvatar });
})();
