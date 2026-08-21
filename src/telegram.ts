import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { logger } from './logger.js';

const API_BASE = `https://api.telegram.org/bot${config.telegram.botToken}`;
const FILE_BASE = `https://api.telegram.org/file/bot${config.telegram.botToken}`;
const MAX_MESSAGE_LENGTH = 4000;

interface TelegramResponse<T> {
  ok: boolean;
  result: T;
  description?: string;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export interface InlineKeyboard {
  inline_keyboard: InlineKeyboardButton[][];
}

interface SentMessage {
  message_id: number;
}

async function callApi<T = unknown>(method: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as TelegramResponse<T>;
  if (!data.ok) {
    throw new Error(`Telegram API ${method} failed: ${data.description || res.statusText}`);
  }
  return data.result;
}

function splitMessage(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > MAX_MESSAGE_LENGTH) {
    let splitAt = remaining.lastIndexOf('\n', MAX_MESSAGE_LENGTH);
    if (splitAt < MAX_MESSAGE_LENGTH * 0.5) splitAt = MAX_MESSAGE_LENGTH;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export async function sendMessage(chatId: number, text: string): Promise<void> {
  const chunks = splitMessage(text);
  for (const chunk of chunks) {
    if (!chunk.trim()) continue;
    await callApi('sendMessage', { chat_id: chatId, text: chunk });
  }
}

export async function sendStatusMessage(chatId: number, text: string): Promise<number> {
  const result = await callApi<SentMessage>('sendMessage', {
    chat_id: chatId,
    text: text.slice(0, MAX_MESSAGE_LENGTH),
  });
  return result.message_id;
}

export async function sendMessageWithKeyboard(
  chatId: number,
  text: string,
  keyboard: InlineKeyboard,
): Promise<number> {
  const result = await callApi<SentMessage>('sendMessage', {
    chat_id: chatId,
    text: text.slice(0, MAX_MESSAGE_LENGTH),
    reply_markup: keyboard,
  });
  return result.message_id;
}

export async function editMessageText(
  chatId: number,
  messageId: number,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  try {
    await callApi('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: text.slice(0, MAX_MESSAGE_LENGTH),
      reply_markup: keyboard,
    });
  } catch (err) {
    // Editing to identical text (or an already-superseded message) is not fatal for a progress indicator.
    logger.debug('editMessageText failed:', err);
  }
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  await callApi('answerCallbackQuery', { callback_query_id: callbackQueryId, text }).catch((err) => {
    logger.debug('answerCallbackQuery failed:', err);
  });
}

export async function sendChatAction(chatId: number, action: string): Promise<void> {
  await callApi('sendChatAction', { chat_id: chatId, action });
}

interface TelegramFile {
  file_id: string;
  file_path?: string;
}

export async function getFilePath(fileId: string): Promise<string> {
  const file = await callApi<TelegramFile>('getFile', { file_id: fileId });
  if (!file.file_path) throw new Error('Telegram getFile returned no file_path');
  return file.file_path;
}

export async function downloadFile(filePath: string): Promise<Buffer> {
  const res = await fetch(`${FILE_BASE}/${filePath}`);
  if (!res.ok) throw new Error(`Failed to download file from Telegram: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function sendDocument(chatId: number, filePath: string, caption?: string): Promise<void> {
  const buffer = await fs.readFile(filePath);
  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (caption) form.append('caption', caption.slice(0, 1024));
  form.append('document', new Blob([buffer]), path.basename(filePath));
  const res = await fetch(`${API_BASE}/sendDocument`, { method: 'POST', body: form });
  const data = (await res.json()) as TelegramResponse<unknown>;
  if (!data.ok) {
    throw new Error(`Telegram sendDocument failed: ${data.description || res.statusText}`);
  }
}

