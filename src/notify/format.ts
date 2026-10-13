import { formatEther } from 'viem';
import type { DecodedLaunch, LaunchEnrichment } from '../chain/types.js';

const CONTROL_OR_BIDI = /[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;

export function safeTelegramHtml(value: string | undefined, maxLength = 120): string {
  const cleaned = (value ?? '').replace(CONTROL_OR_BIDI, '').replace(/\s+/gu, ' ').trim();
  if (!cleaned) return '-';
  const shortened = [...cleaned].slice(0, maxLength).join('');
  return shortened.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
}

export function formatLaunchAlert(
  launch: DecodedLaunch,
  enrichment: LaunchEnrichment,
): string {
  const { token, transaction, runitup } = enrichment;
  const creator = launch.creator ?? runitup?.creator ?? transaction.sender;
  const pair = launch.pool ?? runitup?.pair;
  const creatorBnbBalance = formatNativeAmount(token.creatorBnbBalance);
  const tax = launch.buyBps !== undefined || launch.sellBps !== undefined
    ? `buy ${formatPercentFromBps(launch.buyBps)} / sell ${formatPercentFromBps(launch.sellBps)}`
    : runitup?.taxPercent !== undefined ? `${runitup.taxPercent}%` : '-';
  const facts = [
    '<b>Runitup launch</b>',
    `<b>Token Address</b> : <code>${launch.token}</code>`,
    `<b>Name</b> : ${safeTelegramHtml(token.name)}`,
    `<b>Symbol</b> : ${safeTelegramHtml(token.symbol)}`,
    `<b>Pair</b> : ${pair ? `<code>${pair}</code>` : '-'}`,
    `<b>Dev Buy</b> : ${formatDevBuy(transaction.devBuyWei, transaction.bnbUsdPrice)}`,
    `<b>Tax</b> : ${safeTelegramHtml(tax)}`,
    `<b>Twitter</b> : ${safeTelegramHtml(runitup?.twitter)}`,
    `<b>Website</b> : ${safeTelegramHtml(runitup?.website)}`,
    `<b>Telegram</b> : ${safeTelegramHtml(runitup?.telegram)}`,
    `<b>About</b> : ${safeTelegramHtml(runitup?.about, 500)}`,
    `<b>Creator</b> : ${creator ? `<a href="https://bscscan.com/address/${creator}">${creator}</a>` : '-'}`,
    `<b>Creator Balance</b> : ${creatorBnbBalance === '-' ? '-' : `${creatorBnbBalance} BNB`}`,
    `<b>Count Deploys</b> : ${runitup?.creatorLaunchCount ?? '-'}`,
  ];
  return facts.join('\n');
}

function formatPercentFromBps(value: number | undefined): string {
  return value === undefined ? '-' : `${value / 100}%`;
}

function formatDevBuy(nativeWei: bigint | undefined, bnbUsdPrice: number | undefined): string {
  if (nativeWei === undefined || bnbUsdPrice === undefined) return '-';
  const usd = Number(formatEther(nativeWei)) * bnbUsdPrice;
  if (!Number.isFinite(usd)) return '-';
  return `~$${usd.toFixed(2)} (${formatNativeAmount(nativeWei)} BNB)`;
}

function formatNativeAmount(value: bigint | undefined): string {
  if (value === undefined) return '-';
  const [whole, fraction] = formatEther(value).split('.');
  return fraction ? `${whole ?? '0'}.${fraction.slice(0, 6)}` : whole ?? '0';
}
