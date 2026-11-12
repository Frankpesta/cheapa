import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { formatAlert, OpsAlerter, type Alert, type AlertThrottle } from './alerts.js';
import { loadWorkerEnv } from './config/env.js';
import { evaluateRun } from './jobs/health.js';
import type { CrawlRun } from './crawl/health.js';

const alert: Alert = {
  kind: 'store_blocked',
  storeId: 's1',
  message: 'Fake Fashion blocked CheapaBot (429)',
  details: { domain: 'fake.ng' },
};

function memoryThrottle(): AlertThrottle {
  const keys = new Set<string>();
  return {
    claim: (key) => Promise.resolve(!keys.has(key) && Boolean(keys.add(key))),
  };
}

function fakeFetch(status = 200) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fn = ((url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(init.body as string) as Record<string, unknown> });
    return Promise.resolve(new Response('{}', { status }));
  }) as typeof fetch;
  return { fn, calls };
}

const log = pino({ level: 'silent' });

describe('OpsAlerter', () => {
  it('posts to Telegram once per kind and store per window', async () => {
    const http = fakeFetch();
    const alerter = new OpsAlerter({
      log,
      throttle: memoryThrottle(),
      throttleSeconds: 3600,
      telegram: { botToken: 'T0KEN', chatId: '-100123' },
      fetch: http.fn,
    });
    await alerter.send(alert);
    await alerter.send(alert);
    await alerter.send({ ...alert, storeId: 's2' });
    expect(http.calls).toHaveLength(2);
    expect(http.calls[0]).toEqual({
      url: 'https://api.telegram.org/botT0KEN/sendMessage',
      body: { chat_id: '-100123', text: formatAlert(alert), disable_web_page_preview: true },
    });
  });

  it('only logs when Telegram is not configured', async () => {
    const http = fakeFetch();
    await new OpsAlerter({ log, throttle: memoryThrottle(), throttleSeconds: 60, fetch: http.fn }).send(
      alert,
    );
    expect(http.calls).toEqual([]);
  });

  it('never throws when delivery fails', async () => {
    const failing = (() => Promise.reject(new Error('network down'))) as typeof fetch;
    const alerter = new OpsAlerter({
      log,
      throttle: memoryThrottle(),
      throttleSeconds: 60,
      telegram: { botToken: 't', chatId: 'c' },
      fetch: failing,
    });
    await expect(alerter.send(alert)).resolves.toBeUndefined();
    await expect(
      new OpsAlerter({
        log,
        throttle: memoryThrottle(),
        throttleSeconds: 60,
        telegram: { botToken: 't', chatId: 'c' },
        fetch: fakeFetch(500).fn,
      }).send(alert),
    ).resolves.toBeUndefined();
  });

  it('formats a readable message', () => {
    expect(formatAlert(alert)).toBe(
      '⚠️ Cheapa store blocked\nFake Fashion blocked CheapaBot (429)\ndomain: fake.ng',
    );
  });
});

describe('alert env', () => {
  const base = {
    CATALOG_DATABASE_URL: 'postgres://u:p@localhost:5432/cheapa_catalog',
    REDIS_QUEUE_URL: 'redis://localhost:6379',
  };
  it('needs both Telegram settings or neither', () => {
    expect(() => loadWorkerEnv({ ...base, ALERT_TELEGRAM_BOT_TOKEN: 'x' })).toThrow(/ALERT_TELEGRAM_CHAT_ID/);
    expect(loadWorkerEnv(base).ALERT_THROTTLE_MINUTES).toBe(360);
    expect(
      loadWorkerEnv({ ...base, ALERT_TELEGRAM_BOT_TOKEN: 'x', ALERT_TELEGRAM_CHAT_ID: '-1' }),
    ).toMatchObject({
      ALERT_TELEGRAM_CHAT_ID: '-1',
    });
  });
});

describe('evaluateRun', () => {
  const store = { id: 's1', name: 'Fake Fashion', tier: 1 as const };
  const run = (over: Partial<CrawlRun>) =>
    ({ id: 'r1', itemsFound: 100, refsTotal: 20, fetchesFailed: 0, ...over }) as CrawlRun;
  const fresh = { visible: 100, fresh: 100 };

  it('is quiet for a normal run', () => {
    expect(evaluateRun(run({}), store, 100, fresh)).toEqual([]);
  });

  it('flags a >40% item drop against the 7-day median', () => {
    expect(evaluateRun(run({ itemsFound: 61 }), store, 100, fresh)).toEqual([]);
    expect(evaluateRun(run({ itemsFound: 59 }), store, 100, fresh)).toMatchObject([
      { kind: 'items_dropped' },
    ]);
    expect(evaluateRun(run({ itemsFound: 0 }), store, null, fresh)).toEqual([]);
  });

  it('flags an error rate above 10%', () => {
    expect(evaluateRun(run({ fetchesFailed: 2 }), store, 100, fresh)).toEqual([]);
    expect(evaluateRun(run({ fetchesFailed: 3 }), store, 100, fresh)).toMatchObject([
      { kind: 'error_rate', details: { errorRate: 0.15 } },
    ]);
  });

  it('flags stale tier-1 listings only', () => {
    const stale = { visible: 100, fresh: 90 };
    expect(evaluateRun(run({}), store, 100, stale)).toMatchObject([{ kind: 'stale_listings' }]);
    expect(evaluateRun(run({}), { ...store, tier: 2 }, 100, stale)).toEqual([]);
  });
});
