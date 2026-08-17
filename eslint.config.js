import js from '@eslint/js';

/**
 * Configuration ESLint 9 (format « flat »).
 * /!\ `npm run lint` échouait: le script existait mais aucun fichier de
 * configuration n'était présent, ESLint 9 renvoyait une erreur de migration.
 */
export default [
  js.configs.recommended,

  // Code applicatif (navigateur, ES modules)
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        AbortController: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        Worker: 'readonly',
        Chart: 'readonly',
        confirm: 'readonly',
        alert: 'readonly',
        Uint8Array: 'readonly',
        TextDecoder: 'readonly',
        caches: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        indexedDB: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-console': 'off',
      eqeqeq: ['warn', 'smart'],
      'prefer-const': 'warn'
    }
  },

  // Service Worker
  {
    files: ['src/js/workers/**/*.js', 'public/sw.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        self: 'readonly',
        caches: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        Uint8Array: 'readonly'
      }
    }
  },

  // Tests Vitest
  {
    files: ['**/__tests__/**/*.js', '**/*.test.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        console: 'readonly'
      }
    }
  },

  // Fonction serverless (Edge runtime)
  {
    files: ['api/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        fetch: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        console: 'readonly'
      }
    }
  },

  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**']
  }
];
