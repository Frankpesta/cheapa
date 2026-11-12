import { Module } from '@nestjs/common';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard.js';
import { LiveSearchService } from './live-search.service.js';
import { SearchController } from './search.controller.js';

@Module({
  controllers: [SearchController],
  providers: [RateLimitGuard, LiveSearchService],
  exports: [LiveSearchService],
})
export class SearchModule {}
