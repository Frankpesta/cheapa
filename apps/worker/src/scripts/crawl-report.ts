/**
 * Per-store crawl health table (02-crawler-core.md 2.5; the admin page comes later).
 * Usage: pnpm crawl:report   (reads CATALOG_DATABASE_URL from .env)
 */
import { catalogDbEnv, loadEnv } from '@cheapa/core';
import { createCatalogDb } from '@cheapa/db/catalog';
import { renderTable, storeReport } from '../crawl/report.js';

const env = loadEnv(catalogDbEnv, process.env);
const catalog = createCatalogDb(env.CATALOG_DATABASE_URL, { max: 2, applicationName: 'cheapa-crawl-report' });
try {
  process.stdout.write(renderTable(await storeReport(catalog.db)));
} finally {
  await catalog.close();
}
