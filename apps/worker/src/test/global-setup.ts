/**
 * One Postgres (pgvector) + one Redis for the whole worker test run. Each file clones a
 * fresh catalog database from the migrated template and uses its own Redis DB + BullMQ
 * prefix. Containers are reused across local runs (remove with `pnpm test:down`); CI
 * gets fresh ones, stopped at the end.
 */
import { createCatalogDb, runCatalogMigrations } from '@cheapa/db/catalog';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Redis } from 'ioredis';
import pg from 'pg';
import { GenericContainer, Wait } from 'testcontainers';
import type { TestProject } from 'vitest/node';

export const CATALOG_TEMPLATE = 'tpl_worker_catalog';

declare module 'vitest' {
  export interface ProvidedContext {
    pgAdminUri: string;
    redisUrl: string;
  }
}

const reuse = process.env.CI !== 'true';
if (reuse) process.env.TESTCONTAINERS_REUSE_ENABLE ??= 'true';

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const postgresDef = new PostgreSqlContainer('pgvector/pgvector:0.8.3-pg16')
    .withLabels({ 'cheapa.test': 'worker' })
    .withCommand([
      'postgres',
      '-c',
      'fsync=off',
      '-c',
      'synchronous_commit=off',
      '-c',
      'full_page_writes=off',
    ]);
  const redisDef = new GenericContainer('redis:7.4.8-alpine')
    .withLabels({ 'cheapa.test': 'worker' })
    .withCommand(['redis-server', '--maxmemory-policy', 'noeviction', '--save', '', '--appendonly', 'no'])
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'));
  const [postgres, redis] = await Promise.all([
    (reuse ? postgresDef.withReuse() : postgresDef).start(),
    (reuse ? redisDef.withReuse() : redisDef).start(),
  ]);

  const adminUri = postgres.getConnectionUri();
  const redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  await buildTemplate(adminUri);
  const client = new Redis(redisUrl);
  await client.flushall();
  client.disconnect();

  project.provide('pgAdminUri', adminUri);
  project.provide('redisUrl', redisUrl);
  return async () => {
    if (!reuse) await Promise.allSettled([postgres.stop(), redis.stop()]);
  };
}

async function buildTemplate(adminUri: string): Promise<void> {
  const admin = new pg.Client({ connectionString: adminUri });
  await admin.connect();
  try {
    const { rows } = await admin.query<{ datname: string }>(
      `select datname from pg_database where datname like 'w\\_%' or datname = $1`,
      [CATALOG_TEMPLATE],
    );
    for (const { datname } of rows) await admin.query(`drop database if exists "${datname}" with (force)`);
    await admin.query(`create database ${CATALOG_TEMPLATE}`);
  } finally {
    await admin.end();
  }
  const uri = Object.assign(new URL(adminUri), { pathname: `/${CATALOG_TEMPLATE}` }).toString();
  const ext = new pg.Client({ connectionString: uri });
  await ext.connect();
  await ext.query('create extension if not exists vector; create extension if not exists pg_trgm;');
  await ext.end();
  const catalog = createCatalogDb(uri, { max: 1 });
  await runCatalogMigrations(catalog.db);
  await catalog.close();
}
