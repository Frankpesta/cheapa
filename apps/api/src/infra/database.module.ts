import { createCatalogDb, type CatalogConnection } from '@cheapa/db/catalog';
import { createUsersDb, type UsersConnection } from '@cheapa/db/users';
import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { API_ENV, type ApiEnv } from '../config/env.js';

/** cheapa_catalog connection (drizzle + pool). */
export const CATALOG_DB = Symbol('CATALOG_DB');
/** cheapa_users connection (drizzle + pool). Only this process may hold it (CLAUDE.md rule 2). */
export const USERS_DB = Symbol('USERS_DB');

@Global()
@Module({
  providers: [
    {
      provide: CATALOG_DB,
      inject: [API_ENV],
      useFactory: (env: ApiEnv): CatalogConnection =>
        createCatalogDb(env.CATALOG_DATABASE_URL, { applicationName: 'cheapa-api' }),
    },
    {
      provide: USERS_DB,
      inject: [API_ENV],
      useFactory: (env: ApiEnv): UsersConnection =>
        createUsersDb(env.USERS_DATABASE_URL, { applicationName: 'cheapa-api' }),
    },
  ],
  exports: [CATALOG_DB, USERS_DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(
    @Inject(CATALOG_DB) private readonly catalog: CatalogConnection,
    @Inject(USERS_DB) private readonly users: UsersConnection,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.catalog.close(), this.users.close()]);
  }
}
