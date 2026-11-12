import { Module } from '@nestjs/common';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';

/** Internal admin tools (04 §4.4). Every route requires the admin role. */
@Module({ controllers: [ReviewsController], providers: [ReviewsService] })
export class AdminModule {}
