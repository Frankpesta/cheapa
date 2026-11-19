import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { API_ENV, type ApiEnv } from '../../config/env.js';
import { REDIS_QUEUE } from '../../infra/redis.module.js';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard.js';
import { LiveSearchService } from './live-search.service.js';
import { SearchController } from './search.controller.js';
import { createSearchMl, SEARCH_ML, type SearchMl } from './search-ml.js';
import { SearchService } from './search.service.js';

/** Tests provide fake models under this token (a @Global module) instead of loading real ones. */
export const SEARCH_ML_OVERRIDE = Symbol('SEARCH_ML_OVERRIDE');

@Module({
  controllers: [SearchController],
  providers: [
    RateLimitGuard,
    LiveSearchService,
    SearchService,
    {
      provide: SEARCH_ML,
      inject: [API_ENV, REDIS_QUEUE, { token: SEARCH_ML_OVERRIDE, optional: true }],
      useFactory: (env: ApiEnv, queue: Redis, override?: SearchMl) => override ?? createSearchMl(env, queue),
    },
  ],
  exports: [LiveSearchService],
})
export class SearchModule {}
