# tg-claude-agent

A Telegram bot that exposes the [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
(Claude Code) as a chat interface. Text or voice-message the bot and it does real work —
edits files, runs commands, searches the web — the same way Claude Code does in a terminal,
without you having to open a terminal.

## How it works

- **Webhook, not polling.** An Express server exposes `POST /webhook`; Telegram pushes
  updates to it. The endpoint checks the `X-Telegram-Bot-Api-Secret-Token` header before
  doing anything else, and only processes updates from `TELEGRAM_OWNER_ID` — everyone else
  is silently ignored.
- **One Claude session per chat.** SQLite stores `chat_id → session_id`. Every call resumes
  that session (`resume: sessionId`); the SDK itself keeps the conversation history and
  compresses context as it grows, so there's no separate history/memory system to build.
- **Tool permissions.** `Read`, `Write`, `Edit`, `Grep`, `Glob`, `WebSearch`, `WebFetch` are
  auto-approved (`allowedTools`). `Bash` is not on that list, so every Bash call goes through
  `canUseTool` (see `src/agent.ts`): commands that don't match a deny-list of dangerous
  patterns (`src/safety.ts` — `rm -rf`, `git push --force`, `sudo`, `dd`, `mkfs`, piping
  `curl`/`wget` into a shell, etc.) run automatically; commands that do match are sent to you
  in Telegram as an inline "✅ Allow / ❌ Deny" prompt, and the agent blocks on your tap
  (`src/permissions.ts`, via `callback_query`).
- **`settingSources: []`.** The agent does not read any local `CLAUDE.md`/skills/MCP config
  from the server filesystem — only the tools wired up in code. If you want the bot to have
  standing memory, drop a `CLAUDE.md` into the agent's working directory and switch
  `settingSources` to `['project']` in `src/agent.ts`.
- **Progress while it works.** Tool calls stream in as `assistant` messages from the SDK;
  they're rendered into one Telegram message that's edited in place (`editMessageText`) so a
  long-running turn doesn't look stuck. The final answer is sent as a separate, normally
  notified message once the turn completes.
- **Long replies don't get lost.** `sendMessage` splits anything over ~4000 characters into
  multiple messages on line boundaries (Telegram's hard cap is 4096 and it just rejects
  longer text).
- **Files the agent creates/changes come back to you.** The agent's working directory is
  snapshotted before and after each turn; anything new or modified is sent back as a
  Telegram document, otherwise it would only ever exist on the server.
- **Voice messages** are downloaded via `getFile`, transcribed, and fed into the exact same
  pipeline as a typed message. Two providers, picked via `VOICE_PROVIDER`:
  - `whisper-local` (free): `nodejs-whisper` bindings to whisper.cpp, compiled and with its
    model baked into the Docker image at *build* time (see `Dockerfile` and
    `scripts/warmup-whisper.js`) — so the first real voice message doesn't have to wait for a
    multi-minute whisper.cpp compile.
  - `openai`: OpenAI's Whisper API, paid, no local compilation needed.

## Setup

1. **Create the bot.** Talk to [@BotFather](https://t.me/BotFather), get a bot token. Get
   your own numeric Telegram user id from [@userinfobot](https://t.me/userinfobot) — this is
   the only id the bot will ever respond to.
2. **Pick Claude auth** — set exactly one:
   - `ANTHROPIC_API_KEY` — a pay-as-you-go key from console.anthropic.com, or
   - `CLAUDE_CODE_OAUTH_TOKEN` — free if you already have a Claude Pro/Max/Team subscription:
     run `claude setup-token` locally once (browser OAuth), paste the printed token (valid
     ~1 year).
3. **Copy `.env.example` to `.env`** and fill it in. Never commit `.env` or paste real
   secrets into chat/source control — set them as environment variables on your host instead.
4. **Local dev:** `npm install && npm run dev` (tsx watch). For local testing of the webhook
   you'll need a public URL (e.g. a tunnel) since Telegram pushes to it directly — there's no
   polling mode.

## Deploying (e.g. Railway)

- **Push over git, not the web upload.** Railway's browser drag-and-drop upload silently
  drops nested folders (`src/`) and dotfiles (`.gitignore`, `.dockerignore`). Add the
  deploy machine's SSH key to GitHub → Settings → SSH keys and `git push` to a real repo.
- **Mount a persistent Volume** at a fixed path (e.g. `/data`) and point `AGENT_WORKDIR` and
  `DB_PATH` at absolute paths under that mount (`/data/workspace`, `/data/bot.sqlite`) —
  exactly as in `.env.example`. A relative path silently resolves inside the container's
  ephemeral filesystem: no error, your data (sessions, files) just vanishes on every
  redeploy. `WHISPER_MODEL_ROOT` does *not* need the volume — it's baked into the image at
  build time (see `Dockerfile`).
- **After the first successful deploy, register the webhook** — the service does not start
  answering on its own:
  ```
  PUBLIC_URL=https://<your-railway-domain> npm run register-webhook
  ```
  (Networking → Generate Domain in Railway if you don't have a public domain yet.) This is a
  separate, easy-to-forget step — skipping it looks exactly like "the bot is broken."
- **Diagnosing "bot doesn't respond":** run `npm run webhook-info` first, before digging
  through application logs. It calls `getWebhookInfo` and shows whether a webhook is even
  registered, `pending_update_count`, and `last_error_message`.

## Test plan

- Plain text message → agent responds.
- Voice message → transcribed and answered the same way.
- A task that produces/modifies a file → the file actually arrives as a Telegram document.
- A long answer → arrives as multiple messages, nothing truncated or silently dropped.
- A dangerous Bash command (e.g. ask the agent to run something like `rm -rf`) → you get an
  Allow/Deny prompt, not immediate execution.
- Restart/redeploy the service → session and files survive (confirms the Volume and
  `AGENT_WORKDIR`/`DB_PATH` are configured correctly).
