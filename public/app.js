const state = {
  month: new Date().toISOString().slice(0, 7),
  reports: [],
  messages: [],
  selectedDate: null,
  activeSheet: 'Касса'
};

const CATEGORY_LAYOUT = [
  { key: 'закуп', label: 'Закуп' },
  { key: 'зп', label: 'зп' },
  { key: 'оплата поставщики', label: 'оплата поставщики' },
  { key: 'маркетинг', label: 'маркетинг' },
  { key: 'связь, интернет', label: 'связь, интернет' },
  { key: 'посуда', label: 'посуда' },
  { key: 'мбп зал', label: 'МБП зал' },
  { key: 'форма', label: 'форма' },
  { key: 'полиграфия', label: 'Полиграфия' },
  { key: 'доставка', label: 'доставка' },
  { key: 'услуги контрагентов', label: 'Услуги контрагентов' },
  { key: 'сервис', label: 'сервис' },
  { key: 'призы', label: 'призы' },
  { key: 'чай', label: 'чай' },
  { key: 'покупка оборудования', label: 'Покупка оборудования' },
  { key: 'ремонт оборудования', label: 'Ремонт оборудования' },
  { key: 'коммунальные услуги', label: 'Коммунальные услуги' },
  { key: 'аренда жилья', label: 'Аренда жилья' },
  { key: 'крыша', label: 'крыша' },
  { key: 'развлекательная программа', label: 'Развлекательная программа' },
  { key: 'аренда', label: 'аренда' },
  { key: 'декор', label: 'декор' },
  { key: 'аптека', label: 'аптека' }
];
const ALL_CATEGORIES = CATEGORY_LAYOUT.map((item) => item.key);
const SHEETS = ['Касса', 'Расход', 'Сводная', 'зп'];

const loginScreen = document.getElementById('loginScreen');
const appScreen = document.getElementById('appScreen');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const monthPicker = document.getElementById('monthPicker');
const kpiStrip = document.getElementById('kpiStrip');
const sheetTabs = document.getElementById('sheetTabs');
const sheetViewport = document.getElementById('sheetViewport');
const messagesList = document.getElementById('messagesList');
const dayTitle = document.getElementById('dayTitle');
const cashForm = document.getElementById('cashForm');
const expenseForm = document.getElementById('expenseForm');
const expensesList = document.getElementById('expensesList');

monthPicker.value = state.month;

for (const category of ALL_CATEGORIES) {
  const option = document.createElement('option');
  option.value = category;
  option.textContent = category;
  expenseForm.category.append(option);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  if (response.status === 401) {
    showLogin();
    throw new Error('Нужна авторизация.');
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: 'Ошибка запроса.' }));
    throw new Error(payload.error || 'Ошибка запроса.');
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response;
}

function showLogin() {
  loginScreen.classList.remove('hidden');
  appScreen.classList.add('hidden');
}

function showApp() {
  loginScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('ru-RU');
}

function formatSheetMoney(value) {
  const num = Number(value || 0);
  return num ? formatMoney(num) : '';
}

function formatDateISO(iso) {
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
}

