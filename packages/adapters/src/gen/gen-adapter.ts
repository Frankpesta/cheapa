/**
 * `pnpm gen:adapter <id>` (02-crawler-core.md 2.6): scaffolds an adapter folder, its
 * fixture test and docs/sources/<id>.md. The adapter is NOT registered in all.ts: it
 * goes live only after its fixture test passes (CLAUDE.md rule 5).
 */
import { STORE_PLATFORMS, type StorePlatform } from '@cheapa/core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface GenOptions {
  /** Folder name and, for custom adapters, the adapter id: "jumia", "shop-aramide". */
  id: string;
  /** Custom adapter: the store's bare host. */
  domain?: string;
  /** Platform adapter (WooCommerce, Shopify...): handles every store on that platform. */
  platform?: StorePlatform;
  name?: string;
  format?: 'html' | 'json';
  /** Today, for the source doc's "Verified" line. */
  date?: string;
}

export interface GeneratedFile {
  /** Relative to the repo root. */
  path: string;
  content: string;
}

const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const HOST = /^(?=.{3,253}$)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
const TEMPLATES = fileURLToPath(new URL('./templates/', import.meta.url));

const words = (id: string) => id.split('-');
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
export const pascalCase = (id: string) => words(id).map(cap).join('');
export const camelCase = (id: string) => {
  const p = pascalCase(id);
  return p.charAt(0).toLowerCase() + p.slice(1);
};

export function validateOptions(o: GenOptions): void {
  if (!ID.test(o.id) || o.id.length > 40) {
    throw new Error(`adapter id "${o.id}" must be lower-case kebab-case, e.g. "jumia" or "shop-aramide"`);
  }
  if (Boolean(o.domain) === Boolean(o.platform)) {
    throw new Error('pass exactly one of --domain <host> (one store) or --platform <name> (a platform)');
  }
  if (o.domain && !HOST.test(o.domain)) {
    throw new Error(`--domain "${o.domain}" must be a bare host like www.example.ng (no scheme or path)`);
  }
  if (o.platform && !STORE_PLATFORMS.includes(o.platform)) {
    throw new Error(`--platform must be one of ${STORE_PLATFORMS.join(', ')}`);
  }
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = values[key];
    if (value === undefined) throw new Error(`template value ${match} is missing`);
    return value;
  });
}

const read = (name: string) => readFileSync(join(TEMPLATES, name), 'utf8');

/** Pure: options -> files. Nothing touches the disk. */
export function renderAdapter(o: GenOptions): GeneratedFile[] {
  validateOptions(o);
  const format = o.format ?? 'html';
  const platform = o.platform;
  const adapterId = platform ? `platform:${platform}` : o.id;
  const domain = o.domain ?? `shop.example.ng`;
  const html = format === 'html';
  const values: Record<string, string> = {
    name: o.name ?? words(o.id).map(cap).join(' '),
    folder: o.id,
    adapterId,
    pascal: pascalCase(o.id),
    camel: camelCase(o.id),
    kind: platform ? 'platform' : 'custom',
    kindLabel: platform ? `${platform} platform` : domain,
    target: platform ? `  platform: '${platform}',` : `  domains: ['${domain}'],`,
    platform: platform ?? 'custom',
    domain,
    format,
    date: o.date ?? new Date().toISOString().slice(0, 10),
    startPath: "'/'",
    typeImports: html
      ? "import type { ProductRef, SourceAdapter } from '../types.js';"
      : "import type { JsonValue, ProductRef, SourceAdapter } from '../types.js';",
    firstBody: html ? 'first.body' : '(JSON.parse(first.body) as JsonValue)',
    fetchBody: html ? 'res.body' : 'JSON.parse(res.body) as JsonValue',
    fixture: html ? 'list-page-1.html' : 'list-page-1.json',
    lastPageArg: html ? 'page().body as string' : 'page().body',
    brokenBody: html
      ? "format: 'html' as const, body: '<html><body><p>Down for maintenance</p></body></html>'"
      : "format: 'json' as const, body: { maintenance: true }",
  };
  const dir = `packages/adapters/src/${o.id}`;
  return [
    { path: `${dir}/index.ts`, content: fill(read('index.ts.tmpl'), values) },
    { path: `${dir}/parse.ts`, content: fill(read(`parse.${format}.ts.tmpl`), values) },
    { path: `${dir}/parse.test.ts`, content: fill(read('parse.test.ts.tmpl'), values) },
    { path: `${dir}/__fixtures__/.gitkeep`, content: '' },
    { path: `docs/sources/${o.id}.md`, content: fill(read('source.md.tmpl'), values) },
  ];
}

/** Writes the files under `root`; refuses to overwrite an existing adapter or source doc. */
export function writeAdapter(root: string, files: readonly GeneratedFile[]): string[] {
  const existing = files.filter((f) => existsSync(join(root, f.path)));
  if (existing.length > 0) {
    throw new Error(`already exists, nothing written: ${existing.map((f) => f.path).join(', ')}`);
  }
  for (const f of files) {
    mkdirSync(dirname(join(root, f.path)), { recursive: true });
    writeFileSync(join(root, f.path), f.content);
  }
  return files.map((f) => f.path);
}

/** Parses `<id> [--domain host | --platform name] [--name "Store"] [--format html|json]`. */
export function parseArgs(argv: readonly string[]): GenOptions {
  const [id, ...rest] = argv;
  if (!id || id.startsWith('--')) throw new Error(USAGE);
  const opts: GenOptions = { id };
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (value === undefined) throw new Error(`${flag} needs a value\n\n${USAGE}`);
    if (flag === '--domain') opts.domain = value.toLowerCase();
    else if (flag === '--platform') opts.platform = value as StorePlatform;
    else if (flag === '--name') opts.name = value;
    else if (flag === '--format' && (value === 'html' || value === 'json')) opts.format = value;
    else throw new Error(`unknown option ${flag} ${value}\n\n${USAGE}`);
  }
  return opts;
}

export const USAGE = `Usage:
  pnpm gen:adapter <id> --domain <host> [--name "Store Name"] [--format html|json]
  pnpm gen:adapter <id> --platform <woocommerce|shopify|...> [--format html|json]

Examples:
  pnpm gen:adapter shop-aramide --domain www.shoparamide.ng --name "Shop Aramide"
  pnpm gen:adapter woocommerce --platform woocommerce --format json`;

export const NEXT_STEPS = (id: string) => `
Next:
  1. Fill in docs/sources/${id}.md (robots.txt, terms, list endpoint, field mapping).
  2. Save one real, signed-out listing page into packages/adapters/src/${id}/__fixtures__/.
  3. Set START_PATHS and the selectors / field paths, then run:
       pnpm --filter @cheapa/adapters test -- ${id}
     and review the snapshot it writes.
  4. Add the adapter to allAdapters in packages/adapters/src/all.ts.`;
