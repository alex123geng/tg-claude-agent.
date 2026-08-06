require('dotenv').config();

const { Telegraf } = require('telegraf');
const Anthropic = require('@anthropic-ai/sdk');

const { TELEGRAM_BOT_TOKEN, ANTHROPIC_API_KEY } = process.env;

if (!TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN is not set');
}
if (!ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY is not set');
}

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

bot.start((ctx) => ctx.reply('Привет! Я бот на базе Claude. Напиши что-нибудь, и я отвечу.'));

bot.on('text', async (ctx) => {
  await ctx.sendChatAction('typing');
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: ctx.message.text }],
    });
    const reply = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    await ctx.reply(reply || 'Не удалось получить ответ.');
  } catch (error) {
    console.error('Claude API error:', error);
    await ctx.reply('Произошла ошибка при обращении к Claude. Попробуйте ещё раз позже.');
  }
});

bot.launch();
console.log('Bot started');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
