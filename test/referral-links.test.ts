import { describe, expect, it } from 'vitest';
import { launchReferralKeyboard } from '../src/notify/referral-links.js';

describe('launch referral buttons', () => {
  it('uses the exact user-provided destinations', () => {
    expect(launchReferralKeyboard.inline_keyboard[0]?.map((button) => button.url)).toEqual([
      'https://gmgn.ai/r/kX4rUcuP',
      'https://t.me/based_eth_bot?start=r_odglug69420',
    ]);
  });
});
