import { baseConfig } from '@cheapa/config/vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

// Pure helpers only (lib/, tokens); components are checked in the /dev/components gallery.
export default mergeConfig(baseConfig, defineConfig({ test: { include: ['lib/**/*.test.ts'] } }));
