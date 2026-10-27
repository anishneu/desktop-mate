'use strict';

// Behavior engine for the companion. It owns position, physics, needs and the
// state machine, and knows nothing about Electron, so it runs under `node --test`.
// Coordinates are screen DIPs; `pos` is the top-left of the companion window,
// whose feet sit on its bottom edge.

const { STATES, clamp } = require('./states');

const DEFAULT_TUNING = {
  gravity: 2600, // px/s²
  walkSpeed: 70,
  runSpeed: 260,
  climbSpeed: 55,
  energyDrain: 1 / 420, // full → empty in ~7 min awake
  energyRecover: 1 / 45,
  startleSpeed: 2200, // cursor px/s that counts as a sudden swipe
  startleRadius: 160,
  curiosityRadius: 480,
  maxThrow: 1800,
};

function weighted(rng, options) {
  const total = options.reduce((sum, [, w]) => sum + w, 0);
  let r = rng() * total;
  for (const [name, w] of options) if ((r -= w) < 0) return name;
  return options[0][0];
}

class Brain {
  constructor({ window, hitbox, area, tuning, rng = Math.random }) {
    this.win = window; // { width, height } of the companion window
    this.hit = hitbox; // { width, height } of the visible character inside it
    this.area = area; // work area of the current display
    this.tuning = { ...DEFAULT_TUNING, ...tuning };
    this.rng = rng;

    this.pos = { x: area.x + area.width / 2 - window.width / 2, y: this.ceilingY };
    this.vel = { x: 0, y: 0 };
    this.facing = 1;
    this.energy = 1;
    this.autonomous = true;
    this.cursor = { x: 0, y: 0, vx: 0, vy: 0, speed: 0, still: 0, seen: false };
    this.cooldowns = {};
    this.events = [];
    this.pet = 0;
    this.time = 0;
    this.speechUntil = 0;
    this.grab = null;
    this.enter('fall'); // drop in from the top of the screen
  }

  // --- geometry -------------------------------------------------------------

  get margin() { return (this.win.width - this.hit.width) / 2; }
  get floorY() { return this.area.y + this.area.height - this.win.height; }
  get ceilingY() { return this.area.y - (this.win.height - this.hit.height); }
  get leftX() { return this.area.x - this.margin; }
  get rightX() { return this.area.x + this.area.width - this.win.width + this.margin; }

  center() {
    return { x: this.pos.x + this.win.width / 2, y: this.pos.y + this.win.height - this.hit.height / 2 };
  }

  get anim() {
    const a = STATES[this.state].anim;
    return typeof a === 'function' ? a(this) : a;
  }

  // --- helpers used by states -----------------------------------------------

  rand(lo, hi) { return lo + this.rng() * (hi - lo); }

  cursorDistance() {
    const c = this.center();
    return Math.hypot(this.cursor.x - c.x, this.cursor.y - c.y);
  }

  faceCursor() { this.facing = this.cursor.x < this.center().x ? -1 : 1; }

  // Moves along the floor; returns true once x is reached.
  walkToward(x, speed, dt) {
    const dx = x - this.pos.x;
    if (Math.abs(dx) <= speed * dt) {
      this.pos.x = x;
      return true;
    }
    this.facing = Math.sign(dx);
    this.pos.x += this.facing * speed * dt;
    return false;
  }

  randomFloorX() {
    let x = this.pos.x;
    for (let i = 0; i < 5 && Math.abs(x - this.pos.x) < 120; i++) x = this.rand(this.leftX, this.rightX);
    return x;
  }

  letGo() {
    this.vel = { x: -this.facing * 160, y: -120 }; // push off the wall
    return 'fall';
  }

  // Returns true (and starts the cooldown) when `name` is off cooldown.
  ready(name, seconds) {
    if ((this.cooldowns[name] ?? 0) > 0) return false;
    this.cooldowns[name] = seconds;
    return true;
  }

  // Autonomous choice after idling. Low energy makes yawning and sleeping likelier.
  chooseNext() {
    if (!this.autonomous) return 'idle';
    const e = this.energy;
    const nearWall = Math.min(this.pos.x - this.leftX, this.rightX - this.pos.x) < 200;
    return weighted(this.rng, [
      ['walk', 4],
      ['idle', 2],
      ['sit', 1.5],
      ['toWall', nearWall ? 1.5 : 0.6],
      ['yawn', 0.3 + (1 - e) * 3],
      ['sleep', e < 0.25 ? 5 : 0],
    ]);
  }

  // --- main loop ------------------------------------------------------------

  // Queue an external event: 'drag-start', 'drag-end', 'say' {duration}, 'force' {state}.
  send(type, payload = {}) { this.events.push({ type, ...payload }); }

  enter(name) {
    this.state = name;
    this.stateTime = 0;
    this.data = {};
    STATES[name].enter?.(this);
  }

