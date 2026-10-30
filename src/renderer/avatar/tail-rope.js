// A smooth, bendable tail: the drawn tail straightened into one strip (tail_rope.png,
// cut by cut_tailrope.py) and bent along a curve every frame with a PIXI rope, so it
// is one continuous piece with no joints. Shared by the parts avatar and the tail
// tuner page, so what the tuner shows is what the app does.
//
// The motion is a sitting cat's swish. The base swings over the back, centred on
// straight up, `range` degrees from one side to the other. The curl follows: the
// drawn curl out on its own side, straight when upright, mirrored on the far side,
// so it always curls outward. Each point takes the curl and the trailing bend a
// moment after the one before, so the change rolls from the root to the tip: the
// tail bends into an S as it swings and the tip flips over last at each end.
(function () {
  const DEFAULTS = {
    speed: 3, // rad/s of the swing's phase: a full there-and-back is 2π
    range: 180, // degrees from one side to the other, centred on straight up
    lean: 0, // degrees: tips the whole swing toward its own side (+) or the other (−)
    hold: 0, // 0 keeps it moving; higher rests longer at each end
    mode: 'follow', // the curl flips: 'follow' (gradually, as it swings), 'flip' (at the end), 'none'
    curl: 1.5, // 1 is the drawn curl; 0 straight
    lag: 32, // how fast the curl and bend travel down the tail (higher = sooner)
    mirror: true, // mirror the curl on the far side
    drag: 0.011, // how far the tail trails the swing
    ripple: 0.035, // a small wave running down the tail
    rspeed: 5.5, // its speed
  };
  const BONES = 13; // the settings were tuned per bone of a 14-bone tail; points rescale them

  function flipped(image) {
    const c = document.createElement('canvas');
    c.width = image.width;
    c.height = image.height;
    const ctx = c.getContext('2d');
    ctx.translate(0, c.height);
    ctx.scale(1, -1);
    ctx.drawImage(image, 0, 0);
    return c;
  }

  class TailRope {
    // spec: parts.json's tailRope; image: the loaded strip; scale: screen px per canvas px.
    constructor(spec, image, scale = 1) {
      this.spec = spec;
      this.view = new PIXI.Container();
      this.view.scale.set(scale);
      const n = spec.points.length;
      this.n = n;
      this.points = Array.from({ length: n }, (_, j) => new PIXI.Point(spec.points[j], 0));
      // Two ropes on the same points: the strip, and the strip flipped across, shown
      // while the tail is mirrored (so its shading and tuft face the right way).
      this.plain = this.view.addChild(new PIXI.SimpleRope(PIXI.Texture.from(image), this.points));
      this.mirrored = this.view.addChild(new PIXI.SimpleRope(PIXI.Texture.from(flipped(image)), this.points));
      this.mirrored.alpha = 0;
      // side: which way each point curls (+1 as drawn … −1 mirrored); amt: how much.
      this.state = { phase: 0, T: 0, target: 1, amt: DEFAULTS.curl, side: new Array(n).fill(1), drag: new Array(n).fill(0), prevTheta: null };
      this.update(0, DEFAULTS);
    }

    update(dt, P) {
      const st = this.state;
      const { points: pts, n } = this;
      const { turns, heading } = this.spec;
      st.T += dt;
      st.phase += P.speed * dt;
      const k = 1 + P.hold * 2.5;
      const c = Math.max(-1, Math.min(1, k * Math.cos(st.phase))); // +1 own side … −1 far side
      // How far the base is raised from its drawn direction (radians): the swing is
      // centred on straight up (90°), so at 180° it runs from the drawing to its mirror.
      // Eased toward the swing, so a change of settings (going stiff when cross)
      // glides instead of jumping.
      const goal = ((90 + P.lean) - (P.range / 2) * c) * Math.PI / 180;
      const elev = st.prevTheta === null ? goal : st.prevTheta + (goal - st.prevTheta) * Math.min(1, dt * 14);
      const vel = st.prevTheta === null || dt <= 0 ? 0 : (elev - st.prevTheta) / dt;
      st.prevTheta = elev;

      // Which way it curls follows the swing; how much is the curl setting. Kept
      // apart, so straightening the tail (going stiff) never reads as half-flipped.
      let target = 1;
      if (P.mode === 'follow') target = P.mirror ? c : 1;
      else if (P.mode === 'flip') {
        if (c < -0.93) st.target = -1;
        else if (c > 0.93) st.target = 1;
        target = P.mirror ? st.target : 1;
      }
      const per = BONES / (n - 1);
      const kr = Math.min(1, dt * 12);
      const kc = Math.min(1, dt * P.lag / per);
      st.amt += (P.curl - st.amt) * kr;
      st.side[0] += (target - st.side[0]) * kr;
      st.drag[0] += (-vel * P.drag * per - st.drag[0]) * kr;
      for (let j = 1; j < n; j++) {
        st.side[j] += (st.side[j - 1] - st.side[j]) * kc;
        st.drag[j] += (st.drag[j - 1] - st.drag[j]) * kc;
      }

      // How mirrored the tail is: 0 as drawn … 1 fully mirrored.
      const m = Math.max(0, Math.min(1, (1 - st.side[0]) / 2));
      // The base direction: the drawn one, raised by the elevation, and mirrored
      // about straight up as m goes to 1.
      let h = heading - elev - 2 * heading * m;
      let x = 0;
      let y = 0;
      pts[0].set(0, 0);
      for (let j = 1; j < n; j++) {
        const t = j / (n - 1);
        h += st.amt * st.side[j] * turns[j] + st.drag[j] * (0.4 + t) + P.ripple * per * Math.sin(st.T * P.rspeed - j * 0.55 * per) * t;
        const ds = this.spec.points[j] - this.spec.points[j - 1];
        x += Math.cos(h) * ds;
        y += Math.sin(h) * ds;
        pts[j].set(x, y);
      }
      // The flipped strip fades in over the plain one, which stays solid underneath,
      // so the tail never turns see-through.
      const f = Math.max(0, Math.min(1, (m - 0.4) / 0.2));
      this.plain.alpha = 1;
      this.plain.visible = f < 1;
      this.mirrored.alpha = f;
      this.mirrored.visible = f > 0;
    }
  }

  window.DM = Object.assign(window.DM || {}, { TailRope, TAIL_DEFAULTS: DEFAULTS });
})();
