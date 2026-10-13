import type { Address, Hex } from 'viem';

/**
 * Links only to the observed creation transaction and the user-supplied
 * referral destinations. This watcher never signs or constructs a trade.
 */
const GMGN_REFERRAL = 'kX4rUcuP';
const BASED_BOT_REFERRAL = 'r_odglug69420';

export interface LaunchLinks {
  token: Address;
  creator?: Address;
  transactionHash: Hex;
}

export function launchReferralKeyboard({ token, creator, transactionHash }: LaunchLinks) {
  const contract = token.toLowerCase();
  return {
    inline_keyboard: [
      [
        { text: '🌍 Contract ↗', url: `https://bscscan.com/token/${contract}` },
        ...(creator ? [{ text: '👤 Dev ↗', url: `https://bscscan.com/address/${creator}` }] : []),
      ],
      [
        { text: '🔥 Based Web Bot ↗', url: 'https://trade.basedbot.app' },
        { text: '🔥 Based Bot ↗', url: `https://t.me/based_eth_bot?start=${BASED_BOT_REFERRAL}_b_${contract}` },
        { text: '🔥 GMGN ↗', url: `https://gmgn.ai/bsc/token/${GMGN_REFERRAL}_${contract}` },
      ],
      [{ text: '🧾 Tx ↗', url: `https://bscscan.com/tx/${transactionHash}` }],
    ],
  } as const;
}
