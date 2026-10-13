/**
 * User-supplied promotional destinations. These are intentionally static: the
 * watcher does not construct a buy transaction or claim that either venue
 * supports a particular BSC token. Keep this disclosure in the alert body.
 */
export const launchReferralKeyboard = {
  inline_keyboard: [[
    { text: 'Buy on GMGN ↗ (referral)', url: 'https://gmgn.ai/r/kX4rUcuP' },
    { text: 'Open Based Bot ↗ (referral)', url: 'https://t.me/based_eth_bot?start=r_odglug69420' },
  ]],
} as const;
