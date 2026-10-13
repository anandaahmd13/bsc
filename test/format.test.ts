import { describe, expect, it } from 'vitest';
import { formatLaunchAlert, safeTelegramHtml } from '../src/notify/format.js';

describe('Telegram HTML metadata escaping', () => {
  it('escapes markup and strips control/bidi characters', () => {
    expect(safeTelegramHtml('<b>& hello\u202E\u0000')).toBe('&lt;b&gt;&amp; hello');
    expect(safeTelegramHtml(undefined)).toBe('-');
    expect(safeTelegramHtml(' \n\t ')).toBe('-');
  });

  it('renders the requested token card fields with factory calldata and an on-chain creator balance', () => {
    const body = formatLaunchAlert({
      eventName: 'TokenLaunched', factory: '0x8c6689531003158f7A7fFd02895396A122191ffF', token: '0xa00866F73Aaead7E0a410386C6ea66B979c40bfC',
      creator: '0xcD5F15D0aE0cAB4B7B941C0475A37107bb20F28e', pool: '0x702607Fb171a17FECF1A4e731A120eD6F6542E88',
      transactionHash: '0xdc36ea456f1886b3a124856ee80cfbc50dd9e262bd18a7462fe91930114edc1e', logIndex: 73,
      blockNumber: 100n, blockHash: '0x4b92889b6817b36e3414bdfa64533d1fef9cc7db4e7ab1441c5c2534857c7aed',
    }, {
      token: { name: 'Dly', symbol: 'DEL', decimals: 18, creatorBalance: 0n, creatorBnbBalance: 1_250_000_000_000_000_000n, proxy: false, unavailable: [] },
      transaction: { devBuyWei: 13_471_427_420_192_330n, bnbUsdPrice: 744.3 },
      runitup: { taxPercent: 1, twitter: 'https://x.example', website: 'https://example.com', telegram: 'https://t.me/example', about: 'About', creatorLaunchCount: 2 },
    });
    for (const label of ['Token Address', 'Name', 'Symbol', 'Pair', 'Dev Buy', 'Tax', 'Twitter', 'Website', 'Telegram', 'About', 'Creator', 'Creator Balance', 'Count Deploys']) {
      expect(body).toContain(`<b>${label}</b>`);
    }
    expect(body).toContain('<b>Token Address</b> : <code>0xa00866F73Aaead7E0a410386C6ea66B979c40bfC</code>');
    expect(body).toContain('<b>Dev Buy</b> : ~$10.03 (0.013471 BNB)');
    expect(body).toContain('<b>Creator Balance</b> : 1.25 BNB');
    expect(body).not.toContain('Risk / data labels');
    expect(body).not.toContain('Event:');
  });
});
