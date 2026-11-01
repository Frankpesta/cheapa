/**
 * Runs once per `vitest run`: one Postgres (pgvector) and one Redis for every e2e file.
 * Each file clones fresh databases from migrated templates (milliseconds) and uses its
 * own Redis DB numbers, so files stay isolated and run in parallel.
 *
 * Locally the containers are REUSED across runs (Testcontainers reuse): starting them
 * costs ~20 s on Docker Desktop, so only the first run pays it. Templates are rebuilt
 * every run, so a reused container never leaks state between runs. CI (CI=true) gets
 * fresh containers that are stopped at the end.
 */
import { createCatalogDb, runCatalogMigrations } from '@cheapa/db/catalog';
import { createUsersDb, runUsersMigrations } from '@cheapa/db/users';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { Redis } from 'ioredis';
import pg from 'pg';
import { GenericContainer, Wait } from 'testcontainers';
import type { TestProject } from 'vitest/node';

export const CATALOG_TEMPLATE = 'tpl_catalog';
export const USERS_TEMPLATE = 'tpl_users';

declare module 'vitest' {
  export interface ProvidedContext {
    pgAdminUri: string;
    redisUrl: string;
  }
}

const reuse = process.env.CI !== 'true';
if (reuse) process.env.TESTCONTAINERS_REUSE_ENABLE ??= 'true';

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const postgresContainer = new PostgreSqlContainer('pgvector/pgvector:0.8.3-pg16')
    .withLabels({ 'cheapa.test': 'api-e2e' })
    // Throwaway data: skip durability work to speed up CREATE DATABASE and migrations.
    .withCommand([
      'postgres',
      '-c',
      'fsync=off',
      '-c',
      'synchronous_commit=off',
      '-c',
      'full_page_writes=off',
    ]);
  const redisContainer = new GenericContainer('redis:7.4.8-alpine')
    .withLabels({ 'cheapa.test': 'api-e2e' })
    .withCommand(['redis-server', '--maxmemory-policy', 'noeviction', '--save', '', '--appendonly', 'no'])
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'));

  const [postgres, redis] = await Promise.all([
    (reuse ? postgresContainer.withReuse() : postgresContainer).start(),
    (reuse ? redisContainer.withReuse() : redisContainer).start(),
  ]);

  const adminUri = postgres.getConnectionUri();
  const redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  await resetPostgres(adminUri);
  await resetRedis(redisUrl);

  project.provide('pgAdminUri', adminUri);
  project.provide('redisUrl', redisUrl);

  return async () => {
    if (!reuse) await Promise.allSettled([postgres.stop(), redis.stop()]);
  };
}

/** Drop leftovers from earlier runs, then build both templates from the migrations. */
async function resetPostgres(adminUri: string): Promise<void> {
  const dbUri = (name: string) => Object.assign(new URL(adminUri), { pathname: `/${name}` }).toString();

  const admin = new pg.Client({ connectionString: adminUri });
  await admin.connect();
  try {
    const { rows } = await admin.query<{ datname: string }>(
      `select datname from pg_database where datname like 't\\_%' or datname in ($1, $2)`,
      [CATALOG_TEMPLATE, USERS_TEMPLATE],
    );
    for (const { datname } of rows) await admin.query(`drop database if exists "${datname}" with (force)`);
    await admin.query(`create database ${CATALOG_TEMPLATE}`);
    await admin.query(`create database ${USERS_TEMPLATE}`);
  } finally {
    await admin.end();
  }

  // Extensions need superuser (as in infra/postgres/init); then migrate each template once.
  const ext = new pg.Client({ connectionString: dbUri(CATALOG_TEMPLATE) });
  await ext.connect();
  await ext.query('create extension if not exists vector; create extension if not exists pg_trgm;');
  await ext.end();

  const catalog = createCatalogDb(dbUri(CATALOG_TEMPLATE), { max: 1 });
  await runCatalogMigrations(catalog.db);
  await catalog.close();
  const users = createUsersDb(dbUri(USERS_TEMPLATE), { max: 1 });
  await runUsersMigrations(users.db);
  await users.close();
}

async function resetRedis(url: string): Promise<void> {
  const redis = new Redis(url, { lazyConnect: true });
  await redis.connect();
  await redis.flushall();
  redis.disconnect();
}
