'use strict';

// Task layer: a registry of tools the companion can run. Each tool has a name, a
// description and a `parse` that turns a typed command into arguments (or null),
// so the same registry can later be handed to an LLM as function-calling tools.
//
// `ctx` is provided by the main process: { say, behave, openExternal, setTimer,
// listTimers, cancelTimers, startFocus, stopFocus, focusStatus }, plus optional
// `now` and `rng` (tests pass fixed ones).

const UNIT_SECONDS = { s: 1, sec: 1, second: 1, m: 60, min: 60, minute: 60, h: 3600, hr: 3600, hour: 3600 };
const MAX_TIMER = 24 * 3600;
const DURATION = String.raw`(\d+(?:\.\d+)?)\s*(s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?)\b`;
const MINUTES = String.raw`(\d+)\s*(?:m|mins?|minutes?)?`;

function unitSeconds(unit) {
  const u = unit.toLowerCase();
  return UNIT_SECONDS[u.length > 1 ? u.replace(/s$/, '') : u];
}

function humanize(seconds) {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  if (seconds < 3600) {
    const m = +(seconds / 60).toFixed(1);
    return `${m} minute${m === 1 ? '' : 's'}`;
  }
  const h = +(seconds / 3600).toFixed(1);
  return `${h} hour${h === 1 ? '' : 's'}`;
}

// Time left, rounded up to whole minutes once it's a minute or more: "12 min".
function left(seconds) {
  return seconds < 60 ? `${seconds} s` : `${Math.ceil(seconds / 60)} min`;
}

const clockTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// Milliseconds until the next h:mm. Without am/pm, "3" is whichever 3 o'clock comes first.
function untilClock(now, hour, minute, ampm) {
  const hours = ampm ? [(hour % 12) + (ampm.toLowerCase() === 'pm' ? 12 : 0)] : hour <= 12 ? [hour % 12, (hour % 12) + 12] : [hour];
  const base = new Date(now);
  let best = Infinity;
  for (const h of hours) {
    const d = new Date(base);
    d.setHours(h, minute, 0, 0);
    if (d <= base) d.setDate(d.getDate() + 1);
    best = Math.min(best, d - base);
  }
  return best;
}

const random = (ctx) => (ctx.rng || Math.random)();
const pick = (ctx, list) => list[Math.floor(random(ctx) * list.length)];

const BEHAVIORS = {
  sleep: ['sleep', 'Okay… just a short nap. Zzz'],
  nap: ['sleep', 'Okay… just a short nap. Zzz'],
  walk: ['walk', 'Going for a stroll!'],
  wander: ['walk', 'Going for a stroll!'],
  sit: ['sit', 'Sitting down~'],
  climb: ['toWall', 'Watch me climb!'],
  dance: ['happy', '♪ ♪ ♪'],
  jump: ['happy', 'Hop!'],
};

