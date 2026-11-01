import { Module } from '@nestjs/common';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard.js';
import { SearchController } from './search.controller.js';

@Module({ controllers: [SearchController], providers: [RateLimitGuard] })
export class SearchModule {}
