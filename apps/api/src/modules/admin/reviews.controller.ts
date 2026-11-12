import {
  ReviewDecisionRequest,
  type ReviewDecisionResponse,
  ReviewQueueQuery,
  type ReviewQueueResponse,
} from '@cheapa/core';
import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../../common/zod.pipe.js';
import { CurrentIdentity, type Identity, Roles } from '../auth/auth.decorators.js';
import { ReviewsService } from './reviews.service.js';

/** Admin-only match review queue (04 §4.4). The page itself lives in apps/web (phase 07). */
@Roles('admin')
@Controller('admin/reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  queue(
    @Query(new ZodPipe(ReviewQueueQuery)) query: z.output<typeof ReviewQueueQuery>,
  ): Promise<ReviewQueueResponse> {
    return this.reviews.queue(query.limit);
  }

  @Post(':id')
  @HttpCode(200)
  async decide(
    @Param('id', new ZodPipe(z.uuid())) id: string,
    @Body(new ZodPipe(ReviewDecisionRequest)) body: ReviewDecisionRequest,
    @CurrentIdentity() identity: Identity,
  ): Promise<ReviewDecisionResponse> {
    // The admin role guard only lets signed-in users through.
    const { productId } = await this.reviews.decide(id, body.decision, identity.user!.clerkId);
    return { reviewId: id, decision: body.decision, productId };
  }
}
