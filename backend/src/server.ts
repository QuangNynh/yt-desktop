import express from 'express';
import cors from 'cors';
import { loadSettings } from './config';
import { apiRouter } from './routes';

export function createServer() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Mount API Router tại /api/v1
  app.use('/api/v1', apiRouter);

  // Mount thêm tại root để hỗ trợ URL callback không có tiền tố /api/v1
  app.use('/', apiRouter);

  // Route báo tín hiệu focus cho Electron
  app.get('/api/v1/internal/focus', (req, res) => {
    res.json({ ok: true });
  });

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  return app;
}

export function startServer(port?: number) {
  const settings = loadSettings();
  const listenPort = port || Number(process.env.PORT) || settings.port || 8696;
  const app = createServer();

  const server = app.listen(listenPort, () => {
    console.log(`[Backend] YouTube Scheduler Server running on http://localhost:${listenPort}/api/v1`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Backend] Port ${listenPort} is already in use. Assuming existing backend server is running.`);
    } else {
      console.error(`[Backend] Server error:`, err);
    }
  });

  // Lắng nghe thêm trên các cổng phụ cũ (8000, 1111) nếu còn trống để hỗ trợ callback cũ
  [8000, 1111].forEach((secPort) => {
    try {
      const secServer = app.listen(secPort, () => {
        console.log(`[Backend] Compatibility callback listener running on http://localhost:${secPort}`);
      });
      secServer.on('error', () => {});
    } catch {}
  });

  return server;
}

// Nếu chạy trực tiếp từ CLI (tsx watch backend/src/server.ts)
if (require.main === module) {
  startServer();
}
