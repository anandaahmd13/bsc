import type { DecodedLaunch, LaunchEnrichment } from '../chain/types.js';
import { isVerifiedHook } from '../contracts/runitup.js';
import type { RiskLabel } from '../risk/labels.js';

const CONTROL_OR_BIDI = /[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;

export function safeTelegramHtml(value: string | undefined, maxLength = 120): string {
  const cleaned = (value ?? 'DATA_UNAVAILABLE').replace(CONTROL_OR_BIDI, '').replace(/\s+/gu, ' ').trim();
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
  const { token, transaction } = enrichment;
  const confirmations = head >= launch.blockNumber ? head - launch.blockNumber + 1n : 0n;
  const state = confirmations >= BigInt(confirmationsRequired) ? 'confirmed' : 'newly detected / not final';
  const hook = launch.hook ?? transaction.hook;
  const suiteVerified = Boolean(hook && isVerifiedHook(hook));
  const actor = launch.creator ?? transaction.sender;
  const facts = [
    `<b>Runitup launch: ${safeTelegramHtml(state)}</b>`,
    `Event: <code>${launch.eventName}</code>`,
    `Token: <a href="https://bscscan.com/token/${launch.token}">${launch.token}</a>`,
    `Name / symbol: <b>${safeTelegramHtml(token.name)}</b> / <b>${safeTelegramHtml(token.symbol)}</b>`,
    `Factory: <code>${launch.factory}</code> (Sourcify-verified)`,
    actor ? `${launch.creator ? 'Creator' : 'Transaction sender'}: <a href="https://bscscan.com/address/${actor}">${actor}</a>` : undefined,
    launch.pool ? `Pool: <code>${launch.pool}</code>` : undefined,
    hook ? `Hook: <code>${hook}</code>${isVerifiedHook(hook) ? ' (registry verified)' : ' (not in registry)'}` : undefined,
    transaction.quoteAsset ? `Quote asset: <code>${transaction.quoteAsset}</code>` : undefined,
    `Supply (event/read): ${launch.totalSupply?.toString() ?? 'DATA_UNAVAILABLE'} / ${token.totalSupply?.toString() ?? 'DATA_UNAVAILABLE'}`,
    `Block: <a href="https://bscscan.com/tx/${launch.transactionHash}">${launch.blockNumber.toString()}</a> (${confirmations.toString()} confirmation(s))`,
    suiteVerified ? '<b>RUNITUP_VERIFIED</b>: factory and observed hook are in the verified registry.' : 'Suite status: factory verified; no fully verified observed suite component yet.',
  ].filter((line): line is string => Boolean(line));
  const riskLines = risks.length
    ? ['<b>Risk / data labels (not trading advice)</b>', ...risks.map((risk) => `• <code>${risk.code}</code>: ${safeTelegramHtml(risk.detail, 240)}`)]
    : ['<b>Risk / data labels</b>', 'No automated risk condition matched. This is not a safety assessment.'];
  return [...facts, '', ...riskLines, '', '<i>External buttons below are referral links, not a trading recommendation. Verify the network and token yourself.</i>'].join('\n');
}
