import { MESSAGE_CATEGORIES } from './categories.js';

function formatNumber(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '';
  if (Math.abs(numericValue - Math.round(numericValue)) < 0.0000001) {
    return String(Math.round(numericValue));
  }
  return numericValue.toFixed(2).replace(/\.?0+$/, '');
}

function replaceLineInText(sourceText, issue, replacementLine) {
  const lines = String(sourceText || '').replace(/\r/g, '').split('\n');

  if (Number.isInteger(issue?.lineIndex) && issue.lineIndex >= 0 && issue.lineIndex < lines.length) {
    lines[issue.lineIndex] = replacementLine;
    for (const index of issue.removeLineIndices || []) {
      if (index !== issue.lineIndex && index >= 0 && index < lines.length) {
        lines[index] = '';
      }
    }
    return lines.join('\n');
  }

  const insertAtLineIndex = Number.isInteger(issue?.insertAtLineIndex)
    ? Math.max(0, Math.min(issue.insertAtLineIndex, lines.length))
    : lines.length;
  lines.splice(insertAtLineIndex, 0, replacementLine);
  return lines.join('\n');
}

export function getFirstActionableIssue(parsed) {
  return parsed?.issues?.find((issue) => issue?.actionable) || null;
}

export function getCategoryOptions() {
  return MESSAGE_CATEGORIES;
}

export function formatClarificationPrompt(issue) {
  switch (issue?.type) {
    case 'expense_unknown_category':
      return [
        'Не понял статью расхода в строке:',
        `"${issue.currentLine}"`,
        '',
        'Выбери, в какую статью это внести.'
      ].join('\n');
    case 'expense_invalid_amount':
      return [
        'Не удалось прочитать сумму в строке:',
        `"${issue.currentLine}"`,
        '',
        'Ответь на это сообщение одной исправленной строкой.',
        `Например: ${issue.exampleLine}`
      ].join('\n');
    case 'expense_invalid_line':
      return [
        'Не удалось разобрать строку расхода:',
        `"${issue.currentLine}"`,
        '',
        'Ответь на это сообщение одной исправленной строкой.',
        `Например: ${issue.exampleLine}`
      ].join('\n');
    case 'field_mismatch':
      return [
        'Проверь строку:',
        `"${issue.currentLine}"`,
        '',
        'Ответь на это сообщение исправленной строкой.',
        `Подсказка: ${issue.exampleLine}`
      ].join('\n');
    case 'field_invalid_value':
      return [
        issue.currentLine ? 'Не удалось прочитать значение в строке:' : `Не нашёл строку "${issue.label}".`,
        ...(issue.currentLine ? [`"${issue.currentLine}"`, ''] : ['']),
        'Ответь на это сообщение одной исправленной строкой.',
        `Например: ${issue.exampleLine}`
      ].join('\n');
    case 'date_invalid':
      return [
        issue.currentLine ? 'Не удалось понять дату в строке:' : 'Не удалось определить дату отчёта.',
        ...(issue.currentLine ? [`"${issue.currentLine}"`, ''] : ['']),
        'Ответь на это сообщение одной строкой с датой.',
        `Например: ${issue.exampleLine}`
      ].join('\n');
    default:
      return issue?.message || 'Нужно уточнить строку отчёта.';
  }
}

export function applyTextClarification(sourceText, issue, replyText) {
  const trimmedReply = String(replyText || '').replace(/\r/g, '').trim();
  if (!trimmedReply) {
    return { ok: false, error: 'Пришли одну исправленную строку текстом.' };
  }

  let replacementLine = trimmedReply;
  if ((issue?.type === 'field_invalid_value' || issue?.type === 'field_mismatch') && !trimmedReply.includes(':')) {
    replacementLine = `${issue.label}: ${trimmedReply}`;
  }

  return {
    ok: true,
    text: replaceLineInText(sourceText, issue, replacementLine)
  };
}

export function applyCategoryClarification(sourceText, issue, category) {
  if (issue?.type !== 'expense_unknown_category') {
    return { ok: false, error: 'Сейчас не ожидается выбор категории.' };
  }

  if (!MESSAGE_CATEGORIES.includes(category)) {
    return { ok: false, error: 'Неизвестная категория для исправления.' };
  }

  const amount = formatNumber(issue.amount);
  const comment = String(issue.comment || '').trim();
  const replacementLine = `${amount} ${comment} (${category})`.trim();

  return {
    ok: true,
    text: replaceLineInText(sourceText, issue, replacementLine)
  };
}
