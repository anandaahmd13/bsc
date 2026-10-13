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
}

export interface TokenMetadata {
  name?: string;
  symbol?: string;
  decimals?: number;
  totalSupply?: bigint;
  bytecode?: Hex;
  owner?: Address;
  creatorBalance?: bigint;
  proxy: boolean;
  unavailable: readonly string[];
}

export interface LaunchEnrichment {
  token: TokenMetadata;
  transaction: TransactionContext;
}
