import { describe, expect, it, vi } from 'vitest';
import pino from 'pino';
import { DurableScanner } from '../src/chain/scanner.js';
import type { AppConfig } from '../src/config.js';

const config: AppConfig = {
  chainId: 56, httpRpcUrls: ['https://example.invalid'], dbPath: ':memory:', pollIntervalMs: 1_000,
  reorgWindow: 24, initialChunkSize: 8, minChunkSize: 2, finalityConfirmations: 15, dryRun: true,
  telegramChatIds: [], telegramAdminUserIds: new Set(), telegramMinIntervalMs: 1_000,
};

describe('adaptive getLogs', () => {
  it('shrinks after an RPC limit response and continues the same range', async () => {
    const getLogs = vi.fn()
      .mockRejectedValueOnce(new Error('query returned more than 10000 results'))
      .mockResolvedValue([]);
    const scanner = new DurableScanner(
      { getLogs } as never,
      { getCursor: () => undefined, setCursor: vi.fn(), getRecentBlocks: () => [], recordBlock: vi.fn(), rollbackFrom: vi.fn() } as never,
      config,
      { onLaunch: vi.fn(), onReorg: vi.fn() },
      pino({ enabled: false }),
    );
    await scanner.scanRange(1n, 8n);
    expect(getLogs).toHaveBeenCalledTimes(18); // initial six run concurrently, then six each for 1-4 and 5-8
    expect(getLogs.mock.calls.some(([request]) => request.fromBlock === 1n && request.toBlock === 4n)).toBe(true);
  });

  it('retains the same range when the getLogs backend is behind the reported head', async () => {
    const getLogs = vi.fn().mockRejectedValue(new Error('block range extends beyond current head block: requested 18, head 10'));
    const scanner = new DurableScanner(
      { getLogs } as never,
      { getCursor: () => undefined, setCursor: vi.fn(), getRecentBlocks: () => [], recordBlock: vi.fn(), rollbackFrom: vi.fn() } as never,
      config,
      { onLaunch: vi.fn(), onReorg: vi.fn() },
      pino({ enabled: false }),
    );
    await expect(scanner.scanRange(11n, 18n)).resolves.toBe(false);
    // The six factory/event requests retain the original range; no smaller
    // range is attempted and the caller will retry on the next poll.
    expect(getLogs).toHaveBeenCalledTimes(6);
    expect(getLogs.mock.calls.every(([request]) => request.fromBlock === 11n && request.toBlock === 18n)).toBe(true);
  });

  it('does not advance the cursor while waiting for a lagging getLogs backend', async () => {
    const setCursor = vi.fn();
    const scanner = new DurableScanner(
      {
        getBlockNumber: vi.fn().mockResolvedValue(100n),
        getLogs: vi.fn().mockRejectedValue(new Error('block range extends beyond current head block: requested 100, head 99')),
      } as never,
      { getCursor: () => 99n, setCursor, getRecentBlocks: () => [], recordBlock: vi.fn(), rollbackFrom: vi.fn() } as never,
      config,
      { onLaunch: vi.fn(), onReorg: vi.fn() },
      pino({ enabled: false }),
    );
    await scanner.scanOnce();
    expect(setCursor).not.toHaveBeenCalled();
  });
});
