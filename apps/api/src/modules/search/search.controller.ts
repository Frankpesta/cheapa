import { ImageSearchFields, type SearchResponse, TextSearchRequest } from '@cheapa/core';
import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ZodPipe } from '../../common/zod.pipe.js';
import { RateLimit, RateLimitGuard } from '../rate-limit/rate-limit.guard.js';
import { readImageUpload } from './image-upload.js';

/**
 * Search routes (05-visual-search.md 5.3). Phase 0 stub: validates input and
 * returns a typed empty result. The visual/read paths land in phase 05.
 */
@Controller('search')
export class SearchController {
  @Post('image')
  @HttpCode(200)
  @RateLimit('image_search')
  @UseGuards(RateLimitGuard)
  async image(@Req() request: FastifyRequest): Promise<SearchResponse> {
    const upload = await readImageUpload(request);
    const fields = new ZodPipe(ImageSearchFields).transform(upload.fields);
    // Only the hash and derived data survive this function (CLAUDE.md rule 4).
    request.log.info(
      { imageSha256: upload.sha256, mime: upload.mime, source: fields.source },
      'image search',
    );
    return emptyResult(String(request.id));
  }

  @Post('text')
  @HttpCode(200)
  text(
    @Req() request: FastifyRequest,
    @Body(new ZodPipe(TextSearchRequest)) body: TextSearchRequest,
  ): SearchResponse {
    request.log.info({ source: body.source, queryLength: body.query.length }, 'text search');
    return emptyResult(String(request.id));
  }
}

function emptyResult(requestId: string): SearchResponse {
  return { requestId, detected: { confidence: 0 }, products: [], lookalikes: [] };
}
