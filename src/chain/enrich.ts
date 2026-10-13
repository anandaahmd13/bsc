import { decodeEventLog, getAddress, toFunctionSelector, zeroAddress } from 'viem';
import type { Address } from 'viem';
import { z } from 'zod';
import { runitupLaunchAbi } from '../contracts/runitup.js';
import { decodeLaunchCall, decodeTransactionContext } from './decode.js';
import type { ChainLog, DecodedLaunch, LaunchEnrichment, TokenMetadata } from './types.js';
import type { RunitupClient } from './rpc.js';

const erc20Abi = [
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
] as const;

const EIP1967_IMPLEMENTATION_SLOT =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc' as const;

const runitupTokenResponseSchema = z.object({
  creatorLaunchCount: z.number().int().nonnegative().optional(),
  token: z.object({
    chainId: z.number(),
    address: z.string(),
    description: z.string().nullable().optional(),
    socials: z.object({
      x: z.string().nullable().optional(),
      website: z.string().nullable().optional(),
      telegram: z.string().nullable().optional(),
    }).nullable().optional(),
    creatorAddress: z.string().nullable().optional(),
    poolAddress: z.string().nullable().optional(),
    taxPct: z.number().nullable().optional(),
    // Kept for compatibility with prior API responses.
    creatorLaunchCount: z.number().int().nonnegative().optional(),
  }),
});

const bnbUsdTickerSchema = z.object({
  symbol: z.literal('BNBUSDT'),
  price: z.coerce.number().positive().finite(),
});

