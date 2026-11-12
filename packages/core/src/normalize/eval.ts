/**
 * Scores the normalizer against the labelled title set (scripts/data/titles-labelled.jsonl).
 * Used by eval.test.ts (gates) and scripts/eval-titles.ts (report).
 */
import { readFileSync } from 'node:fs';
import { RawListing } from '../types.js';
import { normalizeListing } from './index.js';

export interface LabelledTitle {
  id: string;
  store: string;
  title: string;
  expect: {
    department: string;
    category?: string;
    /** null = the title names no brand. */
    brand?: string | null;
    model?: string;
    storageGb?: number;
    ramGb?: number;
  };
  labels: string;
}

export const LABELLED_TITLES = new URL('../../../../scripts/data/titles-labelled.jsonl', import.meta.url);

export function loadLabelledTitles(path: URL | string = LABELLED_TITLES): LabelledTitle[] {
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as LabelledTitle);
}

export interface Score {
  correct: number;
  total: number;
}
export interface Miss {
  id: string;
  field: string;
  title: string;
  expected: unknown;
  got: unknown;
}
export interface TitleReport {
  department: Record<string, Score>;
  category: Record<string, Score>;
  brand: Score;
  /** Electronics: model and storage both right (04 §4.1: ≥ 80%). */
  modelStorage: Score;
  ram: Score;
  misses: Miss[];
}

const same = (a: unknown, b: unknown) =>
  typeof a === 'string' && typeof b === 'string'
    ? a.toLowerCase().replace(/\s+/g, ' ').trim() === b.toLowerCase().replace(/\s+/g, ' ').trim()
    : a === b;

export function evaluateTitles(rows: readonly LabelledTitle[]): TitleReport {
  const r: TitleReport = {
    department: {},
    category: {},
    brand: { correct: 0, total: 0 },
    modelStorage: { correct: 0, total: 0 },
    ram: { correct: 0, total: 0 },
    misses: [],
  };
  const tally = (
    bucket: Score,
    ok: boolean,
    row: LabelledTitle,
    field: string,
    expected: unknown,
    got: unknown,
  ) => {
    bucket.total += 1;
    if (ok) bucket.correct += 1;
    else r.misses.push({ id: row.id, field, title: row.title, expected, got });
  };
  for (const row of rows) {
    const raw = RawListing.parse({
      externalId: row.id,
      sourceUrl: 'https://example.ng/p',
      title: row.title,
      priceKobo: 100,
      inStock: true,
    });
    const n = normalizeListing(raw);
    const dept = row.expect.department;
    r.department[dept] ??= { correct: 0, total: 0 };
    tally(r.department[dept], n.department === dept, row, 'department', dept, n.department);
    if (row.expect.category) {
      r.category[dept] ??= { correct: 0, total: 0 };
      tally(
        r.category[dept],
        n.category === row.expect.category,
        row,
        'category',
        row.expect.category,
        n.category,
      );
    }
    if (row.expect.brand !== undefined) {
      const got = n.brand ?? null;
      tally(
        r.brand,
        row.expect.brand === null ? got === null : same(got, row.expect.brand),
        row,
        'brand',
        row.expect.brand,
        got,
      );
    }
    if (row.expect.storageGb !== undefined) {
      const ok =
        same(n.model ?? null, row.expect.model ?? null) && n.variant.storageGb === row.expect.storageGb;
      tally(
        r.modelStorage,
        ok,
        row,
        'model+storage',
        [row.expect.model, row.expect.storageGb],
        [n.model, n.variant.storageGb],
      );
      tally(r.ram, n.variant.ramGb === row.expect.ramGb, row, 'ram', row.expect.ramGb, n.variant.ramGb);
    }
  }
  return r;
}

export const pct = (s: Score) => (s.total === 0 ? 1 : s.correct / s.total);

export function formatReport(r: TitleReport): string {
  const line = (label: string, s: Score) =>
    `${label.padEnd(28)} ${(pct(s) * 100).toFixed(1).padStart(5)}%  (${s.correct}/${s.total})`;
  const out = ['Title-only accuracy (scripts/data/titles-labelled.jsonl)', ''];
  for (const [d, s] of Object.entries(r.department)) out.push(line(`department: ${d}`, s));
  out.push('');
  for (const [d, s] of Object.entries(r.category)) out.push(line(`category: ${d}`, s));
  out.push(
    '',
    line('brand', r.brand),
    line('electronics model+storage', r.modelStorage),
    line('electronics RAM', r.ram),
    '',
  );
  out.push(`Misses (${r.misses.length}):`);
  for (const m of r.misses) {
    out.push(
      `  ${m.id} ${m.field}: expected ${JSON.stringify(m.expected)} got ${JSON.stringify(m.got)} | ${m.title.slice(0, 90)}`,
    );
  }
  return out.join('\n') + '\n';
}
