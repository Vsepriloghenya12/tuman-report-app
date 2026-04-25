import { isAllowedMessageCategory, normalizeCategory } from './categories.js';

const REQUIRED_FIELDS = [
  { label: 'Наличные', key: 'cash', example: 'Наличные: 4060' },
  { label: 'Рубли', key: 'rubles', example: 'Рубли: 16520' },
  { label: 'Банковские карты', key: 'bankCards', example: 'Банковские карты: 125736' },
  { label: 'Яндекс доставка', key: 'yandexDelivery', example: 'Яндекс доставка: 1280' },
  { label: 'Нет монет', key: 'qrCode', example: 'Нет монет: 0' },
  { label: 'Общая', key: 'totalIncome', example: 'Общая: 147596' },
  { label: 'Итог', key: 'cashLeft', example: 'Итог: 9501' },
  { label: 'Итого расход', key: 'expenseTotal', example: 'Итого расход: 6159' }
];

function toNumber(raw) {
  if (raw == null) return NaN;
  const normalized = String(raw)
    .replace(/\s+/g, '')
    .replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : NaN;
}

function formatNumberSuggestion(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '';
  if (Math.abs(numericValue - Math.round(numericValue)) < 0.0000001) {
    return String(Math.round(numericValue));
  }
  return numericValue.toFixed(2).replace(/\.?0+$/, '');
}

function createLineEntries(sourceText) {
  return String(sourceText || '')
    .split('\n')
    .map((raw, index) => ({
      index,
      raw,
      trimmed: raw.trim()
    }));
}

function findLineStartingWith(entries, prefix) {
  const normalizedPrefix = `${prefix.toLowerCase()}:`;
  return entries.find((entry) => entry.trimmed.toLowerCase().startsWith(normalizedPrefix)) || null;
}

function extractLabelValue(entries, label) {
  const labelEntry = findLineStartingWith(entries, label);
  if (!labelEntry) {
    return {
      value: null,
      labelLineIndex: -1,
      valueLineIndex: -1,
      currentLine: null,
      removeLineIndices: []
    };
  }

  const sameLine = labelEntry.trimmed.split(':').slice(1).join(':').trim();
  if (sameLine) {
    return {
      value: sameLine,
      labelLineIndex: labelEntry.index,
      valueLineIndex: labelEntry.index,
      currentLine: labelEntry.trimmed || `${label}: ${sameLine}`,
      removeLineIndices: []
    };
  }

  for (let i = labelEntry.index + 1; i < entries.length; i += 1) {
    if (entries[i].trimmed) {
      return {
        value: entries[i].trimmed,
        labelLineIndex: labelEntry.index,
        valueLineIndex: entries[i].index,
        currentLine: `${label}: ${entries[i].trimmed}`,
        removeLineIndices: entries[i].index === labelEntry.index ? [] : [entries[i].index]
      };
    }
  }

  return {
    value: null,
    labelLineIndex: labelEntry.index,
    valueLineIndex: -1,
    currentLine: `${label}:`,
    removeLineIndices: []
  };
}

function findFieldInsertIndex(entries, label, fallbackIndex = null) {
  const labelIndex = REQUIRED_FIELDS.findIndex((field) => field.label === label);
  if (labelIndex === -1) return fallbackIndex;

  for (let i = labelIndex + 1; i < REQUIRED_FIELDS.length; i += 1) {
    const nextMeta = extractLabelValue(entries, REQUIRED_FIELDS[i].label);
    if (nextMeta.labelLineIndex >= 0) {
      return nextMeta.labelLineIndex;
    }
  }

  return fallbackIndex;
}

function buildFieldIssue(entries, field, meta, message) {
  const expensesHeaderEntry = entries.find((entry) => entry.trimmed.toLowerCase() === 'расходы:');

  if (meta.labelLineIndex >= 0) {
    return {
      type: 'field_invalid_value',
      actionable: true,
      promptKind: 'text',
      label: field.label,
      lineIndex: meta.labelLineIndex,
      currentLine: meta.currentLine || field.example,
      exampleLine: field.example,
      removeLineIndices: meta.removeLineIndices || [],
      message
    };
  }

  return {
    type: 'field_invalid_value',
    actionable: true,
    promptKind: 'text',
    label: field.label,
    lineIndex: null,
    insertAtLineIndex: findFieldInsertIndex(entries, field.label, expensesHeaderEntry?.index ?? entries.length),
    currentLine: null,
    exampleLine: field.example,
    removeLineIndices: [],
    message
  };
}

