/**
 * Title-only accuracy against scripts/data/titles-labelled.jsonl (04 §4.1 acceptance,
 * 13 §13.9). The normalizer sees the title alone: no store category, no store brand.
 * Usage: pnpm --filter @cheapa/core eval:titles
 */
import { evaluateTitles, formatReport, loadLabelledTitles } from '../src/normalize/eval.js';

const report = evaluateTitles(loadLabelledTitles());
process.stdout.write(formatReport(report));
