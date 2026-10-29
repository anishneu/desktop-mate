'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Brain, STATES } = require('../src/core/brain');

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
  for (const s of ['walk', 'sit', 'climb', 'cling', 'yawn', 'liedown', 'sleep']) assert.ok(seen.has(s), `never entered ${s}`);
});

test('with a wide drawing reported, all of it stays on screen, and it still climbs flush with the edge', () => {
  const b = make(7);
  // A drawing reaching 110 px either side of the window's middle and 340 px up.
  b.setExtent({ left: 40, right: 40, top: 60 });
  const seen = new Set();
  let prevX = b.pos.x;
  let landed = false;
  for (let t = 0; t < 20 * 60; t += DT) {
    b.update(DT, { area: AREA, cursor: FAR });
    seen.add(b.state);
    const surface = STATES[b.state].surface;
    if (surface === 'wall') {
      assert.ok(b.pos.x === b.wallLeftX || b.pos.x === b.wallRightX, `off the wall in ${b.state}`);
    } else if (surface === 'floor') {
      assert.ok(b.pos.x >= b.leftX - 0.5 && b.pos.x <= b.rightX + 0.5, `drawing off screen in ${b.state}`);
      assert.ok(Math.abs(b.pos.x - prevX) < 40, `jumped sideways in ${b.state}`);
    }
    if (b.state !== 'fall') landed = true; // it drops in from above the screen on purpose
    if (landed) assert.ok(b.pos.y >= b.ceilingY - 0.5, `above the top of the screen in ${b.state}`);
    prevX = b.pos.x;
  }
  for (const s of ['walk', 'climb', 'cling']) assert.ok(seen.has(s), `never entered ${s}`);
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

test('going to sleep lies down and yawns first, and a click on the sleeper wakes it with a stretch', () => {
  const b = make();
  landed(b);
  b.send('force', { state: 'sleep' });
  b.update(DT, { area: AREA, cursor: FAR });
  assert.equal(b.state, 'liedown');
  run(b, 1.5);
  assert.equal(b.state, 'curlYawn');
  run(b, 3);
  assert.equal(b.state, 'sleep');
  b.send('drag-start');
  b.send('drag-end');
  b.update(DT, { area: AREA, cursor: FAR });
  assert.equal(b.state, 'wake');
  assert.equal(b.anim, 'wake');
  run(b, 4.6);
  assert.equal(b.state, 'idle');
});

test('a fast cursor swipe nearby startles it', () => {
  const b = make();
  landed(b);
  b.send('force', { state: 'idle' });
  b.update(DT, { area: AREA, cursor: FAR });
  const c = b.center();
  for (let i = -10; i <= 0 && b.state !== 'startled'; i++) {
    b.update(DT, { area: AREA, cursor: { x: c.x + i * 50, y: c.y } });
  }
  assert.equal(b.state, 'startled');
});

test('fast cursor movement beside it, not at it, does not startle it', () => {
  const b = make();
  landed(b);
  b.send('force', { state: 'idle' });
  b.update(DT, { area: AREA, cursor: FAR });
  const c = b.center();
  // Back and forth vertically, 100 px to the side of the cat.
  for (let i = 0; i < 240; i++) {
    const y = c.y + Math.sin(i / 2) * 150;
    b.update(DT, { area: AREA, cursor: { x: c.x + 100, y } });
    assert.notEqual(b.state, 'startled');
  }
});

test('a quick yawn while awake stands; only bedtime curls up, and it will not nap right after waking', () => {
  const b = make(9);
  landed(b);
  b.send('force', { state: 'yawn' });
  run(b, 3);
  assert.equal(b.state, 'idle');
  b.energy = 0.1;
  b.send('force', { state: 'sleep' });
  run(b, 5);
  assert.equal(b.state, 'sleep');
  b.send('drag-start');
  b.send('drag-end');
  run(b, 3); // woken early, still tired
  const seen = new Set();
  for (let t = 0; t < 150; t += DT) {
    b.update(DT, { area: AREA, cursor: FAR });
    seen.add(b.state);
  }
  assert.ok(!seen.has('sleep') && !seen.has('liedown'), 'napped again right after waking');
});

test('rubbing the head makes it happy (patted: blushing)', () => {
  const b = make();
  landed(b);
  b.send('force', { state: 'sit' });
  b.update(DT, { area: AREA, cursor: FAR });
  const head = { x: b.center().x, y: b.pos.y + 400 - 214 * 0.75 };
  for (let i = 0; i < 180 && b.state !== 'patted'; i++) {
    b.update(DT, { area: AREA, cursor: { x: head.x + Math.sin(i / 3) * 20, y: head.y } });
  }
  assert.equal(b.state, 'patted');
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

test('climbs down head first a little, leaps off away from the wall, lands and strolls on', () => {
  const b = make(3);
  landed(b);
  b.pos.x = b.rightX;
  b.facing = 1;
  b.send('force', { state: 'cling' });
  run(b, DT);
  b.pos.y = b.floorY - 500;
  b.enter('descend');
  run(b, 0.5);
  assert.equal(b.state, 'descend');
  assert.equal(b.pos.x, b.rightX); // still on the wall
  const seen = [];
  for (let t = 0; t < 12; t += DT) {
    b.update(DT, { area: AREA, cursor: FAR });
    if (seen.at(-1) !== b.state) seen.push(b.state);
  }
  assert.deepEqual(seen.slice(0, 5), ['descend', 'pounce', 'touchdown', 'stroll', 'idle']);
  assert.equal(b.pos.y, b.floorY);
  assert.ok(b.pos.x < b.rightX - 150, 'moved away from the wall');
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

test('a click on the standing companion makes it happy (patted: blushing)', () => {
  const b = make(2);
  run(b, 6);
  const c = { x: b.pos.x + 150, y: b.pos.y + 300 };
  run(b, 0.1, c);
  b.send('drag-start');
  run(b, DT, c);
  b.send('drag-end');
  run(b, DT, c);
  assert.equal(b.state, 'patted');
});

function click(b) {
  const c = { x: b.pos.x + 150, y: b.pos.y + 300 };
  run(b, DT, c);
  b.send('drag-start');
  run(b, DT, c);
  b.send('drag-end');
  run(b, DT, c);
}

test('clicks spaced out are pats; a flurry makes it mad and meow, and it calms down after', () => {
  const b = make(2);
  run(b, 6);
  b.send('force', { state: 'idle' });
  run(b, DT);
  for (let i = 0; i < 3; i++) {
    click(b);
    assert.equal(b.state, 'patted');
    run(b, 2);
  }
  assert.equal(b.meows, 0);
  for (let i = 0; i < 4; i++) {
    click(b);
    run(b, 0.2);
  }
  assert.equal(b.state, 'mad');
  assert.equal(b.meows, 1);
  for (let i = 0; i < 3; i++) {
    run(b, 0.5);
    click(b); // still pestering: stays mad and meows again
    assert.equal(b.state, 'mad');
  }
  assert.ok(b.meows >= 2, `meowed ${b.meows} times`);
  run(b, 3.5);
  assert.notEqual(b.state, 'mad');
  b.send('force', { state: 'idle' });
  run(b, DT);
  click(b);
  assert.equal(b.state, 'patted');
});

function drag(b, path) {
  let cursor = { x: b.pos.x + 150, y: b.pos.y + 300 };
  run(b, DT, cursor);
  b.send('drag-start');
  run(b, DT, cursor);
  for (const p of path) {
    cursor = p(cursor);
    run(b, DT, cursor);
  }
  b.send('drag-end');
  run(b, DT, cursor);
  return cursor;
}

test('swung round in circles and dropped, it lands dizzy, shakes it off and recovers', () => {
  const b = make(6);
  run(b, 6);
  b.send('force', { state: 'idle' });
  run(b, DT);
  // Two circles of radius 120, ~0.5 s each.
  const start = { x: b.pos.x + 150, y: b.pos.y + 300 - 200 };
  const circle = Array.from({ length: 60 }, (_, i) => () => ({
    x: start.x + Math.cos((i / 30) * 2 * Math.PI) * 120,
    y: start.y + Math.sin((i / 30) * 2 * Math.PI) * 120,
  }));
  const cursor = drag(b, circle);
  assert.equal(b.state, 'fall');
  const seen = [];
  for (let t = 0; t < 8; t += DT) {
    b.update(DT, { area: AREA, cursor });
    if (seen.at(-1) !== b.state) seen.push(b.state);
  }
  assert.deepEqual(seen.slice(0, 5), ['fall', 'land', 'dizzy', 'shakeOff', 'recover']);
  assert.equal(seen[5], 'idle');
});

test('dizzy faces the way it was flung, even after bouncing off a screen edge', () => {
  for (const dir of [-1, 1]) {
    const b = make(6);
    run(b, 6);
    b.send('force', { state: 'idle' });
    run(b, DT);
    const o = { x: b.pos.x + 150, y: b.pos.y + 100 };
    const circle = Array.from({ length: 60 }, (_, i) => () => ({
      x: o.x + Math.cos((i / 30) * 2 * Math.PI) * 120,
      y: o.y + Math.sin((i / 30) * 2 * Math.PI) * 120,
    }));
    const fling = Array.from({ length: 6 }, () => (c) => ({ x: c.x + dir * 40, y: c.y }));
    const cursor = drag(b, [...circle, ...fling]);
    for (let t = 0; t < 3 && b.state !== 'dizzy'; t += DT) b.update(DT, { area: AREA, cursor });
    assert.equal(b.state, 'dizzy');
    assert.equal(b.facing, dir);
  }
});

test('a plain throw or shaking back and forth does not make it dizzy', () => {
  const b = make(6);
  run(b, 6);
  b.send('force', { state: 'idle' });
  run(b, DT);
  const shake = Array.from({ length: 60 }, (_, i) => (c) => ({ x: c.x + (Math.floor(i / 6) % 2 ? -25 : 25), y: c.y - 2 }));
  const cursor = drag(b, shake);
  const seen = new Set();
  for (let t = 0; t < 5; t += DT) {
    b.update(DT, { area: AREA, cursor });
    seen.add(b.state);
  }
  assert.ok(seen.has('land') && !seen.has('dizzy'));
});

test('a nap lasts at least a minute even when not tired', () => {
  const b = make(4);
  landed(b);
  b.send('force', { state: 'sleep' });
  run(b, 4.5); // lying down, then the yawn
  assert.equal(b.state, 'sleep');
  run(b, 55);
  assert.equal(b.state, 'sleep');
  run(b, 120);
  assert.notEqual(b.state, 'sleep');
});
