PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS blocks (
  number INTEGER PRIMARY KEY,
  hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  factory TEXT NOT NULL,
  event_name TEXT NOT NULL,
  token TEXT NOT NULL,
  creator TEXT,
  block_number INTEGER NOT NULL,
  block_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('CANONICAL', 'REORGED')),
  detected_at INTEGER NOT NULL,
  PRIMARY KEY (tx_hash, log_index)
);
CREATE INDEX IF NOT EXISTS events_block_status ON events(block_number, status);
CREATE INDEX IF NOT EXISTS events_token ON events(token);

CREATE TABLE IF NOT EXISTS tokens (
  address TEXT PRIMARY KEY,
  name TEXT,
  symbol TEXT,
  decimals INTEGER,
  total_supply TEXT,
  metadata_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  chat_id TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PENDING', 'SENT', 'CANCELLED', 'REORG_NOTICE_PENDING', 'REORG_NOTICE_SENT')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  telegram_message_id INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  UNIQUE(tx_hash, log_index, chat_id),
  FOREIGN KEY (tx_hash, log_index) REFERENCES events(tx_hash, log_index)
);
CREATE INDEX IF NOT EXISTS outbox_pending ON outbox(status, next_attempt_at, id);
