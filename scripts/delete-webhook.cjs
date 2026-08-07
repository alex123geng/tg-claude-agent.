#!/usr/bin/env node
require('dotenv/config');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('Missing TELEGRAM_BOT_TOKEN in the environment.');
  process.exit(1);
}

fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, { method: 'POST' })
  .then((res) => res.json())
  .then((data) => {
    console.log(data);
    if (!data.ok) process.exit(1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