const TOOLS = [
  {
    name: 'help',
    description: 'List what the companion can do.',
    parse: (t) => (/^(help|\?|what can you do)/i.test(t) ? {} : null),
    run: () => 'Try: "focus 25", "remind me at 3pm to call mom", "timer 5 min tea", "pick pizza or sushi", ' +
      '"flip a coin", "roll 2d6", "time", "search cute cats", "sleep", "climb".',
  },
  {
    name: 'focus_status',
    description: 'Say how long is left of the focus session or break.',
    parse: (t) => (/^(focus status|status|time left|how (long|much) (time )?(is )?left)\b/i.test(t) ? {} : null),
    run(_args, ctx) {
      const f = ctx.focusStatus();
      if (!f) return 'No focus session running. Type "focus 25" to start one.';
      return f.phase === 'focus' ? `${left(f.left)} of focus left. Keep going!` : `${left(f.left)} of break left.`;
    },
  },
  {
    name: 'stop_focus',
    description: 'End the focus session.',
    parse: (t) => (/^(stop|end|cancel|quit)\s+(the\s+)?(focus|pomodoro|break)\b/i.test(t) ? {} : null),
    run: (_args, ctx) => (ctx.stopFocus() ? 'Focus session ended. Nice work!' : 'There was no focus session running.'),
  },
  {
    name: 'focus',
    description: 'Start a focus session (Pomodoro): the companion naps while you work, then wakes you for a break.',
    parse(t) {
      const m = t.match(new RegExp(String.raw`^(?:focus|pomodoro|start (?:a )?(?:focus|pomodoro))(?:\s+(?:for\s+)?${MINUTES})?` +
        String.raw`(?:\s*(?:,|and|with|then)?\s*(?:an?\s+)?${MINUTES}\s+break)?\s*$`, 'i'));
      return m ? { minutes: Number(m[1] || 25), breakMinutes: Number(m[2] || 5) } : null;
    },
    run({ minutes, breakMinutes }, ctx) {
      if (!(minutes >= 1 && minutes <= 180) || !(breakMinutes >= 1 && breakMinutes <= 60)) {
        return 'Focus can be 1–180 minutes, with a 1–60 minute break.';
      }
      ctx.startFocus(minutes, breakMinutes);
      return `Focus mode for ${minutes} min! I'll nap here and wake you for a ${breakMinutes} min break. Zzz`;
    },
  },
  {
    name: 'list_timers',
    description: 'List pending timers and reminders.',
    parse: (t) => (/^((list|show|my)\s+)?(timers|reminders)\??$|^what are my (timers|reminders)/i.test(t) ? {} : null),
    run(_args, ctx) {
      const all = ctx.listTimers();
      if (!all.length) return 'No timers or reminders set.';
      return all.map((t) => `${t.label || 'timer'} in ${left(t.left)}${t.every ? ` (every ${humanize(t.every)})` : ''}`).join(' · ');
    },
  },
  {
    name: 'cancel_timers',
    description: 'Cancel all timers and reminders.',
    parse: (t) => (/^(cancel|stop|clear|delete)\s+(all\s+)?(my\s+)?(the\s+)?(timers?|reminders?)\b/i.test(t) ? {} : null),
    run(_args, ctx) {
      const n = ctx.cancelTimers();
      return n ? `Cancelled ${n} timer${n === 1 ? '' : 's'}.` : 'There were no timers to cancel.';
    },
  },
  {
    name: 'remind_at',
    description: 'Set a reminder for a time of day.',
    parse(t) {
      const m = t.match(/^remind me (?:at|by)\s+(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b\s*(?:(to|about|for|that) )?(.*)$/i);
      if (!m || Number(m[1]) > 23 || Number(m[2] || 0) > 59 || (m[3] && Number(m[1]) > 12)) return null;
      return { hour: Number(m[1]), minute: Number(m[2] || 0), ampm: m[3], word: (m[4] || 'about').toLowerCase(), label: m[5].trim() };
    },
    run({ hour, minute, ampm, word, label }, ctx) {
      const now = ctx.now ? ctx.now() : Date.now();
      const ms = untilClock(now, hour, minute, ampm);
      ctx.setTimer(Math.round(ms / 1000), label, { kind: 'reminder' });
      return `Okay! I'll remind you at ${clockTime(now + ms)}${label ? ` ${word} ${label}` : ''}.`;
    },
  },
  {
    name: 'set_timer',
    description: 'Set a timer or reminder.',
    parse(t) {
      const m = t.match(new RegExp(String.raw`(?:timer|remind me)\D*?${DURATION}\s*(?:to |about |for )?(.*)$`, 'i'));
      if (!m) return null;
      const args = { seconds: Math.round(Number(m[1]) * unitSeconds(m[2])), label: m[3].trim() };
      // "remind me every 30 min to drink water" repeats until cancelled.
      return /^remind me\s+every\b/i.test(t) ? { ...args, every: true } : args;
    },
    run({ seconds, label, every }, ctx) {
      if (every) {
        if (!(seconds >= 60) || seconds > MAX_TIMER) return 'Repeating reminders can be every 1 minute to 24 hours.';
        ctx.setTimer(seconds, label, { every: seconds, kind: 'reminder' });
        return `Okay! I'll remind you every ${humanize(seconds)}${label ? ` to ${label}` : ''}. Say "cancel reminders" to stop.`;
      }
      if (!(seconds > 0) || seconds > MAX_TIMER) return 'I can only keep timers between 1 second and 24 hours.';
      ctx.setTimer(seconds, label);
      return `Okay! I'll ping you in ${humanize(seconds)}${label ? ` about "${label}"` : ''}.`;
    },
  },
  {
    name: 'get_time',
    description: 'Tell the current time and date.',
    parse: (t) => (/\b(time|date|what day)\b/i.test(t) ? {} : null),
    run() {
      const d = new Date();
      const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const day = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
      return `It's ${time} on ${day}.`;
    },
  },
  {
    name: 'open_url',
    description: 'Open a web page in the default browser.',
    parse(t) {
      const m = t.match(/^(?:open|go to)\s+(https?:\/\/\S+)$/i);
      return m ? { url: m[1] } : null;
    },
    run({ url }, ctx) {
      ctx.openExternal(url);
      return 'Opening it for you!';
    },
  },
  {
    name: 'web_search',
    description: 'Search the web in the default browser.',
    parse(t) {
      const m = t.match(/^(?:search|google|look up)\s+(?:for\s+)?(.+)$/i);
      return m ? { query: m[1] } : null;
    },
    run({ query }, ctx) {
      ctx.openExternal(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`);
      return `Searching for "${query}"…`;
    },
  },
  {
    name: 'flip_coin',
    description: 'Flip a coin.',
    parse: (t) => (/^(flip|toss)\s+(a\s+)?coin\b|^(coin ?flip|heads or tails)\??$/i.test(t) ? {} : null),
    run: (_args, ctx) => `*flips it with a paw* … ${pick(ctx, ['Heads', 'Tails'])}!`,
  },
  {
    name: 'roll_dice',
    description: 'Roll dice, e.g. "roll", "roll a d20", "roll 2d6".',
    parse(t) {
      const m = t.match(/^roll(?:\s+(?:an?\s+)?(?:(\d*)\s*d(\d+)|dice|die))?\s*$/i);
      return m ? { count: Number(m[1] || 1), sides: Number(m[2] || 6) } : null;
    },
    run({ count, sides }, ctx) {
      if (count < 1 || count > 20 || sides < 2 || sides > 1000) return 'I can roll 1–20 dice with 2–1000 sides.';
      const rolls = Array.from({ length: count }, () => 1 + Math.floor(random(ctx) * sides));
      const total = rolls.reduce((a, b) => a + b, 0);
      return `🎲 ${count > 1 ? `${rolls.join(' + ')} = ${total}` : total}`;
    },
  },
  {
    name: 'pick',
    description: 'Pick one of several options, e.g. "pick pizza, sushi or tacos".',
    parse(t) {
      const m = t.match(/^(?:pick|choose|decide)(?:\s+(?:between|from|one of|for me))?[:\s]+(.+?)\??$/i);
      if (!m) return null;
      const options = m[1].split(/\s*(?:,|\/|\bor\b|\band\b)\s*/i).map((o) => o.trim()).filter(Boolean);
      return options.length >= 2 ? { options } : null;
    },
    run: ({ options }, ctx) => `*bats one with a paw* … ${pick(ctx, options)}!`,
  },
  {
    name: 'behave',
    description: 'Ask the companion to sleep, walk, sit, climb or dance.',
    parse(t) {
      const m = t.match(/^(?:go to |go |please )?(sleep|nap|walk|wander|sit|climb|dance|jump)\b/i);
      return m ? { action: m[1].toLowerCase() } : null;
    },
    run({ action }, ctx) {
      const [state, reply] = BEHAVIORS[action];
      ctx.behave(state);
      return reply;
    },
  },
];

function run(text, ctx) {
  const input = text.trim();
  for (const tool of TOOLS) {
    const args = tool.parse(input);
    if (!args) continue;
    try {
      return tool.run(args, ctx);
    } catch (err) {
      return `Oops, that didn't work: ${err.message}`;
    }
  }
  return 'I don\'t know that one yet — type "help" to see what I can do.';
}

module.exports = { TOOLS, run };