function buildDateIssue(meaningfulEntries) {
  const firstMeaningfulEntry = meaningfulEntries[0] || null;
  return {
    type: 'date_invalid',
    actionable: true,
    promptKind: 'text',
    label: 'Дата',
    lineIndex: firstMeaningfulEntry?.index ?? null,
    insertAtLineIndex: firstMeaningfulEntry?.index ?? 0,
    currentLine: firstMeaningfulEntry?.trimmed || null,
    exampleLine: '30.03',
    removeLineIndices: [],
    message: 'Не удалось определить дату. Укажи дату первой строкой в формате ДД.ММ.'
  };
}

function buildTotalMismatchIssue(fieldMeta, label, actualValue, expectedValue) {
  return {
    type: 'field_mismatch',
    actionable: true,
    promptKind: 'text',
    label,
    lineIndex: fieldMeta.labelLineIndex >= 0 ? fieldMeta.labelLineIndex : null,
    currentLine: fieldMeta.currentLine || `${label}: ${formatNumberSuggestion(actualValue)}`,
    exampleLine: `${label}: ${formatNumberSuggestion(expectedValue)}`,
    removeLineIndices: fieldMeta.removeLineIndices || [],
    expectedValue,
    actualValue,
    message: `Проверь строку "${fieldMeta.currentLine || `${label}: ${formatNumberSuggestion(actualValue)}`}". По расчёту получается ${formatNumberSuggestion(expectedValue)}.`
  };
}

function splitExpenseLine(line) {
  const trimmed = String(line || '').trim();

  const amountFirst = trimmed.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/u);
  if (amountFirst) {
    return {
      amount: amountFirst[1],
      remainder: amountFirst[2].trim()
    };
  }

  const amountLast = trimmed.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)$/u);
  if (amountLast) {
    return {
      amount: amountLast[2],
      remainder: amountLast[1].trim()
    };
  }

  const amountMiddle = trimmed.match(/^(.*?)\s*(\d+(?:[.,]\d+)?)\s*(.*?)$/u);
  if (amountMiddle && (amountMiddle[1].trim() || amountMiddle[3].trim())) {
    const before = amountMiddle[1].trim();
    const after = amountMiddle[3].trim();
    const remainder = [before, after].filter(Boolean).join(' ').trim();
    if (remainder) {
      return {
        amount: amountMiddle[2],
        remainder
      };
    }
  }

  return null;
}

function parseExpenseLineDetailed(line, context = {}) {
  const trimmed = String(line || '').trim();
  const issueBase = {
    actionable: true,
    promptKind: 'text',
    lineIndex: context.lineIndex ?? null,
    currentLine: trimmed,
    removeLineIndices: []
  };

  const categoryMatch = trimmed.match(/^(.*?)\s*\(([^()]+)\)\s*$/u);

  if (!categoryMatch) {
    return {
      ok: false,
      issue: {
        ...issueBase,
        type: 'expense_invalid_line',
        exampleLine: '250 дост (доставка)',
        message: `Не найдена категория в конце строки: "${trimmed}". Используй формат: 250 дост (доставка).`
      }
    };
  }

  const beforeCategory = categoryMatch[1].trim();
  const split = splitExpenseLine(beforeCategory);
  const sourceCategory = categoryMatch[2].trim();

  if (!split) {
    return {
      ok: false,
      issue: {
        ...issueBase,
        type: 'expense_invalid_amount',
        sourceCategory,
        exampleLine: `250 комментарий (${normalizeCategory(sourceCategory) || 'доставка'})`,
        message: `Не удалось прочитать сумму в строке: "${trimmed}".`
      }
    };
  }

  const amount = toNumber(split.amount);
  const comment = split.remainder.trim();

  if (!Number.isFinite(amount)) {
    return {
      ok: false,
      issue: {
        ...issueBase,
        type: 'expense_invalid_amount',
        sourceCategory,
        exampleLine: `250 ${comment || 'комментарий'} (${normalizeCategory(sourceCategory) || 'доставка'})`,
        message: `Не удалось прочитать сумму в строке: "${trimmed}".`
      }
    };
  }

  const category = normalizeCategory(sourceCategory);

  if (!isAllowedMessageCategory(category)) {
    return {
      ok: false,
      issue: {
        ...issueBase,
        type: 'expense_unknown_category',
        promptKind: 'category',
        amount,
        comment,
        sourceCategory,
        message: `Неизвестная категория "${sourceCategory}". Выбери, в какую статью расходов это внести.`
      }
    };
  }

  return {
    ok: true,
    value: {
      amount,
      comment,
      category,
      rawText: line
    }
  };
}

