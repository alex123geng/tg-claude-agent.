#!/usr/bin/env node
// Runs at Docker BUILD time (see Dockerfile), not on the first user voice
// message. It forces nodejs-whisper to compile whisper.cpp and download the
// ggml model, using a silent audio clip as input.
//
// whisper.cpp legitimately returns an empty transcript for silence, and
// nodejs-whisper treats that as an error — we must catch specifically that
// error and not fail the build, since by the time it's thrown the compile
// and model download have already happened.
require('dotenv/config');

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { nodewhisper } = require('nodejs-whisper');

const modelName = process.env.WHISPER_MODEL || 'base.en';
const modelRootPath = process.env.WHISPER_MODEL_ROOT || undefined;

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-warmup-'));
  const silencePath = path.join(tmpDir, 'silence.wav');

  console.log(`[warmup] generating 1s of silence at ${silencePath}`);
  execFileSync(
    'ffmpeg',
    ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', '1', silencePath],
    { stdio: 'inherit' },
  );

  console.log(`[warmup] compiling whisper.cpp and downloading model "${modelName}" (one-time, build-time only)`);
  try {
    await nodewhisper(silencePath, {
      modelName,
      modelRootPath,
      autoDownloadModelName: modelName,
      removeWavFileAfterTranscription: true,
    });
    console.log('[warmup] transcription of silence unexpectedly returned text — build and model are ready either way.');
  } catch (err) {
    if (/Transcription failed or produced no output/.test(err.message)) {
      console.log('[warmup] silence produced an empty transcript, as expected. Build and model are ready.');
    } else {
      throw err;
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('[warmup] failed:', err);
  process.exit(1);
});
