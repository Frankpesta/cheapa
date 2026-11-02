/**
 * Worker test harness: a fresh catalog database cloned from the template, a private
 * BullMQ prefix, a local HTTP "store" and a fake adapter that crawls it through the real
 * PoliteHttp (robots, blocks, retries). Rate limiting is a no-op here; it has its own
 * Redis tests in @cheapa/adapters.
 */
import { AdapterRegistry, ParseError, PoliteHttp, type RateLimiter } from '@cheapa/adapters';
import { send, startServer, type Route, type TestServer } from '@cheapa/adapters/testing';
import type { JsonValue, RawListingInput, SourceAdapter } from '@cheapa/adapters/types';
import { createCatalogDb, stores, type CatalogConnection } from '@cheapa/db/catalog';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { pino } from 'pino';
import { inject } from 'vitest';
import type { Alert, Alerter } from '../alerts.js';
import type { WorkerDeps } from '../jobs/deps.js';
import { closeQueues, createQueues, type Queues } from '../queues.js';
import { CATALOG_TEMPLATE } from './global-setup.js';

export interface Harness {
  catalog: CatalogConnection;
  redis: Redis;
  queues: Queues;
  prefix: string;
  server: TestServer;
  deps: WorkerDeps;
  alerts: Alert[];
  addStore(overrides?: Partial<typeof stores.$inferInsert>): Promise<string>;
  stop(): Promise<void>;
}

const noLimit: RateLimiter = { acquire: () => Promise.resolve() };

interface Product {
  sku: string;
  name: string;
  price: number;
}

/** Fake store API: /list -> { pages: [paths] }, each page -> { products: [...] }. */
export function fakeAdapter(domain: string): SourceAdapter {
  const origin = `http://${domain}`;
  const getJson = async (http: { get: PoliteHttp['get'] }, url: string, signal: AbortSignal) =>
    JSON.parse((await http.get(url, { accept: 'json', signal })).body) as JsonValue;
  return {
    id: 'fake',
    kind: 'custom',
    domains: [domain],
    needsBrowser: false,
    async *discover(ctx) {
      const list = (await getJson(ctx.http, `${origin}/list`, ctx.signal)) as { pages: string[] };
      for (const path of list.pages) yield { kind: 'page', url: origin + path };
    },
    async fetch(ctx, ref) {
      return {
        ref,
        url: ref.url,
        fetchedAt: new Date().toISOString(),
        format: 'json',
        body: await getJson(ctx.http, ref.url, ctx.signal),
      };
    },
    parse(raw) {
      const body = raw.body as { products?: Product[] };
      if (raw.format !== 'json' || !Array.isArray(body.products))
        throw new ParseError('fake', 'no products array');
      return body.products.map((p): RawListingInput => ({
        externalId: p.sku,
        sourceUrl: `${origin}/p/${p.sku}`,
        title: p.name,
        priceKobo: p.price,
        inStock: true,
      }));
    },
  };
}

export const json =
  (value: unknown): Route =>
  (res) =>
    send(res, 200, JSON.stringify(value), { 'content-type': 'application/json' });

export async function startHarness(routes: Record<string, Route> = {}): Promise<Harness> {
  const adminUri = inject('pgAdminUri');
  const dbName = `w_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  await withAdmin(adminUri, (admin) => cloneDatabase(admin, dbName));
  const catalog = createCatalogDb(Object.assign(new URL(adminUri), { pathname: `/${dbName}` }).toString(), {
    max: 4,
  });

  const redis = new Redis(inject('redisUrl'), { maxRetriesPerRequest: null });
  const prefix = `t${randomUUID().slice(0, 8)}`;
  const queues = createQueues(redis, prefix);
  const server = await startServer({ '/robots.txt': (res) => send(res, 404), ...routes });
  const domain = new URL(server.origin).host;
  const alerts: Alert[] = [];
  const alerter: Alerter = { send: (a) => Promise.resolve(void alerts.push(a)) };

  const deps: WorkerDeps = {
    db: catalog.db,
    queues,
    registry: new AdapterRegistry([fakeAdapter(domain)]),
    httpFor: (store) =>
      new PoliteHttp({ limiter: noLimit, maxRps: store.crawlPolicy.maxRps, backoffBaseMs: 1 }),
    alerter,
    log: pino({ level: 'silent' }),
    signal: new AbortController().signal,
    random: () => 0,
  };

  return {
    catalog,
    redis,
    queues,
    prefix,
    server,
    deps,
    alerts,
    async addStore(overrides = {}) {
      const [row] = await catalog.db
        .insert(stores)
        .values({
          name: 'Fake Fashion',
          domain,
          platform: 'custom',
          tier: 1,
          status: 'active',
          crawlPolicy: { robotsOk: true, maxRps: 3 },
          ...overrides,
        })
        .returning({ id: stores.id });
      return row!.id;
    },
    async stop() {
      await closeQueues(queues);
      await Promise.allSettled([server.close(), catalog.close()]);
      redis.disconnect();
      await withAdmin(adminUri, (admin) => admin.query(`drop database if exists ${dbName} with (force)`));
    },
  };
}

async function withAdmin<T>(uri: string, run: (admin: pg.Client) => Promise<T>): Promise<T> {
  const admin = new pg.Client({ connectionString: uri });
  await admin.connect();
  try {
    return await run(admin);
  } finally {
    await admin.end();
  }
}

/** CREATE DATABASE ... TEMPLATE, retrying while another file is cloning the same template. */
async function cloneDatabase(admin: pg.Client, name: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await admin.query(`create database ${name} template ${CATALOG_TEMPLATE}`);
      return;
    } catch (error) {
      const busy = error instanceof Error && /being accessed by other users/.test(error.message);
      if (!busy || attempt >= 20) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
    }
  }
}

/** Polls until `check` passes or the timeout expires. */
export async function waitFor(check: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
