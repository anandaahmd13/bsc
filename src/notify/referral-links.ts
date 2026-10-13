import type { Address } from 'viem';

/**
 * User-supplied referral IDs. Both providers support a token-specific deep
 * link, so the alert delivers the observed BSC contract rather than a generic
 * landing page. This still only opens a third-party venue; it never signs or
 * constructs a transaction.
 */
const GMGN_REFERRAL = 'kX4rUcuP';
const BASED_BOT_REFERRAL = 'r_odglug69420';

export function launchReferralKeyboard(token: Address) {
  const contract = token.toLowerCase();
  return {
  inline_keyboard: [[
      { text: 'Buy on GMGN ↗ (referral)', url: `https://gmgn.ai/bsc/token/${GMGN_REFERRAL}_${contract}` },
      { text: 'Buy on Based Bot ↗ (referral)', url: `https://t.me/based_eth_bot?start=${BASED_BOT_REFERRAL}_b_${contract}` },
  ]],
  } as const;
}
