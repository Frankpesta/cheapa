import { createConfig } from '@cheapa/config/eslint';

export default [
  // gen-adapter.test.ts writes a scratch adapter here for a moment; lint running in
  // parallel must not pick it up.
  { ignores: ['src/zz-gen-check-*/**'] },
  ...createConfig({ tsconfigRootDir: import.meta.dirname, restrictUsersDb: true }),
];
