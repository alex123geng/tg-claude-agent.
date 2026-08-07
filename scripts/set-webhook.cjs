#!/usr/bin/env node
// Registers the Telegram webhook against PUBLIC_URL. This is a separate,
// manual step after the first successful deploy — the service does not
// start receiving updates on its own until this has been run once.
require('dotenv/config');

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const publicUrl = process.env.PUBLIC_URL;

if (!token || !secret || !publicUrl) {
  console.error('Missing TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET or PUBLIC_URL in the environment.');
  process.exit(1);
}

const url = `${publicUrl.replace(/\/+$/, '')}/webhook`;

fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url, secret_token: secret }),
})
  .then((res) => res.json())
  .then((data) => {
    console.log(data);
    if (!data.ok) process.exit(1);
    console.log(`Webhook registered: ${url}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
