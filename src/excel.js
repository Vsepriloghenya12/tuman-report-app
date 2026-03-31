import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { config } from './config.js';
import { ALL_CATEGORIES, CATEGORY_COLUMN_MAP } from './categories.js';

const AMOUNT_COLUMNS = ALL_CATEGORIES.map((category) => CATEGORY_COLUMN_MAP[category].amount);

function toNumber(value) {
  return Number(value || 0);
}

function findExpenseRow(sheet, day) {
  for (let row = 4; row <= 37; row += 1) {
    const value = sheet.getCell(`A${row}`).value;
    if (Number(value) === day) return row;
  }
  return day + 3;
}

function aggregateExpenses(expenses) {
  const map = new Map();
  for (const expense of expenses || []) {
    const category = String(expense.category || '').toLowerCase();
    const existing = map.get(category) || { sum: 0, comments: [] };
    existing.sum += toNumber(expense.amount);
    if (expense.comment) existing.comments.push(String(expense.comment));
    map.set(category, existing);
  }
  return map;
}

function cloneStyle(target, source) {
  target.style = JSON.parse(JSON.stringify(source.style || {}));
}

function setSheetValue(sheet, cellRef, value) {
  sheet.getCell(cellRef).value = value === 0 ? 0 : value || null;
}

function setExpenseFormula(sheet, row) {
  const formula = `=${AMOUNT_COLUMNS.map((column) => `${column}${row}`).join('+')}`;
  sheet.getCell(`AV${row}`).value = { formula };
}

function patchSummary(summarySheet) {
  summarySheet.getCell('B17').value = { formula: '=SUM(B18:B43)' };
  summarySheet.getCell('B33').value = { formula: '=Расход!AJ40' };
  summarySheet.getCell('B34').value = { formula: '=Расход!AL40' };
}

export async function buildMonthlyWorkbook(reports, monthKey) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(config.templatePath);

  const cashSheet = workbook.getWorksheet('Касса');
  const expenseSheet = workbook.getWorksheet('Расход');
  const summarySheet = workbook.getWorksheet('Сводная');

  if (!cashSheet || !expenseSheet) {
    throw new Error('В шаблоне не найдены листы Касса и Расход.');
  }

  // Add "Осталось наличных" column.
  const h1 = cashSheet.getCell('H1');
  h1.value = 'осталось наличных';
  cloneStyle(h1, cashSheet.getCell('G1'));
  cashSheet.getColumn(8).width = cashSheet.getColumn(7).width || 15;

  for (let row = 2; row <= 32; row += 1) {
    cloneStyle(cashSheet.getCell(`H${row}`), cashSheet.getCell(`G${row}`));
  }

  for (const report of reports) {
    const date = new Date(report.report_date);
    const day = date.getUTCDate();
    const cashRow = day + 1;

    setSheetValue(cashSheet, `B${cashRow}`, toNumber(report.cash));
    setSheetValue(cashSheet, `C${cashRow}`, toNumber(report.rubles));
    setSheetValue(cashSheet, `D${cashRow}`, toNumber(report.bank_cards));
    setSheetValue(cashSheet, `E${cashRow}`, toNumber(report.yandex_delivery));
    setSheetValue(cashSheet, `F${cashRow}`, toNumber(report.qr_code));
    setSheetValue(cashSheet, `G${cashRow}`, toNumber(report.total_income));
    setSheetValue(cashSheet, `H${cashRow}`, toNumber(report.cash_left));

    const expenseRow = findExpenseRow(expenseSheet, day);
    const aggregated = aggregateExpenses(report.expenses);

    for (const category of ALL_CATEGORIES) {
      const column = CATEGORY_COLUMN_MAP[category];
      const entry = aggregated.get(category);
      const amount = entry ? entry.sum : null;
      const comment = entry ? entry.comments.join('; ') : null;

      setSheetValue(expenseSheet, `${column.amount}${expenseRow}`, amount);
      expenseSheet.getCell(`${column.comment}${expenseRow}`).value = comment || null;
    }

    setExpenseFormula(expenseSheet, expenseRow);
    expenseSheet.getCell(`A${expenseRow}`).value = day;
  }

  // Monthly totals rows.
  for (const category of ALL_CATEGORIES) {
    const { amount, comment } = CATEGORY_COLUMN_MAP[category];
    expenseSheet.getCell(`${amount}38`).value = { formula: `=SUM(${amount}4:${amount}37)` };
    expenseSheet.getCell(`${comment}38`).value = null;
    expenseSheet.getCell(`${amount}40`).value = { formula: `=${amount}38` };
    expenseSheet.getCell(`${comment}40`).value = null;
  }
  expenseSheet.getCell('AV38').value = { formula: '=SUM(B38, D38, F38, H38, J38, L38, N38, P38, R38, T38, V38, X38, Z38, AB38, AD38, AF38, AH38, AJ38, AL38, AN38, AP38, AR38, AT38)' };
  expenseSheet.getCell('AV40').value = { formula: '=AV38' };

  // Fix all day formulas.
  for (let row = 4; row <= 37; row += 1) {
    setExpenseFormula(expenseSheet, row);
  }

  if (summarySheet) {
    patchSummary(summarySheet);
  }

  const [year, month] = monthKey.split('-');
  const outputPath = path.join(os.tmpdir(), `tuman-report-${year}-${month}.xlsx`);
  await workbook.xlsx.writeFile(outputPath);
  return outputPath;
}
