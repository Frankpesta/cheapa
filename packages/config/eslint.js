// Shared ESLint flat config. Each package: createConfig({ tsconfigRootDir: import.meta.dirname }).
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * @param {{ tsconfigRootDir: string, restrictUsersDb?: boolean }} options
 *   restrictUsersDb: forbid importing the users database (CLAUDE.md rule 2).
 *   Set for the worker, adapters, core and ml.
 */
export function createConfig({ tsconfigRootDir, restrictUsersDb = false }) {
  return tseslint.config(
    { ignores: ['dist/**', 'coverage/**', '.turbo/**', 'node_modules/**'] },
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
      languageOptions: {
        globals: globals.node,
        parserOptions: {
          projectService: { allowDefaultProject: ['*.js'] },
          tsconfigRootDir,
        },
      },
      rules: {
        '@typescript-eslint/consistent-type-imports': 'error',
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        'no-console': 'error',
      },
    },
    restrictUsersDb
      ? {
          rules: {
            'no-restricted-imports': [
              'error',
              {
                patterns: [
                  {
                    group: ['@cheapa/db/users', '@cheapa/db/users/*'],
                    message:
                      'User data lives in cheapa_users and is only reachable from apps/api (CLAUDE.md rule 2).',
                  },
                ],
              },
            ],
          },
        }
      : {},
    { files: ['**/*.js'], ...tseslint.configs.disableTypeChecked },
    prettier,
  );
}
