import { query, withTransaction } from './db.js';

export async function saveTelegramMessage(message) {
  const sql = `
    INSERT INTO telegram_messages (
      chat_id, message_id, message_kind, telegram_user_id, telegram_username,
      telegram_full_name, text_content, parse_status, parse_error, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
    ON CONFLICT (chat_id, message_id, message_kind)
    DO UPDATE SET
      telegram_user_id = EXCLUDED.telegram_user_id,
      telegram_username = EXCLUDED.telegram_username,
      telegram_full_name = EXCLUDED.telegram_full_name,
      text_content = EXCLUDED.text_content,
      parse_status = EXCLUDED.parse_status,
      parse_error = EXCLUDED.parse_error,
      updated_at = NOW()
    RETURNING *
  `;

  const values = [
    message.chatId,
    message.messageId,
    message.messageKind,
    message.telegramUserId,
    message.telegramUsername,
    message.telegramFullName,
    message.textContent,
    message.parseStatus,
    message.parseError || null
  ];

  const result = await query(sql, values);
  return result.rows[0];
}

export async function updateMessageParseResult(messageRowId, parseStatus, parseError = null) {
  const result = await query(
    `UPDATE telegram_messages SET parse_status = $2, parse_error = $3, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [messageRowId, parseStatus, parseError]
  );
  return result.rows[0] || null;
}

export async function upsertEmployeeReport(parsed, messageRowId) {
  return withTransaction(async (client) => {
    const reportResult = await client.query(
      `
        INSERT INTO daily_reports (
          report_date, report_month, cash, rubles, bank_cards, yandex_delivery,
          qr_code, total_income, cash_left, expense_total, last_message_id,
          source_type, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'employee',NOW())
        ON CONFLICT (report_date)
        DO UPDATE SET
          report_month = EXCLUDED.report_month,
          cash = EXCLUDED.cash,
          rubles = EXCLUDED.rubles,
          bank_cards = EXCLUDED.bank_cards,
          yandex_delivery = EXCLUDED.yandex_delivery,
          qr_code = EXCLUDED.qr_code,
          total_income = EXCLUDED.total_income,
          cash_left = EXCLUDED.cash_left,
          expense_total = EXCLUDED.expense_total,
          last_message_id = EXCLUDED.last_message_id,
          source_type = 'employee',
          updated_at = NOW()
        RETURNING *
      `,
      [
        parsed.date.isoDate,
        parsed.date.monthKey,
        parsed.cash.cash,
        parsed.cash.rubles,
        parsed.cash.bankCards,
        parsed.cash.yandexDelivery,
        parsed.cash.qrCode,
        parsed.cash.totalIncome,
        parsed.cash.cashLeft,
        parsed.cash.expenseTotal,
        messageRowId
      ]
    );

    const report = reportResult.rows[0];

    await client.query(`DELETE FROM expense_lines WHERE report_id = $1 AND source = 'employee'`, [report.id]);

    for (let i = 0; i < parsed.expenses.length; i += 1) {
      const expense = parsed.expenses[i];
      await client.query(
        `
          INSERT INTO expense_lines (report_id, amount, category, comment, source, raw_text, sort_order)
          VALUES ($1,$2,$3,$4,'employee',$5,$6)
        `,
        [report.id, expense.amount, expense.category, expense.comment, expense.rawText || '', i]
      );
    }

    return report;
  });
}

export async function getMonthReports(monthKey) {
  const reportRows = await query(
    `SELECT * FROM daily_reports WHERE report_month = $1 ORDER BY report_date ASC`,
    [monthKey]
  );

  const expenseRows = await query(
    `
      SELECT e.*, r.report_date
      FROM expense_lines e
      INNER JOIN daily_reports r ON r.id = e.report_id
      WHERE r.report_month = $1
      ORDER BY r.report_date ASC, e.sort_order ASC, e.id ASC
    `,
    [monthKey]
  );

  const expensesByReportId = new Map();
  for (const expense of expenseRows.rows) {
    const list = expensesByReportId.get(expense.report_id) || [];
    list.push(expense);
    expensesByReportId.set(expense.report_id, list);
  }

  return reportRows.rows.map((report) => ({
    ...report,
    expenses: expensesByReportId.get(report.id) || []
  }));
}

export async function getReportByDate(isoDate) {
  const reportResult = await query(`SELECT * FROM daily_reports WHERE report_date = $1 LIMIT 1`, [isoDate]);
  if (!reportResult.rows[0]) return null;
  const report = reportResult.rows[0];
  const expensesResult = await query(
    `SELECT * FROM expense_lines WHERE report_id = $1 ORDER BY sort_order ASC, id ASC`,
    [report.id]
  );
  return { ...report, expenses: expensesResult.rows };
}

export async function upsertOwnerCash(isoDate, monthKey, payload) {
  const existing = await getReportByDate(isoDate);
  if (existing) {
    const result = await query(
      `
        UPDATE daily_reports
        SET cash = $2, rubles = $3, bank_cards = $4, yandex_delivery = $5,
            qr_code = $6, total_income = $7, cash_left = $8, expense_total = $9,
            updated_at = NOW()
        WHERE report_date = $1
        RETURNING *
      `,
      [
        isoDate,
        payload.cash,
        payload.rubles,
        payload.bankCards,
        payload.yandexDelivery,
        payload.qrCode,
        payload.totalIncome,
        payload.cashLeft,
        payload.expenseTotal
      ]
    );
    return result.rows[0];
  }

  const result = await query(
    `
      INSERT INTO daily_reports (
        report_date, report_month, cash, rubles, bank_cards, yandex_delivery,
        qr_code, total_income, cash_left, expense_total, source_type
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'owner')
      RETURNING *
    `,
    [
      isoDate,
      monthKey,
      payload.cash,
      payload.rubles,
      payload.bankCards,
      payload.yandexDelivery,
      payload.qrCode,
      payload.totalIncome,
      payload.cashLeft,
      payload.expenseTotal
    ]
  );
  return result.rows[0];
}

export async function addOwnerExpense(isoDate, monthKey, expense) {
  const existing = await getReportByDate(isoDate);
  let reportId = existing?.id;
  if (!reportId) {
    const inserted = await upsertOwnerCash(isoDate, monthKey, {
      cash: 0,
      rubles: 0,
      bankCards: 0,
      yandexDelivery: 0,
      qrCode: 0,
      totalIncome: 0,
      cashLeft: 0,
      expenseTotal: 0
    });
    reportId = inserted.id;
  }

  const sortOrderResult = await query(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort FROM expense_lines WHERE report_id = $1`, [reportId]);
  const nextSort = Number(sortOrderResult.rows[0].next_sort || 0);

  const inserted = await query(
    `
      INSERT INTO expense_lines (report_id, amount, category, comment, source, raw_text, sort_order)
      VALUES ($1,$2,$3,$4,'owner',$5,$6)
      RETURNING *
    `,
    [reportId, expense.amount, expense.category, expense.comment || '', expense.comment || '', nextSort]
  );

  return inserted.rows[0];
}

