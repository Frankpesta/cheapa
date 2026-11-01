import { catalogDbEnv, loadEnv, usersDbEnv } from '@cheapa/core';
import { existsSync } from 'node:fs';

/** For CLI scripts only: load the repo-root .env (if present) and validate. */
function loadRootEnv(): void {
  const rootEnv = new URL('../../../.env', import.meta.url);
  if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
}

export function loadCatalogCliEnv() {
  loadRootEnv();
  return loadEnv(catalogDbEnv, process.env);
}

export function loadUsersCliEnv() {
  loadRootEnv();
  return loadEnv(usersDbEnv, process.env);
}
