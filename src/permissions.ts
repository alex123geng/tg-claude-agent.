import { randomBytes } from 'node:crypto';
import { editMessageText, sendMessageWithKeyboard } from './telegram.js';
import { logger } from './logger.js';

const CONFIRMATION_TIMEOUT_MS = 10 * 60 * 1000;

interface PendingConfirmation {
  chatId: number;
  messageId: number;
  command: string;
  resolve: (allowed: boolean) => void;
  timeout: NodeJS.Timeout;
}

const pending = new Map<string, PendingConfirmation>();

function promptText(command: string, suffix = ''): string {
  return `⚠️ The agent wants to run a potentially dangerous command:\n\n${command}\n\nAllow it?${suffix}`;
}

/** Asks the owner to approve a Bash command via Telegram inline buttons, and waits for their tap. */
export async function requestBashConfirmation(chatId: number, command: string): Promise<boolean> {
  const id = randomBytes(4).toString('hex');
  const messageId = await sendMessageWithKeyboard(chatId, promptText(command), {
    inline_keyboard: [
      [
        { text: '✅ Allow', callback_data: `confirm:allow:${id}` },
        { text: '❌ Deny', callback_data: `confirm:deny:${id}` },
      ],
    ],
  });

  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      editMessageText(chatId, messageId, promptText(command, '\n\n⏱ Timed out — denied.')).catch(() => {});
      resolve(false);
    }, CONFIRMATION_TIMEOUT_MS);
    pending.set(id, { chatId, messageId, command, resolve, timeout });
  });
}

/** Resolves a pending confirmation once the owner taps Allow/Deny in Telegram. */
export async function resolveConfirmation(id: string, allowed: boolean): Promise<void> {
  const entry = pending.get(id);
  if (!entry) {
    logger.warn(`No pending confirmation for id ${id} (already resolved or expired)`);
    return;
  }
  pending.delete(id);
  clearTimeout(entry.timeout);
  entry.resolve(allowed);
  const suffix = allowed ? '\n\n✅ Allowed.' : '\n\n❌ Denied.';
  await editMessageText(entry.chatId, entry.messageId, promptText(entry.command, suffix));
}
