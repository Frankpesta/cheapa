import type { PriceHistoryResponse, ProductResponse } from '@cheapa/core';
import { canonicalProducts, type CatalogConnection, listings, priceHistory } from '@cheapa/db/catalog';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, sql } from 'drizzle-orm';
import { CATALOG_DB } from '../../infra/database.module.js';
import { CatalogSearch, LISTINGS_PER_PRODUCT } from '../search/catalog-search.js';
import { byStockThenPrice, listingCard } from '../search/results.js';

@Injectable()
export class ProductsService {
  private readonly search: CatalogSearch;

  constructor(@Inject(CATALOG_DB) private readonly catalog: CatalogConnection) {
    this.search = new CatalogSearch(catalog.db);
  }

  async bySlug(slug: string): Promise<ProductResponse | null> {
    const [row] = await this.catalog.db
      .select()
      .from(canonicalProducts)
      .where(eq(canonicalProducts.slug, slug))
      .limit(1);
    if (!row) return null;
    const now = new Date();
    const rows = await this.search.listingsFor([row.id]);
    return {
      productId: row.id,
      slug: row.slug,
      title: row.title,
      department: row.department,
      category: row.category,
      brand: row.brand,
      repImageUrl: row.repImageUrl,
      minPriceKobo: row.minPriceKobo,
      maxPriceKobo: row.maxPriceKobo,
      cheapestNewKobo: row.cheapestNewKobo,
      cheapestUsedKobo: row.cheapestUsedKobo,
      listingCount: row.listingCount,
      updatedAt: row.updatedAt.toISOString(),
      listings: byStockThenPrice(rows)
        .slice(0, LISTINGS_PER_PRODUCT)
        .map((l) => listingCard(l, now)),
    };
  }

  async exists(productId: string): Promise<boolean> {
    const [row] = await this.catalog.db
      .select({ id: canonicalProducts.id })
      .from(canonicalProducts)
      .where(eq(canonicalProducts.id, productId))
      .limit(1);
    return row !== undefined;
  }

  /** Cheapest in-stock observation per day (Africa/Lagos) across the product's listings. */
  async history(productId: string, days: number): Promise<PriceHistoryResponse> {
    const day = sql<string>`to_char(${priceHistory.observedAt} at time zone 'Africa/Lagos', 'YYYY-MM-DD')`;
    const rows = await this.catalog.db
      .select({ day, minPriceKobo: sql<number>`min(${priceHistory.priceKobo})`.mapWith(Number) })
      .from(priceHistory)
      .innerJoin(listings, eq(listings.id, priceHistory.listingId))
      .where(
        and(
          eq(listings.canonicalProductId, productId),
          eq(priceHistory.inStock, true),
          gte(priceHistory.observedAt, sql`now() - make_interval(days => ${days})`),
        ),
      )
      .groupBy(day)
      .orderBy(asc(day));
    return { productId, days, points: rows };
  }
}