const withTimeout = async <T>(name: string, promise: Promise<T>, timeoutMs: number, unavailable: string[]): Promise<T | undefined> => {
  let timer: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } catch {
    unavailable.push(name);
    return undefined;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

function result<T>(value: { status: 'success'; result: T } | { status: 'failure' } | undefined, name: string, unavailable: string[]): T | undefined {
  if (!value || value.status !== 'success') {
    unavailable.push(name);
    return undefined;
  }
  return value.result;
}

export async function enrichLaunch(client: RunitupClient, launch: DecodedLaunch, timeoutMs = 5_000): Promise<LaunchEnrichment> {
  const unavailable: string[] = [];
  const contracts = [
    { address: launch.token, abi: erc20Abi, functionName: 'name' as const },
    { address: launch.token, abi: erc20Abi, functionName: 'symbol' as const },
    { address: launch.token, abi: erc20Abi, functionName: 'decimals' as const },
    { address: launch.token, abi: erc20Abi, functionName: 'totalSupply' as const },
    ...(launch.creator
      ? [{ address: launch.token, abi: erc20Abi, functionName: 'balanceOf' as const, args: [launch.creator] as const }]
      : []),
  ];
  const reads = await withTimeout('erc20 multicall', client.multicall({ contracts, allowFailure: true }), timeoutMs, unavailable);
  const creatorBnbBalancePromise = launch.creator
    ? withTimeout('creator BNB balance', client.getBalance({ address: launch.creator }), timeoutMs, unavailable)
    : Promise.resolve(undefined);
  const bnbUsdPricePromise = withTimeout('BNB/USD price', fetchBnbUsdPrice(), timeoutMs, unavailable);
  const bytecode = await withTimeout('bytecode', client.getBytecode({ address: launch.token }), timeoutMs, unavailable);
  const owner = await withTimeout('owner()', client.readContract({ address: launch.token, abi: erc20Abi, functionName: 'owner' }), timeoutMs, unavailable);
  const implementationSlot = await withTimeout(
    'EIP-1967 slot',
    client.getStorageAt({ address: launch.token, slot: EIP1967_IMPLEMENTATION_SLOT }),
    timeoutMs,
    unavailable,
  );
  const receipt = await withTimeout('transaction receipt', client.getTransactionReceipt({ hash: launch.transactionHash }), timeoutMs, unavailable);
  const launchTransaction = await withTimeout('launch transaction', client.getTransaction({ hash: launch.transactionHash }), timeoutMs, unavailable);
  const runitup = await withTimeout('Runitup token API', fetchRunitupProfile(launch.token), timeoutMs, unavailable);
  const [creatorBnbBalance, bnbUsdPrice] = await Promise.all([creatorBnbBalancePromise, bnbUsdPricePromise]);

  const name = result(reads?.[0] as { status: 'success'; result: string } | undefined, 'name()', unavailable);
  const symbol = result(reads?.[1] as { status: 'success'; result: string } | undefined, 'symbol()', unavailable);
  const decimals = result(reads?.[2] as { status: 'success'; result: number } | undefined, 'decimals()', unavailable);
  const totalSupply = result(reads?.[3] as { status: 'success'; result: bigint } | undefined, 'totalSupply()', unavailable);
  const creatorBalance = launch.creator
    ? result(reads?.[4] as { status: 'success'; result: bigint } | undefined, 'balanceOf(creator)', unavailable)
    : undefined;
  const contextLogs = receipt
    ? receipt.logs
      .filter((log) => log.address.toLowerCase() === launch.factory.toLowerCase())
      .map((log) => ({
        address: getAddress(log.address), topics: log.topics, data: log.data,
        blockNumber: log.blockNumber, blockHash: log.blockHash, transactionHash: log.transactionHash,
        logIndex: log.logIndex, removed: log.removed,
      }) satisfies ChainLog)
    : [];
  const transaction = {
    ...decodeTransactionContext(launch.token, contextLogs),
    ...decodeLaunchCall(launchTransaction?.input),
    bnbUsdPrice,
    sender: receipt ? getAddress(receipt.from) : undefined,
  };
  const implementation = implementationSlot && implementationSlot !== '0x' && !/^0x0{64}$/i.test(implementationSlot);
  const token: TokenMetadata = {
    name,
    symbol,
    decimals,
    totalSupply,
    creatorBalance,
    creatorBnbBalance,
    bytecode: bytecode ?? undefined,
    owner: typeof owner === 'string' ? getAddress(owner) : undefined,
    proxy: Boolean(implementation),
    unavailable: [...new Set(unavailable)],
  };
  return { token, transaction, runitup };
}

async function fetchBnbUsdPrice(): Promise<number> {
  const response = await fetch('https://data-api.binance.vision/api/v3/ticker/price?symbol=BNBUSDT', {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`BNB/USD ticker returned ${response.status}`);
  const parsed = bnbUsdTickerSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('BNB/USD ticker response failed validation');
  return parsed.data.price;
}

async function fetchRunitupProfile(address: Address): Promise<import('./types.js').RunitupTokenProfile | undefined> {
  const response = await fetch(`https://www.runitup.family/api/tokens/${address}?chain=56`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Runitup token API returned ${response.status}`);
  const parsed = runitupTokenResponseSchema.safeParse(await response.json());
  if (!parsed.success || parsed.data.token.chainId !== 56 || parsed.data.token.address.toLowerCase() !== address.toLowerCase()) {
    throw new Error('Runitup token API response failed token/chain validation');
  }
  const api = parsed.data.token;
  return {
    pair: asAddress(api.poolAddress),
    taxPercent: api.taxPct ?? undefined,
    twitter: api.socials?.x || undefined,
    website: api.socials?.website || undefined,
    telegram: api.socials?.telegram || undefined,
    about: api.description || undefined,
    creator: asAddress(api.creatorAddress),
    creatorLaunchCount: parsed.data.creatorLaunchCount ?? api.creatorLaunchCount,
  };
}

function asAddress(value: string | null | undefined): Address | undefined {
  try {
    return value ? getAddress(value) : undefined;
  } catch {
    return undefined;
  }
}

export function hasPrivilegedSelector(bytecode: `0x${string}` | undefined): readonly string[] {
  if (!bytecode) return [];
  const selectors = [
    ['mint(address,uint256)', 'mint'],
    ['mint(uint256)', 'mint'],
    ['pause()', 'pause'],
    ['unpause()', 'unpause'],
    ['blacklist(address)', 'blacklist'],
    ['setBlacklist(address,bool)', 'blacklist'],
    ['setMaxWallet(uint256)', 'max-wallet'],
  ] as const;
  const lower = bytecode.toLowerCase();
  return selectors.filter(([signature]) => lower.includes(toFunctionSelector(signature).slice(2).toLowerCase())).map(([, label]) => label);
}

export function hasNonZeroOwner(owner: Address | undefined): boolean {
  return Boolean(owner && owner.toLowerCase() !== zeroAddress.toLowerCase());
}
