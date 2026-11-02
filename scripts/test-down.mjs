// Remove the throwaway Testcontainers (label cheapa.test) left running for reuse between
// test runs. Leaves the dev stack from `pnpm infra:up` alone. Cross-platform (no xargs).
import { execFileSync } from 'node:child_process';

const ids = execFileSync('docker', ['ps', '-aq', '--filter', 'label=cheapa.test'], { encoding: 'utf8' })
  .split(/\s+/)
  .filter(Boolean);
if (ids.length === 0) {
  console.log('No test containers running.');
} else {
  execFileSync('docker', ['rm', '-f', ...ids], { stdio: 'inherit' });
  console.log(`Removed ${ids.length} test container(s).`);
}
