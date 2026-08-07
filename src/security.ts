import type { NextFunction, Request, Response } from 'express';
import { config } from './config';

const SECRET_HEADER = 'x-telegram-bot-api-secret-token';

// Anyone who learns the webhook URL could otherwise POST forged Telegram
// updates at it; Telegram echoes back whatever secret_token we registered
// with setWebhook on every real request via this header.
export function verifyWebhookSecret(req: Request, res: Response, next: NextFunction): void {
  const header = req.get(SECRET_HEADER);
  if (header !== config.telegramWebhookSecret) {
    res.sendStatus(401);
    return;
  }
  next();
}

export function isOwner(fromId: number | undefined): boolean {
  return fromId === config.telegramOwnerId;
}
