import fixture from './fixtures/del-token-launched.json' with { type: 'json' };
import { encodeFunctionData } from 'viem';
import { describe, expect, it } from 'vitest';
import { decodeLaunchCall, decodeLaunchLog } from '../src/chain/decode.js';
import { launchTopics, runitupFactoryLaunchAbi } from '../src/contracts/runitup.js';
import type { ChainLog } from '../src/chain/types.js';

describe('verified DEL golden fixture', () => {
  it('decodes the TokenLaunched event at log 0x49', () => {
    const launch = decodeLaunchLog({
      ...fixture,
      blockNumber: BigInt(fixture.blockNumber),
    } as ChainLog);
    expect(launch).toMatchObject({
      eventName: 'TokenLaunched',
      totalSupply: 1_000_000_000_000_000_000_000_000_000n,
      tokenId: 1_596_104n,
      transactionHash: fixture.transactionHash,
      logIndex: 73,
    });
    expect(launch?.token.toLowerCase()).toBe('0xa00866f73aaead7e0a410386c6ea66b979c40bfc');
    expect(launch?.creator?.toLowerCase()).toBe('0xcd5f15d0ae0cab4b7b941c0475a37107bb20f28e');
    expect(launch?.pool?.toLowerCase()).toBe('0x702607fb171a17fecf1a4e731a120ed6f6542e88');
  });

  it('pins the reviewed topic0 instead of inferring from a token address', () => {
    expect(fixture.topics[0]).toBe(launchTopics.TokenLaunched);
  });

  it('decodes the developer buy from the DEL launch factory calldata', () => {
    const data = encodeFunctionData({
      abi: runitupFactoryLaunchAbi,
      functionName: 'launchSniper',
      args: [{
        name: 'Dly', symbol: 'DEL', totalSupply: 1_000_000_000_000_000_000_000_000_000n,
        feeRecipient: '0x7fc61aa970469c42faf4dce3ac0b2475a7e76cc6',
        devBuyWei: 13_471_427_420_192_330n,
        venue: 2,
        quoteToken: '0x0000000000000000000000000000000000000000',
        devBuyQuoteAmount: 0n,
        nonce: '0x52c04c41536af8666548ed3b3cf2f49d1e5d1b2d9cc6cb3e66d4a855e6732a3',
      }, 5],
    });
    expect(decodeLaunchCall(data)).toEqual({
      devBuyWei: 13_471_427_420_192_330n,
      devBuyQuoteAmount: 0n,
    });
  });
});
