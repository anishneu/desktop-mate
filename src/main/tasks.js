'use strict';

// Task layer: a registry of tools the companion can run. Each tool has a name, a
// description and a `parse` that turns a typed command into arguments (or null),
// so the same registry can later be handed to an LLM as function-calling tools.
//
// `ctx` is provided by the main process: { say, behave, openExternal, setTimer }.

const UNIT_SECONDS = { s: 1, sec: 1, second: 1, m: 60, min: 60, minute: 60, h: 3600, hr: 3600, hour: 3600 };
const MAX_TIMER = 24 * 3600;

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
    run: () => 'Try: "time", "timer 5 min tea", "open https://…", "search cute cats", "sleep", "walk", "climb".',
  },
  {
    name: 'set_timer',
    description: 'Set a timer or reminder.',
    parse(t) {
      const m = t.match(/(?:timer|remind me)\D*?(\d+(?:\.\d+)?)\s*(s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?)\b\s*(?:to |about |for )?(.*)$/i);
      return m ? { seconds: Math.round(Number(m[1]) * unitSeconds(m[2])), label: m[3].trim() } : null;
    },
    run({ seconds, label }, ctx) {
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
