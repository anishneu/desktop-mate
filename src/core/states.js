'use strict';

// State table for the companion. Each state may define:
//   anim           animation name sent to the renderer (string, or fn(brain) → string)
//   surface        'floor' | 'wall' | 'air' — where the body must be. The brain drops
//                  the companion into `fall` when that surface disappears under it.
//   interruptible  whether cursor reactions (startle, curiosity, petting) may cut in
//   enter(b, prev) and update(b, dt) → next state name, or undefined to stay

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Ballistic flight with gravity, air drag and wall bounces. Returns true on landing.
function airborne(b, dt) {
  const { vel, pos } = b;
  vel.y += b.tuning.gravity * dt;
  vel.x *= Math.pow(0.6, dt); // air drag
  pos.x += vel.x * dt;
  pos.y += vel.y * dt;
  // Bounce off the screen's edges only when heading out; a drawing that is wider
  // than the last one eases back in (Brain.keepInBounds) instead of jumping.
  if ((pos.x <= b.leftX && vel.x < 0) || (pos.x >= b.rightX && vel.x > 0)) vel.x *= -0.4;
  if (pos.y < b.ceilingY && vel.y < 0) vel.y = Math.abs(vel.y) * 0.3;
  if (Math.abs(vel.x) > 20) b.facing = Math.sign(vel.x);
  if (pos.y < b.floorY) return false;
  pos.y = b.floorY;
  b.vel = { x: 0, y: 0 };
  return true;
}

