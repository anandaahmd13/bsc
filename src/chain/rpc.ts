import { createPublicClient, fallback, http, webSocket } from 'viem';
import { bsc } from 'viem/chains';
import type { AppConfig } from '../config.js';

export function createHttpClient(config: AppConfig) {
  return createPublicClient({
    chain: bsc,
    transport: fallback(config.httpRpcUrls.map((url) => http(url, { retryCount: 2, timeout: 12_000 }))),
  });
}

export type RunitupClient = ReturnType<typeof createHttpClient>;

export function createWebSocketClient(config: AppConfig) {
  if (!config.wsRpcUrl) return undefined;
  return createPublicClient({
    chain: bsc,
    transport: webSocket(config.wsRpcUrl, { retryDelay: 1_000, timeout: 12_000 }),
  });
}

export function isLogRangeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return /(?:range|limit|too many|query returned more than|max results|response size|exceed)/.test(message);
}
