/**
 * Accuracy gates on the labelled title set (04 §4.1 acceptance, 13 §13.9). Title only: the
 * normalizer gets no store category and no store brand. Report: pnpm --filter @cheapa/core eval:titles
 *
 * The electronics hand labels were also used to tune the model/storage extractor, so that
 * score is optimistic until fresh titles are added (BACKLOG).
 */
import { describe, expect, it } from 'vitest';
import { evaluateTitles, loadLabelledTitles, pct, type Score } from './eval.js';

const rows = loadLabelledTitles();
const report = evaluateTitles(rows);
const sum = (scores: Score[]): Score =>
  scores.reduce((a, s) => ({ correct: a.correct + s.correct, total: a.total + s.total }), {
    correct: 0,
    total: 0,
  });
const FASHION = ['clothing', 'shoes', 'bags_accessories', 'hair', 'beauty'];

describe('labelled title set', () => {
  it('is big enough and fashion-first (≥ 500 titles, ≥ 60% fashion and beauty)', () => {
    expect(rows.length).toBeGreaterThanOrEqual(500);
    const fashion = rows.filter((r) => FASHION.includes(r.expect.department)).length;
    expect(fashion / rows.length).toBeGreaterThanOrEqual(0.6);
  });
});

describe('title-only accuracy gates', () => {
  it('brand ≥ 90% (04 §4.1)', () => {
    expect(pct(report.brand)).toBeGreaterThanOrEqual(0.9);
  });

  it('phones and laptops: model + storage ≥ 80% (04 §4.1)', () => {
    expect(report.modelStorage.total).toBeGreaterThan(50);
    expect(pct(report.modelStorage)).toBeGreaterThanOrEqual(0.8);
  });

  it('fashion, hair and beauty department ≥ 85% (regression floor)', () => {
    expect(pct(sum(FASHION.map((d) => report.department[d]!)))).toBeGreaterThanOrEqual(0.85);
  });

  it('fashion, hair and beauty category ≥ 85% where the store names one (regression floor)', () => {
    expect(
      pct(sum(FASHION.map((d) => report.category[d] ?? { correct: 0, total: 0 }))),
    ).toBeGreaterThanOrEqual(0.85);
  });
});
