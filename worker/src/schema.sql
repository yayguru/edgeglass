-- Day 1 skeleton. Pairing, watchlists and paper ledger land on later days.
-- Do not store private keys or Telegram message bodies here.

CREATE TABLE IF NOT EXISTS pairings (
  code TEXT PRIMARY KEY,
  telegram_user_id TEXT,
  created_at TEXT NOT NULL,
  linked_at TEXT
);

CREATE TABLE IF NOT EXISTS watchlists (
  telegram_user_id TEXT NOT NULL,
  market_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (telegram_user_id, market_key)
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
