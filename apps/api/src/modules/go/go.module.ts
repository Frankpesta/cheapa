import { Module } from '@nestjs/common';
import { ClicksQueue } from './clicks.queue.js';
import { GoController } from './go.controller.js';
import { GoService } from './go.service.js';

/** HTTP side of clicks (api process). The consumer lives in ClicksJobsModule (api-jobs). */
@Module({
  controllers: [GoController],
  providers: [GoService, ClicksQueue],
})
export class GoModule {}
