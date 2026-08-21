import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { nodewhisper } from 'nodejs-whisper';

function writeSilentWav(filePath, seconds = 1, sampleRate = 16000) {
  const numSamples = seconds * sampleRate;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  fs.writeFileSync(filePath, buffer);
}

async function main() {
  const provider = process.env.VOICE_PROVIDER || 'whisper-local';
  if (provider !== 'whisper-local') {
    console.log(`[warmup-whisper] VOICE_PROVIDER=${provider}, skipping local whisper.cpp warmup.`);
    return;
  }

  const modelName = process.env.WHISPER_MODEL || 'base';
  const modelRootPath = path.resolve(process.env.WHISPER_MODEL_ROOT || './whisper-models');
  const tmpWav = path.join(os.tmpdir(), 'warmup-silence.wav');

  writeSilentWav(tmpWav);
  console.log(`[warmup-whisper] Downloading/building whisper model "${modelName}" into ${modelRootPath}...`);
  try {
    await nodewhisper(tmpWav, {
      modelName,
      modelRootPath,
      autoDownloadModelName: modelName,
      removeWavFileAfterTranscription: true,
    });
    console.log('[warmup-whisper] Done.');
  } catch (err) {
    // whisper.cpp legitimately returns an empty transcript for silent audio, and
    // nodejs-whisper treats that as an error. By the time this throws, the model has
    // already been downloaded and whisper.cpp has already been built, so this specific
    // failure is expected and must not fail the build.
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Transcription failed or produced no output')) {
      console.log('[warmup-whisper] Silent warmup audio produced no transcript, as expected. Model is ready.');
    } else {
      throw err;
    }
  } finally {
    fs.rmSync(tmpWav, { force: true });
  }
}

main().catch((err) => {
  console.error('[warmup-whisper] Failed:', err);
  process.exit(1);
});
