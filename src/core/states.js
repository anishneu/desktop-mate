'use strict';

// State table for the companion. Each state may define:
//   anim           animation name sent to the renderer (string, or fn(brain) → string)
//   surface        'floor' | 'wall' | 'air' — where the body must be. The brain drops
//                  the companion into `fall` when that surface disappears under it.
//   interruptible  whether cursor reactions (startle, curiosity, petting) may cut in
//   enter(b, prev) and update(b, dt) → next state name, or undefined to stay

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const STATES = {
  idle: {
    anim: 'idle', surface: 'floor', interruptible: true,
    enter(b) { b.data.until = b.rand(2, 6); },
    update(b) {
      if (b.cursorDistance() < 400) b.faceCursor();
      if (b.stateTime > b.data.until) return b.chooseNext();
    },
  },

  walk: {
    anim: 'walk', surface: 'floor', interruptible: true,
    enter(b) { b.data.target = b.randomFloorX(); },
    update(b, dt) {
      if (b.walkToward(b.data.target, b.tuning.walkSpeed, dt)) return 'idle';
    },
  },

  // Edge walking: head for a screen edge, then usually climb it.
  toWall: {
    anim: 'walk', surface: 'floor', interruptible: true,
    enter(b) {
      const nearLeft = b.pos.x - b.leftX < b.rightX - b.pos.x;
      b.data.side = (b.rng() < 0.7) === nearLeft ? -1 : 1;
    },
    update(b, dt) {
      const x = b.data.side < 0 ? b.leftX : b.rightX;
      if (b.walkToward(x, b.tuning.walkSpeed, dt)) {
        b.facing = b.data.side;
        return b.rng() < 0.75 ? 'climb' : 'idle';
      }
    },
  },

  climb: {
    anim: 'climb', surface: 'wall', interruptible: true,
    enter(b) {
      const top = b.ceilingY;
      b.data.targetY = Math.max(top, Math.min(b.pos.y - 80, top + (b.floorY - top) * b.rand(0, 0.65)));
    },
    update(b, dt) {
      b.pos.y -= b.tuning.climbSpeed * dt;
      if (b.pos.y <= b.data.targetY) {
        b.pos.y = b.data.targetY;
        return 'cling';
      }
    },
  },

  cling: {
    anim: 'cling', surface: 'wall', interruptible: true,
    enter(b) { b.data.until = b.rand(3, 8); },
    update(b) {
      if (b.stateTime < b.data.until) return;
      if (b.pos.y > b.ceilingY + 100 && b.rng() < 0.4) return 'climb';
      return b.letGo();
    },
  },

  sit: {
    anim: 'sit', surface: 'floor', interruptible: true,
    enter(b) { b.data.until = b.rand(6, 15); },
    update(b) {
      if (b.stateTime > b.data.until) return b.energy < 0.35 ? 'yawn' : 'idle';
    },
  },

  yawn: {
    anim: 'yawn', surface: 'floor', interruptible: false,
    update(b) {
      if (b.stateTime > 2.6) return b.energy < 0.25 ? 'sleep' : 'idle';
    },
  },

  // Cursor reactions are handled specially while asleep (see Brain.react).
  sleep: {
    anim: 'sleep', surface: 'floor', interruptible: false,
    update(b) {
      if (b.energy >= 0.98 && b.stateTime > 20) return 'wake';
    },
  },

  wake: {
    anim: 'yawn', surface: 'floor', interruptible: false,
    update(b) {
      if (b.stateTime > 2.6) return 'idle';
    },
  },

  startled: {
    anim: 'startled', surface: 'floor', interruptible: false,
    enter(b) { b.faceCursor(); },
    update(b) {
      if (b.stateTime > 0.7) return b.rng() < 0.6 ? 'flee' : 'idle';
    },
  },

  flee: {
    anim: 'run', surface: 'floor', interruptible: false,
    enter(b) {
      b.faceCursor();
      b.facing = -b.facing;
      b.data.until = b.rand(0.8, 1.4);
    },
    update(b, dt) {
      const x = b.facing < 0 ? b.leftX : b.rightX;
      if (b.walkToward(x, b.tuning.runSpeed, dt) || b.stateTime > b.data.until) return 'idle';
    },
  },

  // Curiosity: walk up to a cursor that has been resting nearby.
  approach: {
    anim: 'walk', surface: 'floor', interruptible: true,
    update(b, dt) {
      const side = Math.sign(b.center().x - b.cursor.x) || 1;
      const goal = clamp(b.cursor.x + side * 90 - b.win.width / 2, b.leftX, b.rightX);
      if (b.walkToward(goal, b.tuning.walkSpeed * 1.4, dt)) {
        b.faceCursor();
        return 'happy';
      }
      if (b.stateTime > 8) return 'idle';
    },
  },

  happy: {
    anim: 'happy', surface: 'floor', interruptible: false,
    update(b) {
      if (b.stateTime > 1.8) return 'idle';
    },
  },

  talk: {
    anim: 'talk', surface: 'floor', interruptible: false,
    update(b) {
      if (b.time > b.speechUntil) return 'idle';
    },
  },

  land: {
    anim: 'land', surface: 'floor', interruptible: false,
    update(b) {
      if (b.stateTime > 0.35) return 'idle';
    },
  },

  // Until the cursor actually moves, a press is just a click, so keep the old pose.
  dragged: {
    anim: (b) => (b.grab.moved ? 'dragged' : b.grab.prevAnim),
    surface: 'air', interruptible: false,
    update(b) {
      const { grab: g, cursor: c } = b;
      b.pos.x = c.x - g.dx;
      b.pos.y = c.y - g.dy;
      if (!g.moved && Math.hypot(c.x - g.x0, c.y - g.y0) > 6) g.moved = true;
    },
  },

  fall: {
    anim: 'fall', surface: 'air', interruptible: false,
    update(b, dt) {
      const { vel, pos } = b;
      vel.y += b.tuning.gravity * dt;
      vel.x *= Math.pow(0.6, dt); // air drag
      pos.x += vel.x * dt;
      pos.y += vel.y * dt;
      if (pos.x <= b.leftX || pos.x >= b.rightX) {
        pos.x = clamp(pos.x, b.leftX, b.rightX);
        vel.x *= -0.4;
      }
      if (pos.y < b.ceilingY) {
        pos.y = b.ceilingY;
        vel.y = Math.abs(vel.y) * 0.3;
      }
      if (Math.abs(vel.x) > 20) b.facing = Math.sign(vel.x);
      if (pos.y >= b.floorY) {
        pos.y = b.floorY;
        b.vel = { x: 0, y: 0 };
        return 'land';
      }
    },
  },
};

module.exports = { STATES, clamp };
