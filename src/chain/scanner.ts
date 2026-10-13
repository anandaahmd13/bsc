import { isVerifiedFactory, runitupFactories, runitupLaunchEvents } from '../contracts/runitup.js';
import type { AppConfig } from '../config.js';
import type { Store } from '../db/store.js';
import type { Logger } from 'pino';
import { decodeLaunchLog } from './decode.js';
import { isLogRangeError, isRpcHeadLagError } from './rpc.js';
import type { RunitupClient } from './rpc.js';
import type { ChainLog, DecodedLaunch } from './types.js';

export interface ScannerHooks {
  onLaunch(launch: DecodedLaunch): Promise<void>;
  onReorg(): Promise<void>;
}

/**
 * HTTP polling is authoritative for backfill and recovery. The same idempotent
 * path accepts websocket logs so a WS outage never loses a launch.
 */
export class DurableScanner {
  private running = false;
  private chunkSize: number;

  constructor(
    private readonly client: RunitupClient,
    private readonly store: Store,
    private readonly config: AppConfig,
    private readonly hooks: ScannerHooks,
    private readonly logger: Logger,
  ) {
    this.chunkSize = config.initialChunkSize;
  }

  async scanOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const head = await this.client.getBlockNumber();
      await this.reconcile(head);
      const cursor = this.store.getCursor();
      const minimum = factoryMinimumStart();
      // A first run monitors the latest reorg window. Historical replay is an
      // explicit operator action through BOOTSTRAP_BLOCK, avoiding alert floods.
      const initial = this.config.bootstrapBlock ?? (head > BigInt(this.config.reorgWindow) ? head - BigInt(this.config.reorgWindow) : minimum);
      let from = cursor === undefined ? initial : cursor + 1n;
      if (from < minimum) from = minimum;
      // Rescan the mutable tail every time. Database uniqueness makes overlap safe.
      const tail = head > BigInt(this.config.reorgWindow) ? head - BigInt(this.config.reorgWindow) : minimum;
      if (cursor !== undefined && tail < from) from = tail < minimum ? minimum : tail;
      while (from <= head) {
        const desiredEnd = from + BigInt(this.chunkSize - 1);
        const to = desiredEnd > head ? head : desiredEnd;
        const completed = await this.scanRange(from, to);
        // Do not advance the durable cursor when the provider's getLogs
        // backend is behind the head it just reported. The next polling pass
        // retries this exact uncommitted range after POLL_INTERVAL_MS.
        if (!completed) return;
        this.store.setCursor(to);
        from = to + 1n;
      }
    } finally {
      this.running = false;
    }
  }

  /** Returns false only when an RPC getLogs backend is temporarily behind head. */
  async scanRange(fromBlock: bigint, toBlock: bigint): Promise<boolean> {
    let start = fromBlock;
    while (start <= toBlock) {
      const end = start + BigInt(this.chunkSize - 1) > toBlock ? toBlock : start + BigInt(this.chunkSize - 1);
      try {
        const logs = await this.fetchLogs(start, end);
        await this.processLogs(logs);
        if (this.chunkSize < this.config.initialChunkSize) this.chunkSize = Math.min(this.config.initialChunkSize, this.chunkSize * 2);
        start = end + 1n;
      } catch (error) {
        if (isRpcHeadLagError(error)) {
          this.logger.debug(
            { fromBlock: start.toString(), toBlock: end.toString() },
            'RPC getLogs backend is behind its reported head; retaining range for next poll',
          );
          return false;
        }
        if (isLogRangeError(error) && this.chunkSize > this.config.minChunkSize) {
          this.chunkSize = Math.max(this.config.minChunkSize, Math.floor(this.chunkSize / 2));
          this.logger.warn({ fromBlock: start.toString(), toBlock: end.toString(), chunkSize: this.chunkSize }, 'shrinking getLogs range after provider limit');
          continue;
        }
        throw error;
      }
    }
    return true;
  }

  /**
   * Some public BSC nodes reject an OR-list of addresses/topics even for tiny
   * ranges. One factory + one event per request is less efficient but portable;
   * range adaptation still handles ordinary block/result caps.
   */
  private async fetchLogs(fromBlock: bigint, toBlock: bigint): Promise<readonly ChainLog[]> {
    const batches = await Promise.all(
      runitupFactories.flatMap((factory) => runitupLaunchEvents.map(async (event) => {
        const logs = await this.client.getLogs({ address: factory.address, event, fromBlock, toBlock });
        return logs as unknown as readonly ChainLog[];
      })),
    );
    return batches.flat().sort((left, right) => {
      const byBlock = Number((left.blockNumber ?? 0n) - (right.blockNumber ?? 0n));
      return byBlock || (left.logIndex ?? 0) - (right.logIndex ?? 0);
    });
  }

  async processLogs(logs: readonly ChainLog[]): Promise<void> {
    for (const log of logs) {
      if (log.removed) continue;
      const launch = decodeLaunchLog(log);
      if (!launch) continue;
      if (!isVerifiedFactory(launch.factory)) {
        this.logger.error({ factory: launch.factory, transactionHash: launch.transactionHash }, 'refusing non-registry launch log');
        continue;
      }
      this.store.recordBlock(launch.blockNumber, launch.blockHash);
      await this.hooks.onLaunch(launch);
    }
  }

  /** Returns true only when a persisted canonical event block changed hash. */
  private async reconcile(head: bigint): Promise<void> {
    const min = head > BigInt(this.config.reorgWindow) ? head - BigInt(this.config.reorgWindow) : 0n;
    const recent = this.store.getRecentBlocks(min);
    for (const stored of recent) {
      const current = await this.client.getBlock({ blockNumber: stored.number });
      if (current.hash && current.hash.toLowerCase() !== stored.hash.toLowerCase()) {
        this.logger.warn({ block: stored.number.toString(), oldHash: stored.hash, newHash: current.hash }, 'BSC reorg detected; rolling back canonical alerts');
        this.store.rollbackFrom(stored.number);
        await this.hooks.onReorg();
        return;
      }
    }
  }
}

function factoryMinimumStart(): bigint {
  // Kept local to avoid accepting a range before the verified registry begins.
  let minimum: bigint = runitupFactories[0]!.startBlock;
  for (const factory of runitupFactories) if (factory.startBlock < minimum) minimum = factory.startBlock;
  return minimum;
}
