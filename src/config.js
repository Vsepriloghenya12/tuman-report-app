import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_OWNER_USERNAME = 'owner';
export const DEFAULT_OWNER_PASSWORD = 'change-me';
export const DEFAULT_JWT_SECRET = 'change-me-too';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function required(name, fallback = '') {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  rootDir,
  port: Number(process.env.PORT || 8080),
  databaseUrl: required('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/tuman_reports'),
  ownerUsername: process.env.OWNER_USERNAME || DEFAULT_OWNER_USERNAME,
  ownerPassword: process.env.OWNER_PASSWORD || DEFAULT_OWNER_PASSWORD,
  jwtSecret: process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || 'tuman-report-webhook',
  telegramAllowedChatId: process.env.TELEGRAM_ALLOWED_CHAT_ID || '',
  appBaseUrl: (process.env.APP_BASE_URL || '').replace(/\/$/, ''),
  defaultReportYear: Number(process.env.DEFAULT_REPORT_YEAR || new Date().getFullYear()),
  autoApplySchema: String(process.env.AUTO_APPLY_SCHEMA || 'true').toLowerCase() === 'true',
  templatePath: process.env.EXCEL_TEMPLATE_PATH || path.join(rootDir, 'templates', 'tuman-march-2026.xlsx')
};

export function hasTelegramConfig() {
  return Boolean(config.telegramBotToken);
}
