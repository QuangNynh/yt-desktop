import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { UPLOADS_DIR, loadSettings, saveSettings } from './config';
import { youtubeService } from './youtube.service';

const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

export const apiRouter = Router();

// =================== Settings API ===================
apiRouter.get('/settings', (req: Request, res: Response) => {
  res.json({ success: true, settings: loadSettings() });
});

apiRouter.post('/settings', (req: Request, res: Response) => {
  const updated = saveSettings(req.body);
  res.json({ success: true, settings: updated });
});

// =================== YouTube OAuth2 ===================
apiRouter.get('/youtube/auth/url', (req: Request, res: Response) => {
  try {
    const url = youtubeService.getAuthUrl();
    res.json({ success: true, url });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

apiRouter.get('/youtube/login', (req: Request, res: Response) => {
  try {
    const url = youtubeService.getAuthUrl();
    res.redirect(url);
  } catch (error: any) {
    res.status(400).send(`Error: ${error.message}`);
  }
});

// Biến callback listener để thông báo cho Electron khi kết nối thành công
type AuthSuccessCallback = (channelTitle: string) => void;
let onAuthSuccess: AuthSuccessCallback | null = null;

export function setAuthSuccessListener(cb: AuthSuccessCallback) {
  onAuthSuccess = cb;
}

apiRouter.get('/youtube/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  if (!code) {
    return res.status(400).send('<h3>Thiếu authorization code từ Google!</h3>');
  }

  try {
    const result = await youtubeService.handleCallback(code);

    // Kích hoạt callback focus app desktop ngay lập tức
    if (onAuthSuccess) {
      onAuthSuccess(result.channelTitle);
    }
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Kết nối YouTube thành công</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: white; }
            .card { background: #1e293b; padding: 32px; border-radius: 12px; text-align: center; max-width: 440px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
            h2 { color: #10b981; margin-bottom: 8px; }
            p { color: #94a3b8; font-size: 14px; margin-bottom: 20px; line-height: 1.5; }
            .btn { display: inline-block; background: #ef4444; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; text-decoration: none; transition: 0.2s; }
            .btn:hover { background: #dc2626; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>✓ Kết nối thành công!</h2>
            <p>Đã liên kết kênh YouTube: <br><b style="color: #f8fafc; font-size: 16px;">${result.channelTitle}</b></p>
            <p>Đang tự động chuyển bạn về ứng dụng Desktop...</p>
            <a href="youtubescheduler://focus" class="btn" id="openBtn">Mở Ứng Dụng Desktop</a>
          </div>
          <script>
            // Tự động kích hoạt mở app desktop
            try {
              window.location.href = "youtubescheduler://focus";
            } catch (e) {}

            // Tự động đóng tab trình duyệt sau khi kích hoạt
            setTimeout(() => {
              window.close();
            }, 1500);
          </script>
        </body>
      </html>
    `);
  } catch (error: any) {
    res.status(400).send(`
      <!DOCTYPE html>
      <html>
        <body style="background: #0f172a; color: #ef4444; font-family: sans-serif; padding: 40px; text-align: center;">
          <h2>Kết nối thất bại</h2>
          <p>${error.message}</p>
        </body>
      </html>
    `);
  }
});

apiRouter.post('/youtube/auth/callback', async (req: Request, res: Response) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ success: false, message: 'Missing code' });
  }
  try {
    const result = await youtubeService.handleCallback(code);
    res.json({
      success: true,
      message: 'YouTube authentication successful',
      channel: result,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// =================== Channels Management ===================
apiRouter.get('/youtube/channels', (req: Request, res: Response) => {
  try {
    const data = youtubeService.getConnectedChannels();
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

apiRouter.delete('/youtube/channels/:channelId', (req: Request, res: Response) => {
  try {
    const result = youtubeService.disconnectChannel(req.params.channelId);
    res.json(result);
  } catch (error: any) {
    res.status(404).json({ success: false, message: error.message });
  }
});

apiRouter.get('/youtube/channels/:channelId/check-token', async (req: Request, res: Response) => {
  try {
    const result = await youtubeService.checkTokenStatus(req.params.channelId);
    res.json(result);
  } catch (error: any) {
    res.status(404).json({ success: false, message: error.message });
  }
});

// =================== Video & Schedule Management ===================
apiRouter.get('/youtube/videos', async (req: Request, res: Response) => {
  const channelId = req.query.channelId as string;
  const maxResults = req.query.maxResults ? Number(req.query.maxResults) : 50;
  const pageToken = req.query.pageToken as string | undefined;
  const privacyStatus = req.query.privacyStatus as any;

  if (!channelId) {
    return res.status(400).json({ success: false, message: 'Missing channelId query param' });
  }

  // Kiểm tra trước kênh có trong storage không, nếu không có thì trả về videos: [] thay vì 400 error
  const channels = youtubeService.getConnectedChannels().channels;
  const exists = channels.some((c) => c.channelId === channelId);
  if (!exists) {
    return res.json({
      success: false,
      channelId,
      totalResults: 0,
      resultsPerPage: 0,
      videos: [],
      message: `Kênh "${channelId}" chưa được kết nối trong hệ thống. Vui lòng bấm "Thêm Kênh Mới".`,
    });
  }

  try {
    const result = await youtubeService.getVideos({
      channelId,
      maxResults,
      pageToken,
      privacyStatus,
    });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

apiRouter.post('/youtube/schedule', async (req: Request, res: Response) => {
  const { channelId, videoId, publishTime } = req.body;
  if (!channelId || !videoId || !publishTime) {
    return res.status(400).json({
      success: false,
      message: 'Thiếu channelId, videoId hoặc publishTime',
    });
  }

  try {
    const result = await youtubeService.scheduleVideo({
      channelId,
      videoId,
      publishTime,
    });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

apiRouter.post('/youtube/update-status', async (req: Request, res: Response) => {
  const { channelId, videoId, privacyStatus } = req.body;
  if (!channelId || !videoId || !privacyStatus) {
    return res.status(400).json({
      success: false,
      message: 'Thiếu channelId, videoId hoặc privacyStatus (unlisted | private)',
    });
  }

  if (!['private', 'unlisted'].includes(privacyStatus)) {
    return res.status(400).json({
      success: false,
      message: 'Trạng thái không hợp lệ. Chỉ cho phép đổi sang private (nháp) hoặc unlisted (không công khai)',
    });
  }

  try {
    const result = await youtubeService.updateVideoStatus({
      channelId,
      videoId,
      privacyStatus,
    });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

apiRouter.post('/youtube/update-metadata', async (req: Request, res: Response) => {
  const { channelId, videoId, title, description, tags } = req.body;
  if (!channelId || !videoId || !title) {
    return res.status(400).json({
      success: false,
      message: 'Thiếu channelId, videoId hoặc title',
    });
  }

  try {
    const result = await youtubeService.updateMetadata({
      channelId,
      videoId,
      title,
      description: description || '',
      tags: Array.isArray(tags) ? tags : [],
    });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

apiRouter.post('/youtube/thumbnail', upload.single('file'), async (req: Request, res: Response) => {
  const channelId = req.body.channelId;
  const videoId = req.body.videoId;
  const file = req.file;

  if (!channelId || !videoId || !file) {
    return res.status(400).json({
      success: false,
      message: 'Thiếu channelId, videoId hoặc file ảnh thumbnail',
    });
  }

  try {
    const result = await youtubeService.updateThumbnail(channelId, videoId, file);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});
