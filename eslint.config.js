const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    extends: [
      'eslint:recommended',
    ],
    ignores: [],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "no-extra-boolean-cast": "off"
    }
  })