import { createConfig } from '@cheapa/config/eslint';

export default [
  { ignores: ['.expo/**', 'dist/**', 'expo-env.d.ts', 'android/**', 'ios/**', 'eslint.config.mjs'] },
  ...createConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@cheapa/core',
              message: 'Use @cheapa/core/client: the root entry pulls in Node-only code (node:crypto).',
            },
          ],
          patterns: [
            {
              group: ['@cheapa/db', '@cheapa/db/*', '@cheapa/ml', '@cheapa/adapters'],
              message: 'Server packages never ship in the app; call the API.',
            },
          ],
        },
      ],
    },
  },
  // Expo loads babel/metro configs as CommonJS.
  { files: ['*.config.js'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
];
