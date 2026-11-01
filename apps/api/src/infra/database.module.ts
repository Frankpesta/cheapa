import { createCatalogDb, type CatalogConnection } from '@cheapa/db/catalog';
import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import pg from 'pg';
import { API_ENV, type ApiEnv } from '../config/env.js';

/** cheapa_catalog connection (drizzle + pool). */
export const CATALOG_DB = Symbol('CATALOG_DB');
/** cheapa_users pool. Drizzle users schema arrives in 1.6 (08-user-side.md 8.2). */
export const USERS_POOL = Symbol('USERS_POOL');

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
      provide: USERS_POOL,
      inject: [API_ENV],
      useFactory: (env: ApiEnv): pg.Pool =>
        new pg.Pool({ connectionString: env.USERS_DATABASE_URL, max: 10, application_name: 'cheapa-api' }),
    },
  ],
  exports: [CATALOG_DB, USERS_POOL],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(
    @Inject(CATALOG_DB) private readonly catalog: CatalogConnection,
    @Inject(USERS_POOL) private readonly users: pg.Pool,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.catalog.close(), this.users.end()]);
  }
}
