// pnpm db:migrate — apply catalog and users migrations, each with its own role.
import { createCatalogDb, runCatalogMigrations } from './catalog/client.js';
import { loadCatalogCliEnv, loadUsersCliEnv } from './cli-env.js';
import { createUsersDb, runUsersMigrations } from './users/client.js';

const catalog = createCatalogDb(loadCatalogCliEnv().CATALOG_DATABASE_URL, {
  max: 1,
  applicationName: 'cheapa-migrate',
});
try {
  await runCatalogMigrations(catalog.db);
  process.stdout.write('catalog: migrations applied\n');
} finally {
  await catalog.close();
}

const users = createUsersDb(loadUsersCliEnv().USERS_DATABASE_URL, {
  max: 1,
  applicationName: 'cheapa-migrate',
});
try {
  await runUsersMigrations(users.db);
  process.stdout.write('users: migrations applied\n');
} finally {
  await users.close();
}
