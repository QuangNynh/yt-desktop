import fs from 'fs';
import { CHANNELS_FILE_PATH } from './config';

export interface YouTubeChannel {
  channelId: string;
  channelTitle: string;
  thumbnailUrl?: string;
  uploadsPlaylistId?: string;
  refreshToken: string;
  accessToken?: string;
  expiresAt: number;
  connectedAt: number;
}

export class StorageService {
  static readChannels(): YouTubeChannel[] {
    try {
      if (!fs.existsSync(CHANNELS_FILE_PATH)) {
        return [];
      }
      const data = fs.readFileSync(CHANNELS_FILE_PATH, 'utf-8');
      return JSON.parse(data) as YouTubeChannel[];
    } catch (error: any) {
      console.error(`Failed to read channels file: ${error.message}`);
      return [];
    }
  }

  static writeChannels(channels: YouTubeChannel[]): void {
    try {
      fs.writeFileSync(CHANNELS_FILE_PATH, JSON.stringify(channels, null, 2), 'utf-8');
    } catch (error: any) {
      console.error(`Failed to write channels file: ${error.message}`);
      throw new Error(`Failed to save channels storage: ${error.message}`);
    }
  }
}
