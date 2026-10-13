import { describe, expect, it } from 'vitest';
import { launchReferralKeyboard } from '../src/notify/referral-links.js';

describe('launch referral buttons', () => {
  it('adds the observed contract to both user-provided referral links', () => {
    const token = '0x67434b56286da2cf0159ebfe3c012853124acf9b' as const;
    expect(launchReferralKeyboard(token).inline_keyboard[0]?.map((button) => button.url)).toEqual([
      'https://gmgn.ai/bsc/token/kX4rUcuP_0x67434b56286da2cf0159ebfe3c012853124acf9b',
      'https://t.me/based_eth_bot?start=r_odglug69420_b_0x67434b56286da2cf0159ebfe3c012853124acf9b',
    ]);
  });
});
