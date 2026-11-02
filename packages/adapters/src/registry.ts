import type { SourceAdapter, StoreRef } from './types.js';

/**
 * Picks the adapter for a store: a custom adapter that lists the store's domain wins,
 * otherwise the platform adapter for `store.platform` ('platform:woocommerce' for a
 * WooCommerce store). Built once at startup; duplicates are a programming error.
 */
export class AdapterRegistry {
  private readonly byId = new Map<string, SourceAdapter>();
  private readonly byDomain = new Map<string, SourceAdapter>();
  private readonly byPlatform = new Map<string, SourceAdapter>();

  constructor(adapters: Iterable<SourceAdapter>) {
    for (const adapter of adapters) this.add(adapter);
  }

  get(id: string): SourceAdapter | undefined {
    return this.byId.get(id);
  }

  forStore(store: Pick<StoreRef, 'domain' | 'platform'>): SourceAdapter | undefined {
    return this.byDomain.get(normalizeDomain(store.domain)) ?? this.byPlatform.get(store.platform);
  }

  list(): SourceAdapter[] {
    return [...this.byId.values()];
  }

  private add(adapter: SourceAdapter): void {
    claim(this.byId, adapter.id, adapter, 'id');
    if (adapter.kind === 'custom') {
      if (!adapter.domains?.length) throw new Error(`custom adapter ${adapter.id} must list its domains`);
      for (const domain of adapter.domains) claim(this.byDomain, normalizeDomain(domain), adapter, 'domain');
    } else {
      if (!adapter.platform)
        throw new Error(`${adapter.kind} adapter ${adapter.id} must declare its platform`);
      claim(this.byPlatform, adapter.platform, adapter, 'platform');
    }
  }
}

function claim(map: Map<string, SourceAdapter>, key: string, adapter: SourceAdapter, what: string): void {
  const existing = map.get(key);
  if (existing) throw new Error(`${what} "${key}" claimed by both ${existing.id} and ${adapter.id}`);
  map.set(key, adapter);
}

/** "WWW.Jumia.com.ng." -> "jumia.com.ng" so stores and adapters match however they're written. */
export function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^www\./, '');
}
