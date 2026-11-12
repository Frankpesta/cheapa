import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { testStore } from '../testing.js';
import type { PoliteHttpClient, SourceAdapter } from '../types.js';
import { parseListings } from '../validate.js';
import { camelCase, parseArgs, renderAdapter, writeAdapter } from './gen-adapter.js';

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));

describe('parseArgs / validation', () => {
  it('reads the id and flags', () => {
    expect(parseArgs(['shop-aramide', '--domain', 'WWW.ShopAramide.ng', '--name', 'Shop Aramide'])).toEqual({
      id: 'shop-aramide',
      domain: 'www.shoparamide.ng',
      name: 'Shop Aramide',
    });
    expect(parseArgs(['woo', '--platform', 'woocommerce', '--format', 'json'])).toMatchObject({
      platform: 'woocommerce',
      format: 'json',
    });
  });

  it.each([
    [['--domain', 'x.ng'], /Usage/],
    [['shop', '--domain'], /needs a value/],
    [['shop', '--colour', 'red'], /unknown option/],
  ])('rejects %j', (argv, error) => {
    expect(() => parseArgs(argv)).toThrow(error);
  });

  it.each([
    [{ id: 'Shop_Aramide', domain: 'a.ng' }, /kebab-case/],
    [{ id: 'shop' }, /exactly one of/],
    [{ id: 'shop', domain: 'a.ng', platform: 'shopify' as const }, /exactly one of/],
    [{ id: 'shop', domain: 'https://a.ng/x' }, /bare host/],
    [{ id: 'shop', platform: 'tiktok' as never }, /must be one of/],
  ])('refuses bad options %j', (options, error) => {
    expect(() => renderAdapter(options)).toThrow(error);
  });
});

describe('renderAdapter', () => {
  it('creates the adapter folder, fixture test and source doc with no placeholders left', () => {
    const files = renderAdapter({ id: 'shop-aramide', domain: 'www.shoparamide.ng', date: '2026-11-12' });
    expect(files.map((f) => f.path)).toEqual([
      'packages/adapters/src/shop-aramide/index.ts',
      'packages/adapters/src/shop-aramide/parse.ts',
      'packages/adapters/src/shop-aramide/parse.test.ts',
      'packages/adapters/src/shop-aramide/__fixtures__/.gitkeep',
      'docs/sources/shop-aramide.md',
    ]);
    for (const f of files) expect(f.content).not.toMatch(/\{\{\w+\}\}/);
    const [index, parse, , , doc] = files.map((f) => f.content);
    expect(index).toContain("id: 'shop-aramide'");
    expect(index).toContain("domains: ['www.shoparamide.ng']");
    expect(index).toContain('export const shopAramideAdapter');
    expect(parse).toContain("from 'cheerio'");
    expect(doc).toContain('# Shop Aramide source notes');
    expect(doc).toContain('Verified: 2026-11-12');
  });

  it('renders a platform adapter over JSON', () => {
    const [index, parse] = renderAdapter({ id: 'shopify', platform: 'shopify', format: 'json' }).map(
      (f) => f.content,
    );
    expect(index).toContain("id: 'platform:shopify'");
    expect(index).toContain("platform: 'shopify'");
    expect(index).not.toContain('domains:');
    expect(parse).not.toContain('cheerio');
  });
});

describe('writeAdapter', () => {
  const root = mkdtempSync(join(tmpdir(), 'cheapa-gen-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('writes once and refuses to overwrite', () => {
    const files = renderAdapter({ id: 'shop', domain: 'shop.ng' });
    expect(writeAdapter(root, files)).toHaveLength(5);
    expect(existsSync(join(root, 'packages/adapters/src/shop/__fixtures__/.gitkeep'))).toBe(true);
    expect(() => writeAdapter(root, files)).toThrow(/already exists, nothing written/);
  });
});

/**
 * The generated code itself: written next to the real adapters (so its relative imports
 * resolve), given a sample page and selectors, then run. Keeps the templates honest as
 * the adapter contract changes.
 */
describe('generated adapter runs', () => {
  const id = `zz-gen-check-${process.pid}`;
  const dir = join(REPO, 'packages/adapters/src', id);
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(join(REPO, 'docs/sources', `${id}.md`), { force: true });
  });

  it('parses a fashion listing page and pages through it', async () => {
    const files = renderAdapter({ id, domain: 'www.trial.ng' }).map((f) =>
      f.path.endsWith('/parse.ts')
        ? {
            ...f,
            content: f.content
              .replace("card: '',", "card: 'article.prd',")
              .replace("title: '',", "title: '.name',")
              .replace("price: '',", "price: '.prc',")
              .replace("soldOut: '',", "soldOut: '.soldout',")
              .replace("pageLinks: '',", "pageLinks: 'nav a',"),
          }
        : f,
    );
    // Only the source files: the generated parse.test.ts would be picked up by later runs.
    writeAdapter(
      REPO,
      files.filter((f) => !f.path.endsWith('.test.ts') && !f.path.startsWith('docs/')),
    );
    const html = `<article class="prd" data-id="D1"><a href="/p/d1"><h3 class="name">Satin Slip Dress</h3></a>
      <div class="prc">From ₦ 12,500</div><span class="soldout">x</span></article><nav><a>1</a><a>2</a></nav>`;
    writeFileSync(join(dir, '__fixtures__/page.html'), html);

    const mod = (await import(/* @vite-ignore */ join(dir, 'index.ts'))) as Record<string, SourceAdapter>;
    const adapter = mod[`${camelCase(id)}Adapter`]!;
    const store = testStore({ domain: 'www.trial.ng' });
    const raw = {
      ref: { kind: 'page' as const, url: 'https://www.trial.ng/' },
      url: 'https://www.trial.ng/',
      fetchedAt: '2026-11-12T00:00:00.000Z',
      format: 'html' as const,
      body: html,
    };
    const { listings, rejected } = parseListings(adapter, raw, store);
    expect(rejected).toEqual([]);
    expect(listings).toMatchObject([
      {
        externalId: 'D1',
        title: 'Satin Slip Dress',
        priceKobo: 1_250_000,
        priceKind: 'from',
        inStock: false,
        sourceUrl: 'https://www.trial.ng/p/d1',
      },
    ]);

    const http: PoliteHttpClient = {
      get: (url) => Promise.resolve({ url, status: 200, headers: {}, body: html, notModified: false }),
    };
    const log = { debug() {}, info() {}, warn() {}, error() {} };
    const refs: string[] = [];
    for await (const ref of adapter.discover({ http, log, signal: new AbortController().signal }, store)) {
      refs.push(ref.url);
    }
    expect(refs).toEqual(['https://www.trial.ng/', 'https://www.trial.ng/?page=2']);
    expect(readdirSync(dir).sort()).toEqual(['__fixtures__', 'index.ts', 'parse.ts']);
  });
});
