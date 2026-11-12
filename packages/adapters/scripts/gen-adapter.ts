/** `pnpm gen:adapter <id> ...`: see src/gen/gen-adapter.ts. */
import { fileURLToPath } from 'node:url';
import { NEXT_STEPS, parseArgs, renderAdapter, writeAdapter } from '../src/gen/gen-adapter.js';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

try {
  const options = parseArgs(process.argv.slice(2));
  const written = writeAdapter(repoRoot, renderAdapter(options));
  process.stdout.write(`Created:\n${written.map((p) => `  ${p}`).join('\n')}\n${NEXT_STEPS(options.id)}\n`);
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
}