export function parseExpenseLine(line, context = {}) {
  const result = parseExpenseLineDetailed(line, context);
  if (!result.ok) {
    return {
      error: result.issue.message,
      issue: result.issue
    };
  }

  return result.value;
}

function dateInfoFromParts(day, month, year) {
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;

  const isoDate = `${year.toString().padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const monthKey = `${year.toString().padStart(4, '0')}-${String(month).padStart(2, '0')}`;

  return { day, month, year, isoDate, monthKey };
}

export function parseFallbackDate(fallbackDateLike, defaultYear) {
  if (!fallbackDateLike && fallbackDateLike !== 0) return null;

  if (typeof fallbackDateLike === 'number' && Number.isFinite(fallbackDateLike)) {
    const milliseconds = fallbackDateLike < 1e12 ? fallbackDateLike * 1000 : fallbackDateLike;
    const date = new Date(milliseconds);
    if (Number.isNaN(date.getTime())) return null;
    return dateInfoFromParts(date.getUTCDate(), date.getUTCMonth() + 1, date.getUTCFullYear());
  }

  const date = new Date(fallbackDateLike);
  if (Number.isNaN(date.getTime())) return null;
  return dateInfoFromParts(date.getUTCDate(), date.getUTCMonth() + 1, date.getUTCFullYear() || defaultYear);
}

export function parseDate(firstLine, defaultYear) {
  const match = String(firstLine || '').trim().match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3] ? Number(match[3].length === 2 ? `20${match[3]}` : match[3]) : defaultYear;

  return dateInfoFromParts(day, month, year);
}

export function parseFullReportMessage(text, defaultYear, fallbackDateLike = null) {
  const sourceText = String(text || '').replace(/\r/g, '');
  const entries = createLineEntries(sourceText);
  const meaningfulEntries = entries.filter((entry) => entry.trimmed);

  if (!meaningfulEntries.length) {
    return { ok: false, errors: ['Сообщение пустое.'], issues: [] };
  }

  const explicitDate = parseDate(meaningfulEntries[0].trimmed, defaultYear);
  const fallbackDate = parseFallbackDate(fallbackDateLike, defaultYear);
  const dateInfo = explicitDate || fallbackDate;
  if (!dateInfo) {
    const issue = buildDateIssue(meaningfulEntries);
    return {
      ok: false,
      errors: [issue.message],
      issues: [issue]
    };
  }

  const errors = [];
  const issues = [];
  const fields = {};
  const fieldMetaByKey = {};

  for (const field of REQUIRED_FIELDS) {
    const meta = extractLabelValue(entries, field.label);
    fieldMetaByKey[field.key] = meta;
    const numericValue = toNumber(meta.value);
    if (!Number.isFinite(numericValue)) {
      const issue = buildFieldIssue(
        entries,
        field,
        meta,
        meta.labelLineIndex >= 0
          ? `Не удалось прочитать значение поля "${field.label}".`
          : `Не найдено поле "${field.label}".`
      );
      issues.push(issue);
      errors.push(issue.message);
    } else {
      fields[field.key] = numericValue;
    }
  }

  const expensesHeaderEntry = entries.find((entry) => entry.trimmed.toLowerCase() === 'расходы:') || null;
  const expenseTotalLineIndex = fieldMetaByKey.expenseTotal?.labelLineIndex ?? -1;

  if (!expensesHeaderEntry) {
    errors.push('Не найден блок "Расходы:".');
  }

  const expenses = [];
  if (expensesHeaderEntry && expenseTotalLineIndex >= 0) {
    const expenseEntries = entries.filter(
      (entry) => entry.index > expensesHeaderEntry.index && entry.index < expenseTotalLineIndex && entry.trimmed
    );

    for (const expenseEntry of expenseEntries) {
      const parsedExpense = parseExpenseLine(expenseEntry.trimmed, { lineIndex: expenseEntry.index });
      if (parsedExpense.error) {
        issues.push(parsedExpense.issue);
        errors.push(parsedExpense.error);
      } else {
        expenses.push(parsedExpense);
      }
    }
  }

  if (errors.length) {
    return {
      ok: false,
      errors: [...new Set(errors)],
      issues
    };
  }

  const computedTotalIncome = fields.cash + fields.rubles + fields.bankCards + fields.yandexDelivery + fields.qrCode;
  const computedExpenseTotal = expenses.reduce((sum, item) => sum + item.amount, 0);
  const validationErrors = [];

  if (Math.abs(computedTotalIncome - fields.totalIncome) > 0.0001) {
    const issue = buildTotalMismatchIssue(
      fieldMetaByKey.totalIncome,
      'Общая',
      fields.totalIncome,
      computedTotalIncome
    );
    issues.push(issue);
    validationErrors.push(issue.message);
  }

  if (Math.abs(computedExpenseTotal - fields.expenseTotal) > 0.0001) {
    const issue = buildTotalMismatchIssue(
      fieldMetaByKey.expenseTotal,
      'Итого расход',
      fields.expenseTotal,
      computedExpenseTotal
    );
    issues.push(issue);
    validationErrors.push(issue.message);
  }

  if (validationErrors.length) {
    return { ok: false, errors: validationErrors, issues };
  }

  return {
    ok: true,
    mode: 'full_report',
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

function looksLikeFullReport(lines) {
  const reportLabels = [
    'наличные',
    'рубли',
    'банковские карты',
    'яндекс доставка',
    'нет монет',
    'общая',
    'расходы:',
    'итого расход',
    'итог'
  ];

  return lines.some((line) => {
    const normalized = String(line || '').trim().toLowerCase();
    return reportLabels.some((label) => normalized === label || normalized.startsWith(`${label}:`));
  });
}

export function parseExpenseOnlyMessage(text, defaultYear, fallbackDateLike = null) {
  const sourceText = String(text || '').replace(/\r/g, '');
  const entries = createLineEntries(sourceText);
  const meaningfulEntries = entries.filter((entry) => entry.trimmed);

  if (!meaningfulEntries.length) {
    return { ok: false, errors: ['Сообщение пустое.'], issues: [] };
  }

  const explicitDate = parseDate(meaningfulEntries[0].trimmed, defaultYear);
  const fallbackDate = parseFallbackDate(fallbackDateLike, defaultYear);
  const dateInfo = explicitDate || fallbackDate;
  if (!dateInfo) {
    const issue = buildDateIssue(meaningfulEntries);
    return {
      ok: false,
      errors: ['Не удалось определить дату расхода. Укажи дату первой строкой в формате ДД.ММ.'],
      issues: [issue]
    };
  }

  const expenseEntries = (explicitDate ? meaningfulEntries.slice(1) : meaningfulEntries).filter((entry) => entry.trimmed);
  if (!expenseEntries.length) {
    return {
      ok: false,
      errors: ['После даты не найдено ни одной строки расхода. Используй формат: Андрей 50 аванс (зп).'],
      issues: []
    };
  }

  const expenses = [];
  const errors = [];
  const issues = [];

  for (const expenseEntry of expenseEntries) {
    const parsedExpense = parseExpenseLine(expenseEntry.trimmed, { lineIndex: expenseEntry.index });
    if (parsedExpense.error) {
      issues.push(parsedExpense.issue);
      errors.push(parsedExpense.error);
    } else {
      expenses.push(parsedExpense);
    }
  }

  if (errors.length) {
    return { ok: false, errors, issues };
  }

  return {
    ok: true,
    mode: 'expense_only',
    date: dateInfo,
    expenses
  };
}

export function parseIncomingTelegramMessage(text, defaultYear, fallbackDateLike = null) {
  const sourceText = String(text || '').replace(/\r/g, '');
  const lines = sourceText.split('\n').map((line) => line.trim()).filter(Boolean);

  if (looksLikeFullReport(lines)) {
    return parseFullReportMessage(text, defaultYear, fallbackDateLike);
  }

  return parseExpenseOnlyMessage(text, defaultYear, fallbackDateLike);
}
