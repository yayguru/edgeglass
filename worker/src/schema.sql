-- Pairing ids, watchlist/alerts, paper ledger, mid samples.
-- Do not store private keys or Telegram message bodies.

CREATE TABLE IF NOT EXISTS pairings (
  code TEXT PRIMARY KEY,
  telegram_user_id TEXT,
  chat_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  linked_at TEXT
);

CREATE TABLE IF NOT EXISTS wallets (
  telegram_user_id TEXT PRIMARY KEY,
  pm_address TEXT,
  hl_address TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  market_key TEXT NOT NULL,
  threshold_cents INTEGER NOT NULL,
  paused INTEGER NOT NULL DEFAULT 0,
  last_fired_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paper_fills (
  id TEXT PRIMARY KEY,
  telegram_user_id TEXT,
  market_key TEXT NOT NULL,
  side TEXT NOT NULL,
  size_usd REAL NOT NULL,
  price REAL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS samples (
  k TEXT NOT NULL,
  t INTEGER NOT NULL,
  v REAL NOT NULL,
  PRIMARY KEY (k, t)
);

CREATE INDEX IF NOT EXISTS samples_t ON samples (t);
CREATE INDEX IF NOT EXISTS alerts_user ON alerts (telegram_user_id);
