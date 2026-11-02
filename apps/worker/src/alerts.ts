import type { Logger } from './logger.js';

/**
 * Operational alerts (02-crawler-core.md 2.5): a store blocked us, robots changed,
 * item counts dropped. Outcomes, not bugs, so they never go to Sentry.
 */
export interface Alert {
  kind: 'store_blocked' | 'robots_disallowed' | 'items_dropped' | 'error_rate';
  storeId: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface Alerter {
  send(alert: Alert): Promise<void>;
}

/** Writes alerts as warn-level log lines (`alert: true`); 2.5 adds Telegram/email delivery. */
export class LogAlerter implements Alerter {
  constructor(private readonly log: Logger) {}

  send(alert: Alert): Promise<void> {
    this.log.warn({ alert: true, ...alert }, alert.message);
    return Promise.resolve();
  }
}
