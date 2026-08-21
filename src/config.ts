import 'dotenv/config';
import path from 'node:path';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

const voiceProvider = (process.env.VOICE_PROVIDER || 'whisper-local') as 'whisper-local' | 'openai';
if (voiceProvider !== 'whisper-local' && voiceProvider !== 'openai') {
  throw new Error(`VOICE_PROVIDER must be "whisper-local" or "openai", got: ${voiceProvider}`);
}

const anthropicApiKey = optional('ANTHROPIC_API_KEY');
const claudeCodeOauthToken = optional('CLAUDE_CODE_OAUTH_TOKEN');
if (!anthropicApiKey && !claudeCodeOauthToken) {
  throw new Error('Set either ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN so the agent can authenticate.');
}

const openaiApiKey = optional('OPENAI_API_KEY');
if (voiceProvider === 'openai' && !openaiApiKey) {
  throw new Error('OPENAI_API_KEY is required when VOICE_PROVIDER=openai');
}

export const config = {
  telegram: {
    botToken: required('TELEGRAM_BOT_TOKEN'),
    ownerId: Number(required('TELEGRAM_OWNER_ID')),
    webhookSecret: required('TELEGRAM_WEBHOOK_SECRET'),
  },
  port: Number(process.env.PORT || 3000),
  agentWorkdir: path.resolve(process.env.AGENT_WORKDIR || './workspace'),
  dbPath: path.resolve(process.env.DB_PATH || './bot.sqlite'),
  anthropicApiKey,
  claudeCodeOauthToken,
  voice: {
    provider: voiceProvider,
    whisperModel: process.env.WHISPER_MODEL || 'base',
    whisperModelRoot: path.resolve(process.env.WHISPER_MODEL_ROOT || './whisper-models'),
    openaiApiKey,
  },
};

if (Number.isNaN(config.telegram.ownerId)) {
  throw new Error('TELEGRAM_OWNER_ID must be a numeric Telegram user id');
}
