// Renderer: draws the avatar from brain snapshots sent by the main process,
// handles click-through hit testing, dragging, the speech bubble and the prompt.
(async function main() {
  const api = window.mate;
  const cfg = await (await fetch('/assets/character.json')).json();
  const { width: W, height: H } = cfg.window;

  const app = new PIXI.Application({
    width: W,
    height: H,
    backgroundAlpha: 0,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  document.getElementById('stage').appendChild(app.view);

  if (new URLSearchParams(location.search).has('export')) {
    await loadScript('dev/export-template.js');
    return DM.exportTemplate(app, api);
  }

  const avatar = await createAvatar(cfg);
  avatar.view.position.set(W / 2, H - 2);
  app.stage.addChild(avatar.view);

  // --- animation ----------------------------------------------------------------

  let snap = { anim: 'fall', facing: 1, vx: 0, cursor: { x: -1e4, y: -1e4 } };
  let anim = null;
  let animStart = 0;
  const t0 = performance.now();
  api.onTick((s) => {
    if (snap.meows !== undefined && s.meows > snap.meows && s.sound !== false) meow();
    snap = s;
  });

  app.ticker.add(() => {
    const T = (performance.now() - t0) / 1000;
    if (snap.anim !== anim) {
      anim = snap.anim;
      animStart = T;
      avatar.setAnim(anim);
    }
    avatar.update(app.ticker.deltaMS / 1000, DM.pose(anim, T - animStart, T, snap), snap);
    reportExtent();
    updateInteractive();
  });

  // The brain keeps the whole drawing on screen, so tell it how far this one reaches
  // (with a little room for flicker and sway). Only sent when it changes.
  let lastExtent = null;
  function reportExtent() {
    if (!avatar.extent) return;
    const e = avatar.extent();
    const pad = 4;
    const ext = {
      left: Math.round(Math.max(0, e.left - pad)),
      right: Math.round(Math.max(0, W - e.right - pad)),
      top: Math.round(Math.max(0, e.top - pad)),
    };
    const moved = (k) => Math.abs(ext[k] - lastExtent[k]) >= 2;
    if (lastExtent && !moved('left') && !moved('right') && !moved('top')) return; // ignore breathing
    lastExtent = ext;
    api.setExtent(ext);
  }

  // --- click-through ------------------------------------------------------------
  // The window ignores the mouse except over the character or the bubble. The check
  // uses the cursor position from each tick, so it stays right while the window moves
  // under a still cursor.

  const bubble = document.getElementById('bubble');
  const bubbleText = document.getElementById('bubble-text');
  const form = document.getElementById('prompt');
  const input = document.getElementById('prompt-input');
  let interactive = false;
  let dragging = false;
  let promptOpen = false;

  function overBubble({ x, y }) {
    if (bubble.hidden) return false;
    const r = bubble.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  function updateInteractive() {
    if (dragging || promptOpen) return;
    const on = avatar.hitTest(snap.cursor.x, snap.cursor.y) || overBubble(snap.cursor);
    if (on !== interactive) {
      interactive = on;
      api.setInteractive(on);
    }
  }

  // --- dragging, clicks, menu ---------------------------------------------------

  const canvas = app.view;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !avatar.hitTest(e.offsetX, e.offsetY)) return;
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    api.dragStart();
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    api.dragEnd();
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('dblclick', (e) => {
    if (avatar.hitTest(e.offsetX, e.offsetY)) openPrompt();
  });
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    api.showMenu();
  });

  // --- speech bubble and prompt -------------------------------------------------

  let bubbleTimer;
  api.onSay(({ text, duration }) => {
    bubbleText.textContent = text;
    bubble.hidden = false;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => { bubble.hidden = true; }, duration * 1000);
  });

  function openPrompt() {
    if (promptOpen) return;
    promptOpen = interactive = true;
    bubble.hidden = true;
    form.hidden = false;
    api.promptOpened(true);
    setTimeout(() => input.focus(), 0);
  }

  function closePrompt() {
    if (!promptOpen) return;
    promptOpen = interactive = false;
    form.hidden = true;
    input.value = '';
    api.promptOpened(false);
  }

  api.onOpenPrompt(openPrompt);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    closePrompt();
    if (text) api.command(text);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePrompt();
  });
  input.addEventListener('blur', closePrompt);
})().catch((err) => console.error('[renderer]', err));

// cfg.avatar picks "parts", "live2d" or "placeholder". If the chosen one fails to
// load (missing files, bad parts.json), the vector placeholder is used instead.
async function createAvatar(cfg) {
  try {
    if (cfg.avatar === 'parts') {
      const avatar = new DM.PartsAvatar(cfg.parts);
      await avatar.load();
      console.info(`[avatar] parts loaded: ${cfg.parts}`);
      return avatar;
    }
    if (cfg.avatar === 'live2d') {
      if (!window.Live2DCubismCore) await loadScript(cfg.live2d.core);
      await loadScript('../../node_modules/pixi-live2d-display/dist/cubism4.min.js');
      const avatar = new DM.Live2DAvatar(cfg.live2d);
      await avatar.load();
      console.info(`[avatar] Live2D model loaded: ${cfg.live2d.model}`);
      return avatar;
    }
  } catch (err) {
    console.warn(`[avatar] ${cfg.avatar} avatar unavailable (${err.message || err}); using the placeholder.`);
  }
  return new DM.PlaceholderAvatar();
}

// A cross "mrr-OW" synthesized with Web Audio: a buzzy source whose pitch rises
// and falls, through two vowel-like filters that open from "m" to "ow".
let audio;
function meow() {
  audio ||= new AudioContext();
  const t = audio.currentTime + 0.01;
  const pitch = 0.9 + Math.random() * 0.2;
  const len = 0.62;
  const src = audio.createOscillator();
  src.type = 'sawtooth';
  src.frequency.setValueAtTime(420 * pitch, t);
  src.frequency.linearRampToValueAtTime(760 * pitch, t + len * 0.35);
  src.frequency.linearRampToValueAtTime(480 * pitch, t + len);
  const vibrato = audio.createOscillator();
  const depth = audio.createGain();
  vibrato.frequency.value = 22;
  depth.gain.value = 14;
  vibrato.connect(depth).connect(src.frequency);
  const out = audio.createGain();
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(0.16, t + 0.06);
  out.gain.setValueAtTime(0.16, t + len * 0.6);
  out.gain.exponentialRampToValueAtTime(0.001, t + len);
  out.connect(audio.destination);
  for (const [from, to, q] of [[500, 1300, 6], [1400, 2600, 9]]) {
    const f = audio.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.linearRampToValueAtTime(to, t + len * 0.4);
    f.frequency.linearRampToValueAtTime(from * 1.3, t + len);
    src.connect(f).connect(out);
  }
  for (const o of [src, vibrato]) {
    o.start(t);
    o.stop(t + len + 0.05);
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`could not load ${src}`));
    document.head.appendChild(s);
  });
}
