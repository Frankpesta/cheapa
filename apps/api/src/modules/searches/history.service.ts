/**
 * Search history (08 §8.5): one row per served search, written after the response,
 * server-side only. Owner is the signed-in user, else the anonymous device.
 */
import type { SearchHistoryItem, SearchHistoryResponse, SearchResponse, SearchSource } from '@cheapa/core';
import { canonicalProducts, type CatalogConnection } from '@cheapa/db/catalog';
import { searches, type UsersConnection } from '@cheapa/db/users';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, lt, or, type SQL } from 'drizzle-orm';
import { CATALOG_DB, USERS_DB } from '../../infra/database.module.js';
import type { Identity } from '../auth/auth.decorators.js';

export interface SearchRecord {
  id: string;
  identity: Identity;
  source: SearchSource;
  imageHash: string | null;
  query: string | null;
  response: SearchResponse;
  latencyMs: number;
}

/** History reads see the user's rows, or a signed-out device's unlinked rows. */
function ownerFilter({ user, device }: Identity): SQL | null {
  if (user) return eq(searches.userId, user.id);
  if (device) return and(eq(searches.deviceId, device.id), isNull(searches.userId))!;
  return null;
}

const encodeCursor = (createdAt: Date, id: string) =>
  Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');

function decodeCursor(cursor: string | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const [at, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  const createdAt = new Date(at ?? '');
  return id && !Number.isNaN(createdAt.getTime()) ? { createdAt, id } : null;
}

@Injectable()
export class HistoryService {
  private readonly log = new Logger(HistoryService.name);

  constructor(
    @Inject(USERS_DB) private readonly users: UsersConnection,
    @Inject(CATALOG_DB) private readonly catalog: CatalogConnection,
  ) {}

  /** Fire and forget: called after the response is built; failures are logged, not thrown. */
  record(r: SearchRecord): Promise<void> {
    const { user, device } = r.identity;
    if (!user && !device) return Promise.resolve();
    const productIds = [
      ...r.response.products.map((p) => p.productId),
      ...r.response.lookalikes.map((l) => l.productId),
    ];
    return this.users.db
      .insert(searches)
      .values({
        id: r.id,
        userId: user?.id ?? null,
        deviceId: device?.id ?? null,
        imageHash: r.imageHash,
        query: r.query,
        detected: r.response.detected,
        resultProductIds: [...new Set(productIds)],
        source: r.source,
        latencyMs: r.latencyMs,
        // Millisecond precision from JS keeps the (createdAt, id) cursor exact.
        createdAt: new Date(),
      })
      .onConflictDoNothing()
      .then(
        () => undefined,
        (error: unknown) => {
          this.log.warn(
            { searchId: r.id, err: error instanceof Error ? error.message : 'unknown' },
            'history not saved',
          );
        },
      );
  }

  async list(identity: Identity, cursor: string | undefined, limit: number): Promise<SearchHistoryResponse> {
    const owner = ownerFilter(identity);
    if (!owner) return { items: [], nextCursor: null };
    const after = decodeCursor(cursor);
    const rows = await this.users.db
      .select()
      .from(searches)
      .where(
        and(
          owner,
          after
            ? or(
                lt(searches.createdAt, after.createdAt),
                and(eq(searches.createdAt, after.createdAt), lt(searches.id, after.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(searches.createdAt), desc(searches.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const tops = await this.topProducts(page.flatMap((r) => r.resultProductIds.slice(0, 1)));
    const items = page.map((r): SearchHistoryItem => ({
      id: r.id,
      source: r.source,
      query: r.query,
      imageSearch: r.imageHash !== null,
      detected: r.detected,
      resultCount: r.resultProductIds.length,
      topProduct: tops.get(r.resultProductIds[0] ?? '') ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
    const last = page.at(-1);
    return { items, nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null };
  }

  /** True when a row was deleted. */
  async remove(identity: Identity, id: string): Promise<boolean> {
    const owner = ownerFilter(identity);
    if (!owner) return false;
    const deleted = await this.users.db
      .delete(searches)
      .where(and(owner, eq(searches.id, id)))
      .returning({ id: searches.id });
    return deleted.length > 0;
  }

  async clear(identity: Identity): Promise<number> {
    const owner = ownerFilter(identity);
    if (!owner) return 0;
    const deleted = await this.users.db.delete(searches).where(owner).returning({ id: searches.id });
    return deleted.length;
  }

  /** On link (8.3): the device's anonymous searches become the user's. */
  async moveToUser(deviceId: string, userId: string): Promise<void> {
    await this.users.db
      .update(searches)
      .set({ userId })
      .where(and(eq(searches.deviceId, deviceId), isNull(searches.userId)));
  }

  private async topProducts(
    ids: string[],
  ): Promise<Map<string, NonNullable<SearchHistoryItem['topProduct']>>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.catalog.db
      .select({
        productId: canonicalProducts.id,
        slug: canonicalProducts.slug,
        title: canonicalProducts.title,
        repImageUrl: canonicalProducts.repImageUrl,
        cheapestNewKobo: canonicalProducts.cheapestNewKobo,
        cheapestUsedKobo: canonicalProducts.cheapestUsedKobo,
        listingCount: canonicalProducts.listingCount,
      })
      .from(canonicalProducts)
      .where(inArray(canonicalProducts.id, unique));
    return new Map(rows.map((r) => [r.productId, r]));
  }
}
