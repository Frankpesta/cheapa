import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as enums from './enums.js';
import { priceHistory } from './price-history.js';
import * as tables from './schema.js';

export const catalogSchema = { ...enums, ...tables, priceHistory };
export type CatalogDb = NodePgDatabase<typeof catalogSchema>;

export interface CatalogConnection {
  db: CatalogDb;
  pool: pg.Pool;
  close: () => Promise<void>;
}

/** Connect to cheapa_catalog. Callers own the pool and must close() it on shutdown. */
export function createCatalogDb(
  url: string,
  options: { max?: number; applicationName?: string } = {},
): CatalogConnection {
  const pool = new pg.Pool({
    connectionString: url,
    max: options.max ?? 10,
    application_name: options.applicationName ?? 'cheapa',
  });
  const db = drizzle(pool, { schema: catalogSchema });
  return { db, pool, close: () => pool.end() };
}

export const CATALOG_MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/catalog', import.meta.url));

export async function runCatalogMigrations(db: CatalogDb): Promise<void> {
  await migrate(db, { migrationsFolder: CATALOG_MIGRATIONS_DIR });
}
