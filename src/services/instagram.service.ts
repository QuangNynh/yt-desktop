import { api } from './youtube.service';

export interface InstagramInfoResponse {
  success: boolean;
  title: string;
  username: string;
  fullname: string;
  likes: number;
  isVerified: boolean;
  videoUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  views: number;
  resultsNumber: number;
  error?: string;
}

export interface InstagramAudioResponse {
  success: boolean;
  audioUrl?: string;
  title?: string;
  error?: string;
  blob?: Blob;
}

export interface InstagramVideoResponse {
  success: boolean;
  videoUrl?: string;
  title?: string;
  error?: string;
  blob?: Blob;
}

export interface InstagramChannelUser {
  username: string;
  fullname: string;
  profilePicUrl: string;
  id: string;
  followersCount?: number;
  followingCount?: number;
}

export interface InstagramChannelItem {
  id: string;
  shortcode: string;
  type: 'image' | 'video' | 'carousel';
  title: string;
  videoUrl: string | null;
  thumbnailUrl: string;
  likes: number;
  comments: number;
  views: number;
  takenAt: number;
}

export interface InstagramChannelResponse {
  success: boolean;
  user?: InstagramChannelUser;
  items?: InstagramChannelItem[];
  pagination?: {
    page: number;
    pageSize: number;
    totalCount: number;
    hasMore: boolean;
  };
  error?: string;
}

class InstagramService {
  async getInfo(url: string): Promise<InstagramInfoResponse> {
    const response = await api.post('/instagram/info', { url });
    return response.data;
  }

  async getAudio(url: string): Promise<InstagramAudioResponse> {
    try {
      const response = await api.post('/instagram/audio', { url }, { responseType: 'blob' });

      const contentDisposition = response.headers['content-disposition'];
      let filename = 'audio.mp3';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) filename = filenameMatch[1];
      }

      return {
        success: true,
        blob: response.data,
        title: filename.replace('.mp3', ''),
        audioUrl: URL.createObjectURL(response.data),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getVideo(url: string): Promise<InstagramVideoResponse> {
    try {
      const response = await api.post('/instagram/video', { url }, { responseType: 'blob' });

      const contentDisposition = response.headers['content-disposition'];
      let filename = 'video.mp4';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) filename = filenameMatch[1];
      }

      return {
        success: true,
        blob: response.data,
        title: filename.replace('.mp4', ''),
        videoUrl: URL.createObjectURL(response.data),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getChannel(url: string, type?: string, page?: number, pageSize?: number): Promise<InstagramChannelResponse> {
    const response = await api.post('/instagram/channel', { url, type, page, pageSize });
    return response.data;
  }

  async exportChannelExcel(url: string, type?: string): Promise<{ blob: Blob; filename: string }> {
    const response = await api.post('/instagram/channel/export', { url, type }, { responseType: 'blob' });

    const contentDisposition = response.headers['content-disposition'];
    let filename = `instagram_export_${Date.now()}.xlsx`;
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="(.+)"/);
      if (filenameMatch) filename = filenameMatch[1];
    }

    return { blob: response.data, filename };
  }

  async exportChannelImagesZip(url: string, type?: string): Promise<{ blob: Blob; filename: string }> {
    const response = await api.post('/instagram/channel/export-images', { url, type }, { responseType: 'blob' });

    const contentDisposition = response.headers['content-disposition'];
    let filename = `instagram_images_${Date.now()}.zip`;
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="(.+)"/);
      if (filenameMatch) filename = filenameMatch[1];
    }

    return { blob: response.data, filename };
  }

  async clearCache(): Promise<{ success: boolean; message: string; deletedFilesCount: number }> {
    const response = await api.post('/instagram/channel/clear-cache');
    return response.data;
  }
}

export const instagramService = new InstagramService();
