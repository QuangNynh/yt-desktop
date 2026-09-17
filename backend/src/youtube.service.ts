import { google } from 'googleapis';
import fs from 'fs';
import { loadSettings } from './config';
import { StorageService, YouTubeChannel } from './storage.service';

export interface ScheduleYoutubeDto {
  channelId: string;
  videoId: string;
  publishTime: string;
}

export interface UpdateMetadataYoutubeDto {
  channelId: string;
  videoId: string;
  title: string;
  description: string;
  tags?: string[];
}

export interface UpdateVideoStatusDto {
  channelId: string;
  videoId: string;
  privacyStatus: 'private' | 'unlisted';
}

export interface GetChannelVideosApiDto {
  channelId: string;
  maxResults?: number;
  pageToken?: string;
  privacyStatus?: 'draft' | 'unlisted';
}

export function checkVideoState(item: any): 'DRAFT' | 'PRIVATE' | 'PUBLIC' | 'UNLISTED' {
  const privacy = item.status?.privacyStatus || item.raw?.status?.privacyStatus;

  if (privacy === 'public') return 'PUBLIC';
  if (privacy === 'unlisted') return 'UNLISTED';

  if (privacy === 'private') {
    const status = item.raw?.status || item.status || {};

    // Video riêng tư thực sự thường bị tắt embed và public stats
    if (status.embeddable === false && status.publicStatsViewable === false) {
      return 'PRIVATE';
    }

    // Nếu vẫn mở embed/stats thì thường là luồng nháp chưa finalize trên Studio
    return 'DRAFT';
  }

  return 'DRAFT';
}

