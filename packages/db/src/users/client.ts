import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as schema from './schema.js';

export const usersSchema = schema;
export type UsersDb = NodePgDatabase<typeof schema>;

export interface UsersConnection {
  db: UsersDb;
  pool: pg.Pool;
  close: () => Promise<void>;
}

/** Connect to cheapa_users. apps/api only. Callers must close() on shutdown. */
export function createUsersDb(
  url: string,
  options: { max?: number; applicationName?: string } = {},
): UsersConnection {
  const pool = new pg.Pool({
    connectionString: url,
    max: options.max ?? 10,
    application_name: options.applicationName ?? 'cheapa',
  });
  return { db: drizzle(pool, { schema }), pool, close: () => pool.end() };
}

export const USERS_MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/users', import.meta.url));

export async function runUsersMigrations(db: UsersDb): Promise<void> {
  await migrate(db, { migrationsFolder: USERS_MIGRATIONS_DIR });
}
