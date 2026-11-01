/**
 * E2E harness: fresh catalog + users databases cloned from the migrated templates
 * made once by global-setup.ts, two private Redis DB numbers, and the real createApp().
 * Requests go through fastify.inject (no network). Costs milliseconds, not containers.
 */
import { createCatalogDb, type CatalogConnection } from '@cheapa/db/catalog';
import { createUsersDb, type UsersConnection } from '@cheapa/db/users';
import type { Type } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';
import { createApp } from '../bootstrap.js';
import { type ApiEnv, loadApiEnv } from '../config/env.js';
import { CATALOG_TEMPLATE, USERS_TEMPLATE } from './global-setup.js';
import { createTestSigner, type TestSigner } from './tokens.js';

export interface Harness {
  app: NestFastifyApplication;
  catalog: CatalogConnection;
  users: UsersConnection;
  signer: TestSigner;
  env: ApiEnv;
  stop: () => Promise<void>;
}

export async function startHarness(
  overrides: Record<string, string> = {},
  extraModules: Type[] = [],
): Promise<Harness> {
  const adminUri = inject('pgAdminUri');
  const dbUri = (name: string) => Object.assign(new URL(adminUri), { pathname: `/${name}` }).toString();
  const prefix = `t_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const catalogDb = `${prefix}_catalog`;
  const usersDb = `${prefix}_users`;
  await withAdmin(adminUri, async (admin) => {
    await cloneDatabase(admin, catalogDb, CATALOG_TEMPLATE);
    await cloneDatabase(admin, usersDb, USERS_TEMPLATE);
  });

  const [queueDb, cacheDb] = await claimRedisDbs(inject('redisUrl'));
  const signer = createTestSigner();
  const env = loadApiEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    CATALOG_DATABASE_URL: dbUri(catalogDb),
    USERS_DATABASE_URL: dbUri(usersDb),
    REDIS_QUEUE_URL: `${inject('redisUrl')}/${queueDb}`,
    REDIS_CACHE_URL: `${inject('redisUrl')}/${cacheDb}`,
    // As it would appear in .env: one line with literal \n sequences.
    CLERK_JWT_KEY: signer.publicKeyPem.replaceAll('\n', '\\n'),
    CLERK_AUTHORIZED_PARTIES: 'http://localhost:3000',
    ...overrides,
  });

  const catalog = createCatalogDb(env.CATALOG_DATABASE_URL, { max: 2 });
  const users = createUsersDb(env.USERS_DATABASE_URL, { max: 2 });
  const app = await createApp(env, extraModules);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return {
    app,
    catalog,
    users,
    signer,
    env,
    stop: async () => {
      await app.close();
      await Promise.allSettled([catalog.close(), users.close()]);
      await withAdmin(adminUri, async (admin) => {
        await admin.query(`drop database if exists ${catalogDb} with (force)`);
        await admin.query(`drop database if exists ${usersDb} with (force)`);
      });
    },
  };
}

async function withAdmin(uri: string, run: (admin: pg.Client) => Promise<void>): Promise<void> {
  const admin = new pg.Client({ connectionString: uri });
  await admin.connect();
  try {
    await run(admin);
  } finally {
    await admin.end();
  }
}

/** CREATE DATABASE ... TEMPLATE, retrying if another file is cloning the same template. */
async function cloneDatabase(admin: pg.Client, name: string, template: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await admin.query(`create database ${name} template ${template}`);
      return;
    } catch (error) {
      const busy = error instanceof Error && /being accessed by other users/.test(error.message);
      if (!busy || attempt >= 20) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
    }
  }
}

/** Two Redis DB numbers (1–15) private to this file; DB 0 holds the counter. */
async function claimRedisDbs(url: string): Promise<[number, number]> {
  const redis = new Redis(url, { lazyConnect: true });
  await redis.connect();
  try {
    const slot = (await redis.incr('test:slot')) - 1;
    const queueDb = 1 + ((slot * 2) % 14);
    const cacheDb = queueDb + 1;
    for (const db of [queueDb, cacheDb]) {
      await redis.select(db);
      await redis.flushdb();
    }
    return [queueDb, cacheDb];
  } finally {
    redis.disconnect();
  }
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
