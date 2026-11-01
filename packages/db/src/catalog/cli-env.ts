import { catalogDbEnv, loadEnv } from '@cheapa/core';
import { existsSync } from 'node:fs';

/** For CLI scripts only: load the repo-root .env (if present) and validate. */
export function loadCatalogCliEnv() {
  const rootEnv = new URL('../../../../.env', import.meta.url);
  if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
  return loadEnv(catalogDbEnv, process.env);
}
