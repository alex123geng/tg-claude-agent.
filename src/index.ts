import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config } from './config.js';
import { markUpdateProcessed } from './db.js';
import { runAgent, resetAgentSession } from './agent.js';
import { sendMessage, sendChatAction, sendDocument, getFilePath, downloadFile, answerCallbackQuery } from './telegram.js';
import { transcribeVoice } from './voice.js';
import { snapshotWorkdir, diffSnapshots, type FileSnapshot } from './fileSnapshot.js';
import { resolveConfirmation } from './permissions.js';
import { logger } from './logger.js';

interface TelegramMessage {
  message_id: number;
  chat: { id: number };
  from?: { id: number };
  text?: string;
  voice?: { file_id: string };
  audio?: { file_id: string };
}

interface TelegramCallbackQuery {
  id: string;
  from: { id: number };
  data?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).send('ok');
});

app.post('/webhook', (req, res) => {
  if (req.get('x-telegram-bot-api-secret-token') !== config.telegram.webhookSecret) {
    res.sendStatus(401);
    return;
  }
  // Acknowledge immediately so Telegram doesn't retry while we work.
  res.sendStatus(200);

  const update = req.body as TelegramUpdate;
  const fromId = update.message?.from?.id ?? update.callback_query?.from.id;
  if (fromId !== config.telegram.ownerId) {
    logger.warn(`Ignoring update from unauthorized user ${fromId}`);
    return;
  }

  if (update.callback_query) {
    handleCallbackQuery(update.callback_query).catch((err) => {
      logger.error('Unhandled error processing callback_query:', err);
    });
    return;
  }

  if (update.message) {
    if (markUpdateProcessed(update.update_id)) return;
    enqueue(update.message.chat.id, () => handleMessage(update.message!));
  }
});

async function handleCallbackQuery(callbackQuery: TelegramCallbackQuery): Promise<void> {
  const [prefix, decision, id] = (callbackQuery.data || '').split(':');
  await answerCallbackQuery(callbackQuery.id);
  if (prefix !== 'confirm' || !id) return;
  await resolveConfirmation(id, decision === 'allow');
}

// Sequential per-chat queue so a chat never has two agent turns running at once.
const chatQueues = new Map<number, Promise<void>>();

function enqueue(chatId: number, task: () => Promise<void>): void {
  const previous = chatQueues.get(chatId) ?? Promise.resolve();
  const next = previous.then(task, task).catch((err) => {
    logger.error(`Queued task failed for chat ${chatId}:`, err);
  });
  chatQueues.set(chatId, next);
}

async function handleMessage(message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;

  try {
    if (message.text === '/start') {
      await sendMessage(chatId, "Hi! I'm your Claude Code agent. Send me a message or a voice note.");
      return;
    }
    if (message.text === '/reset') {
      resetAgentSession(chatId);
      await sendMessage(chatId, 'Session reset. Starting fresh.');
      return;
    }

    let prompt: string | undefined;
    if (message.text) {
      prompt = message.text;
    } else if (message.voice || message.audio) {
      prompt = await handleVoiceMessage(chatId, message.voice?.file_id || message.audio!.file_id);
    }

    if (!prompt) return;

    await sendChatAction(chatId, 'typing');
    const before = await snapshotWorkdir(config.agentWorkdir);
    const reply = await runAgent(chatId, prompt);
    await sendMessage(chatId, reply);
    await sendChangedFiles(chatId, before);
  } catch (err) {
    logger.error(`Failed to handle message for chat ${chatId}:`, err);
    await sendMessage(chatId, `Something went wrong: ${err instanceof Error ? err.message : String(err)}`).catch(
      () => {},
    );
  }
}

async function sendChangedFiles(chatId: number, before: FileSnapshot): Promise<void> {
  const after = await snapshotWorkdir(config.agentWorkdir);
  const changed = diffSnapshots(before, after);
  for (const relPath of changed) {
    try {
      await sendDocument(chatId, path.join(config.agentWorkdir, relPath), relPath);
    } catch (err) {
      logger.error(`Failed to send changed file ${relPath} to chat ${chatId}:`, err);
    }
  }
}

async function handleVoiceMessage(chatId: number, fileId: string): Promise<string> {
  await sendChatAction(chatId, 'typing');
  const filePath = await getFilePath(fileId);
  const buffer = await downloadFile(filePath);
  const localPath = path.join(os.tmpdir(), `voice-${chatId}-${Date.now()}${path.extname(filePath) || '.oga'}`);
  await fs.writeFile(localPath, buffer);
  try {
    return await transcribeVoice(localPath);
  } finally {
    await fs.unlink(localPath).catch(() => {});
  }
}

app.listen(config.port, () => {
  logger.info(`Listening on port ${config.port}`);
});