function getDaysCount(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

function isoDateFromDay(day) {
  return `${state.month}-${String(day).padStart(2, '0')}`;
}

function getReportByDate(date) {
  return state.reports.find((report) => report.report_date.startsWith(date)) || null;
}

function getReportByDay(day) {
  return getReportByDate(isoDateFromDay(day));
}

function getReportExpenseGroups(report) {
  const groups = new Map();
  for (const expense of report?.expenses || []) {
    const current = groups.get(expense.category) || {
      amount: 0,
      comments: [],
      rowCount: 0,
      hasEmployee: false,
      hasOwner: false
    };
    current.amount += Number(expense.amount || 0);
    if (expense.comment) current.comments.push(expense.comment);
    current.rowCount += 1;
    current.hasEmployee = current.hasEmployee || expense.source === 'employee';
    current.hasOwner = current.hasOwner || expense.source === 'owner';
    groups.set(expense.category, current);
  }
  return groups;
}

function isExpenseCellEditable(group) {
  return !group || (group.rowCount === 1 && group.hasOwner && !group.hasEmployee);
}

function sumCategoryMonth(category) {
  return state.reports.reduce((total, report) => {
    for (const expense of report.expenses || []) {
      if (expense.category === category) total += Number(expense.amount || 0);
    }
    return total;
  }, 0);
}

function sumField(field) {
  return state.reports.reduce((total, report) => total + Number(report[field] || 0), 0);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function editableNumberValue(value) {
  return value == null || value === '' ? '' : String(value);
}

function renderTopStrip() {
  const totalIncome = sumField('total_income');
  const totalExpense = sumField('expense_total');
  const cashLeft = sumField('cash_left');
  const lastReport = [...state.reports].sort((a, b) => a.report_date.localeCompare(b.report_date)).at(-1);
  const items = [
    ['Дней с отчётом', state.reports.length],
    ['Общая выручка', formatMoney(totalIncome)],
    ['Общий расход', formatMoney(totalExpense)],
    ['Последний остаток наличных', formatMoney(lastReport?.cash_left || 0)],
    ['Остаток наличных за месяц', formatMoney(cashLeft)]
  ];

  kpiStrip.innerHTML = items.map(([label, value]) => `
    <div class="mini-kpi">
      <div class="mini-kpi__label">${label}</div>
      <div class="mini-kpi__value">${value}</div>
    </div>
  `).join('');
}

function renderSheetTabs() {
  sheetTabs.innerHTML = SHEETS.map((sheet) => `
    <button class="sheet-tab ${sheet === state.activeSheet ? 'is-active' : ''}" data-sheet="${sheet}">${sheet}</button>
  `).join('');

  sheetTabs.querySelectorAll('button[data-sheet]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeSheet = button.dataset.sheet;
      renderSheetTabs();
      renderSheet();
    });
  });
}

function bindSelectableRows() {
  sheetViewport.querySelectorAll('tr[data-date]').forEach((row) => {
    row.addEventListener('click', (event) => {
      if (event.target.closest('input, select, textarea, button')) return;
      selectDay(row.dataset.date);
    });
  });
}

function renderSheet() {
  if (state.activeSheet === 'Касса') renderCashSheet();
  if (state.activeSheet === 'Расход') renderExpenseSheet();
  if (state.activeSheet === 'Сводная') renderSummarySheet();
  if (state.activeSheet === 'зп') renderSalarySheet();
}


async function saveCashInlineRow(isoDate) {
  const row = sheetViewport.querySelector(`tr[data-date="${isoDate}"]`);
  if (!row) return;
  row.classList.add('is-saving');
  try {
    await api(`/api/reports/${isoDate}/cash`, {
      method: 'PUT',
      body: JSON.stringify({
        cash: row.querySelector('[data-field="cash"]')?.value || 0,
        rubles: row.querySelector('[data-field="rubles"]')?.value || 0,
        bankCards: row.querySelector('[data-field="bankCards"]')?.value || 0,
        yandexDelivery: row.querySelector('[data-field="yandexDelivery"]')?.value || 0,
        qrCode: row.querySelector('[data-field="qrCode"]')?.value || 0,
        totalIncome: row.querySelector('[data-field="totalIncome"]')?.value || 0,
        cashLeft: row.querySelector('[data-field="cashLeft"]')?.value || 0,
        expenseTotal: getReportByDate(isoDate)?.expense_total || 0
      })
    });
    await loadMonth();
    selectDay(isoDate);
  } catch (error) {
    row.classList.remove('is-saving');
    alert(error.message);
  }
}

async function saveExpenseInlineCell(isoDate, category) {
  const amountInput = sheetViewport.querySelector(`[data-inline-kind="expense-amount"][data-date="${isoDate}"][data-category="${category}"]`);
  const commentInput = sheetViewport.querySelector(`[data-inline-kind="expense-comment"][data-date="${isoDate}"][data-category="${category}"]`);
  if (!amountInput || !commentInput) return;
  const row = amountInput.closest('tr');
  row?.classList.add('is-saving');
  try {
    await api(`/api/reports/${isoDate}/expense-cells`, {
      method: 'PUT',
      body: JSON.stringify({
        category,
        amount: amountInput.value,
        comment: commentInput.value
      })
    });
    await loadMonth();
    selectDay(isoDate);
  } catch (error) {
    row?.classList.remove('is-saving');
    alert(error.message);
  }
}

