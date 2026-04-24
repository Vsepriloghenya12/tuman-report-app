import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { ensureDatabase } from './db.js';
import { issueAuthCookie, clearAuthCookie, getAuthConfigurationError, requireOwner, validateCredentials } from './auth.js';
import {
  addOwnerExpense,
  deleteExpense,
  getMonthReports,
  getRecentMessages,
  getReportByDate,
  recalculateReportExpenseTotal,
  replaceCategoryExpenseCell,
  updateExpense,
  upsertOwnerCash
} from './reports.js';
import { ALL_CATEGORIES, normalizeCategory } from './categories.js';
import { buildMonthlyWorkbook } from './excel.js';
import { startTelegram } from './telegram.js';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(config.rootDir, 'public')));

const authConfigurationError = getAuthConfigurationError();
if (authConfigurationError) {
  console.warn(authConfigurationError);
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'tuman-report-app' });
});

app.post('/api/auth/login', (req, res) => {
  const currentAuthConfigurationError = getAuthConfigurationError();
  if (currentAuthConfigurationError) {
    return res.status(503).json({ error: currentAuthConfigurationError });
  }

  const { username, password } = req.body || {};
  if (!validateCredentials(username, password)) {
    return res.status(401).json({ error: 'Неверный логин или пароль.' });
  }
  issueAuthCookie(res);
  return res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res, next) => {
  const currentAuthConfigurationError = getAuthConfigurationError();
  if (currentAuthConfigurationError) {
    return res.status(503).json({ error: currentAuthConfigurationError });
  }
  return requireOwner(req, res, next);
}, (req, res) => {
  res.json({ ok: true, user: req.owner });
});

app.get('/api/months/:month', requireOwner, async (req, res) => {
  try {
    const monthKey = req.params.month;
    const reports = await getMonthReports(monthKey);
    res.json({ ok: true, month: monthKey, reports });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Не удалось загрузить отчёты.' });
  }
});

app.get('/api/reports/:date', requireOwner, async (req, res) => {
  try {
    const report = await getReportByDate(req.params.date);
    if (!report) {
      return res.status(404).json({ error: 'Отчёт не найден.' });
    }
    return res.json({ ok: true, report });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Не удалось загрузить отчёт.' });
  }
});

app.put('/api/reports/:date/cash', requireOwner, async (req, res) => {
  try {
    const isoDate = req.params.date;
    const [year, month] = isoDate.split('-');
    const monthKey = `${year}-${month}`;
    const payload = {
      cash: Number(req.body?.cash || 0),
      rubles: Number(req.body?.rubles || 0),
      bankCards: Number(req.body?.bankCards || 0),
      yandexDelivery: Number(req.body?.yandexDelivery || 0),
      qrCode: Number(req.body?.qrCode || 0),
      totalIncome: Number(req.body?.totalIncome || 0),
      cashLeft: Number(req.body?.cashLeft || 0),
      expenseTotal: Number(req.body?.expenseTotal || 0)
    };
    const report = await upsertOwnerCash(isoDate, monthKey, payload);
    res.json({ ok: true, report });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Не удалось сохранить кассу.' });
  }
});


app.put('/api/reports/:date/expense-cells', requireOwner, async (req, res) => {
  try {
    const category = normalizeCategory(req.body?.category);
    if (!ALL_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Неизвестная категория расхода.' });
    }

    const isoDate = req.params.date;
    const [year, month] = isoDate.split('-');
    const monthKey = `${year}-${month}`;
    const amountRaw = String(req.body?.amount ?? '').trim();
    const amount = amountRaw === '' ? 0 : Number(amountRaw);
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ error: 'Сумма расхода должна быть числом 0 или больше.' });
    }

    const report = await replaceCategoryExpenseCell(isoDate, monthKey, {
      amount,
      category,
      comment: String(req.body?.comment || '').trim()
    });

    return res.json({ ok: true, report });
  } catch (error) {
    if (error?.code === 'EXPENSE_CELL_LOCKED') {
      return res.status(409).json({ error: error.message });
    }
    console.error(error);
    return res.status(500).json({ error: 'Не удалось сохранить ячейку расхода.' });
  }
});

app.post('/api/reports/:date/expenses', requireOwner, async (req, res) => {
  try {
    const category = normalizeCategory(req.body?.category);
    if (!ALL_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Неизвестная категория расхода.' });
    }

    const isoDate = req.params.date;
    const [year, month] = isoDate.split('-');
    const monthKey = `${year}-${month}`;
    const amount = Number(req.body?.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Сумма расхода должна быть больше нуля.' });
    }

    const expense = await addOwnerExpense(isoDate, monthKey, {
      amount,
      category,
      comment: String(req.body?.comment || '').trim()
    });
    await recalculateReportExpenseTotal(expense.report_id);
    res.json({ ok: true, expense });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Не удалось добавить расход.' });
  }
});

app.put('/api/expenses/:expenseId', requireOwner, async (req, res) => {
  try {
    const expenseId = Number(req.params.expenseId);
    const category = normalizeCategory(req.body?.category);
    if (!ALL_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Неизвестная категория расхода.' });
    }
    const amount = Number(req.body?.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Сумма расхода должна быть больше нуля.' });
    }
    const expense = await updateExpense(expenseId, {
      amount,
      category,
      comment: String(req.body?.comment || '').trim()
    });
    if (!expense) {
      return res.status(404).json({ error: 'Расход не найден.' });
    }
    await recalculateReportExpenseTotal(expense.report_id);
    return res.json({ ok: true, expense });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Не удалось обновить расход.' });
  }
});

app.delete('/api/expenses/:expenseId', requireOwner, async (req, res) => {
  try {
    const expenseId = Number(req.params.expenseId);
    const expense = await deleteExpense(expenseId);
    if (!expense) {
      return res.status(404).json({ error: 'Расход не найден.' });
    }
    await recalculateReportExpenseTotal(expense.report_id);
    return res.json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Не удалось удалить расход.' });
  }
});

app.get('/api/messages', requireOwner, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 30), 1), 200);
    const messages = await getRecentMessages(limit);
    res.json({ ok: true, messages });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Не удалось загрузить сообщения.' });
  }
});

app.get('/api/export/:month', requireOwner, async (req, res) => {
  try {
    const monthKey = req.params.month;
    const reports = await getMonthReports(monthKey);
    const filePath = await buildMonthlyWorkbook(reports, monthKey);
    const fileName = `tuman-${monthKey}.xlsx`;
    res.download(filePath, fileName, (downloadError) => {
      if (downloadError) {
        console.error(downloadError);
      }
      fs.promises.unlink(filePath).catch(() => {});
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Не удалось собрать Excel.' });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(config.rootDir, 'public', 'index.html'));
});

async function main() {
  await ensureDatabase();
  await startTelegram(app);

  app.listen(config.port, () => {
    console.log(`Tuman report app started on port ${config.port}`);
  });
}

main().catch((error) => {
  console.error('Failed to start app', error);
  process.exit(1);
});
