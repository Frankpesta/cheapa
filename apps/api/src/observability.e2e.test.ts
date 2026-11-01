/**
 * 01-foundation.md 1.7 acceptance (API side):
 * - an unexpected error reaches Sentry with requestId, user id only, and no body,
 *   auth header, cookie, device id, email or phone
 * - expected 4xx errors are not reported
 * - search_served reaches PostHog without query text or image hash; link-device aliases
 */
import { Body, Controller, Module, Post } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initSentry } from './instrument.js';
import { AnalyticsService } from './modules/analytics/analytics.service.js';
import { Public } from './modules/auth/auth.decorators.js';
import { type Harness, startHarness } from './test/harness.js';

@Public()
@Controller('__test')
class BoomController {
  @Post('boom')
  boom(@Body() _body: unknown): never {
    throw new Error('exploded for ada@example.com, call 08031234567');
  }
}

@Module({ controllers: [BoomController] })
class BoomModule {}

const DEVICE = '5e5e5e5e-1111-4222-8333-444444444444';
const sentryBodies: string[] = [];
const posthogBatches: { event: string; distinct_id: string; properties: Record<string, unknown> }[] = [];
let posthog: Server;
let h: Harness;

beforeAll(async () => {
  posthog = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const text = (req.headers['content-encoding'] === 'gzip' ? gunzipSync(raw) : raw).toString('utf8');
      const parsed = JSON.parse(text) as { batch?: typeof posthogBatches };
      posthogBatches.push(...(parsed.batch ?? []));
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"status":1}');
    });
  });
  await new Promise<void>((resolve) => posthog.listen(0, '127.0.0.1', resolve));
  const { port } = posthog.address() as AddressInfo;

  initSentry(
    { NODE_ENV: 'test' },
    {
      dsn: 'https://public@o0.ingest.de.sentry.io/0',
      tracesSampleRate: 0,
      transport: (options) =>
        Sentry.createTransport(options, (request) => {
          sentryBodies.push(
            typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body),
          );
          return Promise.resolve({ statusCode: 200 });
        }),
    },
  );

  h = await startHarness({ POSTHOG_API_KEY: 'phc_testkey123456', POSTHOG_HOST: `http://127.0.0.1:${port}` }, [
    BoomModule,
  ]);
});

afterAll(async () => {
  await h?.stop();
  await Sentry.close(2_000);
  await new Promise((resolve) => posthog?.close(resolve));
});

/** Error events from captured envelopes (an envelope is newline-delimited JSON). */
function sentryErrorEvents(): Record<string, unknown>[] {
  return sentryBodies.flatMap((body) => {
    const lines = body.split('\n').filter(Boolean);
    const events: Record<string, unknown>[] = [];
    for (let i = 1; i < lines.length; i += 2) {
      const item = JSON.parse(lines[i] ?? '{}') as { type?: string };
      if (item.type === 'event') events.push(JSON.parse(lines[i + 1] ?? '{}') as Record<string, unknown>);
    }
    return events;
  });
}

describe('Sentry', () => {
  it('reports an unexpected error with requestId and user id, scrubbed', async () => {
    const token = h.signer.sign({ sub: 'user_sentry', azp: 'http://localhost:3000' });
    const res = await h.app.inject({
      method: 'POST',
      url: '/__test/boom?q=black+dress',
      headers: {
        authorization: `Bearer ${token}`,
        cookie: 'session=supersecretcookie',
        'x-cheapa-device': DEVICE,
        'x-request-id': 'req-sentry-0001',
        'user-agent': 'cheapa-test',
      },
      payload: { query: 'black satin slip dress', phone: '+2348031234567' },
    });
    expect(res.statusCode).toBe(500);
    await Sentry.flush(2_000);

    const events = sentryErrorEvents();
    expect(events).toHaveLength(1);
    const event = events[0] as {
      tags?: Record<string, string>;
      user?: Record<string, unknown>;
      request?: { headers?: Record<string, string>; data?: unknown };
      exception?: { values?: { value?: string }[] };
    };

    expect(event.tags?.requestId).toBe('req-sentry-0001');
    expect(Object.keys(event.user ?? {})).toEqual(['id']);
    expect(event.request?.data).toBeUndefined();
    const headers = Object.keys(event.request?.headers ?? {}).map((k) => k.toLowerCase());
    expect(headers).not.toContain('authorization');
    expect(headers).not.toContain('cookie');
    expect(headers).not.toContain('x-cheapa-device');
    expect(event.exception?.values?.[0]?.value).toBe('exploded for [redacted], call [redacted]');

    const raw = JSON.stringify(event);
    for (const secret of [
      token,
      'supersecretcookie',
      'ada@example.com',
      '08031234567',
      '2348031234567',
      DEVICE,
      'black satin',
    ]) {
      expect(raw).not.toContain(secret);
    }
  });

  it('does not report expected 4xx errors', async () => {
    const before = sentryErrorEvents().length;
    expect((await h.app.inject({ method: 'GET', url: '/me' })).statusCode).toBe(401);
    expect((await h.app.inject({ method: 'GET', url: '/products/nope' })).statusCode).toBe(404);
    await Sentry.flush(2_000);
    expect(sentryErrorEvents().length).toBe(before);
  });
});

describe('PostHog', () => {
  it('sends search_served keyed by device, without query text or hash', async () => {
    const me = (
      await h.app.inject({ method: 'GET', url: '/me', headers: { 'x-cheapa-device': DEVICE } })
    ).json<{
      device: { id: string };
    }>();
    const res = await h.app.inject({
      method: 'POST',
      url: '/search/text',
      headers: { 'x-cheapa-device': DEVICE },
      payload: { query: 'black satin slip dress', source: 'share' },
    });
    expect(res.statusCode).toBe(200);
    await h.app.get(AnalyticsService).flush();

    const event = posthogBatches.find((e) => e.event === 'search_served');
    expect(event?.distinct_id).toBe(me.device.id);
    expect(event?.properties).toMatchObject({
      kind: 'text',
      source: 'share',
      cacheHit: false,
      productCount: 0,
      signedIn: false,
    });
    expect(JSON.stringify(event)).not.toContain('black satin');
    expect(Object.keys(event?.properties ?? {}).some((k) => /sha|hash|query/i.test(k))).toBe(false);
  });

  it('aliases the device to the user on link-device', async () => {
    const token = h.signer.sign({ sub: 'user_alias', azp: 'http://localhost:3000' });
    const res = await h.app.inject({
      method: 'POST',
      url: '/me/link-device',
      headers: { authorization: `Bearer ${token}`, 'x-cheapa-device': DEVICE },
    });
    expect(res.statusCode).toBe(200);
    const { userId, deviceId } = res.json<{ userId: string; deviceId: string }>();
    await h.app.get(AnalyticsService).flush();

    const alias = posthogBatches.find((e) => e.event === '$create_alias');
    expect(alias?.distinct_id).toBe(userId);
    expect(alias?.properties.alias).toBe(deviceId);
  });
});
