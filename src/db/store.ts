import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { Address, Hex } from 'viem';
import type { DecodedLaunch, TokenMetadata } from '../chain/types.js';

interface EventRow {
  tx_hash: string;
  log_index: number;
  factory: string;
  event_name: string;
  token: string;
  creator: string | null;
  block_number: number;
  block_hash: string;
  payload_json: string;
  status: 'CANONICAL' | 'REORGED';
}

export interface StoredOutbox {
  id: number;
  txHash: Hex;
  logIndex: number;
  token: Address;
  creator?: Address;
  chatId: string;
  body: string;
  status: 'PENDING' | 'SENT' | 'CANCELLED' | 'REORG_NOTICE_PENDING' | 'REORG_NOTICE_SENT';
  attempts: number;
  telegramMessageId?: number;
}

export class Store {
  private readonly database: Database.Database;

  constructor(filename: string) {
    fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
    this.database = new Database(filename);
    const schemaPath = new URL('./schema.sql', import.meta.url);
    this.database.exec(fs.readFileSync(schemaPath, 'utf8'));
  }

  close(): void {
    this.database.close();
  }

  getCursor(): bigint | undefined {
    const row = this.database.prepare("SELECT value FROM metadata WHERE key = 'cursor'").get() as { value: string } | undefined;
    return row ? BigInt(row.value) : undefined;
  }

