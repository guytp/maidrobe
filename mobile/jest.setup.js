/**
 * Jest setup file for environment configuration and test utilities.
 */

/* eslint-env jest */

// Set required environment variables for tests
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

// Mock AsyncStorage for Jest tests
// AsyncStorage requires native modules which aren't available in Node test environment
// Export both default and named exports to match AsyncStorage interface expected by Supabase
const mockAsyncStorage = {
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: mockAsyncStorage,
  ...mockAsyncStorage,
}));

// Mock react-native-safe-area-context for Jest tests
// This provides default mocks for SafeAreaProvider, SafeAreaView, and useSafeAreaInsets.
// Individual test files can override these mocks if they need specific inset values.
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }) => children,
  SafeAreaView: ({ children }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
}));

// Silence console warnings during tests for cleaner output
// Keeps error output for actual failures while reducing noise from React Native internals
const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  const message = args[0];
  if (
    typeof message === 'string' &&
    (message.includes('Animated: `useNativeDriver`') ||
      message.includes('componentWillReceiveProps') ||
      message.includes('componentWillMount'))
  ) {
    return;
  }
  originalConsoleWarn.apply(console, args);
};
