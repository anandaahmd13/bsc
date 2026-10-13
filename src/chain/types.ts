import type { Address, Hex } from 'viem';
import type { LaunchEventName } from '../contracts/runitup.js';

export interface ChainLog {
  address: Address;
  topics: readonly Hex[];
  data: Hex;
  blockNumber: bigint | null;
  blockHash: Hex | null;
  transactionHash: Hex | null;
  logIndex: number | null;
  removed?: boolean;
}

export interface DecodedLaunch {
  eventName: LaunchEventName;
  factory: Address;
  token: Address;
  creator?: Address;
  pool?: Address;
  hook?: Address;
  vault?: Address;
  dividendVault?: Address;
  totalSupply?: bigint;
  tokenId?: bigint;
  startingSqrtPriceX96?: bigint;
  buyBps?: number;
  sellBps?: number;
  exitFeeBps?: number;
  cooldownSeconds?: number;
  dripSeconds?: number;
  transactionHash: Hex;
  logIndex: number;
  blockNumber: bigint;
  blockHash: Hex;
}

export interface TransactionContext {
  hook?: Address;
  quoteAsset?: Address;
  sniperSeconds?: number;
  sender?: Address;
  /** Native BNB developer purchase declared in verified factory calldata. */
  devBuyWei?: bigint;
  /** Developer purchase declared in the launch quote asset, if any. */
  devBuyQuoteAmount?: bigint;
  /** Spot BNB/USD price used only to show the developer-buy USD estimate. */
  bnbUsdPrice?: number;
}

export interface TokenMetadata {
  name?: string;
  symbol?: string;
  decimals?: number;
  totalSupply?: bigint;
  bytecode?: Hex;
  owner?: Address;
  /** Balance of the launched token held by its creator; used for risk analysis. */
  creatorBalance?: bigint;
  /** Native BNB balance held by the creator wallet at enrichment time. */
  creatorBnbBalance?: bigint;
  proxy: boolean;
  unavailable: readonly string[];
}

/** Facts reported by Runitup's own token API; they are not on-chain attestations. */
export interface RunitupTokenProfile {
  pair?: Address;
  taxPercent?: number;
  twitter?: string;
  website?: string;
  telegram?: string;
  about?: string;
  creator?: Address;
  creatorLaunchCount?: number;
}

export interface LaunchEnrichment {
  token: TokenMetadata;
  transaction: TransactionContext;
  runitup?: RunitupTokenProfile;
}
