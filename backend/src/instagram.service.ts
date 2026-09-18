/**
 * Instagram Service - Adapted from toolBe for lenytdesktop
 * Handles: post info, video/audio download, channel feed, Excel export, ZIP export, cache
 * Removed: ProxyService dependency (direct connection only for desktop)
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Response } from 'express';
import * as ExcelJS from 'exceljs';
import * as archiver from 'archiver';
import Ffmpeg from 'fluent-ffmpeg';
import { DATA_DIR } from './config';

// Try to set ffmpeg path
try {
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
  Ffmpeg.setFfmpegPath(ffmpegInstaller.path);
} catch {
  console.warn('[Instagram] @ffmpeg-installer/ffmpeg not found, using system ffmpeg');
}

export interface InstagramResponse {
  results_number: number;
  url_list: string[];
  post_info: {
    owner_username: string;
    owner_fullname: string;
    is_verified: boolean;
    is_private: boolean;
    likes: number;
    is_ad: boolean;
    caption: string;
  };
  media_details: {
    type: string;
    dimensions: { height: number; width: number };
    url: string;
    video_view_count?: number;
    thumbnail?: string;
  }[];
}

class InstagramService {
  private getShortcode(input: string): string {
    const trimmed = input.trim();
    if (trimmed.includes('/') || trimmed.includes('instagram.com')) {
      const match = trimmed.match(/(?:\/p\/|\/reel\/|\/tv\/|\/reels\/)([A-Za-z0-9_-]+)/);
      if (!match) throw new Error('Invalid Instagram URL. Only posts and reels are supported.');
      return match[1];
    }
    if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
      throw new Error('Invalid Instagram shortcode or URL format.');
    }
    return trimmed;
  }

  private getUsername(input: string): string {
    const trimmed = input.trim();
    if (trimmed.includes('/') || trimmed.includes('instagram.com')) {
      const match = trimmed.match(/(?:instagram\.com\/)([A-Za-z0-9_.-]+)/);
      if (!match) throw new Error('Invalid Instagram profile URL.');
      return match[1];
    }
    return trimmed;
  }

  private async getCSRFTokenAndCookies(): Promise<{ csrfToken: string; cookieHeader: string }> {
    const response = await axios.request({
      method: 'GET',
      url: 'https://www.instagram.com/',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const setCookies = response.headers['set-cookie'];
    if (!setCookies || setCookies.length === 0) {
      throw new Error('No set-cookie headers returned from Instagram.');
    }

    let csrfToken = '';
    const cookieParts: string[] = [];

    for (const cookie of setCookies) {
      const parts = cookie.split(';');
      cookieParts.push(parts[0]);
      if (parts[0].startsWith('csrftoken=')) {
        csrfToken = parts[0].replace('csrftoken=', '');
      }
    }

    if (!csrfToken) {
      for (const cookie of setCookies) {
        const match = cookie.match(/csrftoken=([^;]+)/);
        if (match) { csrfToken = match[1]; break; }
      }
    }

    if (!csrfToken) throw new Error('CSRF token not found in set-cookie headers.');

    return { csrfToken, cookieHeader: cookieParts.join('; ') };
  }

  private async queryInstagramGraphQL(shortcode: string, csrfToken: string, cookieHeader: string): Promise<any> {
    const BASE_URL = 'https://www.instagram.com/graphql/query';
    const INSTAGRAM_DOCUMENT_ID = '10015901848480474';

    const postData = new URLSearchParams({
      variables: JSON.stringify({
        shortcode,
        fetch_tagged_user_count: null,
        hoisted_comment_id: null,
        hoisted_reply_id: null,
      }),
      doc_id: INSTAGRAM_DOCUMENT_ID,
    });

    const response = await axios.request({
      method: 'POST',
      url: BASE_URL,
      headers: {
        'X-CSRFToken': csrfToken,
        'Cookie': cookieHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': `https://www.instagram.com/reel/${shortcode}/`,
        'Origin': 'https://www.instagram.com',
      },
      data: postData.toString(),
    });

    const data = response.data;
    if (!data || !data.data || !data.data.xdt_shortcode_media) {
      throw new Error('Only posts/reels supported, or post is private/unavailable.');
    }
    return data.data.xdt_shortcode_media;
  }

  private formatInstagramResponse(requestData: any): InstagramResponse {
    const url_list: string[] = [];
    const media_details: any[] = [];

    const isSidecar = requestData['__typename'] === 'XDTGraphSidecar';
    if (isSidecar) {
      const edges = requestData.edge_sidecar_to_children?.edges || [];
      for (const edge of edges) {
        const node = edge.node;
        if (node) {
          media_details.push(this.formatMediaDetails(node));
          url_list.push(node.is_video ? node.video_url : node.display_url);
        }
      }
    } else {
      media_details.push(this.formatMediaDetails(requestData));
      url_list.push(requestData.is_video ? requestData.video_url : requestData.display_url);
    }

    const caption = requestData.edge_media_to_caption?.edges?.[0]?.node?.text || '';

    return {
      results_number: url_list.length,
      url_list,
      post_info: {
        owner_username: requestData.owner?.username || '',
        owner_fullname: requestData.owner?.full_name || '',
        is_verified: !!requestData.owner?.is_verified,
        is_private: !!requestData.owner?.is_private,
        likes: requestData.edge_media_preview_like?.count || 0,
        is_ad: !!requestData.is_ad,
        caption,
      },
      media_details,
    };
  }

  private formatMediaDetails(mediaData: any) {
    if (mediaData.is_video) {
      return {
        type: 'video',
        dimensions: mediaData.dimensions || { height: 0, width: 0 },
        video_view_count: mediaData.video_view_count || 0,
        url: mediaData.video_url,
        thumbnail: mediaData.display_url,
      };
    }
    return {
      type: 'image',
      dimensions: mediaData.dimensions || { height: 0, width: 0 },
      url: mediaData.display_url,
    };
  }

  private async getInstagramData(url: string): Promise<InstagramResponse> {
    const shortcode = this.getShortcode(url);
    console.log(`[Instagram] Fetching metadata for shortcode: ${shortcode}`);
    const { csrfToken, cookieHeader } = await this.getCSRFTokenAndCookies();
    const mediaData = await this.queryInstagramGraphQL(shortcode, csrfToken, cookieHeader);
    return this.formatInstagramResponse(mediaData);
  }

  async getVideoInfo(url: string) {
    const data = await this.getInstagramData(url);
    if (!data || !data.media_details || data.media_details.length === 0) {
      throw new Error('Cannot retrieve media details from this Instagram URL');
    }
    const videoMedia = data.media_details.find((m) => m.type === 'video');
    if (!videoMedia) throw new Error('No video found in this Instagram post');

    const username = data.post_info?.owner_username || 'instagram';
    return {
      success: true,
      title: data.post_info?.caption || 'Instagram Video',
      username,
      fullname: data.post_info?.owner_fullname,
      likes: data.post_info?.likes,
      isVerified: data.post_info?.is_verified,
      videoUrl: videoMedia.url,
      thumbnailUrl: videoMedia.thumbnail || '',
      width: videoMedia.dimensions?.width,
      height: videoMedia.dimensions?.height,
      views: videoMedia.video_view_count,
      resultsNumber: data.results_number,
    };
  }

  private async getWebProfileInfo(username: string): Promise<any> {
    const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`;
    const response = await axios.request({
      method: 'GET',
      url,
      headers: this.getUserFeedHeaders(username),
    });
    const responseData = response.data;
    if (!responseData || !responseData.data || !responseData.data.user) {
      throw new Error('Failed to extract user profile data.');
    }
    return responseData.data.user;
  }

  async getChannelVideos(usernameOrUrl: string, typeFilter?: string, page: number = 1, pageSize: number = 10) {
    const username = this.getUsername(usernameOrUrl);
    console.log(`[Instagram] Fetching channel for: ${username}, page: ${page}, pageSize: ${pageSize}, filter: ${typeFilter}`);

    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 10;
    if (pageSize > 200) pageSize = 200;

    const cacheDir = path.join(DATA_DIR, 'instagram');
    await fs.promises.mkdir(cacheDir, { recursive: true });
    const cacheFilePath = path.join(cacheDir, `${username}.json`);

    let cachedData: { user: any; items: any[]; overallTotalCount: number } | null = null;
    const cacheExists = await fs.promises.access(cacheFilePath).then(() => true).catch(() => false);
    if (cacheExists) {
      try {
        const fileContent = await fs.promises.readFile(cacheFilePath, 'utf-8');
        cachedData = JSON.parse(fileContent);
      } catch { /* Will fetch fresh data */ }
    }

    let overallTotalCount = 0;
    let formattedItems: any[] = [];
    let userProfile: any = null;

    if (cachedData) {
      userProfile = cachedData.user;
      formattedItems = cachedData.items;
      overallTotalCount = cachedData.overallTotalCount;
    } else {
      const profileInfo = await this.getWebProfileInfo(username);
      overallTotalCount = profileInfo.edge_owner_to_timeline_media?.count || 0;
      userProfile = {
        username: profileInfo.username || username,
        fullname: profileInfo.full_name || '',
        profilePicUrl: profileInfo.profile_pic_url || '',
        id: profileInfo.pk || '',
        followersCount: profileInfo.edge_followed_by?.count || 0,
        followingCount: profileInfo.edge_follow?.count || 0,
      };

      const baseFeedUrl = `https://www.instagram.com/api/v1/feed/user/${username}/username/`;
      let allItems: any[] = [];
      let currentMaxId: string | null = null;
      let hasMore = true;
      let pagesFetched = 0;
      const MAX_PAGES = overallTotalCount > 0 ? Math.ceil(overallTotalCount / 12) : 100;

      while (hasMore && pagesFetched < MAX_PAGES) {
        let fetchUrl = baseFeedUrl;
        if (currentMaxId) fetchUrl += `?max_id=${currentMaxId}`;

        console.log(`[Instagram] Fetching page ${pagesFetched + 1}/${MAX_PAGES} for ${username}...`);
        const response = await axios.request({
          method: 'GET',
          url: fetchUrl,
          headers: this.getUserFeedHeaders(username),
        });
        const responseData = response.data;
        if (!responseData || !responseData.items) break;

        allItems = allItems.concat(responseData.items);
        hasMore = responseData.more_available === true;
        currentMaxId = responseData.next_max_id;
        pagesFetched++;
        if (!currentMaxId) hasMore = false;
        if (hasMore) await new Promise((resolve) => setTimeout(resolve, 250));
      }

      formattedItems = allItems.map((item: any) => {
        let type = 'image';
        if (item.media_type === 2) type = 'video';
        else if (item.media_type === 8) type = 'carousel';

        return {
          id: item.id,
          shortcode: item.code,
          type,
          title: item.caption?.text || '',
          videoUrl: item.video_versions?.[0]?.url || null,
          thumbnailUrl: item.image_versions2?.candidates?.[0]?.url || null,
          likes: item.like_count || 0,
          comments: item.comment_count || 0,
          views: item.play_count || item.view_count || 0,
          takenAt: item.taken_at,
        };
      });

      try {
        await fs.promises.writeFile(cacheFilePath, JSON.stringify({ user: userProfile, items: formattedItems, overallTotalCount }, null, 2), 'utf-8');
      } catch { /* ignore cache write error */ }
    }

    let filteredItems = [...formattedItems];
    if (typeFilter) {
      const allowedFilters = ['video', 'image', 'carousel'];
      const targetTypes = typeFilter.split(',').map((t) => t.toLowerCase().trim()).filter((t) => allowedFilters.includes(t));
      if (targetTypes.length > 0) {
        filteredItems = filteredItems.filter((item: any) => targetTypes.includes(item.type));
      }
    }

    filteredItems.sort((a, b) => (a.takenAt || 0) - (b.takenAt || 0));

    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const slicedItems = filteredItems.slice(startIndex, endIndex);

    return {
      success: true,
      user: userProfile,
      items: slicedItems,
      pagination: { page, pageSize, totalCount: filteredItems.length, hasMore: filteredItems.length > endIndex },
    };
  }

  async exportChannelVideosToExcel(usernameOrUrl: string, res: Response, typeFilter?: string) {
    const username = this.getUsername(usernameOrUrl);
    const cacheDir = path.join(DATA_DIR, 'instagram');
    const cacheFilePath = path.join(cacheDir, `${username}.json`);

    if (!fs.existsSync(cacheFilePath)) {
      throw new Error(`No cached data found for channel ${username}. Please fetch the channel feed first.`);
    }

    let items: any[] = [];
    const fileContent = fs.readFileSync(cacheFilePath, 'utf-8');
    const cacheData = JSON.parse(fileContent);
    items = cacheData.items || [];

    if (typeFilter) {
      const targetTypes = typeFilter.split(',').map((t) => t.toLowerCase().trim()).filter((t) => ['video', 'image', 'carousel'].includes(t));
      if (targetTypes.length > 0) items = items.filter((item: any) => targetTypes.includes(item.type));
    }

    items.sort((a, b) => (a.takenAt || 0) - (b.takenAt || 0));

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Instagram Posts');
    worksheet.columns = [
      { header: 'STT', key: 'stt', width: 8 },
      { header: 'Link', key: 'link', width: 45 },
      { header: 'Like', key: 'likes', width: 12 },
      { header: 'Lượt xem', key: 'views', width: 15 },
      { header: 'Ngày tạo', key: 'takenAt', width: 18 },
    ];
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    items.forEach((item, index) => {
      let dateStr = '';
      if (item.takenAt) {
        const date = new Date(item.takenAt * 1000);
        dateStr = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
      }
      worksheet.addRow({ stt: index + 1, link: `https://www.instagram.com/p/${item.shortcode}/`, likes: item.likes || 0, views: item.views || 0, takenAt: dateStr });
    });

    const filename = `instagram_export_${username}_${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  }

  async exportChannelImagesToZip(usernameOrUrl: string, res: Response, typeFilter?: string) {
    const username = this.getUsername(usernameOrUrl);
    const cacheDir = path.join(DATA_DIR, 'instagram');
    const cacheFilePath = path.join(cacheDir, `${username}.json`);

    if (!fs.existsSync(cacheFilePath)) {
      throw new Error(`No cached data found for channel ${username}. Please fetch the channel feed first.`);
    }

    let items: any[] = [];
    const cacheData = JSON.parse(fs.readFileSync(cacheFilePath, 'utf-8'));
    items = cacheData.items || [];

    if (typeFilter) {
      const targetTypes = typeFilter.split(',').map((t) => t.toLowerCase().trim()).filter((t) => ['video', 'image', 'carousel'].includes(t));
      if (targetTypes.length > 0) items = items.filter((item: any) => targetTypes.includes(item.type));
    }

    items.sort((a, b) => (a.takenAt || 0) - (b.takenAt || 0));
    if (items.length === 0) throw new Error('No items found matching the filter.');

    const filename = `instagram_images_${username}_${Date.now()}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const archive = archiver.create('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => console.error(`Archiver error: ${err.message}`));
    archive.pipe(res);

    const CONCURRENCY = 10;
    let itemIdx = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (itemIdx < items.length) {
        const index = itemIdx++;
        const item = items[index];
        const stt = index + 1;
        const url = item.thumbnailUrl;
        if (!url) continue;
        try {
          let ext = '.jpg';
          if (url.includes('.webp')) ext = '.webp';
          else if (url.includes('.png')) ext = '.png';
          const response = await axios({ method: 'GET', url, responseType: 'arraybuffer', timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
          archive.append(Buffer.from(response.data), { name: `${stt}${ext}` });
        } catch { /* skip failed image */ }
      }
    });

    await Promise.all(workers);
    await archive.finalize();
  }

  async clearAllChannelCache() {
    const cacheDir = path.join(DATA_DIR, 'instagram');
    if (!fs.existsSync(cacheDir)) {
      return { success: true, message: 'No cache directory found.', deletedFilesCount: 0 };
    }
    const files = fs.readdirSync(cacheDir);
    let deletedCount = 0;
    for (const file of files) {
      if (file.endsWith('.json')) {
        fs.unlinkSync(path.join(cacheDir, file));
        deletedCount++;
      }
    }
    return { success: true, message: `Cleared ${deletedCount} Instagram cache files.`, deletedFilesCount: deletedCount };
  }

  async downloadVideo(url: string, res: Response) {
    const data = await this.getInstagramData(url);
    if (!data?.media_details?.length) throw new Error('Cannot retrieve media details');
    const videoMedia = data.media_details.find((m) => m.type === 'video');
    if (!videoMedia) throw new Error('No video found in this Instagram post');

    const username = data.post_info?.owner_username || 'instagram';
    const filename = `instagram_${username}_${Date.now()}.mp4`;
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const response = await axios({ url: videoMedia.url, method: 'GET', responseType: 'stream', headers: this.getDownloadHeaders() });
    response.data.pipe(res);
  }

  async downloadAudio(url: string, res: Response) {
    const data = await this.getInstagramData(url);
    if (!data?.media_details?.length) throw new Error('Cannot retrieve media details');
    const videoMedia = data.media_details.find((m) => m.type === 'video');
    if (!videoMedia) throw new Error('No video found in this Instagram post');

    const username = data.post_info?.owner_username || 'instagram';
    const tempDir = os.tmpdir();
    const baseName = `ig-video-${Date.now()}`;
    const tempVideoPath = path.join(tempDir, `${baseName}.mp4`);

    // Download video to temp
    const response = await axios({ url: videoMedia.url, method: 'GET', responseType: 'stream', headers: this.getDownloadHeaders() });
    const writer = fs.createWriteStream(tempVideoPath);
    response.data.pipe(writer);
    await new Promise<void>((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });

    // Extract audio with ffmpeg
    const audioPath = path.join(tempDir, `${baseName}.mp3`);
    await new Promise<void>((resolve, reject) => {
      Ffmpeg(tempVideoPath)
        .noVideo()
        .audioCodec('libmp3lame')
        .audioBitrate(192)
        .save(audioPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err));
    });

    // Cleanup video
    try { fs.unlinkSync(tempVideoPath); } catch { /* ignore */ }

    const audioFilename = `instagram_${username}_${Date.now()}.mp3`;
    const stat = fs.statSync(audioPath);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', stat.size.toString());
    res.setHeader('Content-Disposition', `attachment; filename="${audioFilename}"`);

    const audioStream = fs.createReadStream(audioPath);
    audioStream.pipe(res);
    res.on('finish', () => { try { fs.unlinkSync(audioPath); } catch {} });
    audioStream.on('error', () => { try { fs.unlinkSync(audioPath); } catch {} });
  }

  private getUserFeedHeaders(username: string) {
    return {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'X-IG-App-ID': '936619743392459',
      'Referer': `https://www.instagram.com/${username}/`,
      'Origin': 'https://www.instagram.com',
    };
  }

  private getDownloadHeaders() {
    return {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Referer': 'https://www.instagram.com/',
      'Origin': 'https://www.instagram.com',
    };
  }
}

export const instagramService = new InstagramService();
