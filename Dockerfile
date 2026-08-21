FROM node:20-bookworm

# Required to compile whisper.cpp (via nodejs-whisper) at build time.
# curl is required by nodejs-whisper's model downloader — without it the
# download script fails with "Either wget or curl is required".
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ cmake git ffmpeg curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

# Bake the whisper.cpp binary and model into the image at build time, so the
# first voice message a user sends doesn't have to wait a couple of minutes
# for whisper.cpp to compile. This path lives inside the image, not on the
# persistent volume — every image build reproduces it, so there is nothing
# to persist across redeploys.
ENV VOICE_PROVIDER=whisper-local
ENV WHISPER_MODEL=base
ENV WHISPER_MODEL_ROOT=/app/whisper-models
RUN npm run warmup:whisper

RUN npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
