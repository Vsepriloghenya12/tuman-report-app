import { Telegraf } from 'telegraf';
import { config, hasTelegramConfig } from './config.js';
import { parseReportMessage } from './parser.js';
import { saveTelegramMessage, updateMessageParseResult, upsertEmployeeReport } from './reports.js';

let bot = null;

function allowedChat(chatId) {
  if (!config.telegramAllowedChatId) return true;
  return String(chatId) === String(config.telegramAllowedChatId);
}

function getFullName(from) {
  const first = from?.first_name || '';
  const last = from?.last_name || '';
  return `${first} ${last}`.trim();
}

function formatErrors(dateLine, errors) {
  const lines = [`Ошибка в сообщении${dateLine ? ` за ${dateLine}` : ''}:`];
  for (const error of errors) {
    lines.push(`- ${error}`);
  }
  return lines.join('\n');
}

function formatSuccess(parsed) {
  const expenseLines = parsed.expenses
    .map((expense) => `- ${expense.category}: ${expense.amount}${expense.comment ? ` (${expense.comment})` : ''}`)
    .join('\n');

  return [
    `Отчёт за ${String(parsed.date.day).padStart(2, '0')}.${String(parsed.date.month).padStart(2, '0')} сохранён.`,
    '',
    'Касса:',
    `- Наличные: ${parsed.cash.cash}`,
    `- Рубли: ${parsed.cash.rubles}`,
    `- Банковские карты: ${parsed.cash.bankCards}`,
    `- Яндекс доставка: ${parsed.cash.yandexDelivery}`,
    `- Нет монет: ${parsed.cash.qrCode}`,
    `- Общая: ${parsed.cash.totalIncome}`,
    `- Осталось наличных: ${parsed.cash.cashLeft}`,
    '',
    'Расходы:',
    expenseLines || '- нет',
    '',
    `Итого расход: ${parsed.cash.expenseTotal}`
  ].join('\n');
}

async function processMessage(ctx, messageKind = 'message') {
  const message = messageKind === 'edited_message' ? ctx.update.edited_message : ctx.message;
  if (!message?.text) return;
  if (!allowedChat(message.chat.id)) return;

  const messageRow = await saveTelegramMessage({
    chatId: message.chat.id,
    messageId: message.message_id,
    messageKind,
    telegramUserId: message.from?.id || null,
    telegramUsername: message.from?.username || null,
    telegramFullName: getFullName(message.from),
    textContent: message.text,
    parseStatus: 'pending',
    parseError: null
  });

  const parsed = parseReportMessage(message.text, config.defaultReportYear, message.date);
  const firstLine = String(message.text || '').split(/\r?\n/).find((line) => line.trim())?.trim() || '';

  if (!parsed.ok) {
    await updateMessageParseResult(messageRow.id, 'invalid', parsed.errors.join(' | '));
    await ctx.reply(formatErrors(firstLine, parsed.errors), {
      reply_to_message_id: message.message_id,
      allow_sending_without_reply: true
    });
    return;
  }

  await upsertEmployeeReport(parsed, messageRow.id);
  await updateMessageParseResult(messageRow.id, 'valid', null);
  await ctx.reply(formatSuccess(parsed), {
    reply_to_message_id: message.message_id,
    allow_sending_without_reply: true
  });
}

export async function createBot() {
  if (!hasTelegramConfig()) return null;
  if (bot) return bot;

  bot = new Telegraf(config.telegramBotToken);

  bot.on('text', async (ctx) => {
    await processMessage(ctx, 'message');
  });

  bot.on('edited_message', async (ctx) => {
    await processMessage(ctx, 'edited_message');
  });

  bot.catch((error) => {
    console.error('Telegram bot error:', error);
  });

  return bot;
}

export async function startTelegram(app) {
  const tgBot = await createBot();
  if (!tgBot) {
    console.log('Telegram bot disabled: TELEGRAM_BOT_TOKEN is empty.');
    return null;
  }

  const webhookPath = `/tg-webhook-${config.telegramWebhookSecret}`;
  app.use(tgBot.webhookCallback(webhookPath));

  if (config.appBaseUrl) {
    const webhookUrl = `${config.appBaseUrl}${webhookPath}`;
    await tgBot.telegram.setWebhook(webhookUrl);
    console.log(`Telegram webhook set: ${webhookUrl}`);
  } else {
    console.log('APP_BASE_URL is not set. Webhook route registered, but webhook URL was not configured automatically.');
  }

  return tgBot;
}
