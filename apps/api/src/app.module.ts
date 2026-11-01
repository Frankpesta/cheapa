import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { loggerOptions } from './common/logger.js';
import { ConfigModule } from './config/config.module.js';
import type { ApiEnv } from './config/env.js';
import { DatabaseModule } from './infra/database.module.js';
import { RedisModule } from './infra/redis.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { ProductsModule } from './modules/products/products.module.js';
import { SearchModule } from './modules/search/search.module.js';
import { UsersModule } from './modules/users/users.module.js';

/** HTTP process (main.ts). */
@Module({})
export class AppModule {
  static forRoot(env: ApiEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        // Request logs reuse Fastify's pino logger (same request id); app logs get the same options.
        LoggerModule.forRoot({ pinoHttp: loggerOptions(env), useExisting: true }),
        DatabaseModule,
        RedisModule,
        AuthModule,
        HealthModule,
        SearchModule,
        ProductsModule,
        UsersModule,
      ],
    };
  }
}
