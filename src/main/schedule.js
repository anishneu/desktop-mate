'use strict';

// Timers, reminders and focus sessions. It knows nothing about Electron: the main
// process passes in what the companion can do, so it runs under `node --test` with
// mocked timers.
//
// `hooks`: { say(text), meow(), cheer(), rest(on) } where rest(true) sends the
// companion to sleep for a focus session and rest(false) wakes it with a stretch.

function createSchedule(hooks, { now = Date.now } = {}) {
  const timers = new Map();
  let nextId = 1;
  let focus = null; // { phase: 'focus' | 'break', ends, minutes, breakMinutes, handle }
  let rounds = 0; // focus sessions finished since launch

  // A one-off timer, or a reminder that repeats `every` seconds until cancelled.
  function timer(seconds, label = '', { every = 0, kind = 'timer' } = {}) {
    const t = { id: nextId++, label, every, kind, due: now() + seconds * 1000 };
    const fire = () => {
      if (kind === 'reminder') hooks.say(`⏰ Reminder: ${label || 'this is your reminder'}!`);
      else hooks.say(label ? `⏰ Time's up: ${label}!` : '⏰ Time\'s up!');
      hooks.meow();
      hooks.cheer();
      if (!every) return timers.delete(t.id);
      t.due = now() + every * 1000;
      t.handle = setTimeout(fire, every * 1000);
    };
    t.handle = setTimeout(fire, seconds * 1000);
    timers.set(t.id, t);
    return t;
  }

  // Pending timers and reminders, soonest first: [{ label, kind, every, left }] (left in s).
  function list() {
    return [...timers.values()]
      .sort((a, b) => a.due - b.due)
      .map(({ label, kind, every, due }) => ({ label, kind, every, left: Math.max(0, Math.round((due - now()) / 1000)) }));
  }

  // Cancels every timer and reminder (not a focus session). Returns how many there were.
  function cancel() {
    const n = timers.size;
    for (const t of timers.values()) clearTimeout(t.handle);
    timers.clear();
    return n;
  }

  // A focus session: the companion naps for `minutes`, wakes for a `breakMinutes`
  // break, then says when the break is over. Starting one replaces any other.
  function startFocus(minutes, breakMinutes) {
    stopFocus();
    focus = { phase: 'focus', minutes, breakMinutes };
    phase('focus', minutes, startBreak);
    hooks.rest(true);
  }

  function phase(name, minutes, next) {
    focus.phase = name;
    focus.ends = now() + minutes * 60000;
    focus.handle = setTimeout(next, minutes * 60000);
  }

  function startBreak() {
    rounds++;
    phase('break', focus.breakMinutes, endBreak);
    hooks.rest(false); // wakes with a stretch
    const done = rounds > 1 ? ` That's ${rounds} rounds today!` : '';
    hooks.say(`Break time! Stretch with me for ${focus.breakMinutes} min.${done}`);
    hooks.meow();
  }

  function endBreak() {
    focus = null;
    hooks.say('Break\'s over! Type "focus" when you\'re ready for another round.');
    hooks.meow();
    hooks.cheer();
  }

  // Returns false when there was nothing to stop.
  function stopFocus() {
    if (!focus) return false;
    clearTimeout(focus.handle);
    if (focus.phase === 'focus') hooks.rest(false);
    focus = null;
    return true;
  }

  // { phase, left (s), minutes, breakMinutes, rounds }, or null when not focusing.
  function focusStatus() {
    if (!focus) return null;
    const { phase: p, minutes, breakMinutes } = focus;
    return { phase: p, minutes, breakMinutes, rounds, left: Math.max(0, Math.round((focus.ends - now()) / 1000)) };
  }

  return { timer, list, cancel, startFocus, stopFocus, focusStatus };
}

module.exports = { createSchedule };
