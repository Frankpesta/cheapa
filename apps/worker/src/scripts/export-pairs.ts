/**
 * Writes scripts/data/pairs-labelled.jsonl from review decisions (04 §4.4; weekly, or
 * before retuning MATCH_*_THRESHOLD). Usage: pnpm export:pairs
 */
import { catalogDbEnv, loadEnv } from '@cheapa/core';
import { createCatalogDb } from '@cheapa/db/catalog';
import { writeFileSync } from 'node:fs';
import { decidedPairs, toJsonl } from '../crawl/pairs.js';

const out = new URL('../../../../scripts/data/pairs-labelled.jsonl', import.meta.url);
const env = loadEnv(catalogDbEnv, process.env);
const catalog = createCatalogDb(env.CATALOG_DATABASE_URL, { max: 2, applicationName: 'cheapa-export-pairs' });
try {
  const pairs = await decidedPairs(catalog.db);
  writeFileSync(out, toJsonl(pairs));
  const same = pairs.filter((p) => p.label === 'same').length;
  process.stdout.write(
    `${pairs.length} labelled pairs (${same} same, ${pairs.length - same} different) -> scripts/data/pairs-labelled.jsonl\n`,
  );
} finally {
  await catalog.close();
}
