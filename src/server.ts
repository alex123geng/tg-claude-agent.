import express from 'express';
import { verifyWebhookSecret } from './security';
import { processUpdate } from './updateHandler';
import type { TelegramUpdate } from './telegramTypes';

export function createServer() {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/webhook', verifyWebhookSecret, (req, res) => {
    // Ack Telegram immediately; the update is processed asynchronously so a
    // slow (or long-running) agent turn never causes Telegram to retry/drop it.
    res.sendStatus(200);

    const update = req.body as TelegramUpdate;
    processUpdate(update).catch((err) => {
      console.error('Failed to process update:', err);
    });
  });

  return app;
}
