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

  const avatar = await createAvatar(cfg);
  avatar.view.position.set(W / 2, H - 2);
  app.stage.addChild(avatar.view);

  // --- animation ----------------------------------------------------------------

  let snap = { anim: 'fall', facing: 1, vx: 0, cursor: { x: -1e4, y: -1e4 } };
  let anim = null;
  let animStart = 0;
  const t0 = performance.now();
  api.onTick((s) => { snap = s; });

  app.ticker.add(() => {
    const T = (performance.now() - t0) / 1000;
    if (snap.anim !== anim) {
      anim = snap.anim;
      animStart = T;
      avatar.setAnim(anim);
    }
    avatar.update(app.ticker.deltaMS / 1000, DM.pose(anim, T - animStart, T, snap), snap);
    updateInteractive();
  });

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

// Prefer the Live2D model; fall back to the vector placeholder when the Cubism core
// or the model files are missing.
async function createAvatar(cfg) {
  const l2d = cfg.live2d;
  if (l2d && l2d.enabled !== false) {
    try {
      if (!window.Live2DCubismCore) await loadScript(l2d.core);
      await loadScript('../../node_modules/pixi-live2d-display/dist/cubism4.min.js');
      const avatar = new DM.Live2DAvatar(l2d);
      await avatar.load();
      console.info(`[avatar] Live2D model loaded: ${l2d.model}`);
      return avatar;
    } catch (err) {
      console.warn(`[avatar] Live2D unavailable (${err.message || err}); using the placeholder.`);
    }
  }
  return new DM.PlaceholderAvatar();
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
