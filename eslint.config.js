//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

const noopRule = {
  meta: { type: 'problem', schema: [] },
  create: () => ({}),
}

export default [
  ...tanstackConfig,
  { plugins: { 'react-hooks': { rules: { 'exhaustive-deps': noopRule, 'rules-of-hooks': noopRule } } } },
  {
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      'vite.config.ts',
      'dist/**',
      'electron/server-bundle.cjs',
      'node_modules/**',
      'playground-ws-worker/**',
      'public/sw.js',
      'scripts/**/*.js',
      'scripts/**/*.mjs',
      'server-entry.js',
    ],
  },

  {
    rules: {
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/consistent-type-specifier-style': 'off',
      '@typescript-eslint/method-signature-style': 'off',
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      'import/consistent-type-specifier-style': 'off',
      'import/first': 'off',
      'import/newline-after-import': 'off',
      'import/no-duplicates': 'off',
      'import/order': 'off',
      'no-async-promise-executor': 'off',
      'no-control-regex': 'off',
      'no-useless-escape': 'off',
      'prefer-const': 'off',
      'sort-imports': 'off',
    },
  },
  {
    // Block client-side imports of server-only MCP input types.
    // `src/types/mcp-input.ts` may carry secret-bearing fields and must
    // never be referenced from screens or shared components.
    files: ['src/screens/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/types/mcp-input',
              message:
                'mcp-input.ts is server-only (carries unmasked secrets). Import McpClientInput from @/types/mcp instead.',
            },
          ],
          patterns: [
            {
              group: ['**/types/mcp-input', '**/types/mcp-input.ts'],
              message:
                'mcp-input.ts is server-only (carries unmasked secrets). Import McpClientInput from @/types/mcp instead.',
            },
          ],
        },
      ],
    },
  },
]
