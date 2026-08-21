import fs from 'node:fs/promises';
import path from 'node:path';
import { nodewhisper } from 'nodejs-whisper';
import { config } from './config.js';
import { logger } from './logger.js';

const TIMESTAMP_PREFIX = /^\[\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}\]\s*/;

function parseWhisperStdout(stdout: string): string {
  return stdout
    .split('\n')
    .map((line) => line.replace(TIMESTAMP_PREFIX, '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

async function transcribeLocal(filePath: string): Promise<string> {
  const stdout = await nodewhisper(filePath, {
    modelName: config.voice.whisperModel,
    modelRootPath: config.voice.whisperModelRoot,
    autoDownloadModelName: config.voice.whisperModel,
    removeWavFileAfterTranscription: true,
    logger: {
      debug: () => {},
      log: () => {},
      error: (...args: unknown[]) => logger.error('[whisper]', ...args),
    },
  });
  return parseWhisperStdout(stdout);
}

async function transcribeOpenAI(filePath: string): Promise<string> {
  const fileBuffer = await fs.readFile(filePath);
  const form = new FormData();
  form.append('file', new Blob([fileBuffer]), path.basename(filePath));
  form.append('model', 'whisper-1');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.voice.openaiApiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`OpenAI transcription failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { text: string };
  return data.text.trim();
}

export async function transcribeVoice(filePath: string): Promise<string> {
  const text =
    config.voice.provider === 'openai' ? await transcribeOpenAI(filePath) : await transcribeLocal(filePath);
  if (!text) {
    throw new Error('Transcription produced no text');
  }
  return text;
}