  setCursor(block: bigint): void {
    this.database.prepare("INSERT INTO metadata(key, value) VALUES ('cursor', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .run(block.toString());
  }

  isPaused(): boolean {
    const row = this.database.prepare("SELECT value FROM metadata WHERE key = 'paused'").get() as { value: string } | undefined;
    return row?.value === 'true';
  }

  setPaused(paused: boolean): void {
    this.database.prepare("INSERT INTO metadata(key, value) VALUES ('paused', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .run(String(paused));
  }

  recordBlock(number: bigint, hash: Hex): void {
    this.database.prepare('INSERT INTO blocks(number, hash) VALUES (?, ?) ON CONFLICT(number) DO UPDATE SET hash=excluded.hash')
      .run(Number(number), hash.toLowerCase());
  }

  getRecentBlocks(minimumBlock: bigint): readonly { number: bigint; hash: Hex }[] {
    const rows = this.database.prepare('SELECT number, hash FROM blocks WHERE number >= ? ORDER BY number ASC').all(Number(minimumBlock)) as { number: number; hash: Hex }[];
    return rows.map((row) => ({ number: BigInt(row.number), hash: row.hash }));
  }

  /**
   * Writes the canonical event, token facts, and all notification outbox rows
   * in one SQLite transaction. A crash before commit produces no notification;
   * a crash after commit is recovered from the outbox.
   */
  recordLaunch(
    launch: DecodedLaunch,
    token: TokenMetadata,
    body: string,
    chatIds: readonly string[],
  ): boolean {
    const now = Date.now();
    const write = this.database.transaction(() => {
      const event = this.database.prepare(`
        INSERT INTO events (tx_hash, log_index, factory, event_name, token, creator, block_number, block_hash, payload_json, status, detected_at)
        VALUES (@txHash, @logIndex, @factory, @eventName, @token, @creator, @blockNumber, @blockHash, @payload, 'CANONICAL', @now)
        ON CONFLICT(tx_hash, log_index) DO NOTHING
      `).run({
        txHash: launch.transactionHash.toLowerCase(),
        logIndex: launch.logIndex,
        factory: launch.factory.toLowerCase(),
        eventName: launch.eventName,
        token: launch.token.toLowerCase(),
        creator: launch.creator?.toLowerCase() ?? null,
        blockNumber: Number(launch.blockNumber),
        blockHash: launch.blockHash.toLowerCase(),
        payload: JSON.stringify(serialize(launch)),
        now,
      });
      if (event.changes === 0) return false;
      this.database.prepare(`
        INSERT INTO tokens(address, name, symbol, decimals, total_supply, metadata_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(address) DO UPDATE SET
          name=excluded.name, symbol=excluded.symbol, decimals=excluded.decimals,
          total_supply=excluded.total_supply, metadata_json=excluded.metadata_json, updated_at=excluded.updated_at
      `).run(
        launch.token.toLowerCase(), token.name ?? null, token.symbol ?? null, token.decimals ?? null,
        token.totalSupply?.toString() ?? null, JSON.stringify(serialize(token)), now,
      );
      const insertOutbox = this.database.prepare(`
        INSERT INTO outbox(tx_hash, log_index, chat_id, body, status, created_at)
        VALUES (?, ?, ?, ?, 'PENDING', ?)
      `);
      for (const chatId of chatIds) insertOutbox.run(launch.transactionHash.toLowerCase(), launch.logIndex, chatId, body, now);
      return true;
    });
    return write();
  }

  getDueOutbox(limit = 20): readonly StoredOutbox[] {
    const rows = this.database.prepare(`
      SELECT o.id, o.tx_hash, o.log_index, e.token, e.creator, o.chat_id, o.body, o.status, o.attempts, o.telegram_message_id
      FROM outbox o JOIN events e ON e.tx_hash=o.tx_hash AND e.log_index=o.log_index
      WHERE o.status = 'PENDING' AND o.next_attempt_at <= ? ORDER BY o.id LIMIT ?
    `).all(Date.now(), limit) as Record<string, unknown>[];
    return rows.map(toOutbox);
  }

  markSent(id: number, telegramMessageId?: number): void {
    this.database.prepare(`UPDATE outbox SET status='SENT', telegram_message_id=?, sent_at=?, last_error=NULL WHERE id=? AND status='PENDING'`)
      .run(telegramMessageId ?? null, Date.now(), id);
  }

  retryOutbox(id: number, error: string, retryAfterMs: number): void {
    this.database.prepare(`UPDATE outbox SET attempts=attempts+1, last_error=?, next_attempt_at=? WHERE id=? AND status='PENDING'`)
      .run(error.slice(0, 500), Date.now() + retryAfterMs, id);
  }

  rollbackFrom(block: bigint): readonly StoredOutbox[] {
    const rollback = this.database.transaction(() => {
      const sent = this.database.prepare(`
        SELECT o.id, o.tx_hash, o.log_index, e.token, e.creator, o.chat_id, o.body, o.status, o.attempts, o.telegram_message_id
        FROM outbox o JOIN events e ON e.tx_hash=o.tx_hash AND e.log_index=o.log_index WHERE (o.tx_hash, o.log_index) IN (
          SELECT tx_hash, log_index FROM events WHERE block_number >= ? AND status = 'CANONICAL'
        ) AND o.status = 'SENT'
      `).all(Number(block)) as Record<string, unknown>[];
      this.database.prepare("UPDATE events SET status='REORGED' WHERE block_number >= ? AND status='CANONICAL'").run(Number(block));
      this.database.prepare(`
        UPDATE outbox SET status=CASE WHEN status='SENT' THEN 'REORG_NOTICE_PENDING' ELSE 'CANCELLED' END
        WHERE (tx_hash, log_index) IN (SELECT tx_hash, log_index FROM events WHERE block_number >= ?)
          AND status IN ('PENDING', 'SENT')
      `).run(Number(block));
      this.database.prepare('DELETE FROM blocks WHERE number >= ?').run(Number(block));
      this.setCursor(block - 1n);
      return sent.map(toOutbox);
    });
    return rollback();
  }

  getReorgNotices(limit = 20): readonly StoredOutbox[] {
    const rows = this.database.prepare(`
      SELECT o.id, o.tx_hash, o.log_index, e.token, e.creator, o.chat_id, o.body, o.status, o.attempts, o.telegram_message_id
      FROM outbox o JOIN events e ON e.tx_hash=o.tx_hash AND e.log_index=o.log_index
      WHERE o.status='REORG_NOTICE_PENDING' ORDER BY o.id LIMIT ?
    `).all(limit) as Record<string, unknown>[];
    return rows.map(toOutbox);
  }

  markReorgNoticeSent(id: number): void {
    this.database.prepare("UPDATE outbox SET status='REORG_NOTICE_SENT' WHERE id=? AND status='REORG_NOTICE_PENDING'").run(id);
  }

  getLastBody(): string | undefined {
    const row = this.database.prepare("SELECT body FROM outbox WHERE status='SENT' ORDER BY id DESC LIMIT 1").get() as { body: string } | undefined;
    return row?.body;
  }

  status(): { cursor?: bigint; paused: boolean; pending: number } {
    const pending = this.database.prepare("SELECT COUNT(*) AS count FROM outbox WHERE status='PENDING'").get() as { count: number };
    return { cursor: this.getCursor(), paused: this.isPaused(), pending: pending.count };
  }
}

function serialize(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serialize(entry)]));
  return value;
}

function toOutbox(row: Record<string, unknown>): StoredOutbox {
  return {
    id: Number(row.id),
    txHash: String(row.tx_hash) as Hex,
    logIndex: Number(row.log_index),
    token: String(row.token) as Address,
    creator: row.creator === null || row.creator === undefined ? undefined : String(row.creator) as Address,
    chatId: String(row.chat_id),
    body: String(row.body),
    status: String(row.status) as StoredOutbox['status'],
    attempts: Number(row.attempts),
    telegramMessageId: row.telegram_message_id === null || row.telegram_message_id === undefined ? undefined : Number(row.telegram_message_id),
  };
}
