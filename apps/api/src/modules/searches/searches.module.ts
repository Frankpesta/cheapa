import { Module } from '@nestjs/common';
import { HistoryService } from './history.service.js';
import { SearchesController } from './searches.controller.js';

@Module({
  controllers: [SearchesController],
  providers: [HistoryService],
  exports: [HistoryService],
})
export class SearchesModule {}
