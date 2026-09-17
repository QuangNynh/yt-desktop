import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  focusApp: () => ipcRenderer.invoke('focus-app'),
  onAppFocused: (callback: () => void) => {
    ipcRenderer.on('app-focused', () => callback());
  },
});
