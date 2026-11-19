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
import { randomUUID } from 'node:crypto';
import { ZodPipe } from '../../common/zod.pipe.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { CurrentIdentity, type Identity, Public } from '../auth/auth.decorators.js';
import { RateLimit, RateLimitGuard } from '../rate-limit/rate-limit.guard.js';
import { isUuid } from '../../common/uuid7.js';
import { HistoryService } from '../searches/history.service.js';
import { readImageUpload } from './image-upload.js';
import { SearchService, type SearchOutput } from './search.service.js';

/** Search routes (05-visual-search.md 5.3). */
@Public()
@Controller('search')
export class SearchController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly search: SearchService,
    private readonly history: HistoryService,
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
      output = await this.search.image(upload.sha256, upload.bytes, searchId(request), fields.item);
    } catch (error) {
      if (error instanceof VisionImageError)
        throw new UnprocessableEntityException('Could not read this image');
      throw error;
    }
    // Only the hash and derived data survive this request (CLAUDE.md rule 4).
    this.served(request, identity, 'image', fields.source, started, output, { imageSha256: upload.sha256 });
    this.remember(identity, fields.source, started, output, upload.sha256);
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
    const output = await this.search.text(body.query, searchId(request));
    this.served(request, identity, 'text', body.source, started, output, { queryLength: body.query.length });
    this.remember(identity, body.source, started, output, null);
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

  /** History row (08 §8.5), written after the response; never blocks or fails it. */
  private remember(
    identity: Identity,
    source: SearchSource,
    started: number,
    { response, meta }: SearchOutput,
    imageHash: string | null,
  ): void {
    void this.history.record({
      id: response.requestId,
      identity,
      source,
      imageHash,
      query: meta.query,
      response,
      latencyMs: Math.round(performance.now() - started),
    });
  }
}

/** The response's requestId is also the history row id and /go's `s`: always a uuid. */
function searchId(request: FastifyRequest): string {
  return isUuid(request.id) ? String(request.id).toLowerCase() : randomUUID();
}
