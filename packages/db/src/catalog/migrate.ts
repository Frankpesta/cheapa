// pnpm db:migrate — apply catalog migrations to CATALOG_DATABASE_URL.
import { loadCatalogCliEnv } from './cli-env.js';
import { createCatalogDb, runCatalogMigrations } from './client.js';

const env = loadCatalogCliEnv();
const conn = createCatalogDb(env.CATALOG_DATABASE_URL, { max: 1, applicationName: 'cheapa-migrate' });
try {
  await runCatalogMigrations(conn.db);
  process.stdout.write('catalog: migrations applied\n');
} finally {
  await conn.close();
}
