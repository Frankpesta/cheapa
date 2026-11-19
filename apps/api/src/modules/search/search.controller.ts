import { ImageSearchFields, type SearchResponse, type SearchSource, TextSearchRequest } from '@cheapa/core';
import { VisionImageError } from '@cheapa/ml';
import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ZodPipe } from '../../common/zod.pipe.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { CurrentIdentity, type Identity, Public } from '../auth/auth.decorators.js';
import { RateLimit, RateLimitGuard } from '../rate-limit/rate-limit.guard.js';
import { readImageUpload } from './image-upload.js';
import { SearchService, type SearchOutput } from './search.service.js';

/** Search routes (05-visual-search.md 5.3). */
@Public()
@Controller('search')
export class SearchController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly search: SearchService,
  ) {}

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
    let output: SearchOutput;
    try {
      output = await this.search.image(upload.sha256, upload.bytes, String(request.id), fields.item);
    } catch (error) {
      if (error instanceof VisionImageError)
        throw new UnprocessableEntityException('Could not read this image');
      throw error;
    }
    // Only the hash and derived data survive this request (CLAUDE.md rule 4).
    this.served(request, identity, 'image', fields.source, started, output, { imageSha256: upload.sha256 });
    return output.response;
  }

  @Post('text')
  @HttpCode(200)
  async text(
    @Req() request: FastifyRequest,
    @CurrentIdentity() identity: Identity,
    @Body(new ZodPipe(TextSearchRequest)) body: TextSearchRequest,
  ): Promise<SearchResponse> {
    const started = performance.now();
    const output = await this.search.text(body.query, String(request.id));
    this.served(request, identity, 'text', body.source, started, output, { queryLength: body.query.length });
    return output.response;
  }

  /** One log line (hash, provider, latency, result ids) and search_served (no query, no hash). */
  private served(
    request: FastifyRequest,
    identity: Identity,
    kind: 'image' | 'text',
    source: SearchSource,
    started: number,
    { response, meta }: SearchOutput,
    logOnly: Record<string, unknown>,
  ): void {
    const latencyMs = Math.round(performance.now() - started);
    request.log.info(
      {
        ...logOnly,
        kind,
        source,
        latencyMs,
        cacheHit: meta.cacheHit,
        visionProvider: meta.visionProvider,
        productIds: response.products.map((p) => p.productId),
        lookalikeIds: response.lookalikes.map((l) => l.productId),
      },
      'search served',
    );
    this.analytics.capture(
      identity,
      'search_served',
      {
        kind,
        source,
        latencyMs,
        cacheHit: meta.cacheHit,
        productCount: response.products.length,
        lookalikeCount: response.lookalikes.length,
        visionProvider: meta.visionProvider,
        lowConfidence: meta.lowConfidence,
        liveCount: meta.liveCount,
        needsConfirmation: response.needsConfirmation?.kind ?? null,
      },
      String(request.id),
    );
  }
}
