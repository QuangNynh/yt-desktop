/**
 * TikTok Service - Adapted from toolBe for lenytdesktop
 * Handles: channel videos listing, video download, audio download
 * Uses: yt-dlp (youtube-dl-exec) + fluent-ffmpeg
 * Removed: ProxyService dependency
 */

import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Ffmpeg from 'fluent-ffmpeg';
import youtubedl from 'youtube-dl-exec';

const youtubeDlExec: any = (youtubedl as any)?.exec || youtubedl;

// Try to set ffmpeg path
try {
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
  Ffmpeg.setFfmpegPath(ffmpegInstaller.path);
} catch {
  console.warn('[TikTok] @ffmpeg-installer/ffmpeg not found, using system ffmpeg');
}

class TikTokService {
  async getChannelVideos(url: string, limitVal?: number) {
    try {
      console.log(`[TikTok] Fetching videos from: ${url}${limitVal ? ` (limit: ${limitVal})` : ' (all)'}`);
      const options: any = {
        dumpSingleJson: true,
        flatPlaylist: true,
        noWarnings: true,
        noCheckCertificates: true,
      };

      if (limitVal !== undefined && limitVal > 0) {
        options.playlistItems = `1-${limitVal}`;
      }

      const result = await youtubeDlExec(url, options);
      if (!result || !result.stdout) throw new Error('No data returned from yt-dlp');

      const parsed = JSON.parse(result.stdout);
      const rawEntries: any[] = parsed.entries ?? [parsed];

      const videos = rawEntries.filter((e) => e).map((entry) => {
        const timestamp = entry.timestamp;
        const createdAt = timestamp ? new Date(timestamp * 1000).toISOString() : null;
        return {
          id: entry.id ?? null,
          title: entry.title ?? null,
          description: entry.description ?? null,
          url: entry.url ?? `https://www.tiktok.com/@${parsed.title}/video/${entry.id}`,
          duration: entry.duration ?? null,
          view_count: Number(entry.view_count ?? 0),
          like_count: Number(entry.like_count ?? 0),
          comment_count: Number(entry.comment_count ?? 0),
          repost_count: Number(entry.repost_count ?? 0),
          save_count: Number(entry.save_count ?? 0),
          created_at: createdAt,
          uploader: entry.uploader ?? parsed.title ?? null,
          uploader_id: entry.uploader_id ?? null,
          thumbnails: entry.thumbnails ?? [],
        };
      });

      return {
        channel: parsed.title ?? null,
        title: parsed.title ?? null,
        url: parsed.webpage_url ?? url,
        video_count: videos.length,
        videos,
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch TikTok videos: ${error.message}`);
    }
  }

  async downloadVideo(url: string, res: Response) {
    let rawFile: string | null = null;
    let finalFile: string | null = null;
    try {
      // Fetch metadata for title
      let title = 'tiktok_video';
      try {
        const metaResult = await youtubeDlExec(url, { dumpSingleJson: true, noWarnings: true, noCheckCertificates: true });
        if (metaResult?.stdout) {
          const meta = JSON.parse(metaResult.stdout);
          title = meta.title || meta.description || title;
        }
      } catch { /* use default */ }

      const sanitizedTitle = this.sanitizeFilename(title).substring(0, 50) || 'tiktok_video';
      const filename = `${sanitizedTitle}.mp4`;

      const tempDir = os.tmpdir();
      rawFile = path.join(tempDir, `tiktok-${Date.now()}-raw.mp4`);
      finalFile = path.join(tempDir, `tiktok-${Date.now()}-final.mp4`);

      // Download video
      await youtubeDlExec(url, { format: 'best', output: rawFile, noCheckCertificates: true, noWarnings: true });

      if (!fs.existsSync(rawFile)) throw new Error('Downloaded file does not exist');

      // Re-encode if needed
      const reencode = await this.shouldReencodeVideo(rawFile);
      if (reencode) {
        await new Promise<void>((resolve, reject) => {
          Ffmpeg(rawFile as string)
            .videoCodec('libx264').audioCodec('aac')
            .outputOptions(['-movflags +faststart', '-preset fast', '-crf 23', '-pix_fmt yuv420p'])
            .save(finalFile as string)
            .on('end', () => resolve()).on('error', (err: Error) => reject(err));
        });
      } else {
        await new Promise<void>((resolve, reject) => {
          Ffmpeg(rawFile as string)
            .outputOptions(['-c copy', '-movflags +faststart'])
            .save(finalFile as string)
            .on('end', () => resolve()).on('error', (err: Error) => reject(err));
        });
      }

      try { fs.unlinkSync(rawFile); } catch {} rawFile = null;
      if (!fs.existsSync(finalFile)) throw new Error('Processed file does not exist');

      const stat = fs.statSync(finalFile);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Length', stat.size.toString());
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Accept-Ranges', 'bytes');

      const stream = fs.createReadStream(finalFile);
      stream.pipe(res);
      const targetFile = finalFile;
      res.on('finish', () => { fs.unlink(targetFile, () => {}); });
      stream.on('error', () => { fs.unlink(targetFile, () => {}); });
    } catch (error: any) {
      if (rawFile && fs.existsSync(rawFile)) try { fs.unlinkSync(rawFile); } catch {}
      if (finalFile && fs.existsSync(finalFile)) try { fs.unlinkSync(finalFile); } catch {}
      throw new Error(`Failed to download TikTok video: ${error.message}`);
    }
  }

  async downloadAudio(url: string, res: Response) {
    let rawFile: string | null = null;
    let finalFile: string | null = null;
    const ts = Date.now();
    try {
      let title = 'tiktok_audio';
      try {
        const metaResult = await youtubeDlExec(url, { dumpSingleJson: true, noWarnings: true, noCheckCertificates: true });
        if (metaResult?.stdout) {
          const meta = JSON.parse(metaResult.stdout);
          title = meta.title || meta.description || title;
        }
      } catch { /* use default */ }

      const sanitizedTitle = this.sanitizeFilename(title).substring(0, 50) || 'tiktok_audio';
      const filename = `${sanitizedTitle}.mp3`;

      const tempDir = os.tmpdir();
      rawFile = path.join(tempDir, `tiktok-audio-${ts}-raw`);
      finalFile = path.join(tempDir, `tiktok-audio-${ts}-final.mp3`);

      await youtubeDlExec(url, { format: 'bestaudio/best', output: rawFile, noCheckCertificates: true, noWarnings: true });

      // Find actual downloaded file (yt-dlp appends extension)
      const baseTempName = `tiktok-audio-${ts}-raw`;
      const files = fs.readdirSync(tempDir);
      const downloadedFile = files.find(f => f.startsWith(baseTempName));
      if (!downloadedFile) throw new Error('Downloaded audio file does not exist');
      const downloadedFilePath = path.join(tempDir, downloadedFile);

      // Convert to MP3
      await new Promise<void>((resolve, reject) => {
        Ffmpeg(downloadedFilePath)
          .audioCodec('libmp3lame').audioBitrate(192)
          .save(finalFile as string)
          .on('end', () => resolve()).on('error', (err: Error) => reject(err));
      });

      try { fs.unlinkSync(downloadedFilePath); } catch {}
      if (!fs.existsSync(finalFile)) throw new Error('Converted audio file does not exist');

      const stat = fs.statSync(finalFile);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', stat.size.toString());
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Accept-Ranges', 'bytes');

      const stream = fs.createReadStream(finalFile);
      stream.pipe(res);
      const targetFile = finalFile;
      res.on('finish', () => { fs.unlink(targetFile, () => {}); });
      stream.on('error', () => { fs.unlink(targetFile, () => {}); });
    } catch (error: any) {
      const baseTempName = `tiktok-audio-${ts}-raw`;
      try {
        const files = fs.readdirSync(os.tmpdir());
        const df = files.find(f => f.startsWith(baseTempName));
        if (df) fs.unlinkSync(path.join(os.tmpdir(), df));
      } catch {}
      if (finalFile && fs.existsSync(finalFile)) try { fs.unlinkSync(finalFile); } catch {}
      throw new Error(`Failed to download TikTok audio: ${error.message}`);
    }
  }

  private shouldReencodeVideo(filePath: string): Promise<boolean> {
    return new Promise((resolve) => {
      Ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) return resolve(true);
        const videoStream = metadata?.streams?.find((s) => s.codec_type === 'video');
        const audioStream = metadata?.streams?.find((s) => s.codec_type === 'audio');
        if (!videoStream) return resolve(true);
        const isH264 = videoStream.codec_name === 'h264';
        const isAac = audioStream ? audioStream.codec_name === 'aac' : true;
        const isYuv420p = videoStream.pix_fmt === 'yuv420p';
        resolve(!(isH264 && isAac && isYuv420p));
      });
    });
  }

  private sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9\s\-_]/g, '').trim().replace(/\s+/g, '_');
  }
}

export const tiktokService = new TikTokService();
