FROM node:22-bookworm

# python3/make/g++/cmake/git: build whisper.cpp from source via nodejs-whisper.
# ffmpeg: audio conversion (nodejs-whisper resamples input to 16kHz wav).
# curl/ca-certificates: whisper.cpp's models/download-ggml-model.sh requires
# curl and fails ("Either wget or curl is required") without it.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ cmake git ffmpeg curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

# Compile whisper.cpp and download the ggml model now, at image build time —
# not on the first user's voice message, which would otherwise block them
# for a couple of minutes on whisper.cpp's compile step.
ENV WHISPER_MODEL=base.en
COPY scripts/warmup-whisper.cjs ./scripts/warmup-whisper.cjs
RUN node scripts/warmup-whisper.cjs

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
