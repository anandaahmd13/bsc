import 'dotenv/config';
import pino from 'pino';
import { assertVerifiedRegistry, factoryAddresses, runitupLaunchEvents } from './contracts/runitup.js';
import { loadConfig, redactConfig } from './config.js';
import { enrichLaunch } from './chain/enrich.js';
import { DurableScanner } from './chain/scanner.js';
import { createHttpClient, createWebSocketClient } from './chain/rpc.js';
import type { ChainLog, DecodedLaunch } from './chain/types.js';
import { Store } from './db/store.js';
import { formatLaunchAlert } from './notify/format.js';
import { startAdminCommands, TelegramNotifier } from './notify/telegram.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const config = loadConfig();
assertVerifiedRegistry(config.chainId);
const client = createHttpClient(config);
const websocketClient = createWebSocketClient(config);
const store = new Store(config.dbPath);
const notifier = new TelegramNotifier(config, logger);

async function recordLaunch(launch: DecodedLaunch): Promise<void> {
  const [enrichment, head] = await Promise.all([
    enrichLaunch(client, launch),
    client.getBlockNumber(),
  ]);
  const body = formatLaunchAlert(launch, enrichment);
  const created = store.recordLaunch(launch, enrichment.token, body, config.telegramChatIds);
  if (created) {
    logger.info({ token: launch.token, event: launch.eventName, tx: launch.transactionHash, block: launch.blockNumber.toString() }, 'canonical Runitup launch recorded');
    await notifier.drain(store);
  }
}

const scanner = new DurableScanner(client, store, config, {
  onLaunch: recordLaunch,
  onReorg: async () => notifier.reconcileReorgAlerts(store),
}, logger);

async function main(): Promise<void> {
  const actualChain = await client.getChainId();
  if (actualChain !== config.chainId) throw new Error(`RPC chainId ${actualChain} does not match configured chainId ${config.chainId}`);
  logger.info({ config: redactConfig(config) }, 'starting Runitup BSC watcher');

  await scanner.scanOnce();
  const interval = setInterval(() => {
    void scanner.scanOnce().catch((error) => logger.error({ err: error }, 'HTTP scanner iteration failed'));
  }, config.pollIntervalMs);
  const stopCommands = startAdminCommands(notifier, config, store, logger);

  const unwatch = websocketClient
    ? (websocketClient as unknown as { watchEvent(options: { address: readonly `0x${string}`[]; events: unknown; onLogs(logs: readonly ChainLog[]): void; onError(error: Error): void }): () => void }).watchEvent({
      address: factoryAddresses,
      events: runitupLaunchEvents,
      onLogs: (logs) => {
        void scanner.processLogs(logs).catch((error) => logger.error({ err: error }, 'websocket launch processing failed'));
      },
      onError: (error) => logger.warn({ err: error }, 'websocket subscription error; HTTP recovery remains active'),
    })
    : undefined;
  if (websocketClient) logger.info('websocket low-latency subscription enabled');
  else logger.warn('WS_RPC_URL missing; HTTP polling is the only ingestion path');

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'shutting down');
    clearInterval(interval);
    unwatch?.();
    stopCommands();
    store.close();
    process.exit(0);
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

void main().catch((error) => {
  logger.fatal({ err: error }, 'startup failed');
  store.close();
  process.exitCode = 1;
});