function bindInlineEditors() {
  sheetViewport.querySelectorAll('.cell-input').forEach((input) => {
    input.addEventListener('click', (event) => event.stopPropagation());
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      }
    });
  });

  sheetViewport.querySelectorAll('[data-inline-kind="cash"]').forEach((input) => {
    input.addEventListener('blur', () => saveCashInlineRow(input.dataset.date));
  });

  sheetViewport.querySelectorAll('[data-inline-kind="expense-amount"], [data-inline-kind="expense-comment"]').forEach((input) => {
    input.addEventListener('blur', () => saveExpenseInlineCell(input.dataset.date, input.dataset.category));
  });
}

function renderCashSheet() {
  const daysCount = getDaysCount(state.month);
  const rows = [];
  for (let day = 1; day <= daysCount; day += 1) {
    const isoDate = isoDateFromDay(day);
    const report = getReportByDay(day);
    rows.push(`
      <tr data-date="${isoDate}" class="${state.selectedDate === isoDate ? 'is-selected' : ''}">
        <th class="row-head">${day}</th>
        <td><input class="cell-input cell-input--number" data-inline-kind="cash" data-date="${isoDate}" data-field="cash" type="number" step="0.01" value="${escapeAttr(editableNumberValue(report?.cash))}" /></td>
        <td><input class="cell-input cell-input--number" data-inline-kind="cash" data-date="${isoDate}" data-field="rubles" type="number" step="0.01" value="${escapeAttr(editableNumberValue(report?.rubles))}" /></td>
        <td><input class="cell-input cell-input--number" data-inline-kind="cash" data-date="${isoDate}" data-field="bankCards" type="number" step="0.01" value="${escapeAttr(editableNumberValue(report?.bank_cards))}" /></td>
        <td><input class="cell-input cell-input--number" data-inline-kind="cash" data-date="${isoDate}" data-field="yandexDelivery" type="number" step="0.01" value="${escapeAttr(editableNumberValue(report?.yandex_delivery))}" /></td>
        <td><input class="cell-input cell-input--number" data-inline-kind="cash" data-date="${isoDate}" data-field="qrCode" type="number" step="0.01" value="${escapeAttr(editableNumberValue(report?.qr_code))}" /></td>
        <td><input class="cell-input cell-input--number" data-inline-kind="cash" data-date="${isoDate}" data-field="totalIncome" type="number" step="0.01" value="${escapeAttr(editableNumberValue(report?.total_income))}" /></td>
        <td><input class="cell-input cell-input--number" data-inline-kind="cash" data-date="${isoDate}" data-field="cashLeft" type="number" step="0.01" value="${escapeAttr(editableNumberValue(report?.cash_left))}" /></td>
      </tr>
    `);
  }

  rows.push(`
    <tr class="totals-row">
      <th class="row-head">Итого</th>
      <td>${formatSheetMoney(sumField('cash'))}</td>
      <td>${formatSheetMoney(sumField('rubles'))}</td>
      <td>${formatSheetMoney(sumField('bank_cards'))}</td>
      <td>${formatSheetMoney(sumField('yandex_delivery'))}</td>
      <td>${formatSheetMoney(sumField('qr_code'))}</td>
      <td>${formatSheetMoney(sumField('total_income'))}</td>
      <td>${formatSheetMoney(sumField('cash_left'))}</td>
    </tr>
  `);

  sheetViewport.innerHTML = `
    <div class="sheet-caption">Лист «Касса» — формат как в Excel. Последняя колонка: «Осталось наличных».</div>
    <div class="sheet-scroll">
      <table class="excel-table excel-table--cash">
        <thead>
          <tr>
            <th class="corner-cell">День</th>
            <th>наличные</th>
            <th>рубли</th>
            <th>бн</th>
            <th>яндекс</th>
            <th>кр код</th>
            <th>общая</th>
            <th>осталось наличных</th>
          </tr>
        </thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>
  `;
  bindSelectableRows();
  bindInlineEditors();
}

