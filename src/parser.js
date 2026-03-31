import { EMPLOYEE_CATEGORIES, isAllowedEmployeeCategory, normalizeCategory } from './categories.js';

function toNumber(raw) {
  if (raw == null) return NaN;
  const normalized = String(raw)
    .replace(/\s+/g, '')
    .replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : NaN;
}

function extractLabelValue(lines, label) {
  const index = lines.findIndex((line) => line.toLowerCase().startsWith(`${label.toLowerCase()}:`));
  if (index === -1) return { value: null, index: -1 };

  const sameLine = lines[index].split(':').slice(1).join(':').trim();
  if (sameLine) {
    return { value: sameLine, index };
  }

  for (let i = index + 1; i < lines.length; i += 1) {
    if (lines[i].trim()) {
      return { value: lines[i].trim(), index };
    }
  }

  return { value: null, index };
}

function parseExpenseLine(line) {
  const amountMatch = line.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/u);
  if (!amountMatch) {
    return { error: `Не удалось прочитать сумму в строке: "${line}"` };
  }

  const amount = toNumber(amountMatch[1]);
  const remainder = amountMatch[2].trim();
  const categoryMatch = remainder.match(/^(.*?)\s*\(([^()]+)\)\s*$/u);

  if (!categoryMatch) {
    return {
      error: `Не найдена категория в конце строки: "${line}". Используй формат: 250 дост (доставка)`
    };
  }

  const comment = categoryMatch[1].trim();
  const category = normalizeCategory(categoryMatch[2]);

  if (!isAllowedEmployeeCategory(category)) {
    return {
      error: `Категория "${categoryMatch[2].trim()}" не принимается из сообщений сотрудников. Разрешены только: ${EMPLOYEE_CATEGORIES.join(', ')}.`
    };
  }

  return {
    amount,
    comment,
    category,
    rawText: line
  };
}

function parseDate(firstLine, defaultYear) {
  const match = firstLine.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3] ? Number(match[3].length === 2 ? `20${match[3]}` : match[3]) : defaultYear;

  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;

  const isoDate = `${year.toString().padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const monthKey = `${year.toString().padStart(4, '0')}-${String(month).padStart(2, '0')}`;

  return { day, month, year, isoDate, monthKey };
}

export function parseReportMessage(text, defaultYear) {
  const sourceText = String(text || '').replace(/\r/g, '');
  const rawLines = sourceText.split('\n');
  const lines = rawLines.map((line) => line.trim());
  const meaningfulLines = lines.filter(Boolean);

  if (!meaningfulLines.length) {
    return { ok: false, errors: ['Сообщение пустое.'] };
  }

  const dateInfo = parseDate(meaningfulLines[0], defaultYear);
  if (!dateInfo) {
    return {
      ok: false,
      errors: ['Не удалось определить дату. Первая строка должна быть в формате ДД.ММ, например 30.03.']
    };
  }

  const requiredFields = [
    ['Наличные', 'cash'],
    ['Рубли', 'rubles'],
    ['Банковские карты', 'bankCards'],
    ['Яндекс доставка', 'yandexDelivery'],
    ['Нет монет', 'qrCode'],
    ['Общая', 'totalIncome'],
    ['Итог', 'cashLeft'],
    ['Итого расход', 'expenseTotal']
  ];

  const fieldErrors = [];
  const fields = {};

  for (const [label, key] of requiredFields) {
    const { value } = extractLabelValue(lines, label);
    const numericValue = toNumber(value);
    if (!Number.isFinite(numericValue)) {
      fieldErrors.push(`Не найдено или неверно заполнено поле "${label}".`);
    } else {
      fields[key] = numericValue;
    }
  }

  const expensesHeaderIndex = lines.findIndex((line) => line.toLowerCase() === 'расходы:');
  const expenseTotalIndex = lines.findIndex((line) => line.toLowerCase().startsWith('итого расход'));

  if (expensesHeaderIndex === -1) {
    fieldErrors.push('Не найден блок "Расходы:".');
  }
  if (expenseTotalIndex === -1) {
    fieldErrors.push('Не найдено поле "Итого расход".');
  }

  const expenses = [];
  if (expensesHeaderIndex !== -1 && expenseTotalIndex !== -1) {
    const expenseLines = lines
      .slice(expensesHeaderIndex + 1, expenseTotalIndex)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const expenseLine of expenseLines) {
      const parsedExpense = parseExpenseLine(expenseLine);
      if (parsedExpense.error) {
        fieldErrors.push(parsedExpense.error);
      } else {
        expenses.push(parsedExpense);
      }
    }
  }

  if (fieldErrors.length) {
    return { ok: false, errors: fieldErrors };
  }

  const computedTotalIncome = fields.cash + fields.rubles + fields.bankCards + fields.yandexDelivery + fields.qrCode;
  const computedExpenseTotal = expenses.reduce((sum, item) => sum + item.amount, 0);
  const validationErrors = [];

  if (Math.abs(computedTotalIncome - fields.totalIncome) > 0.0001) {
    validationErrors.push(`Сумма кассы по строкам = ${computedTotalIncome}, а "Общая" = ${fields.totalIncome}.`);
  }

  if (Math.abs(computedExpenseTotal - fields.expenseTotal) > 0.0001) {
    validationErrors.push(`Сумма расходов по строкам = ${computedExpenseTotal}, а "Итого расход" = ${fields.expenseTotal}.`);
  }

  if (validationErrors.length) {
    return { ok: false, errors: validationErrors };
  }

  return {
    ok: true,
    date: dateInfo,
    cash: {
      cash: fields.cash,
      rubles: fields.rubles,
      bankCards: fields.bankCards,
      yandexDelivery: fields.yandexDelivery,
      qrCode: fields.qrCode,
      totalIncome: fields.totalIncome,
      cashLeft: fields.cashLeft,
      expenseTotal: fields.expenseTotal
    },
    expenses
  };
}
