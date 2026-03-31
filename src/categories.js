export const ALL_CATEGORIES = [
  'закуп',
  'зп',
  'оплата поставщики',
  'маркетинг',
  'связь, интернет',
  'посуда',
  'мбп зал',
  'форма',
  'полиграфия',
  'доставка',
  'услуги контрагентов',
  'сервис',
  'призы',
  'чай',
  'покупка оборудования',
  'ремонт оборудования',
  'коммунальные услуги',
  'аренда жилья',
  'крыша',
  'развлекательная программа',
  'аренда',
  'декор',
  'аптека'
];

export const MESSAGE_CATEGORIES = [...ALL_CATEGORIES];

export const CATEGORY_ALIASES = {
  'связь интернет': 'связь, интернет',
  'связь,интернет': 'связь, интернет',
  'интернет': 'связь, интернет',
  'связь': 'связь, интернет',
  'мбп': 'мбп зал',
  'контрагенты': 'услуги контрагентов',
  'услуги контрагента': 'услуги контрагентов',
  'ремонт оборудывания': 'ремонт оборудования',
  'оборудование ремонт': 'ремонт оборудования',
  'коммуналка': 'коммунальные услуги',
  'развлекательная': 'развлекательная программа',
  'дост': 'доставка',
  'аванс': 'зп',
  'зарплата': 'зп'
};

export const CATEGORY_COLUMN_MAP = {
  'закуп': { amount: 'B', comment: 'C', summaryLabel: 'Закуп' },
  'зп': { amount: 'D', comment: 'E', summaryLabel: 'зп' },
  'оплата поставщики': { amount: 'F', comment: 'G', summaryLabel: 'оплата поставщики' },
  'маркетинг': { amount: 'H', comment: 'I', summaryLabel: 'маркетинг' },
  'связь, интернет': { amount: 'J', comment: 'K', summaryLabel: 'Связь интернет' },
  'посуда': { amount: 'L', comment: 'M', summaryLabel: 'посуда' },
  'мбп зал': { amount: 'N', comment: 'O', summaryLabel: 'МБП зал' },
  'форма': { amount: 'P', comment: 'Q', summaryLabel: 'форма' },
  'полиграфия': { amount: 'R', comment: 'S', summaryLabel: 'Полиграфия' },
  'доставка': { amount: 'T', comment: 'U', summaryLabel: 'доставка' },
  'услуги контрагентов': { amount: 'V', comment: 'W', summaryLabel: 'услуги контрагентов' },
  'сервис': { amount: 'X', comment: 'Y', summaryLabel: 'сервис' },
  'призы': { amount: 'Z', comment: 'AA', summaryLabel: 'призы' },
  'чай': { amount: 'AB', comment: 'AC', summaryLabel: 'чай' },
  'покупка оборудования': { amount: 'AD', comment: 'AE', summaryLabel: 'Покупка оборудования' },
  'ремонт оборудования': { amount: 'AF', comment: 'AG', summaryLabel: 'Ремонт оборудования' },
  'коммунальные услуги': { amount: 'AH', comment: 'AI', summaryLabel: 'Коммунальные расходы' },
  'аренда жилья': { amount: 'AJ', comment: 'AK', summaryLabel: 'Аренда жилья' },
  'крыша': { amount: 'AL', comment: 'AM', summaryLabel: 'Крыша' },
  'развлекательная программа': { amount: 'AN', comment: 'AO', summaryLabel: 'развлекательная программа' },
  'аренда': { amount: 'AP', comment: 'AQ', summaryLabel: 'Аренда' },
  'декор': { amount: 'AR', comment: 'AS', summaryLabel: 'Цветы и декор' },
  'аптека': { amount: 'AT', comment: 'AU', summaryLabel: 'аптека' }
};

export function normalizeCategory(input) {
  const normalized = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .replace('связь, интерет', 'связь, интернет');

  return CATEGORY_ALIASES[normalized] || normalized;
}

export function isAllowedMessageCategory(category) {
  return MESSAGE_CATEGORIES.includes(normalizeCategory(category));
}
