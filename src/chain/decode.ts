import { decodeEventLog, decodeFunctionData, getAddress } from 'viem';
import type { Address, Hex } from 'viem';
import {
  launchEventNames,
  launchTopicValues,
  runitupFactoryLaunchAbi,
  runitupLaunchAbi,
} from '../contracts/runitup.js';
import type { ChainLog, DecodedLaunch, TransactionContext } from './types.js';

type EventArgs = Record<string, unknown>;

function asAddress(value: unknown): Address | undefined {
  return typeof value === 'string' ? getAddress(value) : undefined;
}

function asBigInt(value: unknown): bigint | undefined {
  return typeof value === 'bigint' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

export function decodeLaunchLog(log: ChainLog): DecodedLaunch | undefined {
  const topic0 = log.topics[0]?.toLowerCase();
  if (!topic0 || !launchTopicValues.some((topic) => topic.toLowerCase() === topic0)) return undefined;
  if (log.blockNumber === null || log.blockHash === null || log.transactionHash === null || log.logIndex === null) {
    throw new Error('Cannot persist an unresolved log without block, transaction hash, and log index');
  }

  const decoded = decodeEventLog({
    abi: runitupLaunchAbi,
    data: log.data,
    topics: log.topics as [Hex, ...Hex[]],
    strict: true,
  });
  if (!launchEventNames.includes(decoded.eventName as (typeof launchEventNames)[number])) return undefined;

  const args = decoded.args as EventArgs;
  const token = asAddress(args.token);
  if (!token) throw new Error(`Malformed ${decoded.eventName}: missing token`);
  return {
    eventName: decoded.eventName as DecodedLaunch['eventName'],
    factory: getAddress(log.address),
    token,
    creator: asAddress(args.creator),
    pool: asAddress(args.pool),
    hook: asAddress(args.hook),
    vault: asAddress(args.vault),
    dividendVault: asAddress(args.dividendVault),
    totalSupply: asBigInt(args.totalSupply),
    tokenId: asBigInt(args.tokenId),
    startingSqrtPriceX96: asBigInt(args.startingSqrtPriceX96),
    buyBps: asNumber(args.buyBps),
    sellBps: asNumber(args.sellBps),
    exitFeeBps: asNumber(args.exitFeeBps),
    cooldownSeconds: asNumber(args.cooldownSeconds),
    dripSeconds: asNumber(args.dripSeconds),
    transactionHash: log.transactionHash,
    logIndex: log.logIndex,
    blockNumber: log.blockNumber,
    blockHash: log.blockHash,
  };
}

/** Extract supplemental factory facts emitted in the same launch transaction. */
export function decodeTransactionContext(token: Address, logs: readonly ChainLog[]): TransactionContext {
  const context: TransactionContext = {};
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: runitupLaunchAbi,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
        strict: true,
      });
      const args = decoded.args as EventArgs;
      if (asAddress(args.token)?.toLowerCase() !== token.toLowerCase()) continue;
      if (decoded.eventName === 'SniperLaunched') {
        context.hook = asAddress(args.hook);
        context.sniperSeconds = asNumber(args.sniperSeconds);
      }
      if (decoded.eventName === 'QuoteAssetUsed') context.quoteAsset = asAddress(args.quoteToken);
    } catch {
      // A non-Runitup log in the receipt is expected; it is not an error.
    }
  }
  return context;
}

/** Extract developer-buy values declared by a verified Runitup factory call. */
export function decodeLaunchCall(data: Hex | undefined): Pick<TransactionContext, 'devBuyWei' | 'devBuyQuoteAmount'> {
  if (!data || data === '0x') return {};
  try {
    const decoded = decodeFunctionData({ abi: runitupFactoryLaunchAbi, data });
    if (!['launch', 'launchSniper', 'launchTaxed', 'launchTaxedLimited'].includes(decoded.functionName)) return {};
    const params = decoded.args?.[0];
    if (!params || typeof params !== 'object') return {};
    const values = params as { devBuyWei?: unknown; devBuyQuoteAmount?: unknown };
    return {
      devBuyWei: asBigInt(values.devBuyWei),
      devBuyQuoteAmount: asBigInt(values.devBuyQuoteAmount),
    };
  } catch {
    // Not a supported Runitup factory call, or calldata is malformed.
    return {};
  }
}
