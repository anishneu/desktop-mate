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
