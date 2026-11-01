import { defineConfig } from 'vitest/config';

// Resolve workspace packages to their TypeScript source (the "@cheapa/source"
// export condition) so tests never need a prior build.
const conditions = ['@cheapa/source', 'node', 'import', 'module', 'default'];

export const baseConfig = defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions, externalConditions: conditions } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
