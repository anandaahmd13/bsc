import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Store } from '../src/db/store.js';
import type { DecodedLaunch, TokenMetadata } from '../src/chain/types.js';

const paths: string[] = [];
const temporaryStore = (): Store => {
  const filename = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'runitup-store-')), 'watcher.sqlite');
  paths.push(path.dirname(filename));
  return new Store(filename);
};

afterEach(() => paths.splice(0).forEach((directory) => fs.rmSync(directory, { recursive: true, force: true })));

const launch: DecodedLaunch = {
  eventName: 'TokenLaunched', factory: '0x8c6689531003158f7A7fFd02895396A122191ffF', token: '0xa00866F73Aaead7E0a410386C6ea66B979c40bfC',
  creator: '0xcD5F15D0aE0cAB4B7B941C0475A37107bb20F28e', transactionHash: '0xdc36ea456f1886b3a124856ee80cfbc50dd9e262bd18a7462fe91930114edc1e',
  logIndex: 73, blockNumber: 127_265_327n, blockHash: '0x4b92889b6817b36e3414bdfa64533d1fef9cc7db4e7ab1441c5c2534857c7aed', totalSupply: 1n,
};
const token: TokenMetadata = { name: 'Dly', symbol: 'DEL', decimals: 18, totalSupply: 1n, proxy: false, unavailable: [] };

describe('SQLite durable outbox', () => {
  it('is idempotent across a replay and leaves one notification', () => {
    const store = temporaryStore();
    expect(store.recordLaunch(launch, token, '<b>launch</b>', ['1'])).toBe(true);
    expect(store.recordLaunch(launch, token, '<b>launch</b>', ['1'])).toBe(false);
    expect(store.getDueOutbox()).toMatchObject([{
      token: launch.token.toLowerCase(),
      creator: launch.creator?.toLowerCase(),
      txHash: launch.transactionHash,
    }]);
    store.close();
  });

  it('recovers a committed unsent outbox row after a process restart', () => {
    const filename = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'runitup-restart-')), 'watcher.sqlite');
    paths.push(path.dirname(filename));
    const first = new Store(filename);
    first.recordLaunch(launch, token, '<b>launch</b>', ['1']);
    first.close();
    const restarted = new Store(filename);
    expect(restarted.getDueOutbox()).toHaveLength(1);
    restarted.close();
  });

  it('cancels unsent messages and schedules remediation for sent messages on reorg', () => {
    const store = temporaryStore();
    store.recordLaunch(launch, token, '<b>launch</b>', ['1', '2']);
    const [first] = store.getDueOutbox();
    store.markSent(first!.id, 42);
    const sent = store.rollbackFrom(launch.blockNumber);
    expect(sent).toHaveLength(1);
    expect(store.getDueOutbox()).toHaveLength(0);
    expect(store.getReorgNotices()).toHaveLength(1);
    expect(store.getCursor()).toBe(launch.blockNumber - 1n);
    store.close();
  });
});
