import { type DynamicModule, Module } from '@nestjs/common';
import { SentryModule } from '@sentry/nestjs/setup';
import { LoggerModule } from 'nestjs-pino';
import { createLogger } from './common/logger.js';
import { ConfigModule } from './config/config.module.js';
import type { ApiEnv } from './config/env.js';
import { DatabaseModule } from './infra/database.module.js';
import { RedisModule } from './infra/redis.module.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';

/**
 * Background process (main.jobs.ts): price-event consumer, notify/clicks queues,
 * scheduled jobs (08-user-side.md 8.1). Empty until those sections land.
 */
@Module({})
export class JobsModule {
  static forRoot(env: ApiEnv): DynamicModule {
    return {
      module: JobsModule,
      imports: [
        SentryModule.forRoot(),
        ConfigModule.forRoot(env),
        LoggerModule.forRoot({ pinoHttp: { logger: createLogger(env, 'api-jobs') } }),
        DatabaseModule,
        RedisModule,
        AnalyticsModule,
      ],
    };
  }
}
