import 'dotenv/config';

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const url = process.argv[2] || process.env.PUBLIC_URL;

if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is not set');
}
if (!secret) {
  throw new Error('TELEGRAM_WEBHOOK_SECRET is not set');
}
if (!url) {
  console.error('Usage: npm run register-webhook -- <https://your-public-domain.com>');
  console.error('(or set PUBLIC_URL in your environment)');
  process.exit(1);
}

const webhookUrl = `${url.replace(/\/+$/, '')}/webhook`;

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ['message'],
  }),
});
const data = await res.json();
console.log(JSON.stringify(data, null, 2));
if (!data.ok) {
  process.exit(1);
}
