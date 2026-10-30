'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSchedule } = require('../src/main/schedule');

function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let clock = 0;
  const calls = [];
  const hooks = {
    say: (text) => calls.push(['say', text]),
    meow: () => calls.push(['meow']),
    cheer: () => calls.push(['cheer']),
    rest: (on) => calls.push(['rest', on]),
  };
  const s = createSchedule(hooks, { now: () => clock });
  const tick = (seconds) => {
    clock += seconds * 1000;
    t.mock.timers.tick(seconds * 1000);
  };
  return { s, calls, tick };
}

test('a timer fires once and is gone', (t) => {
  const { s, calls, tick } = setup(t);
  s.timer(60, 'tea');
  tick(30);
  assert.deepEqual(s.list(), [{ label: 'tea', kind: 'timer', every: 0, left: 30 }]);
  tick(30);
  assert.deepEqual(calls, [['say', "⏰ Time's up: tea!"], ['meow'], ['cheer']]);
  assert.deepEqual(s.list(), []);
});

test('a repeating reminder keeps firing until cancelled', (t) => {
  const { s, calls, tick } = setup(t);
  s.timer(600, 'drink water', { every: 600, kind: 'reminder' });
  tick(600);
  tick(600);
  assert.equal(calls.filter(([k]) => k === 'say').length, 2);
  assert.equal(calls[0][1], '⏰ Reminder: drink water!');
  assert.equal(s.cancel(), 1);
  tick(1200);
  assert.equal(calls.filter(([k]) => k === 'say').length, 2);
});

test('a focus session naps, wakes for the break, then ends', (t) => {
  const { s, calls, tick } = setup(t);
  s.startFocus(25, 5);
  assert.deepEqual(calls, [['rest', true]]);
  tick(10 * 60);
  assert.deepEqual(s.focusStatus(), { phase: 'focus', minutes: 25, breakMinutes: 5, rounds: 0, left: 15 * 60 });
  tick(15 * 60);
  assert.deepEqual(calls[1], ['rest', false]);
  assert.match(calls[2][1], /Break time/);
  assert.equal(s.focusStatus().phase, 'break');
  tick(5 * 60);
  assert.deepEqual(calls.slice(-2), [['meow'], ['cheer']]);
  assert.match(calls.at(-3)[1], /Break's over/);
  assert.equal(s.focusStatus(), null);
});

test('stopping a focus session wakes it; nothing to stop says so', (t) => {
  const { s, calls, tick } = setup(t);
  assert.equal(s.stopFocus(), false);
  s.startFocus(25, 5);
  assert.equal(s.stopFocus(), true);
  assert.deepEqual(calls, [['rest', true], ['rest', false]]);
  tick(30 * 60);
  assert.equal(calls.length, 2); // its timers were cancelled too
});
