'use strict';

// Main process: one small transparent, frameless, always-on-top window that the
// brain moves around the desktop. The renderer only draws; behavior lives here.

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, Menu, globalShortcut, ipcMain, net, protocol, screen, shell } = require('electron');
const { Brain } = require('../core/brain');
const tasks = require('./tasks');

const ROOT = path.resolve(__dirname, '..', '..');
const character = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'character.json'), 'utf8'));
const { width: W, height: H } = character.window;
const TICK_MS = 1000 / 60;
const PROMPT_SHORTCUT = 'Ctrl+Alt+M';
const snapshotArg = process.argv.find((a) => a.startsWith('--snapshot='));
// Dev only: `--anim=climb` shows that animation whatever the state, to check its art.
const forcedAnim = process.argv.find((a) => a.startsWith('--anim='))?.slice('--anim='.length);
const exportDir = process.argv.find((a) => a.startsWith('--export-template='))?.slice('--export-template='.length);

let win;
let brain;
let lastPos = '';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// Serve the project over app:// so the renderer (and the Live2D loaders) can fetch
// local models and textures without loosening web security for file://.
function registerAppProtocol() {
  protocol.handle('app', (request) => {
    const file = path.join(ROOT, decodeURIComponent(new URL(request.url).pathname));
    if (!file.startsWith(ROOT + path.sep)) return new Response('Forbidden', { status: 403 });
    if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

function createWindow() {
  brain = new Brain({
    window: character.window,
    hitbox: character.hitbox,
    area: screen.getPrimaryDisplay().workArea,
    tuning: character.tuning,
  });
  win = new BrowserWindow({
    width: W,
    height: H,
    x: Math.round(brain.pos.x),
    y: Math.round(brain.pos.y),
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  // Click-through until the renderer reports the cursor is over the character.
  win.setIgnoreMouseEvents(true, { forward: true });
  if (!exportDir) win.once('ready-to-show', () => win.showInactive());
  if (!app.isPackaged) {
    win.webContents.on('console-message', (e) => console.log(`[renderer:${e.level}] ${e.message}`));
  }
  win.loadURL(`app://bundle/src/renderer/index.html${exportDir ? '?export' : ''}`);
}

function tick(dt) {
  if (win.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const c = brain.center();
  const area = screen.getDisplayNearestPoint({ x: Math.round(c.x), y: Math.round(c.y) }).workArea;
  const s = brain.update(dt, { area, cursor });
  const key = `${s.x},${s.y}`;
  if (key !== lastPos) {
    // Pass the size every time: on scaled displays Windows can drift a transparent
    // window's size when only the position is set.
    win.setBounds({ x: s.x, y: s.y, width: W, height: H });
    lastPos = key;
  }
  win.webContents.send('mate:tick', { ...s, ...(forcedAnim && { anim: forcedAnim }), cursor: { x: cursor.x - s.x, y: cursor.y - s.y } });
}

function startLoop() {
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    tick((now - last) / 1000);
    last = now;
  }, TICK_MS);
}

function say(text) {
  const duration = Math.min(9, Math.max(2.5, 1.5 + text.length * 0.05));
  brain.send('say', { duration });
  win.webContents.send('mate:say', { text, duration });
}

const taskContext = {
  say,
  behave: (state) => brain.send('force', { state }),
  openExternal: (url) => shell.openExternal(url),
  setTimer: (seconds, label) => setTimeout(() => {
    say(label ? `⏰ Time's up: ${label}!` : '⏰ Time\'s up!');
    brain.send('force', { state: 'happy' });
  }, seconds * 1000),
};

function openPrompt() {
  win.webContents.send('mate:open-prompt');
}

function showMenu() {
  const actions = [['Walk', 'walk'], ['Sit', 'sit'], ['Yawn', 'yawn'], ['Sleep', 'sleep'], ['Climb a wall', 'toWall'], ['Cheer', 'happy']];
  Menu.buildFromTemplate([
    { label: 'Talk to me…', accelerator: PROMPT_SHORTCUT, click: openPrompt },
    { label: 'Do something', submenu: actions.map(([label, state]) => ({ label, click: () => brain.send('force', { state }) })) },
    { label: 'Wander around', type: 'checkbox', checked: brain.autonomous, click: (item) => { brain.autonomous = item.checked; } },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]).popup({ window: win });
}

ipcMain.on('mate:interactive', (_e, on) => win.setIgnoreMouseEvents(!on, { forward: true }));
ipcMain.on('mate:drag', (_e, phase) => brain.send(phase === 'start' ? 'drag-start' : 'drag-end'));
ipcMain.on('mate:menu', showMenu);
ipcMain.on('mate:command', (_e, text) => say(tasks.run(String(text), taskContext)));
ipcMain.on('mate:prompt', (_e, open) => {
  win.setIgnoreMouseEvents(!open, { forward: true });
  if (open) win.focus();
});

// Dev helper: `npm run export-template` writes the placeholder out as a parts set.
ipcMain.on('mate:export-file', (_e, name, data) => {
  if (!exportDir || !/^[\w-]+\.(png|json)$/.test(name)) return;
  const dir = path.resolve(exportDir);
  fs.mkdirSync(dir, { recursive: true });
  const body = name.endsWith('.png') ? Buffer.from(data.split(',')[1], 'base64') : data;
  fs.writeFileSync(path.join(dir, name), body);
  console.log(`wrote ${path.join(dir, name)}`);
});
ipcMain.on('mate:export-done', () => app.quit());

// Dev helper: `npm run snapshot` grabs the window after a few seconds and exits.
// Add `-- --state=sleep` to force a state once the companion has landed, and
// `--delay=300` (ms after forcing) to catch short states like land or startled.
// `--anim=cling` shows an animation's art without the state (e.g. on the floor).
function captureSnapshot(file) {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const state = arg('state');
  if (state) setTimeout(() => brain.send('force', { state }), 3000);
  setTimeout(async () => {
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.resolve(file), image.toPNG());
    console.log(`snapshot written to ${path.resolve(file)} (state: ${brain.state})`);
    app.quit();
  }, 3000 + Number(arg('delay') || 2000));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    registerAppProtocol();
    createWindow();
    startLoop();
    globalShortcut.register(PROMPT_SHORTCUT, openPrompt);
    if (snapshotArg) captureSnapshot(snapshotArg.slice('--snapshot='.length));
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
}
