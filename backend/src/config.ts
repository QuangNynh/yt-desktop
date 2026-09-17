import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();
const envCandidates = [
  path.join(process.cwd(), '.env'),
  path.join(__dirname, '../../.env'),
  path.join(__dirname, '../.env'),
  (process as any).resourcesPath ? path.join((process as any).resourcesPath, '.env') : '',
  process.env.USER_DATA_PATH ? path.join(process.env.USER_DATA_PATH, '.env') : '',
].filter(Boolean);

for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
  }
}

// Hỗ trợ thư mục userData từ Electron khi chạy đóng gói hoặc dev
export const DATA_DIR = process.env.USER_DATA_PATH
  ? path.join(process.env.USER_DATA_PATH, 'data')
  : path.join(process.cwd(), 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export const CHANNELS_FILE_PATH = path.join(DATA_DIR, 'youtube-channels.json');
export const SETTINGS_FILE_PATH = path.join(DATA_DIR, 'settings.json');

// Tự động sao chép file cấu hình và dữ liệu kênh ban đầu nếu trong userData chưa có
if (!fs.existsSync(SETTINGS_FILE_PATH)) {
  const fallbackSettings = path.join(process.cwd(), 'data', 'settings.json');
  if (fs.existsSync(fallbackSettings)) {
    try {
      fs.copyFileSync(fallbackSettings, SETTINGS_FILE_PATH);
    } catch {}
  }
}
if (!fs.existsSync(CHANNELS_FILE_PATH)) {
  const fallbackChannels = path.join(process.cwd(), 'data', 'youtube-channels.json');
  if (fs.existsSync(fallbackChannels)) {
    try {
      fs.copyFileSync(fallbackChannels, CHANNELS_FILE_PATH);
    } catch {}
  }
}

export interface AppSettings {
  googleClientId: string;
  googleClientSecret: string;
  redirectUri: string;
  port: number;
}

export function loadSettings(): AppSettings {
  let settings: Partial<AppSettings> = {};
  if (fs.existsSync(SETTINGS_FILE_PATH)) {
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_FILE_PATH, 'utf-8'));
    } catch {
      // ignore
    }
  }

  return {
    googleClientId:
      process.env.GOOGLE_CLIENT_ID ||
      '',
    googleClientSecret:
      process.env.GOOGLE_CLIENT_SECRET ||
      '',
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ||
      'http://localhost:8696/api/v1/youtube/callback',
    port: Number(process.env.PORT || settings.port || 8696),
  };
}

export function saveSettings(newSettings: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  const updated = { ...current, ...newSettings };
  fs.writeFileSync(SETTINGS_FILE_PATH, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}
