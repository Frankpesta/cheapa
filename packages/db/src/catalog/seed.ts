// pnpm db:seed — local development only: 3 stores, 10 fake listings, synthetic vectors.
import { loadCatalogCliEnv } from '../cli-env.js';
import { createCatalogDb } from './client.js';
import { nearestByImage } from './queries.js';
import { designVector, seedCatalog } from './seed-data.js';

const env = loadCatalogCliEnv();
if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed in production');

const conn = createCatalogDb(env.CATALOG_DATABASE_URL, { max: 1, applicationName: 'cheapa-seed' });
try {
  const counts = await seedCatalog(conn.db);
  process.stdout.write(`catalog: seeded ${counts.stores} stores, ${counts.listings} listings\n`);
  process.stdout.write('nearest to the "slip-dress" design by image:\n');
  for (const row of await nearestByImage(conn.db, designVector('slip-dress'), { limit: 5 })) {
    process.stdout.write(`  ${row.similarity.toFixed(3)}  ${row.title}\n`);
  }
} finally {
  await conn.close();
}
