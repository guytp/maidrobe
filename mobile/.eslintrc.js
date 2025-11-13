module.exports = {
  extends: ['../.eslintrc.js', 'expo'],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  ignorePatterns: ['node_modules/', '.expo/', 'dist/', 'coverage/', '*.config.js'],
};
