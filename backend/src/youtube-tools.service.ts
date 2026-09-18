import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';
import Ffmpeg from 'fluent-ffmpeg';
import youtubedl from 'youtube-dl-exec';

const youtubeDlExec: any = (youtubedl as any)?.exec || youtubedl;

try {
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
  Ffmpeg.setFfmpegPath(ffmpegInstaller.path);
} catch {
  console.warn('[YouTubeTools] @ffmpeg-installer/ffmpeg not found, using system ffmpeg');
}

export class YouTubeToolsService {
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
      .trim()
      .substring(0, 150) || 'video';
  }

  private extractVideoId(url: string): string {
    const trimmed = url.trim();
    if (trimmed.includes('v=')) {
      return trimmed.split('v=')[1].split('&')[0];
    }
    if (trimmed.includes('youtu.be/')) {
      return trimmed.split('youtu.be/')[1].split('?')[0];
    }
    if (trimmed.includes('/shorts/')) {
      return trimmed.split('/shorts/')[1].split('?')[0];
    }
    return trimmed;
  }

  async getTranscript(url: string): Promise<{ title: string; transcript: string }> {
    const videoId = this.extractVideoId(url);
    let title = 'YouTube Video';

    // 1. Try fetching via video page HTML captionTracks
    try {
      const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const response = await axios.get(pageUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
        },
        timeout: 10000,
      });

      const html = response.data;
      const titleMatch = html.match(/<title>(.*?)<\/title>/);
      if (titleMatch) {
        title = titleMatch[1].replace(' - YouTube', '').trim();
      }

      const splitted = html.split('"captionTracks":[');
      if (splitted.length > 1) {
        const jsonStr = splitted[1].split(']')[0];
        const tracks = JSON.parse(`[${jsonStr}]`);
        const track =
          tracks.find((t: any) => t.languageCode === 'vi') ||
          tracks.find((t: any) => t.languageCode === 'en') ||
          tracks[0];

        if (track?.baseUrl) {
          const subRes = await axios.get(track.baseUrl, { timeout: 10000 });
          const xml = subRes.data;
          const textMatches = Array.from(xml.matchAll(/<text[^>]*>(.*?)<\/text>/gs)) as any[];
          if (textMatches.length > 0) {
            const transcript = textMatches
              .map((m: any) =>
                m[1]
                  .replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"')
                  .replace(/&#39;/g, "'"),
              )
              .join(' ');
            return { title, transcript };
          }
        }
      }
    } catch (e: any) {
      console.warn(`[YouTubeTools] Scrape captions failed: ${e.message}, trying yt-dlp fallback...`);
    }

    // 2. Fallback to yt-dlp metadata & subtitles
    try {
      const info = await youtubeDlExec(url, {
        dumpSingleJson: true,
        skipDownload: true,
        noWarnings: true,
        noCheckCertificates: true,
      });

      if (info?.stdout) {
        const parsed = JSON.parse(info.stdout);
        if (parsed.title) title = parsed.title;

        const subs = parsed.subtitles || parsed.automatic_captions;
        if (subs) {
          const lang = subs.vi || subs.en || Object.values(subs)[0];
          if (Array.isArray(lang)) {
            const subTrack = lang.find((s: any) => s.ext === 'json3' || s.ext === 'srv1') || lang[0];
            if (subTrack?.url) {
              const subRes = await axios.get(subTrack.url, { timeout: 10000 });
              if (typeof subRes.data === 'object' && subRes.data.events) {
                const text = subRes.data.events
                  .filter((ev: any) => ev.segs)
                  .map((ev: any) => ev.segs.map((s: any) => s.utf8).join(''))
                  .join(' ');
                return { title, transcript: text };
              } else if (typeof subRes.data === 'string') {
                const text = subRes.data.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                return { title, transcript: text };
              }
            }
          }
        }
      }
    } catch (e: any) {
      console.warn(`[YouTubeTools] yt-dlp captions fallback failed: ${e.message}`);
    }

    throw new Error('Không tìm thấy phụ đề/transcript cho video này');
  }

  async streamAudio(url: string, res: Response) {
    let rawFile: string | null = null;
    let finalFile: string | null = null;
    try {
      const tempDir = os.tmpdir();
      const baseName = `yt-audio-${Date.now()}`;
      rawFile = path.join(tempDir, `${baseName}-raw.%(ext)s`);

      let title = 'youtube_audio';
      try {
        const metaResult = await youtubeDlExec(url, {
          dumpSingleJson: true,
          noWarnings: true,
          noCheckCertificates: true,
        });
        if (metaResult?.stdout) {
          const meta = JSON.parse(metaResult.stdout);
          title = meta.title || title;
        }
      } catch {
        /* fallback title */
      }

      const filename = `${this.sanitizeFilename(title)}.mp3`;

      // Download audio via yt-dlp
      await youtubeDlExec(url, {
        format: 'bestaudio/best',
        output: rawFile,
        noWarnings: true,
        noCheckCertificates: true,
      });

      // Find downloaded file
      const files = fs.readdirSync(tempDir);
      const downloaded = files.find((f) => f.startsWith(baseName));
      if (!downloaded) throw new Error('File audio tải về không tồn tại');

      const downloadedPath = path.join(tempDir, downloaded);
      rawFile = downloadedPath;
      finalFile = path.join(tempDir, `${baseName}-final.mp3`);

      // Convert to mp3 128kbps
      await new Promise<void>((resolve, reject) => {
        Ffmpeg(downloadedPath)
          .audioCodec('libmp3lame')
          .audioBitrate(128)
          .outputOptions(['-vn', '-threads 0', '-compression_level 0', '-map_metadata -1'])
          .save(finalFile as string)
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err));
      });

      try {
        fs.unlinkSync(downloadedPath);
      } catch {}

      if (!finalFile || !fs.existsSync(finalFile)) {
        throw new Error('File mp3 chuyển đổi không tồn tại');
      }

      const stat = fs.statSync(finalFile);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', stat.size.toString());
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.setHeader('Accept-Ranges', 'bytes');

      const stream = fs.createReadStream(finalFile);
      stream.pipe(res);

      const target = finalFile;
      res.on('finish', () => {
        try {
          if (fs.existsSync(target)) fs.unlinkSync(target);
        } catch {}
      });
      stream.on('error', () => {
        try {
          if (fs.existsSync(target)) fs.unlinkSync(target);
        } catch {}
      });
    } catch (error: any) {
      if (rawFile && fs.existsSync(rawFile)) {
        try {
          fs.unlinkSync(rawFile);
        } catch {}
      }
      if (finalFile && fs.existsSync(finalFile)) {
        try {
          fs.unlinkSync(finalFile);
        } catch {}
      }
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: `Lỗi tải audio: ${error.message}` });
      }
    }
  }

  async streamVideo(url: string, res: Response, quality: string = '1080p') {
    let finalFile: string | null = null;
    try {
      const tempDir = os.tmpdir();
      const baseName = `yt-video-${Date.now()}`;
      finalFile = path.join(tempDir, `${baseName}.mp4`);

      let title = 'youtube_video';
      try {
        const metaResult = await youtubeDlExec(url, {
          dumpSingleJson: true,
          noWarnings: true,
          noCheckCertificates: true,
        });
        if (metaResult?.stdout) {
          const meta = JSON.parse(metaResult.stdout);
          title = meta.title || title;
        }
      } catch {
        /* fallback title */
      }

      const filename = `${this.sanitizeFilename(title)}.mp4`;

      let format = 'bestvideo[height<=1080]+bestaudio/best[height<=1080]';
      if (quality === '720p') format = 'bestvideo[height<=720]+bestaudio/best[height<=720]';
      else if (quality === '480p') format = 'bestvideo[height<=480]+bestaudio/best[height<=480]';

      await youtubeDlExec(url, {
        format,
        mergeOutputFormat: 'mp4',
        output: finalFile,
        noWarnings: true,
        noCheckCertificates: true,
      });

      if (!finalFile || !fs.existsSync(finalFile)) {
        throw new Error('File video tải về không tồn tại');
      }

      const stat = fs.statSync(finalFile);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Length', stat.size.toString());
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.setHeader('Accept-Ranges', 'bytes');

      const stream = fs.createReadStream(finalFile);
      stream.pipe(res);

      const target = finalFile;
      res.on('finish', () => {
        try {
          if (fs.existsSync(target)) fs.unlinkSync(target);
        } catch {}
      });
      stream.on('error', () => {
        try {
          if (fs.existsSync(target)) fs.unlinkSync(target);
        } catch {}
      });
    } catch (error: any) {
      if (finalFile && fs.existsSync(finalFile)) {
        try {
          fs.unlinkSync(finalFile);
        } catch {}
      }
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: `Lỗi tải video: ${error.message}` });
      }
    }
  }

  async getChannelVideos(url: string): Promise<{ urls: string[] }> {
    try {
      const result = await youtubeDlExec(url, {
        dumpSingleJson: true,
        flatPlaylist: true,
        noWarnings: true,
        noCheckCertificates: true,
      });

      if (!result?.stdout) throw new Error('Không nhận được dữ liệu từ kênh YouTube');

      const parsed = JSON.parse(result.stdout);
      const urls: string[] = [];

      const traverse = (node: any) => {
        if (!node) return;
        if (Array.isArray(node.entries)) {
          for (const child of node.entries) {
            traverse(child);
          }
          return;
        }

        const id = node.id;
        const entryUrl = node.url || node.webpage_url;
        if (id && typeof id === 'string' && !id.startsWith('UC') && !id.startsWith('@')) {
          urls.push(`https://www.youtube.com/watch?v=${id}`);
        } else if (entryUrl && typeof entryUrl === 'string' && (entryUrl.includes('watch?v=') || entryUrl.includes('/shorts/'))) {
          urls.push(entryUrl);
        }
      };

      traverse(parsed);
      const uniqueUrls = Array.from(new Set(urls));
      return { urls: uniqueUrls };
    } catch (error: any) {
      throw new Error(`Lỗi lấy danh sách URL kênh: ${error.message}`);
    }
  }
}

export const youtubeToolsService = new YouTubeToolsService();
