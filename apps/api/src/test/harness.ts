/**
 * E2E harness: throwaway Postgres (pgvector) + two Redis containers, migrated
 * catalog, and the real createApp(). Requests go through fastify.inject (no network).
 */
import { createCatalogDb, runCatalogMigrations, type CatalogConnection } from '@cheapa/db/catalog';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { createApp } from '../bootstrap.js';
import { type ApiEnv, loadApiEnv } from '../config/env.js';

export interface Harness {
  app: NestFastifyApplication;
  catalog: CatalogConnection;
  redisCache: StartedTestContainer;
  env: ApiEnv;
  stop: () => Promise<void>;
}

const redis = () =>
  new GenericContainer('redis:7.4.8-alpine')
    .withCommand(['redis-server', '--maxmemory-policy', 'noeviction'])
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
    .start();

export async function startHarness(overrides: Record<string, string> = {}): Promise<Harness> {
  const [postgres, redisQueue, redisCache] = await Promise.all([
    new PostgreSqlContainer('pgvector/pgvector:0.8.3-pg16').start(),
    redis(),
    redis(),
  ]);
  await prepareDatabases(postgres);

  const base = new URL(postgres.getConnectionUri());
  const dbUrl = (name: string) => Object.assign(new URL(base), { pathname: `/${name}` }).toString();
  const env = loadApiEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    CATALOG_DATABASE_URL: dbUrl(postgres.getDatabase()),
    USERS_DATABASE_URL: dbUrl('cheapa_users'),
    REDIS_QUEUE_URL: `redis://${redisQueue.getHost()}:${redisQueue.getMappedPort(6379)}`,
    REDIS_CACHE_URL: `redis://${redisCache.getHost()}:${redisCache.getMappedPort(6379)}`,
    ...overrides,
  });

  const catalog = createCatalogDb(env.CATALOG_DATABASE_URL, { max: 2 });
  await runCatalogMigrations(catalog.db);

  const app = await createApp(env);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return {
    app,
    catalog,
    redisCache,
    env,
    stop: async () => {
      await app.close();
      await catalog.close();
      await Promise.allSettled([postgres.stop(), redisQueue.stop(), redisCache.stop()]);
    },
  };
}

async function prepareDatabases(postgres: StartedPostgreSqlContainer): Promise<void> {
  const admin = new pg.Client({ connectionString: postgres.getConnectionUri() });
  await admin.connect();
  await admin.query('create extension if not exists vector; create extension if not exists pg_trgm;');
  await admin.query('create database cheapa_users');
  await admin.end();
}

/** Smallest valid PNG (1x1), optionally padded to an exact byte size. */
export function pngBytes(padTo = 0): Buffer {
  const png = Buffer.from(
    '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415478da63f8cfc0000003010100c9fe92ef0000000049454e44ae426082',
    'hex',
  );
  return padTo > png.length ? Buffer.concat([png, Buffer.alloc(padTo - png.length)]) : png;
}

/** multipart/form-data body for fastify.inject. */
export function multipart(
  parts: { name: string; value: string | Buffer; filename?: string; type?: string }[],
) {
  const boundary = `----cheapa${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const part of parts) {
    const disposition = `form-data; name="${part.name}"${part.filename ? `; filename="${part.filename}"` : ''}`;
    const headers = `Content-Disposition: ${disposition}\r\n${part.type ? `Content-Type: ${part.type}\r\n` : ''}\r\n`;
    chunks.push(Buffer.from(`--${boundary}\r\n${headers}`), Buffer.from(part.value), Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

export const image = (bytes: Buffer = pngBytes(), extra: Record<string, string> = {}) =>
  multipart([
    { name: 'image', value: bytes, filename: 'shot.png', type: 'image/png' },
    ...Object.entries(extra).map(([name, value]) => ({ name, value })),
  ]);
