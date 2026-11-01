import { baseConfig } from '@cheapa/config/vitest';
import swc from 'unplugin-swc';
import { mergeConfig } from 'vitest/config';

// NestJS DI needs decorator metadata, which esbuild doesn't emit; swc does.
export default mergeConfig(baseConfig, {
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: { hookTimeout: 180_000, testTimeout: 30_000 },
});
