'use strict';

// The renderer's only bridge to the main process.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mate', {
  setInteractive: (on) => ipcRenderer.send('mate:interactive', on),
  dragStart: () => ipcRenderer.send('mate:drag', 'start'),
  dragEnd: () => ipcRenderer.send('mate:drag', 'end'),
  showMenu: () => ipcRenderer.send('mate:menu'),
  command: (text) => ipcRenderer.send('mate:command', text),
  promptOpened: (open) => ipcRenderer.send('mate:prompt', open),
  onTick: (fn) => ipcRenderer.on('mate:tick', (_e, s) => fn(s)),
  onSay: (fn) => ipcRenderer.on('mate:say', (_e, msg) => fn(msg)),
  onOpenPrompt: (fn) => ipcRenderer.on('mate:open-prompt', () => fn()),
});