export async function updateExpense(expenseId, expense) {
  const result = await query(
    `
      UPDATE expense_lines
      SET amount = $2, category = $3, comment = $4, raw_text = $5, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [expenseId, expense.amount, expense.category, expense.comment || '', expense.comment || '']
  );
  return result.rows[0] || null;
}

export async function deleteExpense(expenseId) {
  const result = await query(`DELETE FROM expense_lines WHERE id = $1 RETURNING *`, [expenseId]);
  return result.rows[0] || null;
}

export async function recalculateReportExpenseTotal(reportId) {
  const sumResult = await query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM expense_lines WHERE report_id = $1`,
    [reportId]
  );
  const total = Number(sumResult.rows[0].total || 0);
  await query(`UPDATE daily_reports SET expense_total = $2, updated_at = NOW() WHERE id = $1`, [reportId, total]);
  return total;
}

export async function getRecentMessages(limit = 50) {
  const result = await query(
    `SELECT * FROM telegram_messages ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}


export async function replaceCategoryExpenseCell(isoDate, monthKey, expense) {
  return withTransaction(async (client) => {
    let reportResult = await client.query(`SELECT * FROM daily_reports WHERE report_date = $1 LIMIT 1`, [isoDate]);
    let report = reportResult.rows[0] || null;

    if (!report && !(Number(expense.amount || 0) > 0 || String(expense.comment || '').trim())) {
      return null;
    }

    if (!report) {
      const inserted = await client.query(
        `
          INSERT INTO daily_reports (
            report_date, report_month, cash, rubles, bank_cards, yandex_delivery,
            qr_code, total_income, cash_left, expense_total, source_type
          ) VALUES ($1,$2,0,0,0,0,0,0,0,0,'owner')
          RETURNING *
        `,
        [isoDate, monthKey]
      );
      report = inserted.rows[0];
    }

    await client.query(`DELETE FROM expense_lines WHERE report_id = $1 AND category = $2`, [report.id, expense.category]);

    const amount = Number(expense.amount || 0);
    const comment = String(expense.comment || '').trim();

    if (amount > 0 || comment) {
      const sortOrderResult = await client.query(
        `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort FROM expense_lines WHERE report_id = $1`,
        [report.id]
      );
      const nextSort = Number(sortOrderResult.rows[0].next_sort || 0);
      await client.query(
        `
          INSERT INTO expense_lines (report_id, amount, category, comment, source, raw_text, sort_order)
          VALUES ($1,$2,$3,$4,'owner',$5,$6)
        `,
        [report.id, amount, expense.category, comment, comment, nextSort]
      );
    }

    const sumResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM expense_lines WHERE report_id = $1`,
      [report.id]
    );
    const total = Number(sumResult.rows[0].total || 0);
    await client.query(`UPDATE daily_reports SET expense_total = $2, updated_at = NOW() WHERE id = $1`, [report.id, total]);

    return report;
  });
}
