import { Markup, Telegraf } from 'telegraf';
import { config, hasTelegramConfig } from './config.js';
import { parseIncomingTelegramMessage } from './parser.js';
import {
  applyCategoryClarification,
  applyTextClarification,
  formatClarificationPrompt,
  getCategoryOptions,
  getFirstActionableIssue
} from './clarification.js';
import { normalizeCategory } from './categories.js';
import {
  cancelClarificationsForSourceMessage,
  getPendingClarificationByPrompt,
  getPendingClarificationSession,
  resolveClarificationSession,
  saveTelegramMessage,
  setClarificationPromptMessage,
  updateClarificationSession,
  updateMessageParseResult,
  updateTelegramMessageContent,
  upsertClarificationSession,
  upsertEmployeeReport,
  upsertOwnerExpenseMessage
} from './reports.js';

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

function formatFullReportSuccess(parsed) {
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

function formatExpenseOnlySuccess(parsed) {
  const expenseLines = parsed.expenses
    .map((expense) => `- ${expense.category}: ${expense.amount}${expense.comment ? ` (${expense.comment})` : ''}`)
    .join('\n');

  return [
    `Расход за ${String(parsed.date.day).padStart(2, '0')}.${String(parsed.date.month).padStart(2, '0')} сохранён из короткого сообщения.`,
    '',
    'Добавлено:',
    expenseLines,
    '',
    `Сумма: ${parsed.expenses.reduce((sum, item) => sum + item.amount, 0)}`
  ].join('\n');
}

function formatClarifiedSuccess(parsed) {
  const body = parsed.mode === 'expense_only'
    ? formatExpenseOnlySuccess(parsed)
    : formatFullReportSuccess(parsed);

  return ['Исправление принято.', '', body].join('\n');
}

function getFirstMeaningfulLine(text) {
  return String(text || '')
    .split(/\r?\n/)
    .find((line) => line.trim())
    ?.trim() || '';
}

function getFallbackDateFromSession(session) {
  if (session?.source_message_date == null) return null;
  const numericValue = Number(session.source_message_date);
  return Number.isFinite(numericValue) ? numericValue : session.source_message_date;
}

function buildCategoryKeyboard(sessionId) {
  const categories = getCategoryOptions();
  const buttons = categories.map((category, index) => Markup.button.callback(category, `clarifycat:${sessionId}:${index}`));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }
  return Markup.inlineKeyboard(rows);
}

async function sendClarificationPrompt(ctx, sessionId, issue, replyToMessageId) {
  const markup = issue?.promptKind === 'category' ? buildCategoryKeyboard(sessionId) : null;
  const extra = {
    reply_to_message_id: replyToMessageId,
    allow_sending_without_reply: true
  };
  if (markup?.reply_markup) {
    extra.reply_markup = markup.reply_markup;
  }
  return ctx.reply(formatClarificationPrompt(issue), extra);
}

async function persistParsedMessage(parsed, sourceMessageRowId, messageMeta) {
  if (parsed.mode === 'expense_only') {
    await upsertOwnerExpenseMessage(parsed, sourceMessageRowId, {
      chatId: messageMeta.chatId,
      messageId: messageMeta.messageId
    });
    return;
  }

  await upsertEmployeeReport(parsed, sourceMessageRowId);
}

async function continueClarification(ctx, session, workingText, replyToMessageId) {
  const parsed = parseIncomingTelegramMessage(
    workingText,
    config.defaultReportYear,
    getFallbackDateFromSession(session)
  );

  if (!parsed.ok) {
    const actionableIssue = getFirstActionableIssue(parsed);
    const parseError = parsed.errors.join(' | ');

    if (!actionableIssue) {
      await updateTelegramMessageContent(session.source_message_row_id, workingText, 'invalid', parseError);
      await cancelClarificationsForSourceMessage(session.chat_id, session.source_message_id);
      await ctx.reply(formatErrors(getFirstMeaningfulLine(workingText), parsed.errors), {
        reply_to_message_id: replyToMessageId,
        allow_sending_without_reply: true
      });
      return;
    }

    const updatedSession = await updateClarificationSession(session.id, workingText, actionableIssue);
    await updateTelegramMessageContent(session.source_message_row_id, workingText, 'needs_clarification', parseError);
    const promptMessage = await sendClarificationPrompt(ctx, updatedSession.id, actionableIssue, replyToMessageId);
    await setClarificationPromptMessage(updatedSession.id, promptMessage.message_id);
    return;
  }

  await persistParsedMessage(parsed, session.source_message_row_id, {
    chatId: session.chat_id,
    messageId: session.source_message_id
  });
  await updateTelegramMessageContent(session.source_message_row_id, workingText, 'valid', null);
  await resolveClarificationSession(session.id, workingText);
  await ctx.reply(formatClarifiedSuccess(parsed), {
    reply_to_message_id: replyToMessageId,
    allow_sending_without_reply: true
  });
}

