/**
 * CLAUDE.md rule 5: no adapter merges without fixtures. Every adapter folder in src/
 * must have a parse.test.ts and at least one saved response in __fixtures__/.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { allAdapters } from './all.js';
import { AdapterRegistry } from './registry.js';

const SRC = fileURLToPath(new URL('./', import.meta.url));
/** Engine folders, not adapters. zz-gen-check-* is gen-adapter.test.ts's scratch adapter. */
const NOT_ADAPTERS = new Set(['__fixtures__', '__snapshots__', 'gen', 'http', 'test']);

export function adapterFolders(src = SRC): string[] {
  return readdirSync(src).filter(
    (name) =>
      !NOT_ADAPTERS.has(name) &&
      !name.startsWith('zz-gen-check-') &&
      statSync(join(src, name)).isDirectory() &&
      existsSync(join(src, name, 'index.ts')),
  );
}

export function fixtureProblems(folder: string, src = SRC): string[] {
  const problems: string[] = [];
  if (!existsSync(join(src, folder, 'parse.test.ts'))) problems.push(`${folder}: no parse.test.ts`);
  const fixturesDir = join(src, folder, '__fixtures__');
  const fixtures = existsSync(fixturesDir) ? readdirSync(fixturesDir).filter((f) => !f.startsWith('.')) : [];
  if (fixtures.length === 0) problems.push(`${folder}: no saved responses in __fixtures__/`);
  return problems;
}

describe('adapter fixtures', () => {
  it('every adapter folder ships a parse test and at least one fixture', () => {
    expect(adapterFolders().flatMap((f) => fixtureProblems(f))).toEqual([]);
  });
});

describe('registered adapters', () => {
  it('build a registry, and each custom adapter lives in its own tested folder', () => {
    expect(() => new AdapterRegistry(allAdapters)).not.toThrow();
    const folders = adapterFolders();
    for (const adapter of allAdapters.filter((a) => a.kind === 'custom')) {
      expect(folders).toContain(adapter.id);
    }
  });
});
