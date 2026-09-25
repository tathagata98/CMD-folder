const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopRunner', {
  listTests: () => ipcRenderer.invoke('tests:list'),
  start: (testId) => ipcRenderer.invoke('run:start', testId),
  stop: () => ipcRenderer.invoke('run:stop'),
  getState: () => ipcRenderer.invoke('run:state'),
  onStateChange: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('run-state', listener);
    return () => ipcRenderer.removeListener('run-state', listener);
  },
});
