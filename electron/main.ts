import { app, BrowserWindow, shell, ipcMain } from 'electron';
import path from 'path';
import { Server } from 'http';

// Tắt các cảnh báo không ảnh hưởng từ Chrome DevTools Autofill protocol
app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication,AutofillAddress');

// Thiết lập đường dẫn lưu trữ vào UserData của Electron
process.env.USER_DATA_PATH = app.getPath('userData');

// Đảm bảo chỉ có một instance duy nhất chạy (Single Instance Lock)
const gotSingleInstanceLock = app.requestSingleInstanceLock();

let mainWindow: BrowserWindow | null = null;
let backendServer: Server | null = null;

// Hàm focus hoặc đưa app Desktop lên trước màn hình, hỗ trợ nạp callback URL nếu có
function focusMainWindow(callbackUrl?: string) {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();

    // Trên Windows, toggle alwaysOnTop để đưa app lên trước các cửa sổ trình duyệt khác
    mainWindow.setAlwaysOnTop(true);
    mainWindow.focus();
    mainWindow.setAlwaysOnTop(false);

    try {
      mainWindow.webContents.send('app-focused', callbackUrl);
    } catch {}

    if (callbackUrl && callbackUrl.includes('code=')) {
      try {
        const u = new URL(callbackUrl);
        const code = u.searchParams.get('code');
        if (code) {
          mainWindow.loadURL(`http://localhost:8696/?code=${encodeURIComponent(code)}`);
        }
      } catch (e) {
        // ignore
      }
    }
  }
}

// IPC Handler để backend hoặc frontend yêu cầu focus app
ipcMain.handle('focus-app', () => {
  focusMainWindow();
});

// IPC Handler mở browser ngoài
ipcMain.handle('open-external', async (_, url: string) => {
  await shell.openExternal(url);
});

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

async function startBackend() {
  // Ở dev mode, npm run dev:backend đã chạy backend riêng bằng tsx
  if (isDev) {
    console.log('[Electron] Dev mode: Using standalone dev backend on port 8696.');
    return;
  }

  try {
    const backendModule = require('../dist-backend/server');
    backendServer = backendModule.startServer(8696);
    console.log('[Electron] Production backend server started successfully on port 8696.');
  } catch (err: any) {
    console.error('[Electron] Failed to start backend server:', err.message);
  }
}

function createWindow() {
  // Preload file: hỗ trợ cả chạy ts trực tiếp (dev) lẫn js biên dịch (build)
  const preloadPath = path.join(__dirname, 'preload.js');
  const fallbackPreload = path.join(__dirname, '../dist-electron/preload.js');
  const finalPreload = require('fs').existsSync(preloadPath) ? preloadPath : fallbackPreload;
  const appIconPath = path.join(__dirname, '../build/icon.png');
  const icon = require('fs').existsSync(appIconPath) ? appIconPath : undefined;

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'YouTube Scheduler Desktop',
    icon,
    webPreferences: {
      preload: finalPreload,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    backgroundColor: '#0f172a',
    titleBarStyle: 'default',
  });

  // Hỗ trợ custom scheme hoặc focus từ callback
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:8696');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

if (!gotSingleInstanceLock) {
  // Có một instance khác đang chạy. Thoát ngay lập tức để không khởi động lại backend server
  console.log('[Electron] Another instance is already running. Quitting duplicate instance immediately.');
  app.quit();
} else {
  // Đăng ký custom protocol để browser có thể gọi mở lại Desktop App
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('youtubescheduler', process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient('youtubescheduler');
  }

  // Xử lý khi click vào link youtubescheduler:// trên macOS
  app.on('open-url', (event, url) => {
    event.preventDefault();
    focusMainWindow(url);
  });

  // Xử lý instance thứ hai trên Windows/Linux (khi người dùng click link giao thức youtubescheduler://)
  app.on('second-instance', (_, commandLine) => {
    console.log('[Electron] Second instance opened with args:', commandLine);
    const customUrl = commandLine.find((arg) => arg.startsWith('youtubescheduler://'));
    focusMainWindow(customUrl);
  });

  app.whenReady().then(async () => {
    await startBackend();
    createWindow();

    // Đăng ký listener lắng nghe khi có kênh kết nối thành công từ backend
    try {
      const routes = isDev ? require('../backend/src/routes') : require('../dist-backend/routes');
      if (routes.setAuthSuccessListener) {
        routes.setAuthSuccessListener((title: string) => {
          console.log(`[Electron] Channel "${title}" connected! Focusing desktop window...`);
          focusMainWindow();
        });
      }
    } catch (e) {
      // ignore
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    if (backendServer) {
      console.log('[Electron] Shutting down backend server...');
      backendServer.close();
    }
  });
}
