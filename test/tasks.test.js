'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('../src/main/tasks');

function ctx() {
  const calls = [];
  return {
    calls,
    say: (t) => calls.push(['say', t]),
    behave: (s) => calls.push(['behave', s]),
    openExternal: (u) => calls.push(['open', u]),
    setTimer: (s, l) => calls.push(['timer', s, l]),
  };
}

test('timer phrasing variants', () => {
  for (const [text, seconds, label] of [
    ['timer 5 min tea', 300, 'tea'],
    ['timer 30s', 30, ''],
    ['remind me in 2 hours to stretch', 7200, 'stretch'],
  ]) {
    const c = ctx();
    run(text, c);
    assert.deepEqual(c.calls, [['timer', seconds, label]], text);
  }
});

test('rejects silly timers', () => {
  const c = ctx();
  assert.match(run('timer 48 hours', c), /24 hours/);
  assert.equal(c.calls.length, 0);
});

test('only http(s) URLs are opened', () => {
  const c = ctx();
  run('open https://example.com', c);
  run('open file:///C:/Windows', c);
  assert.deepEqual(c.calls, [['open', 'https://example.com']]);
});

test('behaviors and fallback', () => {
  const c = ctx();
  run('go to sleep', c);
  run('climb', c);
  assert.deepEqual(c.calls, [['behave', 'sleep'], ['behave', 'toWall']]);
  assert.match(run('make me a sandwich', c), /help/);
});

function full() {
  const c = ctx();
  return Object.assign(c, {
    startFocus: (m, b) => c.calls.push(['focus', m, b]),
    stopFocus: () => true,
    focusStatus: () => null,
    listTimers: () => [],
    cancelTimers: () => 0,
    rng: () => 0.99,
  });
}

test('focus phrasing variants', () => {
  for (const [text, m, b] of [
    ['focus', 25, 5],
    ['focus 50', 50, 5],
    ['pomodoro 30', 30, 5],
    ['focus 50 with a 10 min break', 50, 10],
    ['focus for 45 minutes and 15 min break', 45, 15],
  ]) {
    const c = full();
    run(text, c);
    assert.deepEqual(c.calls, [['focus', m, b]], text);
  }
  const c = full();
  assert.match(run('focus 500', c), /1–180/);
  assert.match(run('time left', c), /No focus session/);
  assert.match(run('stop focus', c), /ended/);
});

test('reminders at a time of day and on repeat', () => {
  const c = full();
  c.now = () => new Date(2026, 9, 30, 14, 0, 0).getTime();
  run('remind me at 3pm to call mom', c);
  run('remind me at 2:30 about standup', c); // no am/pm: the next 2:30, this afternoon
  run('remind me at 1pm to lunch', c); // already past: tomorrow
  run('remind me every 30 min to drink water', c);
  assert.deepEqual(c.calls, [
    ['timer', 3600, 'call mom'],
    ['timer', 1800, 'standup'],
    ['timer', 23 * 3600, 'lunch'],
    ['timer', 1800, 'drink water'],
  ]);
  assert.match(run('remind me every 10 seconds to blink', c), /every 1 minute/);
});

test('random picks', () => {
  const c = full();
  assert.match(run('pick pizza or sushi', c), /sushi!$/);
  assert.match(run('choose between tea, coffee and juice', c), /juice!$/);
  assert.match(run('flip a coin', c), /Tails!$/);
  assert.equal(run('roll a d20', c), '🎲 20');
  assert.equal(run('roll 2d6', c), '🎲 6 + 6 = 12');
  assert.match(run('pick one', c), /help/);
});
