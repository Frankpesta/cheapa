import { baseConfig } from '@cheapa/config/vitest';
import swc from 'unplugin-swc';
import { mergeConfig } from 'vitest/config';

// NestJS DI needs decorator metadata, which esbuild doesn't emit; swc does.
export default mergeConfig(baseConfig, {
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    // One Postgres + one Redis for the whole run; each file clones its own databases.
    globalSetup: ['./src/test/global-setup.ts'],
    hookTimeout: 60_000,
    testTimeout: 15_000,
  },
});
