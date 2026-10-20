import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      //  WITHOUT THIS OPTIONS OBJECT, ESLINT CANNOT START AT ALL.
      //
      //  ESLint 9.39's own `no-unused-expressions` destructures
      //  `context.options[0]` with no guard, relying on the
      //  `defaultOptions` it declares in its own metadata. The
      //  typescript-eslint extension rule (8.14.0) applies defaults to
      //  its own parameters and then calls `baseRule.create(context)`
      //  with the untouched context — so when the rule is configured
      //  as a bare severity, `context.options` is `[]`, the base rule
      //  destructures `undefined`, and the whole run dies with
      //  "Cannot read properties of undefined (reading
      //  'allowShortCircuit')" before a single file is linted.
      //
      //  Passing the options explicitly makes `context.options[0]`
      //  exist, which is all the base rule needs. These three values
      //  are the defaults both sides already declare, so nothing about
      //  what the rule ENFORCES changes.
      //
      //  The alternative was upgrading eslint or typescript-eslint,
      //  which is a dependency change. This is a config line.
      '@typescript-eslint/no-unused-expressions': ['error', {
        allowShortCircuit: false,
        allowTernary: false,
        allowTaggedTemplates: false,
      }],

      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  }
);
