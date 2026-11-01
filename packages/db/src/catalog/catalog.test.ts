/**
 * Integration tests against a pgvector container (needs Docker).
 * Covers 01-foundation.md 1.4 acceptance: migrations run clean, seed inserts
 * 3 stores + 10 listings, cosine query on image_vec returns ordered results.
 *
 * Locally the container is reused across runs (startup costs ~20 s on Docker Desktop);
 * every run gets a brand-new database in it, dropped at the end. CI gets a fresh container.
 */
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { count, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCatalogDb, runCatalogMigrations, type CatalogConnection } from './client.js';
import { priceHistory } from './price-history.js';
import { nearestByImage } from './queries.js';
import { listings, stores } from './schema.js';
import { designVector, SEED_LISTINGS, seedCatalog } from './seed-data.js';

const reuse = process.env.CI !== 'true';
if (reuse) process.env.TESTCONTAINERS_REUSE_ENABLE ??= 'true';

const dbName = `dbtest_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
let container: StartedPostgreSqlContainer;
let conn: CatalogConnection;

async function admin<T>(uri: string, run: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: uri });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

beforeAll(async () => {
  const definition = new PostgreSqlContainer('pgvector/pgvector:0.8.3-pg16')
    .withLabels({ 'cheapa.test': 'db-integration' })
    .withCommand([
      'postgres',
      '-c',
      'fsync=off',
      '-c',
      'synchronous_commit=off',
      '-c',
      'full_page_writes=off',
    ]);
  container = await (reuse ? definition.withReuse() : definition).start();

  const adminUri = container.getConnectionUri();
  const dbUri = Object.assign(new URL(adminUri), { pathname: `/${dbName}` }).toString();
  await admin(adminUri, async (c) => {
    // Clear databases left by runs that were interrupted before afterAll.
    const { rows } = await c.query<{ datname: string }>(
      `select datname from pg_database where datname like 'dbtest\\_%'`,
    );
    for (const { datname } of rows) await c.query(`drop database if exists "${datname}" with (force)`);
    await c.query(`create database ${dbName}`);
  });
  // Extensions need superuser, as in infra/postgres/init/01-databases.sh.
  await admin(dbUri, (c) =>
    c.query('create extension if not exists vector; create extension if not exists pg_trgm;'),
  );

  conn = createCatalogDb(dbUri, { max: 2 });
  await runCatalogMigrations(conn.db);
}, 180_000);

afterAll(async () => {
  await conn?.close();
  if (!container) return;
  if (reuse) {
    await admin(container.getConnectionUri(), (c) =>
      c.query(`drop database if exists ${dbName} with (force)`),
    );
  } else {
    await container.stop();
  }
});

describe('migrations', () => {
  it('re-running is a no-op', async () => {
    await expect(runCatalogMigrations(conn.db)).resolves.toBeUndefined();
  });

  it('creates price_history partitions for this month and 3 ahead', async () => {
    const { rows } = await conn.pool.query<{ name: string }>(
      `select c.relname as name from pg_inherits i
       join pg_class c on c.oid = i.inhrelid
       join pg_class p on p.oid = i.inhparent
       where p.relname = 'price_history' order by 1`,
    );
    expect(rows).toHaveLength(4);
    const now = new Date();
    const thisMonth = `price_history_y${now.getUTCFullYear()}m${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    expect(rows.map((r) => r.name)).toContain(thisMonth);
  });

  it('ensure_price_history_partitions is idempotent and extends ahead', async () => {
    const again = await conn.pool.query<{ n: number }>('select ensure_price_history_partitions(3) as n');
    expect(again.rows[0]?.n).toBe(0);
    const more = await conn.pool.query<{ n: number }>('select ensure_price_history_partitions(5) as n');
    expect(more.rows[0]?.n).toBe(2);
  });
});

describe('seed', () => {
  it('inserts 3 stores and 10 listings with one history row each', async () => {
    await expect(seedCatalog(conn.db)).resolves.toEqual({ stores: 3, listings: 10 });
    const [s] = await conn.db.select({ n: count() }).from(stores);
    const [l] = await conn.db.select({ n: count() }).from(listings);
    const [h] = await conn.db.select({ n: count() }).from(priceHistory);
    expect([s?.n, l?.n, h?.n]).toEqual([3, 10, 10]);
  });

  it('re-seeding adds no rows and no history (insert only on change)', async () => {
    await seedCatalog(conn.db);
    const [l] = await conn.db.select({ n: count() }).from(listings);
    const [h] = await conn.db.select({ n: count() }).from(priceHistory);
    expect([l?.n, h?.n]).toEqual([10, 10]);
  });
});

describe('vector search', () => {
  it('returns listings ordered by cosine similarity, same design first', async () => {
    const rows = await nearestByImage(conn.db, designVector('slip-dress'), { limit: 10 });
    expect(rows).toHaveLength(10);
    const sims = rows.map((r) => r.similarity);
    expect([...sims].sort((a, b) => b - a)).toEqual(sims);

    const slipDresses = SEED_LISTINGS.filter((l) => l.design === 'slip-dress').map((l) => l.title);
    expect(
      rows
        .slice(0, 3)
        .map((r) => r.title)
        .sort(),
    ).toEqual([...slipDresses].sort());
    expect(rows[2]?.similarity ?? 0).toBeGreaterThan(0.9);
    expect(rows[3]?.similarity ?? 1).toBeLessThan(0.3);
  });

  it('still returns full results with a recency filter (iterative scan)', async () => {
    const rows = await nearestByImage(conn.db, designVector('wig'), {
      limit: 5,
      seenSince: new Date(Date.now() - 7 * 24 * 3600 * 1000),
    });
    expect(rows).toHaveLength(5);
    expect(rows[0]?.title).toMatch(/wig/i);
  });
});

describe('full-text search', () => {
  it("keeps product codes intact with the 'simple' config", async () => {
    const rows = await conn.db
      .select({ title: listings.title })
      .from(listings)
      .where(sql`${listings.search} @@ plainto_tsquery('simple', '13x4')`);
    expect(rows.length).toBe(2);
  });

  it('finds near-miss spellings with trigrams', async () => {
    const rows = await conn.db
      .select({ title: listings.title })
      .from(listings)
      .where(sql`${listings.title} % 'Black Satin Slip Dres'`);
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe('constraints', () => {
  it('rejects zero prices and non-NGN currency', async () => {
    const [store] = await conn.db.select({ id: stores.id }).from(stores).limit(1);
    const base = {
      storeId: store?.id ?? '',
      externalId: 'bad',
      sourceUrl: 'https://example.com/x',
      title: 'x',
      inStock: true,
    };
    await expect(conn.db.insert(listings).values({ ...base, priceKobo: 0 })).rejects.toThrow();
    await expect(
      conn.db.insert(listings).values({ ...base, priceKobo: 100, currency: 'USD' }),
    ).rejects.toThrow();
    const [bad] = await conn.db.select({ n: count() }).from(listings).where(eq(listings.externalId, 'bad'));
    expect(bad?.n).toBe(0);
  });

  it('rejects history rows outside any partition', async () => {
    const [l] = await conn.db.select({ id: listings.id }).from(listings).limit(1);
    await expect(
      conn.db.insert(priceHistory).values({
        listingId: l?.id ?? '',
        priceKobo: 100,
        inStock: true,
        observedAt: new Date('2001-01-01T00:00:00Z'),
      }),
    ).rejects.toThrow();
  });
});
