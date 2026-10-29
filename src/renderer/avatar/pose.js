// Procedural pose for every animation name the brain emits. Both avatars read it:
// the placeholder drives its whole rig from it, the Live2D avatar layers it on
// top of the model's authored motions (bob, lean, squash, eyes, mouth).
(function () {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // Angles are radians. Legs: positive swings forward. Arms: positive raises outward.
  function base() {
    return {
      bob: 0, squash: 1, lean: 0, sit: 0, headTilt: 0,
      legL: 0, legR: 0, armL: 0.15, armR: 0.15,
      eyes: null, // null = auto-blink, otherwise 0 (closed) … 1 (open)
      mood: 'neutral', // neutral | happy | surprised | sleepy | angry
      mouth: 0,
      blush: 0, // 0 … 1, pink cheeks
      glow: 0, // 0 … 1, a halo around the body (red when angry)
      fx: null, // emote above the head
    };
  }

  // at: seconds since this anim started, T: global seconds, s: latest brain snapshot
  function pose(anim, at, T, s) {
    const p = base();
    const breathe = Math.sin(T * 2.2);
    switch (anim) {
      case 'idle':
        p.bob = breathe * 1.2;
        p.armL = p.armR = 0.12 + breathe * 0.03;
        break;
      case 'walk':
      case 'run': {
        const f = anim === 'run' ? 17 : 10;
        // Ease into the stride instead of starting mid-step.
        const e = clamp(at / 0.3, 0, 1);
        const w = Math.sin(T * f) * e * e * (3 - 2 * e);
        p.legL = w * 0.5;
        p.legR = -w * 0.5;
        p.armL = 0.2 + w * 0.25;
        p.armR = 0.2 - w * 0.25;
        p.bob = -Math.abs(Math.cos(T * f)) * 3 * e;
        p.lean = (anim === 'run' ? 0.15 : 0.04) * e;
        if (anim === 'run') p.mood = 'surprised';
        break;
      }
      case 'sit':
        p.sit = 1;
        p.legL = p.legR = 1.45;
        p.armL = p.armR = 0.5;
        p.bob = breathe;
        break;
      case 'yawn':
      case 'curlYawn':
      case 'wake': {
        const k = Math.sin(Math.PI * clamp(at / 2.4, 0, 1));
        p.mouth = k;
        p.eyes = 1 - k * 0.9;
        p.armL = p.armR = 0.15 + k * 2.6;
        p.headTilt = -k * 0.15;
        p.bob = -k * 4;
        p.mood = 'sleepy';
        p.fx = k > 0.3 ? '~' : null;
        break;
      }
      case 'liedown':
        p.eyes = 0.45;
        p.mood = 'sleepy';
        p.bob = Math.sin(T * 1.2) * 1.5;
        break;
      case 'sleep':
        p.sit = 1;
        p.legL = p.legR = 1.45;
        p.armL = p.armR = 0.6;
        p.eyes = 0;
        p.mood = 'sleepy';
        p.headTilt = 0.3 + Math.sin(T * 1.2) * 0.03;
        p.bob = Math.sin(T * 1.2) * 1.5;
        p.fx = 'zzz';
        break;
      case 'climb':
      case 'descend': {
        const w = Math.sin(T * 7);
        p.armL = 2.7 + w * 0.35;
        p.armR = 2.7 - w * 0.35;
        p.legL = 0.4 + w * 0.4;
        p.legR = 0.4 - w * 0.4;
        p.bob = w * 2;
        break;
      }
      case 'cling':
        p.armL = p.armR = 2.75;
        p.legL = Math.sin(T * 2) * 0.25;
        p.legR = -p.legL;
        p.bob = Math.sin(T * 2);
        break;
      case 'fall': {
        const w = Math.sin(T * 22);
        p.armL = 2.3 + w * 0.4;
        p.armR = 2.3 - w * 0.4;
        p.legL = 0.5 + w * 0.2;
        p.legR = -0.3 - w * 0.2;
        p.mood = 'surprised';
        p.mouth = 0.6;
        break;
      }
      case 'dragged': {
        // Swing against the drag direction, in the character's mirrored space.
        const sway = clamp(-(s.vx || 0) / 1500, -0.6, 0.6) * (s.facing || 1);
        p.lean = sway * 0.5;
        p.legL = Math.sin(T * 6) * 0.3 + sway;
        p.legR = -Math.sin(T * 6) * 0.3 + sway;
        p.armL = p.armR = 1.0;
        p.mood = 'surprised';
        p.mouth = 0.3;
        p.fx = '!?';
        break;
      }
      case 'land': {
        const k = 1 - clamp(at / 0.35, 0, 1);
        p.squash = 1 - 0.18 * k;
        p.armL = p.armR = 0.1 + 0.6 * k;
        break;
      }
      case 'startled': {
        const k = clamp(at / 0.45, 0, 1);
        p.bob = -Math.sin(Math.PI * k) * 38;
        p.armL = p.armR = 2.4;
        p.legL = 0.3;
        p.legR = -0.3;
        p.mood = 'surprised';
        p.mouth = 0.5;
        p.fx = '!';
        break;
      }
      case 'greet':
        p.bob = -Math.abs(Math.sin(T * 4.5)) * 3;
        p.armR = 2.4 + Math.sin(T * 9) * 0.4;
        p.mood = 'happy';
        p.mouth = 0.35;
        p.fx = 'hi!';
        break;
      case 'purr': // the cursor resting on it: a contented smile, leaning into it
        p.bob = breathe * 1.2;
        p.mood = 'happy';
        p.headTilt = Math.sin(T * 1.4) * 0.05;
        break;
      case 'happy':
      case 'patted': // happy because you clicked or petted it: blushes and glows too
        p.bob = -Math.abs(Math.sin(T * 7)) * 12;
        p.armL = p.armR = 2.2 + Math.sin(T * 7) * 0.2;
        p.mood = 'happy';
        p.mouth = 0.35;
        p.blush = p.glow = anim === 'patted' ? 1 : 0;
        p.fx = '♥';
        break;
      case 'mad': {
        // Puffed up and trembling; each meow opens the mouth wide.
        const m = clamp((s.meowAge ?? 9) / 0.6, 0, 1);
        p.bob = -Math.abs(Math.sin(T * 13)) * 3;
        p.lean = Math.sin(T * 38) * 0.025;
        p.squash = 0.96;
        p.headTilt = Math.sin(T * 31) * 0.03;
        p.mood = 'angry';
        p.mouth = m < 1 ? Math.sin(Math.PI * m) * 0.9 : 0;
        p.glow = 1;
        p.fx = m < 1 ? 'MEOW!' : '💢';
        break;
      }
      case 'talk':
        p.bob = breathe * 1.2;
        p.mouth = Math.max(0, Math.sin(T * 15)) * 0.5;
        p.armR = 0.6 + Math.sin(T * 3) * 0.25;
        break;
    }
    return p;
  }

  window.DM = Object.assign(window.DM || {}, { pose, clamp });
})();
