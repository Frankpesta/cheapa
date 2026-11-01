import { type DynamicModule, Global, Module } from '@nestjs/common';
import { API_ENV, type ApiEnv } from './env.js';

/** Provides the validated env under API_ENV. Loaded once in main.ts (or a test). */
@Global()
@Module({})
export class ConfigModule {
  static forRoot(env: ApiEnv): DynamicModule {
    return { module: ConfigModule, providers: [{ provide: API_ENV, useValue: env }], exports: [API_ENV] };
  }
}
