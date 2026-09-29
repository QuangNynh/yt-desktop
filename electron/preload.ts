import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('instagramDesktop', {
  status: () => ipcRenderer.invoke('instagram:status') as Promise<{ connected: boolean }>,
  connect: () => ipcRenderer.invoke('instagram:connect') as Promise<{ connected: boolean }>,
  sync: () => ipcRenderer.invoke('instagram:sync') as Promise<{ connected: boolean }>,
  disconnect: () => ipcRenderer.invoke('instagram:disconnect') as Promise<{ connected: boolean }>,
});

contextBridge.exposeInMainWorld('desktopDownloads', {
  getDirectory: () => ipcRenderer.invoke('downloads:get-directory') as Promise<string | null>,
  chooseDirectory: () => ipcRenderer.invoke('downloads:choose-directory') as Promise<string | null>,
  onDirectoryChanged: (listener: (directory: string) => void) => {
    const callback = (_event: Electron.IpcRendererEvent, directory: string) => listener(directory);
    ipcRenderer.on('downloads:directory-changed', callback);
    return () => ipcRenderer.removeListener('downloads:directory-changed', callback);
  },
});
