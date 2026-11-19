import { GoQuery } from '@cheapa/core';
import { Controller, Get, NotFoundException, Param, Query, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodPipe } from '../../common/zod.pipe.js';
import { isUuid, uuidv7 } from '../../common/uuid7.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { CurrentIdentity, type Identity, Public } from '../auth/auth.decorators.js';
import { outboundUrl } from './affiliate.js';
import { ClicksQueue } from './clicks.queue.js';
import { GoService } from './go.service.js';

/**
 * GET /go/:listingId?s=<search requestId> (08 §8.4, 10 §10.1): queue the click, 302 to
 * the store (affiliate link when configured). Unknown or hidden listing: the store's
 * homepage when known, else 404.
 */
@Public()
@Controller('go')
export class GoController {
  constructor(
    private readonly go: GoService,
    private readonly clicks: ClicksQueue,
    private readonly analytics: AnalyticsService,
  ) {}

  @Get(':listingId')
  async redirect(
    @Param('listingId') listingId: string,
    @Query(new ZodPipe(GoQuery)) query: GoQuery,
    @CurrentIdentity() identity: Identity,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const target = isUuid(listingId) ? await this.go.resolve(listingId.toLowerCase()) : null;
    if (!target) throw new NotFoundException('Listing not found');
    if (!target.listingUrl) {
      if (!target.storeHome) throw new NotFoundException('Listing not found');
      return this.send(reply, target.storeHome);
    }

    const clickId = uuidv7();
    const out = outboundUrl(target.listingUrl, target.affiliate, clickId);
    void this.clicks.enqueue({
      id: clickId,
      userId: identity.user?.id ?? null,
      deviceId: identity.device?.id ?? null,
      listingId: target.listingId,
      productId: target.productId,
      storeId: target.storeId,
      affiliateNetwork: out.network,
      searchRequestId: query.s ?? null,
      at: new Date().toISOString(),
    });
    this.analytics.capture(
      identity,
      'click_redirected',
      { storeId: target.storeId, affiliate: out.network !== null },
      String(request.id),
    );
    return this.send(reply, out.url);
  }

  private send(reply: FastifyReply, location: string): void {
    void reply.code(302).header('location', location).header('cache-control', 'no-store').send();
  }
}
