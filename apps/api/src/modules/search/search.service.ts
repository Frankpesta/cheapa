/**
 * Search pipeline (05 §5.3, 13 §13.5-13.6). Image: hash -> cache -> (vision read ||
 * image embed) -> crop to the chosen item -> vector + text hits -> rank -> exact
 * products, lookalikes, live stores when weak -> cache. Image bytes never leave memory.
 */
import { normalizeQuery } from '@cheapa/adapters';
import { classify, type SearchResponse } from '@cheapa/core';
import { type CatalogConnection } from '@cheapa/db/catalog';
import { cropToBox, prepareVisionImage, VisionResult, type ImageInput } from '@cheapa/ml';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { createHash } from 'node:crypto';
import { API_ENV, type ApiEnv } from '../../config/env.js';
import { CATALOG_DB } from '../../infra/database.module.js';
import { REDIS_CACHE } from '../../infra/redis.module.js';
import { CatalogSearch, IMAGE_NEIGHBOURS, TEXT_NEIGHBOURS } from './catalog-search.js';
import type { Hit } from './rank.js';
import { LiveSearchService } from './live-search.service.js';
import { buildResponse, type RankingInput } from './respond.js';
import { SEARCH_ML, type SearchMl } from './search-ml.js';

export interface SearchMeta {
  cacheHit: boolean;
  visionProvider: string | null;
  lowConfidence: boolean;
  liveCount: number;
  /** The text searched: the typed query, or the phrase read from the photo (history). */
  query: string | null;
}

export interface SearchOutput {
  response: SearchResponse;
  meta: SearchMeta;
}

const TEXT_CACHE_TTL_S = 30 * 60;
const VISION_CACHE_TTL_S = 24 * 60 * 60;

@Injectable()
export class SearchService {
  private readonly catalog: CatalogSearch;

  constructor(
    @Inject(CATALOG_DB) catalog: CatalogConnection,
    @Inject(REDIS_CACHE) private readonly cache: Redis,
    @Inject(SEARCH_ML) private readonly ml: SearchMl,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly live: LiveSearchService,
  ) {
    this.catalog = new CatalogSearch(catalog.db);
  }

  /** `raw` is the upload (memory only); `item` picks one of the detected items. */
  async image(sha256: string, raw: Uint8Array, requestId: string, item?: number): Promise<SearchOutput> {
    const key = `search:img:v2:${sha256}:${item ?? 'auto'}`;
    const hit = await this.cached(key, requestId);
    if (hit) return hit;

    const prepared = await prepareVisionImage(raw);
    const [read, fullVec] = await Promise.all([this.visionRead(sha256, prepared), this.embedImage(prepared)]);
    const vision = read?.result ?? null;
    const chosen = vision?.items[item ?? 0] ?? vision?.items[0];
    const crop = chosen ? await cropToBox(prepared, chosen.bbox) : null;
    const imageVec = crop ? await this.embedImage(crop) : fullVec;
    const query = vision?.isProduct ? vision.searchQuery : null;

    const [imageHits, text] = await Promise.all([
      imageVec && this.ml.embed
        ? this.catalog.nearest('image', imageVec, this.ml.embed.modelVersion, IMAGE_NEIGHBOURS)
        : Promise.resolve<Hit[]>([]),
      this.textHits(query),
    ]);
    const output = await this.respond(requestId, {
      kind: 'image',
      vision,
      query,
      imageHits,
      ...text,
      itemPicked: item !== undefined,
    });
    output.meta.visionProvider = read?.providerId ?? null;
    await this.store(key, output, this.env.SEARCH_CACHE_TTL_S);
    return output;
  }

  async text(query: string, requestId: string): Promise<SearchOutput> {
    const key = `search:txt:v2:${createHash('sha1').update(normalizeQuery(query)).digest('hex')}`;
    const hit = await this.cached(key, requestId);
    if (hit) return hit;
    const output = await this.respond(requestId, {
      kind: 'text',
      vision: null,
      query,
      imageHits: [],
      ...(await this.textHits(query)),
      itemPicked: false,
    });
    await this.store(key, output, TEXT_CACHE_TTL_S);
    return output;
  }

  private async respond(requestId: string, r: RankingInput): Promise<SearchOutput> {
    const live = this.live;
    return buildResponse(requestId, {
      ...r,
      lookalikeMinSim: this.env.LOOKALIKE_MIN_SIM,
      now: new Date(),
      products: (ids) => this.catalog.products(ids),
      listings: (ids) => this.catalog.listingsFor(ids),
      stores: (ids) => this.catalog.storeInfo(ids),
      liveSearch: (q) => live.search({ query: q, timeoutMs: 2500, limit: 10 }),
      saveLiveLinks: (links) => this.saveLiveLinks(links),
      shelfFromText: (q) => {
        const cls = classify([], q);
        return cls.department === 'other' ? {} : { department: cls.department, category: cls.category };
      },
    });
  }

  private async textHits(query: string | null): Promise<{ textVecHits: Hit[]; ftsHits: Hit[] }> {
    if (!query) return { textVecHits: [], ftsHits: [] };
    const embed = this.ml.embed;
    const [textVecHits, ftsHits] = await Promise.all([
      embed
        ? embed
            .embedTitle(query)
            .then((vec) => this.catalog.nearest('text', vec, embed.modelVersion, TEXT_NEIGHBOURS))
        : Promise.resolve<Hit[]>([]),
      this.catalog.fullText(query),
    ]);
    return { textVecHits, ftsHits };
  }

  private async embedImage(img: ImageInput): Promise<number[] | null> {
    if (!this.ml.embed) return null;
    return (await this.ml.embed.embedListing(img.bytes, null)).imageVec;
  }

  /** Vision outcome cached by image hash: a re-pick of another item costs nothing. */
  private async visionRead(sha256: string, img: ImageInput) {
    if (!this.ml.vision) return null;
    const key = `vision:v1:${sha256}`;
    const cached = await this.cache.get(key).catch(() => null);
    if (cached) {
      const parsed = VisionResult.safeParse(JSON.parse(cached));
      if (parsed.success) return { result: parsed.data, providerId: 'cache' };
    }
    const outcome = await this.ml.vision.describe(img);
    if (outcome.status !== 'ok') return null;
    await this.cache
      .set(key, JSON.stringify(outcome.result), 'EX', VISION_CACHE_TTL_S)
      .catch(() => undefined);
    return { result: outcome.result, providerId: outcome.providerId };
  }

  private async cached(key: string, requestId: string): Promise<SearchOutput | null> {
    const raw = await this.cache.get(key).catch(() => null);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { response: SearchResponse; query: string | null };
    const response = { ...entry.response, requestId };
    return {
      response,
      meta: {
        cacheHit: true,
        visionProvider: null,
        lowConfidence: response.detected.confidence < 0.6,
        liveCount: 0,
        query: entry.query,
      },
    };
  }

  private async store(key: string, { response, meta }: SearchOutput, ttl: number): Promise<void> {
    if (ttl <= 0) return;
    const entry = JSON.stringify({ response, query: meta.query });
    await this.cache.set(key, entry, 'EX', ttl).catch(() => undefined);
  }

  /** For GET /go/:listingId on live listings (08 §8.4), which aren't in the catalog yet. */
  private async saveLiveLinks(links: readonly { listingId: string }[]): Promise<void> {
    if (links.length === 0) return;
    const multi = this.cache.multi();
    for (const link of links)
      multi.set(`go:live:${link.listingId}`, JSON.stringify(link), 'EX', VISION_CACHE_TTL_S);
    await multi.exec().catch(() => undefined);
  }
}
