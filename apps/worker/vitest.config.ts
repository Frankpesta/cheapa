import { baseConfig } from '@cheapa/config/vitest';
import { mergeConfig } from 'vitest/config';

export default mergeConfig(baseConfig, {
  test: {
    // One Postgres + one Redis for the run; each file clones its own database.
    globalSetup: ['./src/test/global-setup.ts'],
    hookTimeout: 60_000,
    testTimeout: 20_000,
  },
});
