import { createConfig } from '@cheapa/config/eslint';

export default [
  ...createConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    // NestJS injects by constructor parameter type: those imports must stay value imports.
    languageOptions: { parserOptions: { emitDecoratorMetadata: true, experimentalDecorators: true } },
    rules: { '@typescript-eslint/no-extraneous-class': 'off' },
  },
];
