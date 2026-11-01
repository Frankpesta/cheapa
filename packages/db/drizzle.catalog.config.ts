import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

const rootEnv = new URL('../../.env', import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  dialect: 'postgresql',
  // price-history.ts is deliberately excluded: it's partitioned and migrated by hand.
  schema: ['./src/catalog/enums.ts', './src/catalog/schema.ts'],
  out: './migrations/catalog',
  dbCredentials: { url: process.env.CATALOG_DATABASE_URL ?? '' },
  strict: true,
  verbose: true,
});
