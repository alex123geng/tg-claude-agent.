# tg-claude-agent

Telegram-бот — полноценный ИИ-агент на базе Claude Agent SDK. Пишешь текстом
или голосом, бот выполняет задачи (код, файлы, поиск, shell) так же, как
Claude Code в терминале, и присылает результат обратно в чат: статус по ходу
работы, финальный ответ и изменённые/созданные файлы.

Работает через Telegram webhook (не long polling), доступен только владельцу
(`TELEGRAM_OWNER_ID`).

## Архитектура

- **Node.js + TypeScript + Express**, один webhook-роут `POST /webhook`.
- **`@anthropic-ai/claude-agent-sdk`** — `query({ prompt, options })` со
  `resume: sessionId`. История диалога и сжатие контекста — целиком на
  стороне SDK; в SQLite (`src/db.ts`) хранится только `chat_id → session_id`.
- **Инструменты**: `Read/Write/Edit/Grep/Glob/WebSearch/WebFetch` в
  `allowedTools` (авто-approve). `Bash` туда не входит — каждый вызов идёт
  через `canUseTool` (`src/agentRunner.ts` + `src/bashPolicy.ts`): опасные
  команды (`rm -rf`, `git push --force`, `sudo`, `dd`, `mkfs`, payment-related
  keywords и т.п.) требуют подтверждения инлайн-кнопками в Telegram
  (`src/confirmations.ts`), безопасные выполняются сразу.
- **`settingSources: ['project']`** — на сервере не подтягиваются локальные
  `CLAUDE.md`/skills/MCP-серверы владельца. У каждого чата своя рабочая
  директория `AGENT_WORKDIR/<chat_id>` с собственным `CLAUDE.md` — это и есть
  память агента (`src/agentWorkdir.ts`).
- **Голос**: локальный `nodejs-whisper` (биндинги whisper.cpp), полностью
  офлайн. Модель компилируется и скачивается на этапе сборки Docker-образа
  (`scripts/warmup-whisper.cjs`), а не при первом голосовом сообщении.
- **Очередь по chat_id** (`src/chatQueue.ts`) — сообщения одного чата
  обрабатываются строго последовательно.
- Прогресс хода (`tool_use`) форвардится одним обновляемым сообщением
  (`editMessageText`, `src/statusReporter.ts`), финальный ответ — отдельным
  сообщением, разбитым на части ≤4000 символов по границам строк
  (`src/messageSplitter.ts`), т.к. Telegram `sendMessage` молча фейлится на
  текстах длиннее 4096 символов.
- Файлы, которые агент создал/изменил за ход, определяются снапшотом
  рабочей директории до/после (`src/fileSnapshot.ts`) и отправляются
  `sendDocument`.

## Переменные окружения

См. `.env.example`. Ключевое:

- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_ID`, `TELEGRAM_WEBHOOK_SECRET` — обязательны.
- Ровно одна из `ANTHROPIC_API_KEY` (платный API-ключ) или
  `CLAUDE_CODE_OAUTH_TOKEN` (получить: `claude setup-token` при наличии
  подписки Pro/Max/Team — печатает токен на 1 год, официальный headless-механизм,
  без отдельной оплаты API).
- `AGENT_WORKDIR`, `DB_PATH` — **обязательно абсолютные пути**, совпадающие с
  точкой монтирования persistent Volume (например `/data/workspace`,
  `/data/bot.sqlite`). Относительный путь без слеша тихо резолвится в
  эфемерную файловую систему контейнера — при каждом передеплое данные будут
  стираться без единой ошибки в логах.

## Локальный запуск

```bash
npm install
cp .env.example .env   # заполнить токены
npm run dev             # ts-node, http://localhost:3000
```

Для локальной проверки без реального Telegram-вебхука воспользуйтесь
`curl -X POST http://localhost:3000/webhook -H "X-Telegram-Bot-Api-Secret-Token: <secret>" -d '{...}'`
либо инструментом вроде `ngrok`/`cloudflared`, и `npm run set-webhook`
(нужен `PUBLIC_URL`, указывающий на туннель).

## Деплой на Railway

1. **Заливать код через `git push`, не через веб-загрузку в браузере** —
   веб-загрузка молча роняет вложенные папки (`src/`) и скрытые файлы
   (`.gitignore`, `.dockerignore`). Добавьте SSH-ключ машины в
   GitHub → Settings → SSH keys и пушьте на `git@github.com:...`.
2. Создайте сервис на Railway из этого репозитория (Dockerfile определяется
   автоматически).
3. Подключите **persistent Volume**, смонтированный на конкретный путь,
   например `/data`. Убедитесь, что `AGENT_WORKDIR=/data/workspace` и
   `DB_PATH=/data/bot.sqlite` — абсолютные пути, точно совпадающие с точкой
   монтирования.
4. Заполните переменные окружения (см. `.env.example`) в Railway → Variables.
5. Задеплойте. Settings → Networking → **Generate Domain**, получите
   `https://<домен>.up.railway.app`.
6. **Обязательный отдельный шаг** — сервис не начинает отвечать сам по себе
   после первого деплоя. Зарегистрируйте вебхук на публичный домен:
   ```bash
   PUBLIC_URL=https://<домен>.up.railway.app npm run set-webhook
   ```
   (использует `TELEGRAM_BOT_TOKEN`/`TELEGRAM_WEBHOOK_SECRET` из `.env`; либо
   вызовите `setWebhook` вручную через Bot API с тем же `secret_token`, что
   в `TELEGRAM_WEBHOOK_SECRET`).

### Диагностика «бот не отвечает»

Первым делом — `getWebhookInfo`, а не логи приложения:

```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

Смотреть на `url` (вебхук вообще зарегистрирован?), `pending_update_count`
и `last_error_message`.

## Тест-план

1. **Обычный текст** — бот отвечает, файл сессии в SQLite обновляется.
2. **Голосовое сообщение** — приходит распознанный текст, затем ответ агента.
3. **Задача с файлом** («создай файл foo.py с ...») — файл реально приходит
   документом в Telegram, а не остаётся только на сервере.
4. **Длинный ответ** (попросить агента вывести что-то большое) — приходит
   несколькими сообщениями, ничего не обрезается и не теряется.
5. **Опасная Bash-команда** («удали всё в этой папке через rm -rf») —
   приходят инлайн-кнопки «Разрешить/Отклонить», выполнение ждёт нажатия.
6. **Рестарт сервиса** (передеплой на Railway) — сессия чата и файлы
   переживают рестарт: если после передеплоя бот помнит контекст и файлы на
   месте, Volume и абсолютные пути настроены верно.

## Ограничения

Изоляция — на уровне рабочей директории (`AGENT_WORKDIR/<chat_id>`) и
списка разрешённых инструментов, а не полноценный sandbox. Список опасных
команд в `src/bashPolicy.ts` — блоклист для известных деструктивных паттернов,
а не защита от целенаправленного обхода.
