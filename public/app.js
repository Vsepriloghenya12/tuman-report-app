const state = {
  month: new Date().toISOString().slice(0, 7),
  reports: [],
  messages: [],
  selectedDate: null
};

const ALL_CATEGORIES = [
  'закуп', 'зп', 'оплата поставщики', 'маркетинг', 'связь, интернет', 'посуда', 'мбп зал', 'форма',
  'полиграфия', 'доставка', 'услуги контрагентов', 'сервис', 'призы', 'чай', 'покупка оборудования',
  'ремонт оборудования', 'коммунальные услуги', 'аренда жилья', 'крыша', 'развлекательная программа',
  'аренда', 'декор', 'аптека'
];

const loginScreen = document.getElementById('loginScreen');
const appScreen = document.getElementById('appScreen');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const monthPicker = document.getElementById('monthPicker');
const kpiGrid = document.getElementById('kpiGrid');
const cashTable = document.getElementById('cashTable');
const expenseMatrix = document.getElementById('expenseMatrix');
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

function formatDateISO(iso) {
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
}

function getReportByDate(date) {
  return state.reports.find((report) => report.report_date.startsWith(date)) || null;
}

function computeExpenseMap(report) {
  const result = new Map();
  for (const expense of report?.expenses || []) {
    const key = expense.category;
    const current = result.get(key) || 0;
    result.set(key, current + Number(expense.amount || 0));
  }
  return result;
}

function renderKpis() {
  const totals = state.reports.reduce((acc, report) => {
    acc.reports += 1;
    acc.totalIncome += Number(report.total_income || 0);
    acc.expenseTotal += Number(report.expense_total || 0);
    acc.cashLeft += Number(report.cash_left || 0);
    return acc;
  }, { reports: 0, totalIncome: 0, expenseTotal: 0, cashLeft: 0 });

  const items = [
    ['Отчётов за месяц', totals.reports],
    ['Общая выручка', formatMoney(totals.totalIncome)],
    ['Общий расход', formatMoney(totals.expenseTotal)],
    ['Остаток наличных', formatMoney(totals.cashLeft)]
  ];

  kpiGrid.innerHTML = items.map(([label, value]) => `
    <div class="kpi">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
    </div>
  `).join('');
}

function renderCashTable() {
  const rows = [];
  for (let day = 1; day <= 31; day += 1) {
    const isoDate = `${state.month}-${String(day).padStart(2, '0')}`;
    const report = getReportByDate(isoDate);
    rows.push(`
      <tr data-date="${isoDate}" class="${state.selectedDate === isoDate ? 'is-selected' : ''}">
        <td>${String(day).padStart(2, '0')}</td>
        <td>${formatMoney(report?.cash)}</td>
        <td>${formatMoney(report?.rubles)}</td>
        <td>${formatMoney(report?.bank_cards)}</td>
        <td>${formatMoney(report?.yandex_delivery)}</td>
        <td>${formatMoney(report?.qr_code)}</td>
        <td>${formatMoney(report?.total_income)}</td>
        <td>${formatMoney(report?.cash_left)}</td>
        <td>${formatMoney(report?.expense_total)}</td>
      </tr>
    `);
  }

  cashTable.innerHTML = `
    <thead>
      <tr>
        <th>День</th>
        <th>Наличные</th>
        <th>Рубли</th>
        <th>Карты</th>
        <th>Яндекс</th>
        <th>Нет монет</th>
        <th>Общая</th>
        <th>Осталось наличных</th>
        <th>Итого расход</th>
      </tr>
    </thead>
    <tbody>${rows.join('')}</tbody>
  `;

  cashTable.querySelectorAll('tbody tr').forEach((row) => {
    row.addEventListener('click', () => {
      selectDay(row.dataset.date);
    });
  });
}

function renderExpenseMatrix() {
  const headerCells = ALL_CATEGORIES.map((category) => `<th>${category}</th>`).join('');
  const bodyRows = [];

  for (let day = 1; day <= 31; day += 1) {
    const isoDate = `${state.month}-${String(day).padStart(2, '0')}`;
    const report = getReportByDate(isoDate);
    const expenseMap = computeExpenseMap(report);
    const cells = ALL_CATEGORIES.map((category) => `<td>${formatMoney(expenseMap.get(category) || 0)}</td>`).join('');
    bodyRows.push(`<tr><td>${String(day).padStart(2, '0')}</td>${cells}</tr>`);
  }

  expenseMatrix.innerHTML = `
    <thead><tr><th>День</th>${headerCells}</tr></thead>
    <tbody>${bodyRows.join('')}</tbody>
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
  renderCashTable();
  renderDayDetails();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
    const firstReport = state.reports[0];
    state.selectedDate = firstReport?.report_date?.slice(0, 10) || `${state.month}-01`;
  }
  renderKpis();
  renderCashTable();
  renderExpenseMatrix();
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
