import { defineConfig } from 'vitest/config';

// Resolve workspace packages to their TypeScript source (the "@cheapa/source"
// export condition) so tests never need a prior build. The rest are Vite's default
// server conditions; Vite adds "node" and "import"/"require" per call itself.
// Never list "import" here: it forces ESM entries on require() and breaks CommonJS
// packages such as pg (pg-pool resolves to its .mjs build).
const conditions = ['@cheapa/source', 'module', 'development|production'];

export const baseConfig = defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
