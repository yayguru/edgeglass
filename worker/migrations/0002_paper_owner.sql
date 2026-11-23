-- Paper fills are keyed by a glasses/session owner, not only a Telegram id.
ALTER TABLE paper_fills ADD COLUMN owner TEXT;
CREATE INDEX IF NOT EXISTS paper_fills_owner ON paper_fills (owner);
