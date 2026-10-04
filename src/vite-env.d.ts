/// <reference types="vite/client" />

interface Window {
  desktopDownloads?: {
    getDirectory: () => Promise<string | null>
    chooseDirectory: () => Promise<string | null>
    youtube: (request: { action: 'list' | 'create' | 'pause' | 'resume' | 'retry' | 'clear-history'; id?: string; urls?: string[]; kind?: 'audio' | 'video'; quality?: string }) => Promise<any>
    onDirectoryChanged: (listener: (directory: string) => void) => () => void
  }
  instagramDesktop?: {
    status: () => Promise<{ connected: boolean }>
    connect: () => Promise<{ connected: boolean }>
    sync: () => Promise<{ connected: boolean }>
    disconnect: () => Promise<{ connected: boolean }>
  }
}