function renderExpenseSheet() {
  const daysCount = getDaysCount(state.month);
  const rows = [];
  for (let day = 1; day <= daysCount; day += 1) {
    const isoDate = isoDateFromDay(day);
    const report = getReportByDay(day);
    const groups = getReportExpenseGroups(report);
    const cells = CATEGORY_LAYOUT.map((category) => {
      const item = groups.get(category.key);
      const commentValue = item?.comments?.join('; ') || '';
      if (!isExpenseCellEditable(item)) {
        return `
          <td class="cell-readonly">${formatSheetMoney(item?.amount)}</td>
          <td class="comment-cell cell-readonly" title="Ячейка собрана из нескольких строк. Чтобы не потерять детали, редактируй расходы ниже по списку.">${escapeHtml(commentValue)}</td>
        `;
      }
      return `
        <td><input class="cell-input cell-input--number" data-inline-kind="expense-amount" data-date="${isoDate}" data-category="${escapeAttr(category.key)}" type="number" step="0.01" value="${escapeAttr(editableNumberValue(item?.amount))}" /></td>
        <td class="comment-cell"><input class="cell-input cell-input--text" data-inline-kind="expense-comment" data-date="${isoDate}" data-category="${escapeAttr(category.key)}" type="text" value="${escapeAttr(commentValue)}" /></td>
      `;
    }).join('');

    rows.push(`
      <tr data-date="${isoDate}" class="${state.selectedDate === isoDate ? 'is-selected' : ''}">
        <th class="row-head">${day}</th>
        ${cells}
        <td>${formatSheetMoney(report?.expense_total)}</td>
      </tr>
    `);
  }

  const totalCells = CATEGORY_LAYOUT.map((category) => `
    <td>${formatSheetMoney(sumCategoryMonth(category.key))}</td>
    <td></td>
  `).join('');

  sheetViewport.innerHTML = `
    <div class="sheet-caption">Лист «Расход» — те же пары колонок: сумма / комментарий. Ячейки, собранные из нескольких строк или из сообщений сотрудников, защищены от inline-правки: редактируй их через список расходов ниже.</div>
    <div class="sheet-scroll">
      <table class="excel-table excel-table--expense">
        <thead>
          <tr>
            <th rowspan="2" class="corner-cell">Дата</th>
            ${CATEGORY_LAYOUT.map((category) => `<th colspan="2">${category.label}</th>`).join('')}
            <th rowspan="2">итого</th>
          </tr>
          <tr>
            ${CATEGORY_LAYOUT.map(() => '<th>Сумма</th><th>Комментарий</th>').join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.join('')}
          <tr class="totals-row">
            <th class="row-head">Итого</th>
            ${totalCells}
            <td>${formatSheetMoney(sumField('expense_total'))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
  bindSelectableRows();
  bindInlineEditors();
}

function ratio(value, base) {
  return base ? (Number(value || 0) / base).toLocaleString('ru-RU', { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '';
}

function renderSummarySheet() {
  const revenue = sumField('total_income');
  const expense = sumField('expense_total');
  const lastCashLeft = [...state.reports].sort((a, b) => a.report_date.localeCompare(b.report_date)).at(-1)?.cash_left || 0;
  const serviceTea = sumCategoryMonth('сервис') + sumCategoryMonth('чай');
  const summaryRows = [
    ['Выручка', revenue, ''],
    ['Расход', expense, ratio(expense, revenue)],
    ['Закуп', sumCategoryMonth('закуп'), ratio(sumCategoryMonth('закуп'), revenue)],
    ['доставка', sumCategoryMonth('доставка'), ratio(sumCategoryMonth('доставка'), revenue)],
    ['зп', sumCategoryMonth('зп'), ratio(sumCategoryMonth('зп'), revenue)],
    ['оплата поставщики', sumCategoryMonth('оплата поставщики'), ratio(sumCategoryMonth('оплата поставщики'), revenue)],
    ['услуги контрагентов', sumCategoryMonth('услуги контрагентов'), ratio(sumCategoryMonth('услуги контрагентов'), revenue)],
    ['Цветы и декор', sumCategoryMonth('декор'), ratio(sumCategoryMonth('декор'), revenue)],
    ['МБП зал', sumCategoryMonth('мбп зал'), ratio(sumCategoryMonth('мбп зал'), revenue)],
    ['Связь интернет', sumCategoryMonth('связь, интернет'), ratio(sumCategoryMonth('связь, интернет'), revenue)],
    ['Полиграфия', sumCategoryMonth('полиграфия'), ratio(sumCategoryMonth('полиграфия'), revenue)],
    ['развлекательная программа', sumCategoryMonth('развлекательная программа'), ratio(sumCategoryMonth('развлекательная программа'), revenue)],
    ['форма', sumCategoryMonth('форма'), ratio(sumCategoryMonth('форма'), revenue)],
    ['Покупка оборудования', sumCategoryMonth('покупка оборудования'), ratio(sumCategoryMonth('покупка оборудования'), revenue)],
    ['Ремонт оборудования', sumCategoryMonth('ремонт оборудования'), ratio(sumCategoryMonth('ремонт оборудования'), revenue)],
    ['Коммунальные расходы', sumCategoryMonth('коммунальные услуги'), ratio(sumCategoryMonth('коммунальные услуги'), revenue)],
    ['Аренда жилья', sumCategoryMonth('аренда жилья'), ratio(sumCategoryMonth('аренда жилья'), revenue)],
    ['Крыша', sumCategoryMonth('крыша'), ratio(sumCategoryMonth('крыша'), revenue)],
    ['маркетинг', sumCategoryMonth('маркетинг'), ratio(sumCategoryMonth('маркетинг'), revenue)],
    ['Услуги эквайринга', 0, ''],
    ['сервис+чай', serviceTea, ratio(serviceTea, revenue)],
    ['Аренда', sumCategoryMonth('аренда'), ratio(sumCategoryMonth('аренда'), revenue)],
    ['посуда', sumCategoryMonth('посуда'), ratio(sumCategoryMonth('посуда'), revenue)],
    ['аптека', sumCategoryMonth('аптека'), ratio(sumCategoryMonth('аптека'), revenue)]
  ];

  const rightRows = [
    ['Баланс', formatSheetMoney(lastCashLeft)],
    ['Активы', ''],
    ['остаток наличных', formatSheetMoney(lastCashLeft)],
    ['дней с отчётом', String(state.reports.length)],
    ['общая выручка', formatSheetMoney(revenue)],
    ['общий расход', formatSheetMoney(expense)],
    ['Итого Активы', formatSheetMoney(lastCashLeft)],
    ['Пассивы', ''],
    ['зп', formatSheetMoney(sumCategoryMonth('зп'))],
    ['поставщики', formatSheetMoney(sumCategoryMonth('оплата поставщики'))],
    ['аренда', formatSheetMoney(sumCategoryMonth('аренда'))],
    ['Итого Пассивы', formatSheetMoney(sumCategoryMonth('зп') + sumCategoryMonth('оплата поставщики') + sumCategoryMonth('аренда'))]
  ];

  sheetViewport.innerHTML = `
    <div class="sheet-caption">Лист «Сводная» повторяет структуру исходной таблицы и собирает основные суммы из отчётов месяца.</div>
    <div class="summary-grid">
      <div class="sheet-scroll">
        <table class="excel-table excel-table--summary">
          <thead>
            <tr><th colspan="3">туман</th></tr>
            <tr><th>Показатель</th><th>Сумма</th><th>%</th></tr>
          </thead>
          <tbody>
            ${summaryRows.map((row) => `
              <tr>
                <th class="summary-label">${row[0]}</th>
                <td>${formatSheetMoney(row[1])}</td>
                <td>${row[2]}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="sheet-scroll">
        <table class="excel-table excel-table--summary-side">
          <thead>
            <tr><th colspan="2">Баланс / Активы / Пассивы</th></tr>
            <tr><th>Показатель</th><th>Сумма</th></tr>
          </thead>
          <tbody>
            ${rightRows.map((row) => `
              <tr>
                <th class="summary-label">${row[0]}</th>
                <td>${row[1]}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderSalarySheet() {
  const peopleMap = new Map();
  for (const report of state.reports) {
    const day = Number(report.report_date.slice(-2));
    for (const expense of report.expenses || []) {
      if (expense.category !== 'зп') continue;
      const name = (expense.comment || 'Без имени').trim();
      const byDay = peopleMap.get(name) || new Map();
      byDay.set(day, (byDay.get(day) || 0) + Number(expense.amount || 0));
      peopleMap.set(name, byDay);
    }
  }

  const people = [...peopleMap.keys()].sort((a, b) => a.localeCompare(b, 'ru'));
  const daysCount = getDaysCount(state.month);
  const rows = [];

  for (let day = 1; day <= daysCount; day += 1) {
    const cells = people.map((name) => `<td>${formatSheetMoney(peopleMap.get(name)?.get(day) || 0)}</td>`).join('');
    rows.push(`<tr><th class="row-head">${day}</th>${cells}<td>${formatSheetMoney((getReportByDay(day)?.expenses || []).filter((expense) => expense.category === 'зп').reduce((sum, expense) => sum + Number(expense.amount || 0), 0))}</td></tr>`);
  }

  const totals = people.map((name) => {
    const total = [...(peopleMap.get(name)?.values() || [])].reduce((sum, value) => sum + value, 0);
    return `<td>${formatSheetMoney(total)}</td>`;
  }).join('');

  sheetViewport.innerHTML = `
    <div class="sheet-caption">Лист «зп» строится по выплатам категории «зп» и комментариям-именам.</div>
    <div class="sheet-scroll">
      <table class="excel-table excel-table--salary">
        <thead>
          <tr>
            <th class="corner-cell">День</th>
            ${people.length ? people.map((name) => `<th>${escapeHtml(name)}</th>`).join('') : '<th>Нет данных по зарплатам</th>'}
            <th>Итого</th>
          </tr>
        </thead>
        <tbody>
          ${rows.join('')}
          <tr class="totals-row">
            <th class="row-head">Итого</th>
            ${totals || '<td></td>'}
            <td>${formatSheetMoney(sumCategoryMonth('зп'))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderMessages() {
  if (!state.messages.length) {
    messagesList.innerHTML = '<div class="muted">Сообщений пока нет.</div>';
    return;
  }

  messagesList.innerHTML = state.messages.map((message) => `
    <div class="message-card" data-status="${message.parse_status}">
      <div class="message-top">
        <strong>${message.telegram_full_name || message.telegram_username || 'Без имени'}</strong>
        <span class="badge ${message.parse_status === 'valid' ? 'badge--valid' : 'badge--invalid'}">${message.parse_status}</span>
      </div>
      <div class="muted">chat: ${message.chat_id} · message: ${message.message_id}</div>
      <pre>${escapeHtml(message.text_content)}</pre>
      ${message.parse_error ? `<div class="error-box">${escapeHtml(message.parse_error)}</div>` : ''}
    </div>
  `).join('');
}

function renderDayDetails() {
  if (!state.selectedDate) {
    dayTitle.textContent = 'День не выбран';
    cashForm.classList.add('hidden');
    expenseForm.classList.add('hidden');
    expensesList.innerHTML = '<div class="muted">Выбери день, чтобы увидеть строки расходов.</div>';
    return;
  }

  const report = getReportByDate(state.selectedDate);
  dayTitle.textContent = `День ${formatDateISO(state.selectedDate)}`;
  cashForm.classList.remove('hidden');
  expenseForm.classList.remove('hidden');

  cashForm.cash.value = report?.cash || 0;
  cashForm.rubles.value = report?.rubles || 0;
  cashForm.bankCards.value = report?.bank_cards || 0;
  cashForm.yandexDelivery.value = report?.yandex_delivery || 0;
  cashForm.qrCode.value = report?.qr_code || 0;
  cashForm.totalIncome.value = report?.total_income || 0;
  cashForm.cashLeft.value = report?.cash_left || 0;
  cashForm.expenseTotal.value = report?.expense_total || 0;

  const items = report?.expenses || [];
  if (!items.length) {
    expensesList.innerHTML = '<div class="muted">За этот день расходов пока нет.</div>';
    return;
  }

  expensesList.innerHTML = items.map((expense) => `
    <div class="expense-item">
      <div class="expense-top">
        <strong>${formatMoney(expense.amount)} — ${expense.category}</strong>
        <div class="actions">
          <button class="link-button" data-action="edit" data-id="${expense.id}">Изменить</button>
          <button class="link-button" data-action="delete" data-id="${expense.id}">Удалить</button>
        </div>
      </div>
      <div class="muted">${escapeHtml(expense.comment || '')} · источник: ${expense.source}</div>
    </div>
  `).join('');

  expensesList.querySelectorAll('button[data-action="delete"]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await api(`/api/expenses/${button.dataset.id}`, { method: 'DELETE' });
        await loadMonth();
      } catch (error) {
        alert(error.message);
      }
    });
  });

  expensesList.querySelectorAll('button[data-action="edit"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const expense = items.find((item) => String(item.id) === button.dataset.id);
      if (!expense) return;
      const amount = prompt('Новая сумма', expense.amount);
      if (amount == null) return;
      const comment = prompt('Новый комментарий', expense.comment || '');
      if (comment == null) return;
      const category = prompt('Новая категория', expense.category);
      if (category == null) return;
      try {
        await api(`/api/expenses/${expense.id}`, {
          method: 'PUT',
          body: JSON.stringify({ amount, comment, category })
        });
        await loadMonth();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function selectDay(isoDate) {
  state.selectedDate = isoDate;
  renderSheet();
  renderDayDetails();
}

async function loadMessages() {
  const payload = await api('/api/messages?limit=30');
  state.messages = payload.messages;
  renderMessages();
}

async function loadMonth() {
  const payload = await api(`/api/months/${state.month}`);
  state.reports = payload.reports;
  if (!state.selectedDate) {
    state.selectedDate = `${state.month}-01`;
  }
  renderTopStrip();
  renderSheetTabs();
  renderSheet();
  renderDayDetails();
  await loadMessages();
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.classList.add('hidden');
  try {
    await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: loginForm.username.value.trim(),
        password: loginForm.password.value
      })
    });
    showApp();
    await loadMonth();
  } catch (error) {
    loginError.textContent = error.message;
    loginError.classList.remove('hidden');
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  showLogin();
});

document.getElementById('refreshBtn').addEventListener('click', () => loadMonth().catch((error) => alert(error.message)));
monthPicker.addEventListener('change', () => {
  state.month = monthPicker.value;
  state.selectedDate = `${state.month}-01`;
  loadMonth().catch((error) => alert(error.message));
});

document.getElementById('downloadBtn').addEventListener('click', async () => {
  try {
    const response = await api(`/api/export/${state.month}`);
    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `tuman-${state.month}.xlsx`;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (error) {
    alert(error.message);
  }
});

cashForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.selectedDate) return;
  try {
    await api(`/api/reports/${state.selectedDate}/cash`, {
      method: 'PUT',
      body: JSON.stringify({
        cash: cashForm.cash.value,
        rubles: cashForm.rubles.value,
        bankCards: cashForm.bankCards.value,
        yandexDelivery: cashForm.yandexDelivery.value,
        qrCode: cashForm.qrCode.value,
        totalIncome: cashForm.totalIncome.value,
        cashLeft: cashForm.cashLeft.value,
        expenseTotal: cashForm.expenseTotal.value
      })
    });
    await loadMonth();
  } catch (error) {
    alert(error.message);
  }
});

expenseForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.selectedDate) return;
  try {
    await api(`/api/reports/${state.selectedDate}/expenses`, {
      method: 'POST',
      body: JSON.stringify({
        amount: expenseForm.amount.value,
        category: expenseForm.category.value,
        comment: expenseForm.comment.value
      })
    });
    expenseForm.reset();
    await loadMonth();
  } catch (error) {
    alert(error.message);
  }
});

async function bootstrap() {
  try {
    await api('/api/auth/me');
    showApp();
    await loadMonth();
  } catch {
    showLogin();
  }
}

bootstrap();