const STATES = {
  idle: {
    anim: 'idle', surface: 'floor', interruptible: true,
    enter(b) { b.data.until = b.rand(2, 6); },
    update(b) {
      // It stays the way it is facing, whatever the cursor does; only its eyes follow.
      if (b.stateTime > b.data.until || (b.resting.size && b.stateTime > 1)) return b.chooseNext();
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
      // Walking stops when its nose reaches the edge; the climbing drawing's paws meet it.
      b.pos.x = b.facing < 0 ? b.wallLeftX : b.wallRightX;
      const top = b.ceilingY;
      b.data.targetY = Math.max(top, Math.min(b.pos.y - 80, top + (b.floorY - top) * b.rand(0, 0.65)));
    },
    update(b, dt) {
      b.pos.y -= b.tuning.climbSpeed * dt;
      // The ceiling can come down once the (taller) climbing drawing is reported.
      const targetY = Math.max(b.data.targetY, b.ceilingY);
      if (b.pos.y <= targetY) {
        b.pos.y = targetY;
        return 'cling';
      }
    },
  },

  cling: {
    anim: 'cling', surface: 'wall', interruptible: true,
    enter(b) { b.data.until = b.rand(3, 8); },
    update(b) {
      if (b.stateTime < b.data.until) return;
      const r = b.rng();
      if (b.pos.y > b.ceilingY + 100 && r < 0.35) return 'climb';
      return r < 0.7 ? 'descend' : b.letGo();
    },
  },

  // Climbing back down head first, then turning away from the wall.
  // Climbing down head first for a short way, then leaping off.
  descend: {
    anim: 'descend', surface: 'wall', interruptible: true,
    enter(b) { b.data.until = b.rand(1.2, 2.2); },
    update(b, dt) {
      b.pos.y += b.tuning.climbSpeed * 1.4 * dt;
      if (b.stateTime > b.data.until || b.pos.y >= b.floorY - 40) return 'peek';
    },
  },

  // Stops on the way down and looks at the floor, sizing up the jump.
  peek: {
    anim: 'peek', surface: 'wall', interruptible: true,
    update(b) {
      if (b.stateTime > 1) return 'pounce';
    },
  },

  // A planned jump away from the wall, unlike `fall`.
  pounce: {
    anim: 'pounce', surface: 'air', interruptible: false,
    enter(b) {
      b.facing = -b.facing;
      b.vel = { x: b.facing * b.rand(300, 380), y: -b.rand(280, 360) };
    },
    update(b, dt) {
      if (airborne(b, dt)) return 'touchdown';
    },
  },

  // Landing on its feet from a pounce, then strolling on the same way.
  touchdown: {
    anim: 'touchdown', surface: 'floor', interruptible: false,
    update(b) {
      if (b.stateTime > 0.3) return 'stroll';
    },
  },

  stroll: {
    anim: 'walk', surface: 'floor', interruptible: true,
    enter(b) { b.data.target = clamp(b.pos.x + b.facing * b.rand(90, 180), b.leftX, b.rightX); },
    update(b, dt) {
      if (b.walkToward(b.data.target, b.tuning.walkSpeed, dt)) return 'idle';
    },
  },

  sit: {
    anim: 'sit', surface: 'floor', interruptible: true,
    enter(b) { b.data.until = b.rand(6, 15); },
    update(b) {
      if (b.stateTime > b.data.until) return b.energy < 0.35 ? 'yawn' : 'idle';
    },
  },

  // Lying down, drowsy, then dozing off, on the way to sleep.
  liedown: {
    anim: 'liedown', surface: 'floor', interruptible: false,
    update(b) {
      if (b.stateTime > 1.8) return 'curlYawn';
    },
  },

  // A yawn while awake, standing. If it's very tired, it then goes to bed.
  yawn: {
    anim: 'yawn', surface: 'floor', interruptible: false,
    update(b) {
      if (b.stateTime > 2.6) return b.energy < 0.25 && b.mayNap() ? b.bedtime() : 'idle';
    },
  },

  // The bedtime yawn, curled up: always followed by sleep.
  curlYawn: {
    anim: 'curlYawn', surface: 'floor', interruptible: false,
    update(b) {
      if (b.stateTime > 2.6) return 'sleep';
    },
  },

  // Cursor reactions are handled specially while asleep (see Brain.react).
  // While resting (a focus session, or you're away) it sleeps until that ends.
  sleep: {
    anim: 'sleep', surface: 'floor', interruptible: false,
    enter(b) { b.data.until = b.rand(b.tuning.sleepMin, b.tuning.sleepMax); },
    update(b) {
      if (b.resting.size) return;
      if (b.energy >= 0.98 && b.stateTime > b.data.until) return 'wake';
    },
  },

  // Waking up: drowsy with a couple of blinks, lying up, a yawn and a big stretch. It won't nap again for a while, even if woken early.
  wake: {
    anim: 'wake', surface: 'floor', interruptible: false,
    enter(b) { b.cooldowns.nap = b.tuning.napCooldown; },
    update(b) {
      if (b.stateTime > 4.1) return 'idle';
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

  // The cursor resting on it: holds still, smiles and slowly curls its tail.
  purr: {
    anim: 'purr', surface: 'floor', interruptible: true,
    update(b) {
      b.data.away = b.hovered() ? 0 : (b.data.away || 0) + b.dt;
      if (b.data.away > 0.6) return 'idle';
    },
  },

  happy: {
    anim: 'happy', surface: 'floor', interruptible: false,
    update(b) {
      if (b.stateTime > 1.8) return 'idle';
    },
  },

  // Happy because you clicked or petted it, rather than on its own (a visit, a timer).
  patted: {
    anim: 'patted', surface: 'floor', interruptible: false,
    update(b) {
      if (b.stateTime > 1.8) return 'idle';
    },
  },

  // Clicked too many times: puffs up and meows. More clicks keep it cross a little longer.
  mad: {
    anim: 'mad', surface: 'floor', interruptible: false,
    enter(b) {
      b.meow(); // no turning to the cursor: each click would flip it round
      b.madUntil = Math.max(b.madUntil, b.time + 1); // when forced rather than clicked
    },
    update(b) {
      if (b.time < b.madUntil) return;
      b.clicks = []; // calmed down: the next click is a pat again
      return 'idle';
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
      if (b.stateTime <= 0.6) return; // brace, then splat
      if (b.dizzy) {
        b.dizzy = false;
        return 'dizzy';
      }
      if (b.greeted) return 'idle';
      b.greeted = true; // the first landing after launch: say hi
      return 'greet';
    },
  },

  greet: {
    anim: 'greet', surface: 'floor', interruptible: false,
    enter(b) { b.faceCursor(); },
    update(b) {
      if (b.stateTime > 2.4) return 'idle';
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
      // Swinging it round in circles: add up how far the direction of motion
      // turns. Circles keep adding up; shaking back and forth mostly cancels out.
      if (c.speed > 250) {
        const heading = Math.atan2(c.vy, c.vx);
        if (g.heading !== undefined) {
          let d = heading - g.heading;
          d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
          g.turned += d;
        }
        g.heading = heading;
      }
    },
  },

  // Spun round on a drag and dropped: wobbles with spiral eyes, shakes it off, comes round.
  dizzy: {
    anim: 'dizzy', surface: 'floor', interruptible: false,
    enter(b) { b.facing = b.thrown || b.facing; }, // still heading the way it was thrown
    update(b) {
      if (b.stateTime > 3) return 'shakeOff';
    },
  },

  // Dizzy where it sits, from the cursor circling its head; then it comes round.
  headDizzy: {
    anim: 'headDizzy', surface: 'floor', interruptible: false,
    update(b) {
      if (b.stateTime > 3) return 'headRecover';
    },
  },

  headRecover: {
    anim: 'headRecover', surface: 'floor', interruptible: false,
    update(b) {
      if (b.stateTime > 1.4) return 'idle';
    },
  },

  shakeOff: {
    anim: 'shakeOff', surface: 'floor', interruptible: false,
    update(b) {
      if (b.stateTime > 0.7) return 'recover';
    },
  },

  recover: {
    anim: 'recover', surface: 'floor', interruptible: false,
    update(b) {
      if (b.stateTime > 1.2) return 'idle';
    },
  },

  fall: {
    anim: 'fall', surface: 'air', interruptible: false,
    update(b, dt) {
      if (airborne(b, dt)) return 'land';
    },
  },
};

module.exports = { STATES, clamp };
