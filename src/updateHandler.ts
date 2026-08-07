import path from 'node:path';
import { ensureChatWorkdir } from './agentWorkdir';
import { runAgentTurn } from './agentRunner';
import { enqueue } from './chatQueue';
import { decodeCallbackData, resolveConfirmation } from './confirmations';
import { getSessionId, setSessionId } from './db';
import { diffSnapshots, isSendableSize, snapshotDir } from './fileSnapshot';
import { splitMessage } from './messageSplitter';
import { isOwner } from './security';
import { StatusReporter } from './statusReporter';
import {
  answerCallbackQuery,
  editMessageText,
  sendChatAction,
  sendDocument,
  sendMessage,
} from './telegramApi';
import type { TelegramCallbackQuery, TelegramMessage, TelegramUpdate } from './telegramTypes';
import { describeToolUse } from './toolDescribe';
import { transcribeVoiceMessage } from './voice';

export async function processUpdate(update: TelegramUpdate): Promise<void> {
  if (update.callback_query) {
    if (!isOwner(update.callback_query.from?.id)) return;
    await handleCallbackQuery(update.callback_query);
    return;
  }

  const message = update.message;
  if (!message) return;
  if (!isOwner(message.from?.id)) return;

  await handleMessage(message);
}

async function handleMessage(message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  let prompt: string;

  if (message.voice) {
    await sendChatAction(chatId, 'typing');
    let transcript: string;
    try {
      transcript = await transcribeVoiceMessage(message.voice.file_id);
    } catch (err) {
      console.error('Voice transcription failed:', err);
      await sendMessage(chatId, '⚠️ Не удалось распознать голосовое сообщение.');
      return;
    }
    if (!transcript) {
      await sendMessage(chatId, '⚠️ Не удалось разобрать речь в голосовом сообщении (тишина?).');
      return;
    }
    await sendMessage(chatId, `🎙 Распознано: ${transcript}`);
    prompt = transcript;
  } else if (message.text) {
    prompt = message.text;
  } else {
    return;
  }

  enqueue(chatId, () => runTurn(chatId, prompt));
}

async function runTurn(chatId: number, prompt: string): Promise<void> {
  const cwd = ensureChatWorkdir(chatId);
  const before = snapshotDir(cwd);
  const resumeSessionId = getSessionId(chatId);

  await sendChatAction(chatId, 'typing');
  const statusHeader = '⏳ Работаю...';
  const statusMessage = await sendMessage(chatId, statusHeader);
  const status = new StatusReporter(chatId, statusMessage.message_id, statusHeader);

  const result = await runAgentTurn({
    chatId,
    prompt,
    cwd,
    resumeSessionId,
    onToolUse: (toolName, input) => status.addLine(describeToolUse(toolName, input)),
  }).catch((err: Error) => {
    console.error(`Agent turn failed for chat ${chatId}:`, err);
    return { finalText: `❌ Ошибка агента: ${err.message}`, sessionId: resumeSessionId, isError: true };
  });

  if (result.sessionId) {
    setSessionId(chatId, result.sessionId);
  }

  await status.finish(result.isError ? '⚠️ Завершено с ошибкой' : '✅ Готово');

  const after = snapshotDir(cwd);
  const changedFiles = diffSnapshots(cwd, before, after);

  const finalText = result.finalText || '(пустой ответ)';
  for (const chunk of splitMessage(finalText)) {
    await sendMessage(chatId, chunk);
  }

  if (changedFiles.length > 0) {
    await sendChatAction(chatId, 'upload_document');
  }
  for (const filePath of changedFiles) {
    if (!isSendableSize(filePath)) continue;
    try {
      await sendDocument(chatId, filePath, path.relative(cwd, filePath));
    } catch (err) {
      console.error(`Failed to send file ${filePath}:`, err);
    }
  }
}

async function handleCallbackQuery(cb: TelegramCallbackQuery): Promise<void> {
  const decoded = cb.data ? decodeCallbackData(cb.data) : null;
  if (!decoded) {
    await answerCallbackQuery(cb.id);
    return;
  }

  const resolved = resolveConfirmation(decoded.id, decoded.decision === 'allow');
  await answerCallbackQuery(cb.id, resolved ? undefined : 'Запрос уже устарел.');

  if (cb.message) {
    const suffix = decoded.decision === 'allow' ? '\n\n✅ Разрешено' : '\n\n❌ Отклонено';
    await editMessageText(cb.message.chat.id, cb.message.message_id, `${cb.message.text ?? ''}${suffix}`);
  }
}
