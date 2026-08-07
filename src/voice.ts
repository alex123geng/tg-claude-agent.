import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { nodewhisper } from 'nodejs-whisper';
import { config } from './config';
import { downloadFile, getFilePath } from './telegramApi';

// whisper.cpp prints lines like "[00:00:00.000 --> 00:00:02.000]   text" to
// stdout; nodejs-whisper hands that stdout back as-is, so strip the leading
// timestamp bracket from each line before feeding it to the agent.
function stripTimestamps(raw: string): string {
  return raw
    .split('\n')
    .map((line) => line.replace(/^\s*\[[^\]]*\]\s*/, '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

export async function transcribeVoiceMessage(fileId: string): Promise<string> {
  const telegramFilePath = await getFilePath(fileId);
  const buffer = await downloadFile(telegramFilePath);

  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tg-voice-'));
  const inputPath = path.join(tmpDir, `voice-${crypto.randomUUID()}.oga`);

  try {
    await fs.promises.writeFile(inputPath, buffer);
    const rawTranscript = await nodewhisper(inputPath, {
      modelName: config.whisperModel,
      modelRootPath: config.whisperModelRoot,
      autoDownloadModelName: config.whisperModel,
      removeWavFileAfterTranscription: true,
    });
    return stripTimestamps(rawTranscript);
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
}
