import axios from 'axios';

const BASE_URL = import.meta.env.VITE_SERVER_LOCAL || 'http://localhost:8696/api/v1/';

export const api = axios.create({
  baseURL: BASE_URL,
});

export interface YouTubeChannelItem {
  channelId: string;
  channelTitle: string;
  thumbnailUrl?: string;
  connectedAt: number;
  expiresAt?: number;
  isExpired?: boolean;
}

export interface GetYouTubeChannelsResponse {
  success: boolean;
  count: number;
  channels: YouTubeChannelItem[];
  message?: string;
}

export interface YouTubeCheckTokenResponse {
  success: boolean;
  channelId: string;
  channelTitle: string;
  isExpired: boolean;
  timeLeftSeconds: number;
  isWorking: boolean;
  errorMessage: string | null;
}

export interface YouTubeChannelVideoItem {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  publishedAt: string;
  privacyStatus: string;
  uploadStatus?: string | null;
  videoState?: 'DRAFT' | 'PRIVATE' | 'PUBLIC' | 'UNLISTED';
  isDraft?: boolean;
  publishAt?: string | null;
  scheduledStartTime?: string | null;
  status?: any;
  statistics?: any;
  contentDetails?: any;
  raw?: any;
}

export interface GetChannelVideosResponse {
  success: boolean;
  channelId: string;
  totalResults: number;
  resultsPerPage: number;
  nextPageToken?: string | null;
  prevPageToken?: string | null;
  videos: YouTubeChannelVideoItem[];
  message?: string;
}

export interface ScheduleYouTubePayload {
  channelId: string;
  videoId: string;
  publishTime: string; // ISO 8601 string
}

export interface ScheduleYouTubeResponse {
  success: boolean;
  videoId: string;
  channelId?: string;
  channelTitle?: string;
  publishAt?: string;
  privacyStatus?: string;
  message?: string;
}

export interface UpdateMetadataYouTubePayload {
  channelId: string;
  videoId: string;
  title: string;
  description: string;
  tags?: string[];
}

export interface UpdateMetadataYouTubeResponse {
  success: boolean;
  videoId: string;
  title?: string;
  description?: string;
  tags?: string[];
  message?: string;
}

export interface UpdateThumbnailResponse {
  success: boolean;
  videoId: string;
  channelId: string;
  thumbnailUrl: string;
  message?: string;
}

export interface UpdatePrivacyStatusPayload {
  channelId: string;
  videoId: string;
  privacyStatus: 'private' | 'unlisted';
}

export interface UpdatePrivacyStatusResponse {
  success: boolean;
  videoId: string;
  privacyStatus: string;
  publishAt?: string | null;
  message?: string;
}

export interface AppSettings {
  googleClientId: string;
  googleClientSecret: string;
  redirectUri: string;
  port: number;
}

class YouTubeService {
  async getAuthUrl(): Promise<string> {
    const res = await api.get('/youtube/auth/url');
    return res.data.url;
  }

  async getConnectedChannels(): Promise<GetYouTubeChannelsResponse> {
    const res = await api.get('/youtube/channels');
    return res.data;
  }

  async disconnectChannel(channelId: string): Promise<{ success: boolean; message: string }> {
    const res = await api.delete(`/youtube/channels/${channelId}`);
    return res.data;
  }

  async submitAuthCallback(code: string): Promise<{ success: boolean; message: string; channel?: any }> {
    const res = await api.post('/youtube/auth/callback', { code });
    return res.data;
  }

  async checkChannelToken(channelId: string): Promise<YouTubeCheckTokenResponse> {
    const res = await api.get(`/youtube/channels/${channelId}/check-token`);
    return res.data;
  }

  async getChannelVideos(
    channelId: string,
    maxResults: number = 50,
    pageToken?: string,
    privacyStatus: string = 'draft'
  ): Promise<GetChannelVideosResponse> {
    const res = await api.get('/youtube/videos', {
      params: { channelId, maxResults, pageToken, privacyStatus },
    });
    return res.data;
  }

  async scheduleVideo(payload: ScheduleYouTubePayload): Promise<ScheduleYouTubeResponse> {
    const res = await api.post('/youtube/schedule', payload);
    return res.data;
  }

  async updatePrivacyStatus(payload: UpdatePrivacyStatusPayload): Promise<UpdatePrivacyStatusResponse> {
    const res = await api.post('/youtube/update-status', payload);
    return res.data;
  }

  async updateMetadata(payload: UpdateMetadataYouTubePayload): Promise<UpdateMetadataYouTubeResponse> {
    const res = await api.post('/youtube/update-metadata', payload);
    return res.data;
  }

  async updateThumbnail(channelId: string, videoId: string, file: File): Promise<UpdateThumbnailResponse> {
    const formData = new FormData();
    formData.append('channelId', channelId);
    formData.append('videoId', videoId);
    formData.append('file', file);

    const res = await api.post('/youtube/thumbnail', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  }

  async getSettings(): Promise<AppSettings> {
    const res = await api.get('/settings');
    return res.data.settings;
  }

  async saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    const res = await api.post('/settings', settings);
    return res.data.settings;
  }
}

export const youtubeService = new YouTubeService();
