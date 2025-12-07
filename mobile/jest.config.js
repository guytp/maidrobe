module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
  ],
  collectCoverageFrom: [
    '**/*.{ts,tsx}',
    '!**/coverage/**',
    '!**/node_modules/**',
    '!**/babel.config.js',
    '!**/jest.config.js',
    '!**/.expo/**',
  ],
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // CI reliability settings
  testTimeout: 10000,
  maxWorkers: '50%',
  // In CI, add custom reporter to write JSON results for failure summary parsing
  // while preserving default reporter output. The CI env var is set by GitHub Actions.
  ...(process.env.CI && {
    reporters: ['default', '<rootDir>/jest-results-processor.js'],
  }),
};
