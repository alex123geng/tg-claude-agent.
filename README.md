# tg-claude-agent

Telegram-бот на Node.js (telegraf), который пересылает сообщения пользователя в Claude API и отвечает.

## Установка

```bash
npm install
cp .env.example .env
```

Заполните `.env`:

- `TELEGRAM_BOT_TOKEN` — токен бота, полученный от [@BotFather](https://t.me/BotFather)
- `ANTHROPIC_API_KEY` — ключ Anthropic API

## Запуск

```bash
npm start
```

## Дашборд юнит-экономики WB

В `docs/` лежит отдельный статический дашборд для юнит-экономики бренда
«Скаут» на Wildberries — не связан с телеграм-ботом выше, живёт в этом же
репозитории для раздачи через GitHub Pages. Подробности, формулы расчёта
и инструкция по настройке Pages — в [`docs/README.md`](docs/README.md).
