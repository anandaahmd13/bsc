import { describe, expect, it } from 'vitest';
import { launchReferralKeyboard } from '../src/notify/referral-links.js';

describe('launch action buttons', () => {
  it('links the contract, developer, referral destinations, and creation transaction', () => {
    const token = '0x67434b56286da2cf0159ebfe3c012853124acf9b' as const;
    const creator = '0xcd5f15d0ae0cab4b7b941c0475a37107bb20f28e' as const;
    const transactionHash = '0xdc36ea456f1886b3a124856ee80cfbc50dd9e262bd18a7462fe91930114edc1e' as const;
    const keyboard = launchReferralKeyboard({ token, creator, transactionHash }).inline_keyboard;
    expect(keyboard).toEqual([
      [
        { text: '🌍 Contract ↗', url: 'https://bscscan.com/token/0x67434b56286da2cf0159ebfe3c012853124acf9b' },
        { text: '👤 Dev ↗', url: 'https://bscscan.com/address/0xcd5f15d0ae0cab4b7b941c0475a37107bb20f28e' },
      ],
      [
        { text: '🔥 Based Web Bot ↗', url: 'https://trade.basedbot.app' },
        { text: '🔥 Based Bot ↗', url: 'https://t.me/based_eth_bot?start=r_odglug69420_b_0x67434b56286da2cf0159ebfe3c012853124acf9b' },
        { text: '🔥 GMGN ↗', url: 'https://gmgn.ai/bsc/token/kX4rUcuP_0x67434b56286da2cf0159ebfe3c012853124acf9b' },
      ],
      [
        { text: '🧾 Tx ↗', url: 'https://bscscan.com/tx/0xdc36ea456f1886b3a124856ee80cfbc50dd9e262bd18a7462fe91930114edc1e' },
      ],
    ]);
  });
});
