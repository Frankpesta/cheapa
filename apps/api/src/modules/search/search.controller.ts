import { ImageSearchFields, type SearchResponse, type SearchSource, TextSearchRequest } from '@cheapa/core';
import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ZodPipe } from '../../common/zod.pipe.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { CurrentIdentity, type Identity, Public } from '../auth/auth.decorators.js';
import { RateLimit, RateLimitGuard } from '../rate-limit/rate-limit.guard.js';
import { readImageUpload } from './image-upload.js';

/**
 * Search routes (05-visual-search.md 5.3). Phase 0 stub: validates input and
 * returns a typed empty result. The visual/read paths land in phase 05.
 */
@Public()
@Controller('search')
export class SearchController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post('image')
  @HttpCode(200)
  @RateLimit('image_search')
  @UseGuards(RateLimitGuard)
  async image(
    @Req() request: FastifyRequest,
    @CurrentIdentity() identity: Identity,
  ): Promise<SearchResponse> {
    const started = performance.now();
    const upload = await readImageUpload(request);
    const fields = new ZodPipe(ImageSearchFields).transform(upload.fields);
    // Only the hash and derived data survive this function (CLAUDE.md rule 4).
    request.log.info(
      { imageSha256: upload.sha256, mime: upload.mime, source: fields.source },
      'image search',
    );
    const result = emptyResult(String(request.id));
    this.served(identity, request, 'image', fields.source, started, result);
    return result;
  }

  @Post('text')
  @HttpCode(200)
  text(
    @Req() request: FastifyRequest,
    @CurrentIdentity() identity: Identity,
    @Body(new ZodPipe(TextSearchRequest)) body: TextSearchRequest,
  ): SearchResponse {
    const started = performance.now();
    request.log.info({ source: body.source, queryLength: body.query.length }, 'text search');
    const result = emptyResult(String(request.id));
    this.served(identity, request, 'text', body.source, started, result);
    return result;
  }

  /** search_served: shape and timing only. Never the query text or the image hash. */
  private served(
    identity: Identity,
    request: FastifyRequest,
    kind: 'image' | 'text',
    source: SearchSource,
    started: number,
    result: SearchResponse,
  ): void {
    this.analytics.capture(
      identity,
      'search_served',
      {
        kind,
        source,
        latencyMs: Math.round(performance.now() - started),
        cacheHit: false,
        productCount: result.products.length,
        lookalikeCount: result.lookalikes.length,
        visionProvider: null,
        lowConfidence: result.detected.confidence < 0.6,
      },
      String(request.id),
    );
  }
}

function emptyResult(requestId: string): SearchResponse {
  return { requestId, detected: { confidence: 0 }, products: [], lookalikes: [] };
}
