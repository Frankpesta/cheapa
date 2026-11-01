import { baseConfig } from '@cheapa/config/vitest';
import { mergeConfig } from 'vitest/config';

// Integration tests start a Postgres container; allow time for the first image pull.
export default mergeConfig(baseConfig, { test: { hookTimeout: 180_000, testTimeout: 30_000 } });