async function processClarificationReply(ctx, session, message) {
  const issue = session.current_issue_payload;
  if (!issue?.actionable) {
    await ctx.reply('Старое уточнение уже неактуально. Пришли отчёт заново или отредактируй исходное сообщение.', {
      reply_to_message_id: message.message_id,
      allow_sending_without_reply: true
    });
    return;
  }

  if (issue.promptKind === 'category') {
    const typedCategory = normalizeCategory(message.text);
    if (!getCategoryOptions().includes(typedCategory)) {
      await ctx.reply('Для этой строки выбери категорию кнопкой ниже или пришли одно название категории текстом.', {
        reply_to_message_id: message.message_id,
        allow_sending_without_reply: true
      });
      return;
    }

    const appliedCategory = applyCategoryClarification(session.working_text, issue, typedCategory);
    if (!appliedCategory.ok) {
      await ctx.reply(appliedCategory.error, {
        reply_to_message_id: message.message_id,
        allow_sending_without_reply: true
      });
      return;
    }

    await continueClarification(ctx, session, appliedCategory.text, message.message_id);
    return;
  }

  const appliedText = applyTextClarification(session.working_text, issue, message.text);
  if (!appliedText.ok) {
    await ctx.reply(appliedText.error, {
      reply_to_message_id: message.message_id,
      allow_sending_without_reply: true
    });
    return;
  }

  await continueClarification(ctx, session, appliedText.text, message.message_id);
}

async function processMessage(ctx, messageKind = 'message') {
  const message = messageKind === 'edited_message' ? ctx.update.edited_message : ctx.message;
  if (!message?.text) return;
  if (!allowedChat(message.chat.id)) return;

  const pendingClarification = await getPendingClarificationByPrompt(
    message.chat.id,
    message.from?.id || 0,
    message.reply_to_message?.message_id || null
  );
  if (pendingClarification) {
    await processClarificationReply(ctx, pendingClarification, message);
    return;
  }

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

  const parsed = parseIncomingTelegramMessage(message.text, config.defaultReportYear, message.date);
  const firstLine = String(message.text || '').split(/\r?\n/).find((line) => line.trim())?.trim() || '';

  if (!parsed.ok) {
    const actionableIssue = getFirstActionableIssue(parsed);
    const parseError = parsed.errors.join(' | ');

    if (actionableIssue) {
      await updateMessageParseResult(messageRow.id, 'needs_clarification', parseError);
      const session = await upsertClarificationSession({
        chatId: message.chat.id,
        userId: message.from?.id || 0,
        sourceMessageId: message.message_id,
        sourceMessageKind: messageKind,
        sourceMessageRowId: messageRow.id,
        sourceMessageDate: message.date,
        originalText: message.text,
        workingText: message.text,
        issue: actionableIssue
      });
      const promptMessage = await sendClarificationPrompt(ctx, session.id, actionableIssue, message.message_id);
      await setClarificationPromptMessage(session.id, promptMessage.message_id);
      return;
    }

    await cancelClarificationsForSourceMessage(message.chat.id, message.message_id);
    await updateMessageParseResult(messageRow.id, 'invalid', parseError);
    await ctx.reply(formatErrors(firstLine, parsed.errors), {
      reply_to_message_id: message.message_id,
      allow_sending_without_reply: true
    });
    return;
  }

  await cancelClarificationsForSourceMessage(message.chat.id, message.message_id);
  await persistParsedMessage(parsed, messageRow.id, {
    chatId: message.chat.id,
    messageId: message.message_id
  });
  await updateMessageParseResult(messageRow.id, 'valid', null);
  await ctx.reply(parsed.mode === 'expense_only' ? formatExpenseOnlySuccess(parsed) : formatFullReportSuccess(parsed), {
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

  bot.action(/^clarifycat:(\d+):(\d+)$/, async (ctx) => {
    const sessionId = Number(ctx.match[1]);
    const categoryIndex = Number(ctx.match[2]);
    const category = getCategoryOptions()[categoryIndex];

    const session = await getPendingClarificationSession(sessionId);
    if (!session) {
      await ctx.answerCbQuery('Это уточнение уже закрыто.');
      return;
    }

    if (String(session.user_id) !== String(ctx.callbackQuery.from.id)) {
      await ctx.answerCbQuery('Это уточнение для другого пользователя.', { show_alert: true });
      return;
    }

    const appliedCategory = applyCategoryClarification(session.working_text, session.current_issue_payload, category);
    if (!appliedCategory.ok) {
      await ctx.answerCbQuery(appliedCategory.error, { show_alert: true });
      return;
    }

    await ctx.answerCbQuery(`Статья: ${category}`);
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
    await continueClarification(ctx, session, appliedCategory.text, session.source_message_id);
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
