/**
 * Fixture helpers for adapter tests (CLAUDE.md rule 5: no adapter merges without
 * fixtures). Fixtures are saved public responses in `<adapter>/__fixtures__/`.
 * Import from `@cheapa/adapters/testing` in tests only.
 */
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { JsonValue, ProductRef, RawPayload, StoreRef } from './types.js';

/** Fixed so parse output never depends on the clock. */
export const FIXTURE_FETCHED_AT = '2026-11-01T00:00:00.000Z';

/**
 * Loads `<dir>/<name>` as a RawPayload. Format comes from the extension (.json, .html,
 * .xml). `url` should be the page the fixture was saved from.
 */
export function loadFixture(dir: string, name: string, url: string, ref?: Partial<ProductRef>): RawPayload {
  const text = readFileSync(join(dir, name), 'utf8');
  const base = {
    ref: { kind: 'page' as const, url, ...ref },
    url,
    fetchedAt: FIXTURE_FETCHED_AT,
  };
  const ext = extname(name).toLowerCase();
  switch (ext) {
    case '.json':
      return { ...base, format: 'json', body: JSON.parse(text) as JsonValue };
    case '.html':
    case '.htm':
      return { ...base, format: 'html', body: text };
    case '.xml':
      return { ...base, format: 'xml', body: text };
    default:
      throw new Error(`unsupported fixture type "${ext}" (${name})`);
  }
}

/** A plausible active store for parse tests. */
export function testStore(overrides: Partial<StoreRef> = {}): StoreRef {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Test Store',
    domain: 'example.ng',
    platform: 'custom',
    tier: 1,
    status: 'active',
    crawlPolicy: { robotsOk: true, maxRps: 1 },
    ...overrides,
  };
}
export * from './test-server.js';