export class YouTubeService {
  private createOAuth2Client() {
    const settings = loadSettings();
    const clientId = settings.googleClientId;
    const clientSecret = settings.googleClientSecret;
    const redirectUri = settings.redirectUri;

    if (!clientId || !clientSecret) {
      throw new Error(
        'Missing YouTube/Google Client ID or Client Secret in configuration.',
      );
    }

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  getAuthUrl(): string {
    const oauth2Client = this.createOAuth2Client();
    const scopes = [
      'https://www.googleapis.com/auth/youtube.force-ssl',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtubepartner',
      'https://www.googleapis.com/auth/youtubepartner-channel-audit',
    ];

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'select_account consent',
      scope: scopes,
    });
  }

  async handleCallback(code: string): Promise<{ channelTitle: string; channelId: string; refreshToken: string }> {
    const oauth2Client = this.createOAuth2Client();

    let tokens: any;
    try {
      const { tokens: t } = await oauth2Client.getToken(code);
      tokens = t;
    } catch (error: any) {
      const detail = error.response?.data?.error_description || error.message;
      throw new Error(`Failed to exchange Google authorization code: ${detail}`);
    }

    if (!tokens.refresh_token) {
      throw new Error(
        'No refresh_token received. Make sure to use prompt=consent and access_type=offline in the auth URL.',
      );
    }

    oauth2Client.setCredentials(tokens);

    let channelData: any;
    try {
      const yt = google.youtube({ version: 'v3', auth: oauth2Client });
      const response = await yt.channels.list({
        part: ['snippet', 'contentDetails'],
        mine: true,
      });
      channelData = response.data.items?.[0];
    } catch (error: any) {
      const detail = error.response?.data?.error?.message || error.message;
      throw new Error(`Failed to fetch YouTube channel info: ${detail}`);
    }

    if (!channelData) {
      throw new Error('Could not retrieve channel information from YouTube.');
    }

    const channelId = channelData.id;
    const channelTitle = channelData.snippet?.title || channelId;
    const thumbnailUrl = channelData.snippet?.thumbnails?.default?.url || undefined;
    const uploadsPlaylistId = channelData.contentDetails?.relatedPlaylists?.uploads || undefined;

    const channels = StorageService.readChannels();
    const existingIndex = channels.findIndex((ch) => ch.channelId === channelId);

    const newChannel: YouTubeChannel = {
      channelId,
      channelTitle,
      thumbnailUrl,
      uploadsPlaylistId,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiresAt: tokens.expiry_date || Date.now() + 3600 * 1000,
      connectedAt: Date.now(),
    };

    if (existingIndex > -1) {
      channels[existingIndex] = newChannel;
    } else {
      channels.push(newChannel);
    }

    StorageService.writeChannels(channels);

    return {
      channelId,
      channelTitle,
      refreshToken: tokens.refresh_token,
    };
  }

  getConnectedChannels() {
    const channels = StorageService.readChannels();
    const sanitized = channels.map((ch) => ({
      channelId: ch.channelId,
      channelTitle: ch.channelTitle,
      thumbnailUrl: ch.thumbnailUrl,
      connectedAt: ch.connectedAt,
      expiresAt: ch.expiresAt,
      isExpired: Date.now() >= ch.expiresAt,
    }));

    return {
      success: true,
      count: sanitized.length,
      channels: sanitized,
    };
  }

  disconnectChannel(channelId: string) {
    const channels = StorageService.readChannels();
    const filtered = channels.filter((ch) => ch.channelId !== channelId);

    if (channels.length === filtered.length) {
      throw new Error(`YouTube channel "${channelId}" was not found.`);
    }

    StorageService.writeChannels(filtered);
    return {
      success: true,
      message: `YouTube channel "${channelId}" has been disconnected.`,
    };
  }

  async checkTokenStatus(channelId: string) {
    const channels = StorageService.readChannels();
    const channel = channels.find((ch) => ch.channelId === channelId);

    if (!channel) {
      throw new Error(`YouTube channel "${channelId}" is not connected.`);
    }

    const isExpired = Date.now() >= channel.expiresAt;
    const timeLeftSeconds = Math.max(0, Math.floor((channel.expiresAt - Date.now()) / 1000));

    let isWorking = false;
    let errorMessage: string | null = null;

    try {
      const oauth2Client = this.createOAuth2Client();
      oauth2Client.setCredentials({ refresh_token: channel.refreshToken });

      if (isExpired) {
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);
        if (credentials.access_token) {
          channel.accessToken = credentials.access_token;
          channel.expiresAt = credentials.expiry_date || Date.now() + 3600 * 1000;
          StorageService.writeChannels(channels);
        }
      }

      const yt = google.youtube({ version: 'v3', auth: oauth2Client });
      await yt.channels.list({ part: ['id'], mine: true });
      isWorking = true;
    } catch (error: any) {
      isWorking = false;
      errorMessage = error.response?.data?.error?.message || error.message;
    }

    return {
      success: true,
      channelId,
      channelTitle: channel.channelTitle,
      isExpired,
      timeLeftSeconds,
      isWorking,
      errorMessage,
    };
  }

  private async getChannelCredentials(channelId: string): Promise<{ refreshToken: string; uploadsPlaylistId?: string }> {
    const channels = StorageService.readChannels();
    const channel = channels.find((ch) => ch.channelId === channelId);

    if (!channel) {
      throw new Error(
        `Kênh YouTube "${channelId}" chưa được liên kết hoặc đã bị xóa khỏi hệ thống. Vui lòng kết nối lại kênh.`,
      );
    }

    // Auto-refresh nếu sắp hết hạn (còn dưới 5 phút)
    if (Date.now() + 5 * 60 * 1000 >= channel.expiresAt) {
      try {
        const oauth2Client = this.createOAuth2Client();
        oauth2Client.setCredentials({ refresh_token: channel.refreshToken });
        const { credentials } = await oauth2Client.refreshAccessToken();

        channel.accessToken = credentials.access_token || channel.accessToken;
        channel.expiresAt = credentials.expiry_date || Date.now() + 3600 * 1000;
        StorageService.writeChannels(channels);
      } catch (err: any) {
        console.warn(`Could not auto-refresh access token for ${channelId}:`, err.message);
      }
    }

    return {
      refreshToken: channel.refreshToken,
      uploadsPlaylistId: channel.uploadsPlaylistId,
    };
  }

  private async getRefreshTokenForChannel(channelId: string): Promise<string> {
    const creds = await this.getChannelCredentials(channelId);
    return creds.refreshToken;
  }

  async getVideos(dto: GetChannelVideosApiDto) {
    const channelCreds = await this.getChannelCredentials(dto.channelId);
    const oauth2Client = this.createOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: channelCreds.refreshToken });

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    // Bước 1: Xác định uploads playlist ID (lấy từ cache đã lưu hoặc gọi channels.list?mine=true/id)
    let uploadsPlaylistId = channelCreds.uploadsPlaylistId;

    if (!uploadsPlaylistId) {
      // Gọi channels.list lấy uploads playlist (dạng UU...)
      const channelResponse = await youtube.channels.list({
        part: ['contentDetails'],
        id: [dto.channelId],
      });

      const channelItem = channelResponse.data.items?.[0];
      if (!channelItem) {
        throw new Error(`YouTube channel "${dto.channelId}" was not found on YouTube.`);
      }

      uploadsPlaylistId = channelItem.contentDetails?.relatedPlaylists?.uploads || undefined;
      if (!uploadsPlaylistId) {
        throw new Error(`Could not retrieve uploads playlist for channel ${dto.channelId}.`);
      }

      // Lưu lại vào storage để các lần sau không tốn thêm 1 quota channels.list
      const channels = StorageService.readChannels();
      const targetChannel = channels.find((ch) => ch.channelId === dto.channelId);
      if (targetChannel) {
        targetChannel.uploadsPlaylistId = uploadsPlaylistId;
        StorageService.writeChannels(channels);
      }
    }

    const targetMaxResults = Math.min(dto.maxResults || 50, 100);
    const PLAYLIST_PAGE_SIZE = 50; // YouTube API giới hạn tối đa 50 mỗi lần gọi playlistItems.list
    const items: any[] = [];

    // Bước 2: Gọi playlistItems.list — nếu maxResults > 50 thì gọi nhiều lần (mỗi lần 50)
    let playlistPageToken: string | undefined = dto.pageToken || undefined;
    let remainingToFetch = targetMaxResults;
    let lastPlaylistResponse: any = null;

    while (remainingToFetch > 0) {
      const batchMax = Math.min(remainingToFetch, PLAYLIST_PAGE_SIZE);
      const playlistResponse = await youtube.playlistItems.list({
        part: ['contentDetails'],
        playlistId: uploadsPlaylistId,
        maxResults: batchMax,
        pageToken: playlistPageToken,
      });

      lastPlaylistResponse = playlistResponse;

      if (playlistResponse.data.items) {
        items.push(...playlistResponse.data.items);
      }

      remainingToFetch -= batchMax;

      // Nếu còn trang tiếp và vẫn cần thêm video thì tiếp tục
      if (remainingToFetch > 0 && playlistResponse.data.nextPageToken) {
        playlistPageToken = playlistResponse.data.nextPageToken;
      } else {
        break;
      }
    }

    const videoIds = items.map((item) => item.contentDetails?.videoId).filter(Boolean) as string[];

    // Bước 3: Gọi videos.list?id={video_ids}&part=snippet,status,contentDetails,statistics (mỗi batch tối đa 50 video)
    const videoDetailsMap: Record<string, any> = {};
    if (videoIds.length > 0) {
      // Split into batches of 50 (YouTube API limit per videos.list call)
      const batchSize = 50;
      for (let i = 0; i < videoIds.length; i += batchSize) {
        const batchIds = videoIds.slice(i, i + batchSize);
        try {
          const videosListResponse = await youtube.videos.list({
            part: ['snippet', 'status', 'contentDetails', 'statistics'],
            id: batchIds,
            maxResults: batchSize,
          });

          if (videosListResponse.data.items) {
            for (const v of videosListResponse.data.items) {
              if (v.id) videoDetailsMap[v.id] = v;
            }
          }
        } catch (err: any) {
          console.warn(`Failed to fetch videos.list batch [${i}..${i + batchSize}]:`, err.message);
        }
      }
    }

    // Bước 4 (Filter ở code): Duyệt mảng items và lọc theo item.status.privacyStatus hoặc item.status.publishAt
    const videos = items
      .map((item) => {
        const vId = item.contentDetails?.videoId;
        const vDetail = videoDetailsMap[vId];
        if (!vDetail) return null;

        const statusObj = vDetail.status || {};
        const snippetObj = vDetail.snippet || {};
        const uploadStatus = statusObj.uploadStatus;
        const privacyStatus = statusObj.privacyStatus || 'private';
        const publishAt = statusObj.publishAt || null;

        // 1. Video lên lịch (Scheduled): privacyStatus === 'private' và có publishAt
        const isScheduled = privacyStatus === 'private' && Boolean(publishAt);

        // 2. Phân loại trạng thái video theo metadata (embeddable & publicStatsViewable)
        const videoState = checkVideoState(vDetail);
        const isDraft = videoState === 'DRAFT';

        return {
          id: vId,
          title: snippetObj.title || '',
          description: snippetObj.description || '',
          thumbnailUrl:
            snippetObj.thumbnails?.high?.url ||
            snippetObj.thumbnails?.medium?.url ||
            snippetObj.thumbnails?.default?.url ||
            '',
          publishedAt: snippetObj.publishedAt || item.contentDetails?.videoPublishedAt || '',
          privacyStatus,
          uploadStatus: uploadStatus || null,
          videoState,
          isDraft,
          publishAt,
          scheduledStartTime: null,
          status: statusObj,
          statistics: vDetail.statistics || null,
          contentDetails: vDetail.contentDetails || null,
          raw: vDetail,
        };
      })
      .filter(Boolean) as any[];

    // Lọc theo 2 trạng thái:
    // - 'draft': Video có videoState === 'DRAFT' (chưa finalize trên Studio / embeddable !== false || publicStatsViewable !== false)
    // - 'unlisted': Video Không công khai (Unlisted)
    const targetStatus = dto.privacyStatus === 'unlisted' ? 'unlisted' : 'draft';
    let filteredVideos = videos;

    if (targetStatus === 'draft') {
      filteredVideos = videos.filter((v) => v.videoState === 'DRAFT');
    } else {
      filteredVideos = videos.filter((v) => v.privacyStatus === 'unlisted');
    }

    return {
      success: true,
      channelId: dto.channelId,
      totalResults: lastPlaylistResponse?.data.pageInfo?.totalResults || videos.length,
      resultsPerPage: targetMaxResults,
      nextPageToken: lastPlaylistResponse?.data.nextPageToken || null,
      prevPageToken: lastPlaylistResponse?.data.prevPageToken || null,
      videos: filteredVideos,
    };
  }

  async scheduleVideo(dto: ScheduleYoutubeDto) {
    const refreshToken = await this.getRefreshTokenForChannel(dto.channelId);
    const oauth2Client = this.createOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    try {
      const response = await youtube.videos.update({
        part: ['status'],
        requestBody: {
          id: dto.videoId,
          status: {
            privacyStatus: 'private',
            publishAt: dto.publishTime,
          },
        },
      });

      const video = response.data;
      return {
        success: true,
        videoId: video.id,
        channelId: video.snippet?.channelId,
        channelTitle: video.snippet?.channelTitle,
        publishAt: video.status?.publishAt,
        privacyStatus: video.status?.privacyStatus,
      };
    } catch (error: any) {
      const message =
        error.response?.data?.error?.message ||
        error.errors?.[0]?.message ||
        error.message;
      throw new Error(`YouTube API error: ${message}`);
    }
  }

  async updateVideoStatus(dto: UpdateVideoStatusDto) {
    const refreshToken = await this.getRefreshTokenForChannel(dto.channelId);
    const oauth2Client = this.createOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    try {
      const response = await youtube.videos.update({
        part: ['status'],
        requestBody: {
          id: dto.videoId,
          status: {
            privacyStatus: dto.privacyStatus,
          },
        },
      });

      const video = response.data;
      return {
        success: true,
        videoId: video.id,
        privacyStatus: video.status?.privacyStatus,
        publishAt: video.status?.publishAt || null,
        message: `Đã cập nhật trạng thái video sang "${video.status?.privacyStatus}"`,
      };
    } catch (error: any) {
      const message =
        error.response?.data?.error?.message ||
        error.errors?.[0]?.message ||
        error.message;
      throw new Error(`YouTube API error: ${message}`);
    }
  }

  async updateMetadata(dto: UpdateMetadataYoutubeDto) {
    const refreshToken = await this.getRefreshTokenForChannel(dto.channelId);
    const oauth2Client = this.createOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    try {
      const videoInfo = await youtube.videos.list({
        part: ['snippet'],
        id: [dto.videoId],
      });

      const currentVideo = videoInfo.data.items?.[0];
      if (!currentVideo) {
        throw new Error(`Video "${dto.videoId}" not found on YouTube.`);
      }

      const categoryId = currentVideo.snippet?.categoryId || '22';

      const response = await youtube.videos.update({
        part: ['snippet'],
        requestBody: {
          id: dto.videoId,
          snippet: {
            title: dto.title,
            description: dto.description,
            tags: dto.tags,
            categoryId: categoryId,
          },
        },
      });

      const video = response.data;
      return {
        success: true,
        videoId: video.id,
        title: video.snippet?.title,
        description: video.snippet?.description,
        tags: video.snippet?.tags,
      };
    } catch (error: any) {
      const message =
        error.response?.data?.error?.message ||
        error.errors?.[0]?.message ||
        error.message;
      throw new Error(`YouTube API error: ${message}`);
    }
  }

  async updateThumbnail(channelId: string, videoId: string, file: Express.Multer.File) {
    const refreshToken = await this.getRefreshTokenForChannel(channelId);
    const oauth2Client = this.createOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    try {
      const media = {
        mimeType: file.mimetype,
        body: fs.createReadStream(file.path),
      };

      const response = await youtube.thumbnails.set({
        videoId: videoId,
        media: media,
      });

      // Xóa file temp sau khi upload
      try {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      } catch {
        // ignore
      }

      const thumbnailUrl =
        response.data.items?.[0]?.default?.url ||
        response.data.items?.[0]?.medium?.url ||
        '';

      return {
        success: true,
        videoId,
        channelId,
        thumbnailUrl,
        message: 'Cập nhật thumbnail thành công',
      };
    } catch (error: any) {
      // Dọn dẹp file temp nếu lỗi
      try {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      } catch {
        // ignore
      }

      const message =
        error.response?.data?.error?.message ||
        error.errors?.[0]?.message ||
        error.message;
      throw new Error(`Failed to upload thumbnail: ${message}`);
    }
  }
}

export const youtubeService = new YouTubeService();
