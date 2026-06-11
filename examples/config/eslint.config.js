module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    'prettier',
  ],
  rules: {
    // Erreurs courantes à corriger automatiquement
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/no-inferrable-types': 'warn',
    '@typescript-eslint/no-var-requires': 'error',
    'no-console': 'warn', // Utiliser Winston à la place
    'prefer-const': 'error',
    'no-duplicate-imports': 'error',
    'prettier/prettier': 'error',
  },
  env: {
    node: true,
    es2020: true,
  },
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  ignorePatterns: ['node_modules/', 'dist/'],
};
