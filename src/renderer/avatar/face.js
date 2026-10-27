// Code-drawn anime eyes and mouth, blinking and gaze. Shared by the placeholder and
// by parts avatars whose art leaves the face blank ("face.mode": "drawn").
// Sizes are in placeholder units scaled by k: at k = 1 an eye is 18 px wide.
(function () {
  const { clamp } = DM;
  const COLORS = { iris: 0x5a3fa0, line: 0x3b2a4a, mouth: 0x9b3550 };

  // eyes: [[x, y], [x, y]] centers in g's space
  function drawEyes(g, eyes, k, open, mood, lx, ly, colors = COLORS) {
    g.clear();
    for (const [cx, cy] of eyes) {
      if (mood === 'happy') {
        g.lineStyle(3 * k, colors.line).moveTo(cx - 8 * k, cy + 3 * k).quadraticCurveTo(cx, cy - 8 * k, cx + 8 * k, cy + 3 * k);
      } else if (open < 0.15) {
        g.lineStyle(3 * k, colors.line).moveTo(cx - 8 * k, cy).quadraticCurveTo(cx, cy + 5 * k, cx + 8 * k, cy);
      } else {
        const h = 13 * open * k;
        const ir = (mood === 'surprised' ? 5 : 7) * k;
        const ix = cx + lx * 3 * k;
        const iy = cy + (ly * 3 * open + 1) * k;
        g.beginFill(0xffffff).drawEllipse(cx, cy, 9 * k, h).endFill();
        g.beginFill(colors.iris).drawEllipse(ix, iy, ir, Math.max(k, Math.min(h - 1.5 * k, ir * 1.6))).endFill();
        g.beginFill(colors.line).drawEllipse(ix, iy + k, ir * 0.45, Math.max(0.5 * k, Math.min(h - 3 * k, ir * 0.8))).endFill();
        g.beginFill(0xffffff).drawCircle(ix - 2 * k, iy - h * 0.35, 2.4 * k).endFill();
        g.lineStyle(3 * k, colors.line).moveTo(cx - 10 * k, cy - h + 2 * k).quadraticCurveTo(cx, cy - h - 3 * k, cx + 10 * k, cy - h + 2 * k);
      }
      g.lineStyle(0);
    }
  }

  function drawMouth(g, [mx, my], k, m, mood, colors = COLORS) {
    g.clear();
    if (m > 0.08) g.beginFill(colors.mouth).drawEllipse(mx, my + k, (2.5 + m * 4) * k, (1.5 + m * 7) * k).endFill();
    else if (mood === 'sleepy') g.lineStyle(2 * k, colors.line).moveTo(mx - 3 * k, my).lineTo(mx + 3 * k, my);
    else g.lineStyle(2 * k, colors.line).moveTo(mx - 5 * k, my - k).quadraticCurveTo(mx, my + (mood === 'happy' ? 5 : 2) * k, mx + 5 * k, my - k);
    g.lineStyle(0);
  }

  // Returns fn(dt) → eye openness 0…1, blinking every 2–6 s.
  function blinker() {
    const b = { next: 2, t: -1 };
    return (dt) => {
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
    };
  }

  // Smoothed gaze toward the cursor, -1…1 on each axis, in the character's
  // mirrored space. head: [x, y] of the head in window coordinates.
  function gaze(look, dt, cursor, head, facing) {
    const dx = cursor.x - head[0];
    const dy = cursor.y - head[1];
    const far = Math.hypot(dx, dy) > 900;
    const k = 1 - Math.exp(-dt * 8);
    look.x += ((far ? 0 : clamp(dx / 250, -1, 1) * facing) - look.x) * k;
    look.y += ((far ? 0 : clamp(dy / 250, -1, 1)) - look.y) * k;
    return look;
  }

  DM.face = { COLORS, drawEyes, drawMouth, blinker, gaze };
})();
