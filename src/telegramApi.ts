import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';

const API_BASE = `https://api.telegram.org/bot${config.telegramBotToken}`;
const FILE_BASE = `https://api.telegram.org/file/bot${config.telegramBotToken}`;

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

async function call<T = unknown>(method: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!data.ok) {
    throw new Error(`Telegram API ${method} failed: ${data.description ?? res.statusText}`);
  }
  return data.result;
}

export async function sendMessage(
  chatId: number,
  text: string,
  opts: { replyMarkup?: { inline_keyboard: InlineKeyboardButton[][] } } = {},
): Promise<{ message_id: number }> {
  return call('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: opts.replyMarkup,
  });
}

export async function editMessageText(chatId: number, messageId: number, text: string): Promise<void> {
  try {
    await call('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
    });
  } catch (err) {
    // Telegram errors when the new text is identical to the old one (or the
    // message is gone) — neither is worth crashing a running agent turn over.
    console.warn('editMessageText failed:', (err as Error).message);
  }
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  await call('answerCallbackQuery', { callback_query_id: callbackQueryId, text });
}

export async function sendChatAction(chatId: number, action: string): Promise<void> {
  try {
    await call('sendChatAction', { chat_id: chatId, action });
  } catch (err) {
    console.warn('sendChatAction failed:', (err as Error).message);
  }
}

export async function sendDocument(chatId: number, filePath: string, caption?: string): Promise<void> {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (caption) form.append('caption', caption.slice(0, 1024));
  const buffer = await fs.promises.readFile(filePath);
  form.append('document', new Blob([buffer]), path.basename(filePath));

  const res = await fetch(`${API_BASE}/sendDocument`, { method: 'POST', body: form });
  const data = (await res.json()) as { ok: boolean; description?: string };
  if (!data.ok) {
    throw new Error(`Telegram API sendDocument failed: ${data.description ?? res.statusText}`);
  }
}

export async function getFilePath(fileId: string): Promise<string> {
  const result = await call<{ file_path: string }>('getFile', { file_id: fileId });
  return result.file_path;
}

export async function downloadFile(filePath: string): Promise<Buffer> {
  const res = await fetch(`${FILE_BASE}/${filePath}`);
  if (!res.ok) {
    throw new Error(`Failed to download Telegram file: ${res.status} ${res.statusText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function setWebhook(url: string, secretToken: string): Promise<void> {
  await call('setWebhook', { url, secret_token: secretToken });
}

export async function deleteWebhook(): Promise<void> {
  await call('deleteWebhook', {});
}

export async function getWebhookInfo(): Promise<unknown> {
  return call('getWebhookInfo');
}