  update(dt, { area, cursor } = {}) {
    dt = Math.min(dt, 0.05);
    if (area) this.area = area;
    if (cursor) this.sampleCursor(dt, cursor);
    this.time += dt;
    this.stateTime += dt;
    for (const k of Object.keys(this.cooldowns)) this.cooldowns[k] -= dt;
    const t = this.tuning;
    this.energy = clamp(this.energy + (this.state === 'sleep' ? t.energyRecover : -t.energyDrain) * dt, 0, 1);

    if (!this.handleEvents()) {
      const next = this.react(dt) || STATES[this.state].update(this, dt);
      if (next) this.enter(next);
    }
    this.keepInBounds();
    return this.snapshot();
  }

  snapshot() {
    return {
      state: this.state,
      anim: this.anim,
      facing: this.facing,
      energy: Math.round(this.energy * 100) / 100,
      x: Math.round(this.pos.x),
      y: Math.round(this.pos.y),
      vx: this.state === 'dragged' ? this.cursor.vx : this.vel.x,
    };
  }

  sampleCursor(dt, p) {
    const c = this.cursor;
    const warped = Math.hypot(p.x - c.x, p.y - c.y) > 300; // teleport, not a swipe
    if (warped) {
      c.vx = c.vy = 0;
    } else if (c.seen && dt > 0) {
      const k = 0.35; // smoothing
      c.vx += ((p.x - c.x) / dt - c.vx) * k;
      c.vy += ((p.y - c.y) / dt - c.vy) * k;
    }
    c.still = c.seen && p.x === c.x && p.y === c.y ? c.still + dt : 0;
    c.x = p.x;
    c.y = p.y;
    c.seen = true;
    c.speed = Math.hypot(c.vx, c.vy);
  }

  // Events enter their state immediately so a press and release in the same
  // tick still resolve as a click.
  handleEvents() {
    let changed = false;
    for (const e of this.events.splice(0)) {
      const s = STATES[this.state];
      if (e.type === 'drag-start') {
        const c = this.cursor;
        this.grab = {
          dx: c.x - this.pos.x, dy: c.y - this.pos.y, x0: c.x, y0: c.y,
          prev: this.state, prevAnim: this.anim, moved: false,
        };
        this.enter('dragged');
      } else if (e.type === 'drag-end' && this.state === 'dragged') {
        if (this.grab.moved) {
          const m = this.tuning.maxThrow;
          this.vel = { x: clamp(this.cursor.vx, -m, m), y: clamp(this.cursor.vy, -m, m) };
          this.enter('fall');
        } else {
          this.enter(this.poked(this.grab.prev));
        }
      } else if (e.type === 'say') {
        this.speechUntil = this.time + e.duration;
        if (s.interruptible && s.surface === 'floor') this.enter('talk');
        else continue;
      } else if (e.type === 'force') {
        const target = STATES[e.state];
        if (!target || this.state === 'dragged') continue;
        if (target.surface === 'floor' && s.surface !== 'floor') continue;
        this.enter(e.state);
      } else {
        continue;
      }
      changed = true;
    }
    return changed;
  }

  poked(prev) {
    if (prev === 'sleep') return 'wake';
    const surface = STATES[prev].surface;
    if (surface === 'wall') return 'cling';
    if (surface === 'air') return 'fall';
    return 'happy';
  }

  // Cursor reactions that may interrupt the current state.
  react(dt) {
    const s = STATES[this.state];
    const c = this.cursor;
    const dist = this.cursorDistance();
    this.pet = Math.max(0, this.pet - dt * 0.6);

    if (this.state === 'sleep') return dist < 220 && c.speed > 600 ? 'wake' : undefined;
    if (!s.interruptible) return;

    if (dist < this.tuning.startleRadius && c.speed > this.tuning.startleSpeed && this.ready('startle', 4)) {
      return s.surface === 'wall' ? this.letGo() : 'startled';
    }
    if (s.surface !== 'floor') return;

    // Petting: rubbing the cursor over the head.
    const head = { x: this.center().x, y: this.pos.y + this.win.height - this.hit.height * 0.75 };
    if (Math.hypot(c.x - head.x, c.y - head.y) < 55 && c.speed > 120 && c.speed < 1500) {
      this.pet += dt * 1.6;
      if (this.pet > 1.5) {
        this.pet = 0;
        return 'happy';
      }
    }

    // Curiosity: a cursor resting nearby gets a visit now and then.
    if (this.state === 'idle' && c.still > 1.5 && dist > 160 && dist < this.tuning.curiosityRadius &&
        c.y > this.center().y - 250 && this.ready('curious', 12) && this.rng() < 0.6) {
      return 'approach';
    }
  }

  keepInBounds() {
    if (this.state === 'dragged') return;
    const surface = STATES[this.state].surface;
    this.pos.x = clamp(this.pos.x, this.leftX, this.rightX);
    this.pos.y = clamp(this.pos.y, this.ceilingY, this.floorY);
    // The ground or wall can vanish: taskbar moved, resolution changed, display unplugged.
    if (surface === 'floor' && this.pos.y < this.floorY - 1) this.enter('fall');
    else if (surface === 'wall' && this.pos.x > this.leftX + 1 && this.pos.x < this.rightX - 1) this.enter('fall');
  }
}

module.exports = { Brain, STATES, DEFAULT_TUNING };
