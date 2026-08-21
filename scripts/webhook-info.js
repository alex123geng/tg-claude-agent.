import 'dotenv/config';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is not set');
}

const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
const data = await res.json();
console.log(JSON.stringify(data, null, 2));
if (!data.ok) {
  process.exit(1);
}
