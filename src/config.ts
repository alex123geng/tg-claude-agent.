import 'dotenv/config';
import path from 'node:path';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function requireAbsolutePath(name: string, value: string): string {
  if (!path.isAbsolute(value)) {
    throw new Error(
      `${name} must be an absolute path (got "${value}"). A relative path silently ` +
        `resolves inside the ephemeral container filesystem and will be wiped on every redeploy.`,
    );
  }
  return value;
}

const telegramBotToken = required('TELEGRAM_BOT_TOKEN');
const telegramOwnerId = Number(required('TELEGRAM_OWNER_ID'));
if (!Number.isFinite(telegramOwnerId)) {
  throw new Error('TELEGRAM_OWNER_ID must be a numeric Telegram user id');
}

const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
const claudeOAuthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
if (!anthropicApiKey && !claudeOAuthToken) {
  throw new Error(
    'Set either ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN so the Claude Agent SDK can authenticate.',
  );
}

export const config = {
  telegramBotToken,
  telegramOwnerId,
  telegramWebhookSecret: required('TELEGRAM_WEBHOOK_SECRET'),
  publicUrl: process.env.PUBLIC_URL,

  claudeModel: process.env.CLAUDE_MODEL || undefined,

  agentWorkdir: requireAbsolutePath('AGENT_WORKDIR', process.env.AGENT_WORKDIR || '/data/workspace'),
  dbPath: requireAbsolutePath('DB_PATH', process.env.DB_PATH || '/data/bot.sqlite'),

  port: Number(process.env.PORT || 3000),

  whisperModel: process.env.WHISPER_MODEL || 'base.en',
  // Left unset by default so nodejs-whisper uses the model it already
  // downloaded into node_modules at Docker build time (see warmup-whisper.cjs).
  // Only set this to point at the persistent volume if you explicitly want
  // the model cached there instead — note that path won't be pre-warmed.
  whisperModelRoot: process.env.WHISPER_MODEL_ROOT || undefined,
};
