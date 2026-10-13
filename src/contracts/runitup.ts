import type { Address, Hex } from 'viem';
import { keccak256, stringToHex } from 'viem';

export const BSC_CHAIN_ID = 56;

/**
 * Source-of-truth registry. Do not add an address based on a token name, a
 * third-party URL, or a social post. Each entry must have an independent
 * source/ABI review before its `verification` value may be changed.
 */
export const runitupLaunchAbi = [
  {
    type: 'event',
    name: 'TokenLaunched',
    anonymous: false,
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'pool', type: 'address', indexed: false },
      { name: 'totalSupply', type: 'uint256', indexed: false },
      { name: 'tokenId', type: 'uint256', indexed: false },
      { name: 'startingSqrtPriceX96', type: 'uint160', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'TaxedTokenLaunched',
    anonymous: false,
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'hook', type: 'address', indexed: true },
      { name: 'dividendVault', type: 'address', indexed: false },
      { name: 'buyBps', type: 'uint16', indexed: false },
      { name: 'sellBps', type: 'uint16', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'StakedTokenLaunched',
    anonymous: false,
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'vault', type: 'address', indexed: true },
      { name: 'exitFeeBps', type: 'uint16', indexed: false },
      { name: 'cooldownSeconds', type: 'uint32', indexed: false },
      { name: 'dripSeconds', type: 'uint32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'SniperLaunched',
    anonymous: false,
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'hook', type: 'address', indexed: true },
      { name: 'sniperSeconds', type: 'uint32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'QuoteAssetUsed',
    anonymous: false,
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'quoteToken', type: 'address', indexed: true },
      { name: 'startingMcapInQuote', type: 'uint256', indexed: false },
    ],
  },
] as const;

export const launchEventNames = [
  'TokenLaunched',
  'TaxedTokenLaunched',
  'StakedTokenLaunched',
] as const;
export type LaunchEventName = (typeof launchEventNames)[number];
export const runitupLaunchEvents = runitupLaunchAbi.slice(0, 3);

const eventTopic = (signature: string) => keccak256(stringToHex(signature));

export const launchTopics = {
  TokenLaunched: eventTopic('TokenLaunched(address,address,address,uint256,uint256,uint160)'),
  TaxedTokenLaunched: eventTopic('TaxedTokenLaunched(address,address,address,uint16,uint16)'),
  StakedTokenLaunched: eventTopic('StakedTokenLaunched(address,address,uint16,uint32,uint32)'),
} as const satisfies Record<LaunchEventName, Hex>;

export type Verification = 'VERIFIED';

export interface VerifiedAddress {
  address: Address;
  verification: Verification;
  evidence: readonly string[];
}

export interface RunitupFactory extends VerifiedAddress {
  suite: string;
  /** First BSC block where factory runtime bytecode is present. */
  startBlock: bigint;
}

const sourcify = (address: string) =>
  `https://sourcify.dev/server/v2/contract/56/${address}?fields=abi,proxyResolution`;

/**
 * Evidence review, 2026-10-13:
 * - both factory ABIs are Sourcify exact_match and proxyResolution.isProxy=false
 * - start blocks were established by an historical eth_getCode boundary check
 *   (empty at startBlock - 1, bytecode at startBlock) on BSC.
 */
export const runitupFactories = [
  {
    suite: 'bsc-mainnet-v1',
    address: '0xB7aF2FBCBE56bb11950F7105E0910D8DcbB6Bd20',
    startBlock: 126_453_990n,
    verification: 'VERIFIED',
    evidence: [sourcify('0xB7aF2FBCBE56bb11950F7105E0910D8DcbB6Bd20')],
  },
  {
    suite: 'bsc-mainnet-infinity',
    address: '0x8c6689531003158f7A7fFd02895396A122191ffF',
    startBlock: 126_454_047n,
    verification: 'VERIFIED',
    evidence: [sourcify('0x8c6689531003158f7A7fFd02895396A122191ffF')],
  },
] as const satisfies readonly RunitupFactory[];

/** Known on-chain component from the independently corroborated DEL launch. */
export const runitupComponents = {
  hooks: [
    {
      address: '0xbb6f3fd418871627336e8c97837a3479c936440f',
      verification: 'VERIFIED',
      evidence: [
        'https://runitup.gg/api/tokens/0xa00866f73aaead7e0a410386c6ea66b979c40bfc?chain=56',
      ],
    },
  ],
  lockers: [],
  managers: [],
  venues: ['Pancake Infinity', 'Uniswap V4'],
} as const satisfies {
  hooks: readonly VerifiedAddress[];
  lockers: readonly VerifiedAddress[];
  managers: readonly VerifiedAddress[];
  venues: readonly string[];
};

export const factoryAddresses = runitupFactories.map((factory) => factory.address);
export const launchTopicValues = Object.values(launchTopics);

export function assertVerifiedRegistry(chainId: number): void {
  if (chainId !== BSC_CHAIN_ID) {
    throw new Error(`Runitup registry is BSC-only (chainId ${BSC_CHAIN_ID}), got ${chainId}`);
  }
  if (!runitupFactories.length || !launchTopicValues.length) {
    throw new Error('Refusing to start: Runitup factory/event registry is empty');
  }
  for (const factory of runitupFactories) {
    if (factory.verification !== 'VERIFIED' || factory.startBlock < 1n) {
      throw new Error(`Refusing to start: factory ${factory.address} is not VERIFIED with a start block`);
    }
  }
  for (const [name, topic] of Object.entries(launchTopics)) {
    if (!/^0x[0-9a-f]{64}$/i.test(topic)) {
      throw new Error(`Refusing to start: ${name} does not have a valid topic0`);
    }
  }
}

export function isVerifiedFactory(address: Address): boolean {
  return runitupFactories.some((factory) => factory.address.toLowerCase() === address.toLowerCase());
}

export function isVerifiedHook(address: Address | undefined): boolean {
  return Boolean(
    address && runitupComponents.hooks.some((hook) => hook.address.toLowerCase() === address.toLowerCase()),
  );
}
