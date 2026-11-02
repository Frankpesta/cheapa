import { baseConfig } from '@cheapa/config/vitest';
import { mergeConfig } from 'vitest/config';

export default mergeConfig(baseConfig, {
  test: {
    // One Redis for the run (limiter tests); see src/test/global-setup.ts.
    globalSetup: ['./src/test/global-setup.ts'],
    hookTimeout: 60_000,
  },
});
