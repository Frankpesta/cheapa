import type { Redis } from 'ioredis';
import type { Logger } from './logger.js';

/**
 * Operational alerts (02-crawler-core.md 2.5, 11-compliance-and-ops.md 11.3): a store
 * blocked us, robots changed, item counts dropped, errors spiked, listings went stale.
 * Outcomes, not bugs, so they never go to Sentry.
 */
export interface Alert {
  kind:
    | 'store_blocked'
    | 'robots_disallowed'
    | 'items_dropped'
    | 'error_rate'
    | 'stale_listings'
    | 'partition_missing';
  /** Absent for system-wide alerts (partitions). */
  storeId?: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface Alerter {
  send(alert: Alert): Promise<void>;
}

/** "Have we sent this recently?" One alert per kind and store per window. */
export interface AlertThrottle {
  /** True when the caller may send (and claims the window). */
  claim(key: string, ttlSeconds: number): Promise<boolean>;
}

export class RedisAlertThrottle implements AlertThrottle {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'cheapa:alert',
  ) {}

  async claim(key: string, ttlSeconds: number): Promise<boolean> {
    return (await this.redis.set(`${this.prefix}:${key}`, '1', 'EX', ttlSeconds, 'NX')) === 'OK';
  }
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface AlerterOptions {
  log: Logger;
  throttle: AlertThrottle;
  /** Without it alerts are log lines only (local dev). */
  telegram?: TelegramConfig;
  throttleSeconds: number;
  fetch?: typeof fetch;
}

export function formatAlert(alert: Alert): string {
  const lines = [`⚠️ Cheapa ${alert.kind.replaceAll('_', ' ')}`, alert.message];
  for (const [key, value] of Object.entries(alert.details ?? {})) {
    lines.push(`${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
  }
  return lines.join('\n');
}

/**
 * Every alert is a warn log line (`alert: true`). When Telegram is configured, it also
 * goes to the ops chat, at most once per kind+store per window. Delivery failures are
 * logged and swallowed: an alert must never fail the job that raised it.
 */
export class OpsAlerter implements Alerter {
  private readonly fetch: typeof fetch;

  constructor(private readonly options: AlerterOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async send(alert: Alert): Promise<void> {
    const { log, telegram, throttle, throttleSeconds } = this.options;
    log.warn({ alert: true, ...alert }, alert.message);
    if (!telegram) return;
    try {
      if (!(await throttle.claim(`${alert.kind}:${alert.storeId ?? 'system'}`, throttleSeconds))) return;
      const res = await this.fetch(`https://api.telegram.org/bot${telegram.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegram.chatId,
          text: formatAlert(alert),
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      // Never log the URL: it carries the bot token.
      if (!res.ok) log.error({ kind: alert.kind, status: res.status }, 'telegram alert failed');
    } catch (err) {
      log.error(
        { kind: alert.kind, err: err instanceof Error ? err.message : String(err) },
        'telegram alert failed',
      );
    }
  }
}
