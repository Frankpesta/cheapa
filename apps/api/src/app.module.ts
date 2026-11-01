import { type DynamicModule, Module, type Type } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { LoggerModule } from 'nestjs-pino';
import type { Logger } from 'pino';
import { ConfigModule } from './config/config.module.js';
import type { ApiEnv } from './config/env.js';
import { DatabaseModule } from './infra/database.module.js';
import { RedisModule } from './infra/redis.module.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { ProductsModule } from './modules/products/products.module.js';
import { SearchModule } from './modules/search/search.module.js';
import { UsersModule } from './modules/users/users.module.js';

/** HTTP process (main.ts). */
@Module({})
export class AppModule {
  /** extraModules: test-only controllers (e.g. a route that throws for the Sentry test). */
  static forRoot(env: ApiEnv, logger: Logger, extraModules: Type[] = []): DynamicModule {
    return {
      module: AppModule,
      imports: [
        SentryModule.forRoot(),
        ConfigModule.forRoot(env),
        // Request logs reuse Fastify's pino logger (same request id); app logs get the same options.
        LoggerModule.forRoot({ pinoHttp: { logger }, useExisting: true }),
        DatabaseModule,
        RedisModule,
        AnalyticsModule,
        AuthModule,
        HealthModule,
        SearchModule,
        ProductsModule,
        UsersModule,
        ...extraModules,
      ],
      // Reports unexpected (5xx) errors to Sentry; HttpExceptions pass through untouched.
      providers: [{ provide: APP_FILTER, useClass: SentryGlobalFilter }],
    };
  }
}
