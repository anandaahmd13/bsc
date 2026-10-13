import type { Logger } from 'pino';
import type { AppConfig } from '../config.js';
import type { Store, StoredOutbox } from '../db/store.js';
import { launchReferralKeyboard } from './referral-links.js';

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  parameters?: { retry_after?: number };
}

interface TelegramMessage {
  message_id: number;
}

export class TelegramError extends Error {
  constructor(message: string, readonly retryAfterMs?: number) {
    super(message);
  }
}

/** Minimal Telegram Bot API client: this service never owns a wallet or signs. */
export class TelegramNotifier {
  private lastWriteAt = 0;

  constructor(private readonly config: AppConfig, private readonly logger: Logger) {}

  async drain(store: Store): Promise<void> {
    if (store.isPaused()) return;
    for (const item of store.getDueOutbox()) {
      try {
        const messageId = await this.send(item.chatId, item.body, launchReferralKeyboard);
        store.markSent(item.id, messageId);
      } catch (error) {
        const retryAfterMs = error instanceof TelegramError && error.retryAfterMs ? error.retryAfterMs : exponentialBackoff(item.attempts);
        store.retryOutbox(item.id, error instanceof Error ? error.message : String(error), retryAfterMs);
        this.logger.warn({ outboxId: item.id, retryAfterMs, err: error }, 'Telegram delivery deferred');
      }
    }
  }

  async reconcileReorgAlerts(store: Store): Promise<void> {
    for (const item of store.getReorgNotices()) {
      try {
        if (!item.telegramMessageId || this.config.dryRun) {
          store.markReorgNoticeSent(item.id);
          continue;
        }
        const reorgBody = `${item.body}\n\n<b>REORGED</b> — this launch log is no longer canonical.`;
        try {
          await this.edit(item.chatId, item.telegramMessageId, reorgBody);
        } catch {
          await this.send(item.chatId, '<b>REORGED</b> — a previously reported Runitup launch was removed by a chain reorganization.');
        }
        store.markReorgNoticeSent(item.id);
      } catch (error) {
        this.logger.warn({ outboxId: item.id, err: error }, 'could not reconcile reorg alert yet');
      }
    }
  }

  async send(chatId: string, text: string, replyMarkup?: Record<string, unknown>): Promise<number | undefined> {
    if (this.config.dryRun) {
      this.logger.info({ chatId, preview: text.slice(0, 160) }, 'DRY_RUN Telegram alert');
      return undefined;
    }
    const result = await this.call<TelegramMessage>('sendMessage', {
      chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
    return result.message_id;
  }

  async edit(chatId: string, messageId: number, text: string): Promise<void> {
    await this.call<TelegramMessage>('editMessageText', {
      chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', disable_web_page_preview: true,
    });
  }

  private async call<T>(method: string, body: Record<string, unknown>): Promise<T> {
    if (!this.config.telegramBotToken) throw new TelegramError('Telegram token is not configured');
    const wait = this.config.telegramMinIntervalMs - (Date.now() - this.lastWriteAt);
    if (wait > 0) await delay(wait);
    const response = await fetch(`https://api.telegram.org/bot${this.config.telegramBotToken}/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    this.lastWriteAt = Date.now();
    const data = await response.json() as TelegramResponse<T>;
    if (!response.ok || !data.ok || !data.result) {
      throw new TelegramError(data.description ?? `Telegram ${method} failed`, data.parameters?.retry_after ? data.parameters.retry_after * 1_000 : undefined);
    }
    return data.result;
  }
}

/** Long-polls admin commands; only Telegram numeric IDs in the config are trusted. */
export function startAdminCommands(
  notifier: TelegramNotifier,
  config: AppConfig,
  store: Store,
  logger: Logger,
): () => void {
  if (config.dryRun || !config.telegramBotToken || !config.telegramAdminUserIds.size) return () => undefined;
  let offset = 0;
  let stopped = false;
  const poll = async (): Promise<void> => {
    while (!stopped) {
      try {
        const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/getUpdates?timeout=25&offset=${offset}`);
        const data = await response.json() as TelegramResponse<readonly { update_id: number; message?: { text?: string; from?: { id?: number }; chat: { id: number } } }[]>;
        if (!data.ok || !data.result) throw new Error(data.description ?? 'getUpdates failed');
        for (const update of data.result) {
          offset = update.update_id + 1;
          const message = update.message;
          if (!message?.text || !message.from?.id || !config.telegramAdminUserIds.has(String(message.from.id))) continue;
          const reply = command(message.text, store);
          if (reply) await notifier.send(String(message.chat.id), reply);
        }
      } catch (error) {
        logger.warn({ err: error }, 'Telegram command polling failed; retrying');
        await delay(2_000);
      }
    }
  };
  void poll();
  return () => { stopped = true; };
}

function command(text: string, store: Store): string | undefined {
  const verb = text.trim().split(/\s+/, 1)[0]?.replace(/@\w+$/, '');
  if (verb === '/status') {
    const status = store.status();
    return `status: ${status.paused ? 'paused' : 'running'}\ncursor: ${status.cursor?.toString() ?? 'not set'}\npending: ${status.pending}`;
  }
  if (verb === '/pause') { store.setPaused(true); return 'Alerts paused; scanner continues recording canonical events.'; }
  if (verb === '/resume') { store.setPaused(false); return 'Alerts resumed.'; }
  if (verb === '/last') return store.getLastBody() ?? 'No delivered alert yet.';
  return undefined;
}

function exponentialBackoff(attempts: number): number {
  return Math.min(10 * 60_000, 1_000 * 2 ** Math.min(attempts, 8));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
