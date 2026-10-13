import { describe, expect, it } from 'vitest';
import { assertVerifiedRegistry } from '../src/contracts/runitup.js';
import { loadConfig } from '../src/config.js';

describe('startup guardrails', () => {
  it('rejects a non-BSC registry chain', () => {
    expect(() => assertVerifiedRegistry(1)).toThrow(/BSC-only/);
  });

  it('requires Telegram credentials outside dry-run', () => {
    expect(() => loadConfig({ HTTP_RPC_URLS: 'https://rpc.example', DRY_RUN: 'false' })).toThrow(/TELEGRAM_BOT_TOKEN/);
  });
});
