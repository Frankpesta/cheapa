import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

const rootEnv = new URL('../../.env', import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/users/schema.ts',
  out: './migrations/users',
  dbCredentials: { url: process.env.USERS_DATABASE_URL ?? '' },
  strict: true,
  verbose: true,
});
