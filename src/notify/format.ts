import { formatEther, formatUnits } from 'viem';
import type { DecodedLaunch, LaunchEnrichment } from '../chain/types.js';
import type { RiskLabel } from '../risk/labels.js';

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
  risks: readonly RiskLabel[],
  head: bigint,
  confirmationsRequired: number,
): string {
  const { token, transaction, runitup } = enrichment;
  const confirmations = head >= launch.blockNumber ? head - launch.blockNumber + 1n : 0n;
  const state = confirmations >= BigInt(confirmationsRequired) ? 'confirmed' : 'newly detected / not final';
  const creator = launch.creator ?? runitup?.creator ?? transaction.sender;
  const pair = launch.pool ?? runitup?.pair;
  const tax = launch.buyBps !== undefined || launch.sellBps !== undefined
    ? `buy ${formatPercentFromBps(launch.buyBps)} / sell ${formatPercentFromBps(launch.sellBps)} (factory event)`
    : runitup?.taxPercent !== undefined ? `${runitup.taxPercent}% (Runitup API)` : '-';
  const facts = [
    `<b>Runitup launch: ${safeTelegramHtml(state)}</b>`,
    `<b>Token Address</b> : <a href="https://bscscan.com/token/${launch.token}">${launch.token}</a>`,
    `<b>Name</b> : ${safeTelegramHtml(token.name)}`,
    `<b>Symbol</b> : ${safeTelegramHtml(token.symbol)}`,
    `<b>Pair</b> : ${pair ? `<code>${pair}</code>` : '-'}`,
    `<b>Dev Buy</b> : ${formatDevBuy(transaction.devBuyWei, transaction.devBuyQuoteAmount, transaction.quoteAsset)}`,
    `<b>Tax</b> : ${safeTelegramHtml(tax)}`,
    `<b>Twitter</b> : ${safeTelegramHtml(runitup?.twitter)}`,
    `<b>Website</b> : ${safeTelegramHtml(runitup?.website)}`,
    `<b>Telegram</b> : ${safeTelegramHtml(runitup?.telegram)}`,
    `<b>About</b> : ${safeTelegramHtml(runitup?.about, 500)}`,
    `<b>Creator</b> : ${creator ? `<a href="https://bscscan.com/address/${creator}">${creator}</a>` : '-'}`,
    `<b>Creator Balance</b> : ${formatTokenAmount(token.creatorBalance, token.decimals)} ${safeTelegramHtml(token.symbol, 24)}`,
    `<b>Count Deploys</b> : ${runitup?.creatorLaunchCount ?? '-'}`,
  ];
  const riskLines = risks.length
    ? ['<b>Risk / data labels (not trading advice)</b>', ...risks.map((risk) => `• <code>${risk.code}</code>: ${safeTelegramHtml(risk.detail, 240)}`)]
    : ['<b>Risk / data labels</b>', 'No automated risk condition matched. This is not a safety assessment.'];
  return [...facts, '', ...riskLines, '', `<i>Event: ${launch.eventName}; block ${launch.blockNumber.toString()} (${confirmations.toString()} confirmation(s)). External buttons below are referral links, not a trading recommendation.</i>`].join('\n');
}

function formatPercentFromBps(value: number | undefined): string {
  return value === undefined ? 'DATA_UNAVAILABLE' : `${value / 100}%`;
}

function formatTokenAmount(value: bigint | undefined, decimals: number | undefined): string {
  if (value === undefined || decimals === undefined) return '-';
  const formatted = formatUnits(value, decimals);
  const [whole, fraction] = formatted.split('.');
  return fraction ? `${whole ?? '0'}.${fraction.slice(0, 6)}` : whole ?? '0';
}

function formatDevBuy(nativeWei: bigint | undefined, quoteAmount: bigint | undefined, quoteAsset: `0x${string}` | undefined): string {
  if (nativeWei !== undefined) return `${formatNativeAmount(nativeWei)} BNB (factory calldata)`;
  if (quoteAmount !== undefined && quoteAsset) return `${quoteAmount.toString()} quote units via ${quoteAsset} (factory calldata)`;
  return '-';
}

function formatNativeAmount(value: bigint): string {
  const [whole, fraction] = formatEther(value).split('.');
  return fraction ? `${whole ?? '0'}.${fraction.slice(0, 8)}` : whole ?? '0';
}
