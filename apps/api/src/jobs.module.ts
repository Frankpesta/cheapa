import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { loggerOptions } from './common/logger.js';
import { ConfigModule } from './config/config.module.js';
import type { ApiEnv } from './config/env.js';
import { DatabaseModule } from './infra/database.module.js';
import { RedisModule } from './infra/redis.module.js';

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
        ConfigModule.forRoot(env),
        LoggerModule.forRoot({ pinoHttp: loggerOptions(env, 'api-jobs') }),
        DatabaseModule,
        RedisModule,
      ],
    };
  }
}
