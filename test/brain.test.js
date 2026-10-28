'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Brain } = require('../src/core/brain');

const AREA = { x: 0, y: 0, width: 1920, height: 1040 };
const FAR = { x: -5000, y: -5000 };
const DT = 1 / 60;

// Deterministic RNG so behavior runs are reproducible.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function make(seed = 1, tuning) {
  return new Brain({
    window: { width: 300, height: 400 },
    hitbox: { width: 124, height: 214 },
    area: AREA,
    tuning,
    rng: mulberry32(seed),
  });
}

function run(b, seconds, cursor = FAR, area = AREA) {
  for (let t = 0; t < seconds; t += DT) b.update(DT, { area, cursor });
}

function landed(b) {
  run(b, 3);
  assert.equal(b.pos.y, b.floorY);
}

test('spawns at the top and falls onto the floor', () => {
  const b = make();
  assert.equal(b.state, 'fall');
  landed(b);
  assert.notEqual(b.state, 'fall');
});

test('stays inside the work area and lives a full day cycle', () => {
  const b = make(7);
  const seen = new Set();
  for (let t = 0; t < 20 * 60; t += DT) {
    b.update(DT, { area: AREA, cursor: FAR });
    seen.add(b.state);
    assert.ok(b.pos.x >= b.leftX && b.pos.x <= b.rightX, `x out of bounds in ${b.state}`);
    assert.ok(b.pos.y >= b.ceilingY && b.pos.y <= b.floorY, `y out of bounds in ${b.state}`);
  }
  for (const s of ['walk', 'sit', 'climb', 'cling', 'yawn', 'sleep']) assert.ok(seen.has(s), `never entered ${s}`);
});

test('drag and throw: follows the cursor, then falls with its velocity', () => {
  const b = make();
  landed(b);
  const grab = { x: b.pos.x + 150, y: b.pos.y + 300 };
  b.update(DT, { area: AREA, cursor: grab });
  b.send('drag-start');
  b.update(DT, { area: AREA, cursor: grab });
  assert.equal(b.state, 'dragged');
  let cursor = grab;
  for (let i = 0; i < 20; i++) {
    cursor = { x: cursor.x + 20, y: cursor.y - 15 };
    b.update(DT, { area: AREA, cursor });
  }
  assert.equal(b.anim, 'dragged');
  assert.equal(b.pos.x + 150, cursor.x);
  b.send('drag-end');
  b.update(DT, { area: AREA, cursor });
  assert.equal(b.state, 'fall');
  assert.ok(b.vel.x > 500, 'thrown to the right');
  run(b, 3, cursor);
  assert.equal(b.pos.y, b.floorY);
});

test('going to sleep yawns first, and a click on the sleeper wakes it with a stretch', () => {
  const b = make();
  landed(b);
  b.send('force', { state: 'sleep' });
  b.update(DT, { area: AREA, cursor: FAR });
  assert.equal(b.state, 'yawn');
  run(b, 3);
  assert.equal(b.state, 'sleep');
  b.send('drag-start');
  b.send('drag-end');
  b.update(DT, { area: AREA, cursor: FAR });
  assert.equal(b.state, 'wake');
  assert.equal(b.anim, 'wake');
  run(b, 3);
  assert.equal(b.state, 'idle');
});

test('a fast cursor swipe nearby startles it', () => {
  const b = make();
  landed(b);
  b.send('force', { state: 'idle' });
  b.update(DT, { area: AREA, cursor: FAR });
  const c = b.center();
  for (let i = -3; i <= 3 && b.state !== 'startled'; i++) {
    b.update(DT, { area: AREA, cursor: { x: c.x + i * 60, y: c.y } });
  }
  assert.equal(b.state, 'startled');
});

test('rubbing the head makes it happy', () => {
  const b = make();
  landed(b);
  b.send('force', { state: 'sit' });
  b.update(DT, { area: AREA, cursor: FAR });
  const head = { x: b.center().x, y: b.pos.y + 400 - 214 * 0.75 };
  for (let i = 0; i < 180 && b.state !== 'happy'; i++) {
    b.update(DT, { area: AREA, cursor: { x: head.x + Math.sin(i / 3) * 20, y: head.y } });
  }
  assert.equal(b.state, 'happy');
});

test('falls when the floor drops away (taskbar hidden)', () => {
  const b = make();
  landed(b);
  b.update(DT, { area: { ...AREA, height: 1080 }, cursor: FAR });
  assert.equal(b.state, 'fall');
});

test('talks only when standing on the floor', () => {
  const b = make();
  b.send('say', { duration: 2 });
  b.update(DT, { area: AREA, cursor: FAR });
  assert.equal(b.state, 'fall');
  landed(b);
  b.send('force', { state: 'idle' });
  b.send('say', { duration: 2 });
  b.update(DT, { area: AREA, cursor: FAR });
  assert.equal(b.state, 'talk');
  run(b, 2.1);
  assert.notEqual(b.state, 'talk');
});

test('climbs down a wall head first and turns away from it', () => {
  const b = make(3);
  landed(b);
  b.pos.x = b.rightX;
  b.facing = 1;
  b.send('force', { state: 'cling' });
  run(b, DT);
  b.pos.y = b.floorY - 300;
  b.enter('descend');
  run(b, 0.5);
  assert.equal(b.state, 'descend');
  assert.ok(b.pos.y > b.floorY - 300 && b.pos.y < b.floorY);
  assert.equal(b.pos.x, b.rightX);
  run(b, 5);
  assert.equal(b.pos.y, b.floorY);
  assert.equal(b.facing, -1);
  assert.notEqual(b.state, 'descend');
});

test('waves hi once after the first landing, not after later ones', () => {
  const b = make(5);
  const seen = [];
  for (let t = 0; t < 4; t += DT) {
    b.update(DT, { area: AREA, cursor: FAR });
    if (seen.at(-1) !== b.state) seen.push(b.state);
  }
  assert.deepEqual(seen.slice(0, 3), ['fall', 'land', 'greet']);
  b.vel = { x: 0, y: 0 };
  b.pos.y = b.floorY - 300;
  b.enter('fall');
  run(b, 1);
  assert.notEqual(b.state, 'greet');
});

test('a click on the standing companion makes it happy', () => {
  const b = make(2);
  run(b, 6);
  const c = { x: b.pos.x + 150, y: b.pos.y + 300 };
  run(b, 0.1, c);
  b.send('drag-start');
  run(b, DT, c);
  b.send('drag-end');
  run(b, DT, c);
  assert.equal(b.state, 'happy');
});
