CREATE TABLE IF NOT EXISTS telegram_messages (
  id BIGSERIAL PRIMARY KEY,
  chat_id BIGINT NOT NULL,
  message_id BIGINT NOT NULL,
  message_kind TEXT NOT NULL DEFAULT 'message',
  telegram_user_id BIGINT,
  telegram_username TEXT,
  telegram_full_name TEXT,
  text_content TEXT NOT NULL,
  parse_status TEXT NOT NULL DEFAULT 'pending',
  parse_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chat_id, message_id, message_kind)
);

CREATE TABLE IF NOT EXISTS daily_reports (
  id BIGSERIAL PRIMARY KEY,
  report_date DATE NOT NULL UNIQUE,
  report_month TEXT NOT NULL,
  cash NUMERIC(12,2) NOT NULL DEFAULT 0,
  rubles NUMERIC(12,2) NOT NULL DEFAULT 0,
  bank_cards NUMERIC(12,2) NOT NULL DEFAULT 0,
  yandex_delivery NUMERIC(12,2) NOT NULL DEFAULT 0,
  qr_code NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_income NUMERIC(12,2) NOT NULL DEFAULT 0,
  cash_left NUMERIC(12,2) NOT NULL DEFAULT 0,
  expense_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  last_message_id BIGINT REFERENCES telegram_messages(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL DEFAULT 'employee',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expense_lines (
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  category TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL CHECK (source IN ('employee', 'owner')),
  raw_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telegram_clarification_sessions (
  id BIGSERIAL PRIMARY KEY,
  chat_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  source_message_id BIGINT NOT NULL,
  source_message_kind TEXT NOT NULL DEFAULT 'message',
  source_message_row_id BIGINT REFERENCES telegram_messages(id) ON DELETE SET NULL,
  source_message_date BIGINT,
  original_text TEXT NOT NULL,
  working_text TEXT NOT NULL,
  current_issue_type TEXT,
  current_issue_payload JSONB,
  prompt_message_id BIGINT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_daily_reports_month ON daily_reports (report_month);
CREATE INDEX IF NOT EXISTS idx_expense_lines_report_id ON expense_lines (report_id);
CREATE INDEX IF NOT EXISTS idx_telegram_messages_created_at ON telegram_messages (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_clarification_source
  ON telegram_clarification_sessions (chat_id, source_message_id);
CREATE INDEX IF NOT EXISTS idx_telegram_clarification_prompt
  ON telegram_clarification_sessions (chat_id, prompt_message_id);
