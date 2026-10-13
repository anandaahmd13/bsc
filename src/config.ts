import { z } from 'zod';
import { BSC_CHAIN_ID } from './contracts/runitup.js';

const integer = (min: number, fallback: number) =>
  z.coerce.number().int().min(min).default(fallback);

const schema = z.object({
  CHAIN_ID: z.coerce.number().int().default(BSC_CHAIN_ID),
  HTTP_RPC_URLS: z.string().min(1, 'HTTP_RPC_URLS is required'),
  WS_RPC_URL: z.string().url().optional().or(z.literal('')),
  DB_PATH: z.string().min(1).default('./data/runitup.sqlite'),
  POLL_INTERVAL_MS: integer(500, 4_000),
  REORG_WINDOW: integer(2, 24),
  INITIAL_CHUNK_SIZE: integer(10, 100),
  MIN_CHUNK_SIZE: integer(1, 10),
  BOOTSTRAP_BLOCK: z.coerce.bigint().positive().optional(),
  FINALITY_CONFIRMATIONS: integer(1, 15),
  DRY_RUN: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_CHAT_IDS: z.string().optional().default(''),
  TELEGRAM_ADMIN_USER_IDS: z.string().optional().default(''),
  TELEGRAM_MIN_INTERVAL_MS: integer(100, 1_000),
});

const commaList = (value: string) => value.split(',').map((entry) => entry.trim()).filter(Boolean);

export interface AppConfig {
  chainId: number;
  httpRpcUrls: readonly string[];
  wsRpcUrl?: string;
  dbPath: string;
  pollIntervalMs: number;
  reorgWindow: number;
  initialChunkSize: number;
  minChunkSize: number;
  bootstrapBlock?: bigint;
  finalityConfirmations: number;
  dryRun: boolean;
  telegramBotToken?: string;
  telegramChatIds: readonly string[];
  telegramAdminUserIds: ReadonlySet<string>;
  telegramMinIntervalMs: number;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const raw = schema.parse(environment);
  const httpRpcUrls = commaList(raw.HTTP_RPC_URLS);
  if (!httpRpcUrls.every((url) => /^https?:\/\//.test(url))) {
    throw new Error('HTTP_RPC_URLS must contain only http(s) URLs');
  }
  if (raw.WS_RPC_URL && !/^wss?:\/\//.test(raw.WS_RPC_URL)) {
    throw new Error('WS_RPC_URL must be ws(s)://');
  }
  if (raw.MIN_CHUNK_SIZE > raw.INITIAL_CHUNK_SIZE) {
    throw new Error('MIN_CHUNK_SIZE cannot exceed INITIAL_CHUNK_SIZE');
  }
  const telegramChatIds = commaList(raw.TELEGRAM_CHAT_IDS);
  if (!raw.DRY_RUN && (!raw.TELEGRAM_BOT_TOKEN || !telegramChatIds.length)) {
    throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_IDS are required when DRY_RUN=false');
  }
  return {
    chainId: raw.CHAIN_ID,
    httpRpcUrls,
    wsRpcUrl: raw.WS_RPC_URL || undefined,
    dbPath: raw.DB_PATH,
    pollIntervalMs: raw.POLL_INTERVAL_MS,
    reorgWindow: raw.REORG_WINDOW,
    initialChunkSize: raw.INITIAL_CHUNK_SIZE,
    minChunkSize: raw.MIN_CHUNK_SIZE,
    bootstrapBlock: raw.BOOTSTRAP_BLOCK,
    finalityConfirmations: raw.FINALITY_CONFIRMATIONS,
    dryRun: raw.DRY_RUN,
    telegramBotToken: raw.TELEGRAM_BOT_TOKEN,
    telegramChatIds,
    telegramAdminUserIds: new Set(commaList(raw.TELEGRAM_ADMIN_USER_IDS)),
    telegramMinIntervalMs: raw.TELEGRAM_MIN_INTERVAL_MS,
  };
}

/** Safe to log: deliberately excludes bot token and never expands URLs with credentials. */
export function redactConfig(config: AppConfig): Record<string, unknown> {
  return {
    chainId: config.chainId,
    httpRpcEndpointCount: config.httpRpcUrls.length,
    hasWsRpc: Boolean(config.wsRpcUrl),
    dbPath: config.dbPath,
    pollIntervalMs: config.pollIntervalMs,
    reorgWindow: config.reorgWindow,
    finalityConfirmations: config.finalityConfirmations,
    dryRun: config.dryRun,
    telegramChatCount: config.telegramChatIds.length,
    telegramAdminCount: config.telegramAdminUserIds.size,
  };
}
