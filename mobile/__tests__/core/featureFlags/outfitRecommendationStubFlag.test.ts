/**
 * Unit tests for the outfit recommendation stub flag evaluation helper.
 *
 * Tests cover:
 * - Environment-specific default logic
 * - Remote flag fetch with timeout handling
 * - Cross-session cache (AsyncStorage) operations
 * - Session cache and concurrency handling
 * - Navigation guard logic
 * - Hook behavior (indirectly via exported functions)
 *
 * @module __tests__/core/featureFlags/outfitRecommendationStubFlag.test
 * @see Story #366 - Outfit Recommendation Engine Feature Flag and Controlled Rollout
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock dependencies before importing the module under test
jest.mock('../../../src/services/supabase', () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

jest.mock('../../../src/features/recommendations/hooks/useNetworkStatus', () => ({
  checkIsOffline: jest.fn(),
}));

jest.mock('../../../src/core/featureFlags/config', () => ({
  getAppEnvironment: jest.fn(),
}));

jest.mock('../../../src/core/telemetry', () => ({
  trackFeatureFlagEvent: jest.fn(),
}));

// Import after mocks are set up - must be after jest.mock() calls
// eslint-disable-next-line import/first
import { supabase } from '../../../src/services/supabase';
// eslint-disable-next-line import/first
import { checkIsOffline } from '../../../src/features/recommendations/hooks/useNetworkStatus';
// eslint-disable-next-line import/first
import { getAppEnvironment } from '../../../src/core/featureFlags/config';
// eslint-disable-next-line import/first
import { trackFeatureFlagEvent } from '../../../src/core/telemetry';
// eslint-disable-next-line import/first
import {
  evaluateOutfitRecommendationStubFlag,
  clearOutfitRecommendationStubFlagCache,
  initializeOutfitRecommendationStubFlagFromCache,
  getOutfitRecommendationStubFlagSync,
  getOutfitRecommendationStubFlagWithFallback,
  isOutfitRecommendationStubFlagEvaluated,
  canAccessRecommendations,
  resetSessionCache,
} from '../../../src/core/featureFlags/outfitRecommendationStubFlag';

// Type assertions for mocked modules
const mockedSupabase = supabase as jest.Mocked<typeof supabase>;
const mockedCheckIsOffline = checkIsOffline as jest.MockedFunction<typeof checkIsOffline>;
const mockedGetAppEnvironment = getAppEnvironment as jest.MockedFunction<typeof getAppEnvironment>;
const mockedTrackFeatureFlagEvent = trackFeatureFlagEvent as jest.MockedFunction<
  typeof trackFeatureFlagEvent
>;

describe('outfitRecommendationStubFlag', () => {
  // Reset all mocks and caches before each test
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Reset session cache
    resetSessionCache();

    // Clear AsyncStorage
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);

    // Default mock implementations
    mockedCheckIsOffline.mockResolvedValue(false);
    mockedGetAppEnvironment.mockReturnValue('development');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ==========================================================================
  // Environment-Specific Defaults
  // ==========================================================================

  describe('getEnvironmentDefault (via getOutfitRecommendationStubFlagWithFallback)', () => {
    describe('development environment', () => {
      beforeEach(() => {
        mockedGetAppEnvironment.mockReturnValue('development');
      });

      it('should return true for internal users', () => {
        const result = getOutfitRecommendationStubFlagWithFallback('internal');
        expect(result.enabled).toBe(true);
        expect(result.source).toBe('fallback');
        expect(result.environment).toBe('development');
      });

      it('should return true for beta users', () => {
        const result = getOutfitRecommendationStubFlagWithFallback('beta');
        expect(result.enabled).toBe(true);
        expect(result.source).toBe('fallback');
      });

      it('should return true for standard users', () => {
        const result = getOutfitRecommendationStubFlagWithFallback('standard');
        expect(result.enabled).toBe(true);
        expect(result.source).toBe('fallback');
      });
    });

    describe('staging environment', () => {
      beforeEach(() => {
        mockedGetAppEnvironment.mockReturnValue('staging');
      });

      it('should return true for internal users only', () => {
        const result = getOutfitRecommendationStubFlagWithFallback('internal');
        expect(result.enabled).toBe(true);
        expect(result.source).toBe('fallback');
        expect(result.environment).toBe('staging');
      });

      it('should return false for beta users', () => {
        const result = getOutfitRecommendationStubFlagWithFallback('beta');
        expect(result.enabled).toBe(false);
        expect(result.source).toBe('fallback');
      });

      it('should return false for standard users', () => {
        const result = getOutfitRecommendationStubFlagWithFallback('standard');
        expect(result.enabled).toBe(false);
        expect(result.source).toBe('fallback');
      });
    });

    describe('production environment', () => {
      beforeEach(() => {
        mockedGetAppEnvironment.mockReturnValue('production');
      });

      it('should return false for internal users', () => {
        const result = getOutfitRecommendationStubFlagWithFallback('internal');
        expect(result.enabled).toBe(false);
        expect(result.source).toBe('fallback');
        expect(result.environment).toBe('production');
      });

      it('should return false for beta users', () => {
        const result = getOutfitRecommendationStubFlagWithFallback('beta');
        expect(result.enabled).toBe(false);
        expect(result.source).toBe('fallback');
      });

      it('should return false for standard users', () => {
        const result = getOutfitRecommendationStubFlagWithFallback('standard');
        expect(result.enabled).toBe(false);
        expect(result.source).toBe('fallback');
      });
    });

    it('should use standard role as default when no role provided', () => {
      mockedGetAppEnvironment.mockReturnValue('production');
      const result = getOutfitRecommendationStubFlagWithFallback();
      expect(result.enabled).toBe(false);
      expect(result.userRole).toBe('standard');
    });
  });

  // ==========================================================================
  // Remote Flag Fetch
  // ==========================================================================

  describe('evaluateOutfitRecommendationStubFlag - remote fetch', () => {
    const mockUserId = 'user-123';
    const mockUserRole = 'standard';

    it('should return remote value when fetch succeeds', async () => {
      mockedGetAppEnvironment.mockReturnValue('production');
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          flags: {
            wardrobe_image_cleanup_enabled: true,
            wardrobe_ai_attributes_enabled: true,
            outfit_recommendation_stub_enabled: true,
          },
          timestamp: new Date().toISOString(),
        },
        error: null,
      });

      const resultPromise = evaluateOutfitRecommendationStubFlag(mockUserId, mockUserRole);
      jest.runAllTimers();
      const result = await resultPromise;

      expect(result.enabled).toBe(true);
      expect(result.source).toBe('remote');
      expect(result.environment).toBe('production');
      expect(result.userRole).toBe('standard');
    });

    it('should honour explicit OFF from server', async () => {
      mockedGetAppEnvironment.mockReturnValue('development');
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          flags: {
            wardrobe_image_cleanup_enabled: true,
            wardrobe_ai_attributes_enabled: true,
            outfit_recommendation_stub_enabled: false,
          },
          timestamp: new Date().toISOString(),
        },
        error: null,
      });

      const resultPromise = evaluateOutfitRecommendationStubFlag(mockUserId, mockUserRole);
      jest.runAllTimers();
      const result = await resultPromise;

      // Even in development, server's explicit OFF should be honoured
      expect(result.enabled).toBe(false);
      expect(result.source).toBe('remote');
    });

    it('should use fallback on timeout (400ms)', async () => {
      mockedGetAppEnvironment.mockReturnValue('development');

      // The timeout mechanism uses Promise.race - when remote fetch takes longer
      // than 400ms, a timeout null response wins. We simulate this by returning
      // a response with error.message='timeout' which is what the Promise.race
      // timeout path produces internally.
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'timeout' },
      });

      const resultPromise = evaluateOutfitRecommendationStubFlag(mockUserId, mockUserRole);
      jest.runAllTimers();
      const result = await resultPromise;

      // Should use development fallback (true for all users)
      expect(result.enabled).toBe(true);
      expect(result.source).toBe('fallback');
    });

    it('should use fallback on network error', async () => {
      mockedGetAppEnvironment.mockReturnValue('staging');
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Network error' },
      });

      const resultPromise = evaluateOutfitRecommendationStubFlag(mockUserId, 'internal');
      jest.runAllTimers();
      const result = await resultPromise;

      // Should use staging fallback for internal (true)
      expect(result.enabled).toBe(true);
      expect(result.source).toBe('fallback');
    });

    it('should use fallback on invalid response', async () => {
      mockedGetAppEnvironment.mockReturnValue('production');
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { success: false },
        error: null,
      });

      const resultPromise = evaluateOutfitRecommendationStubFlag(mockUserId, mockUserRole);
      jest.runAllTimers();
      const result = await resultPromise;

      // Should use production fallback (false)
      expect(result.enabled).toBe(false);
      expect(result.source).toBe('fallback');
    });

    it('should skip remote fetch when offline', async () => {
      mockedGetAppEnvironment.mockReturnValue('development');
      mockedCheckIsOffline.mockResolvedValue(true);

      const resultPromise = evaluateOutfitRecommendationStubFlag(mockUserId, mockUserRole);
      jest.runAllTimers();
      const result = await resultPromise;

      // Should NOT call supabase when offline
      expect(mockedSupabase.functions.invoke).not.toHaveBeenCalled();

      // Should use fallback
      expect(result.enabled).toBe(true);
      expect(result.source).toBe('fallback');
    });

    it('should track telemetry on successful remote fetch', async () => {
      mockedGetAppEnvironment.mockReturnValue('production');
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          flags: { outfit_recommendation_stub_enabled: true },
        },
        error: null,
      });

      const resultPromise = evaluateOutfitRecommendationStubFlag(mockUserId, mockUserRole);
      jest.runAllTimers();
      await resultPromise;

      expect(mockedTrackFeatureFlagEvent).toHaveBeenCalledWith(
        'feature_flag.outfit_recommendation_stub.evaluated',
        expect.objectContaining({
          userId: mockUserId,
          flagKey: 'outfit_recommendation_stub',
          enabled: true,
          source: 'remote',
          environment: 'production',
          userRole: mockUserRole,
        })
      );
    });

    it('should track telemetry on timeout', async () => {
      mockedGetAppEnvironment.mockReturnValue('production');
      // Simulate the timeout scenario by returning the timeout error
      // (this is what the Promise.race produces when timeout wins)
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'timeout' },
      });

      const resultPromise = evaluateOutfitRecommendationStubFlag(mockUserId, mockUserRole);
      jest.runAllTimers();
      await resultPromise;

      expect(mockedTrackFeatureFlagEvent).toHaveBeenCalledWith(
        'feature_flag.outfit_recommendation_stub.timeout',
        expect.objectContaining({
          errorCode: 'timeout',
        })
      );
    });
  });

  // ==========================================================================
  // Cross-Session Cache (AsyncStorage)
  // ==========================================================================

  describe('AsyncStorage cache operations', () => {
    const mockUserId = 'user-456';
    const mockUserRole = 'beta';

    it('should save remote value to AsyncStorage cache', async () => {
      mockedGetAppEnvironment.mockReturnValue('production');
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          flags: { outfit_recommendation_stub_enabled: true },
        },
        error: null,
      });

      const resultPromise = evaluateOutfitRecommendationStubFlag(mockUserId, mockUserRole);
      jest.runAllTimers();
      await resultPromise;

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'maidrobe-outfit-recommendation-stub-cache',
        expect.stringContaining('"enabled":true')
      );
    });

    it('should use cached value when remote fetch fails', async () => {
      mockedGetAppEnvironment.mockReturnValue('production');

      // Set up cached value
      const cachedValue = {
        enabled: true,
        userId: mockUserId,
        userRole: mockUserRole,
        cachedAt: new Date().toISOString(),
        environment: 'production',
      };
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(cachedValue));

      // Simulate network error
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Network error' },
      });

      const resultPromise = evaluateOutfitRecommendationStubFlag(mockUserId, mockUserRole);
      jest.runAllTimers();
      const result = await resultPromise;

      expect(result.enabled).toBe(true);
      expect(result.source).toBe('cached');
    });

    it('should NOT use cached value for different user', async () => {
      mockedGetAppEnvironment.mockReturnValue('production');

      // Set up cached value for different user
      const cachedValue = {
        enabled: true,
        userId: 'different-user',
        userRole: mockUserRole,
        cachedAt: new Date().toISOString(),
        environment: 'production',
      };
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(cachedValue));

      // Simulate network error
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Network error' },
      });

      const resultPromise = evaluateOutfitRecommendationStubFlag(mockUserId, mockUserRole);
      jest.runAllTimers();
      const result = await resultPromise;

      // Should use fallback, not the cached value from different user
      expect(result.source).toBe('fallback');
    });

    it('should handle corrupted cache gracefully', async () => {
      mockedGetAppEnvironment.mockReturnValue('production');

      // Set up corrupted cache
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('not valid json');

      // Simulate network error
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Network error' },
      });

      const resultPromise = evaluateOutfitRecommendationStubFlag(mockUserId, mockUserRole);
      jest.runAllTimers();
      const result = await resultPromise;

      // Should use fallback when cache is corrupted
      expect(result.source).toBe('fallback');
    });

    it('should handle cache with missing required fields', async () => {
      mockedGetAppEnvironment.mockReturnValue('production');

      // Set up cache with missing fields
      const invalidCache = {
        userId: mockUserId,
        // Missing: enabled, cachedAt, userRole
      };
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(invalidCache));

      // Simulate network error
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Network error' },
      });

      const resultPromise = evaluateOutfitRecommendationStubFlag(mockUserId, mockUserRole);
      jest.runAllTimers();
      const result = await resultPromise;

      expect(result.source).toBe('fallback');
    });
  });

  // ==========================================================================
  // clearOutfitRecommendationStubFlagCache
  // ==========================================================================

  describe('clearOutfitRecommendationStubFlagCache', () => {
    it('should clear AsyncStorage cache', async () => {
      await clearOutfitRecommendationStubFlagCache();

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith(
        'maidrobe-outfit-recommendation-stub-cache'
      );
    });

    it('should clear session cache', async () => {
      // First, populate session cache
      mockedGetAppEnvironment.mockReturnValue('development');
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          flags: { outfit_recommendation_stub_enabled: true },
        },
        error: null,
      });

      const evalPromise = evaluateOutfitRecommendationStubFlag('user-123', 'standard');
      jest.runAllTimers();
      await evalPromise;

      expect(getOutfitRecommendationStubFlagSync()).not.toBeNull();

      // Clear cache
      await clearOutfitRecommendationStubFlagCache();

      // Session cache should be cleared
      expect(getOutfitRecommendationStubFlagSync()).toBeNull();
    });
  });

  // ==========================================================================
  // initializeOutfitRecommendationStubFlagFromCache
  // ==========================================================================

  describe('initializeOutfitRecommendationStubFlagFromCache', () => {
    const mockUserId = 'user-789';
    const mockUserRole = 'internal';

    it('should return cached result when valid cache exists', async () => {
      const cachedValue = {
        enabled: true,
        userId: mockUserId,
        userRole: mockUserRole,
        cachedAt: new Date().toISOString(),
        environment: 'staging',
      };
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(cachedValue));
      mockedGetAppEnvironment.mockReturnValue('staging');

      const result = await initializeOutfitRecommendationStubFlagFromCache(
        mockUserId,
        mockUserRole
      );

      expect(result).not.toBeNull();
      expect(result?.enabled).toBe(true);
      expect(result?.source).toBe('cached');
    });

    it('should return null when no cache exists', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const result = await initializeOutfitRecommendationStubFlagFromCache(
        mockUserId,
        mockUserRole
      );

      expect(result).toBeNull();
    });

    it('should populate session cache for subsequent sync access', async () => {
      const cachedValue = {
        enabled: false,
        userId: mockUserId,
        userRole: mockUserRole,
        cachedAt: new Date().toISOString(),
        environment: 'production',
      };
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(cachedValue));
      mockedGetAppEnvironment.mockReturnValue('production');

      await initializeOutfitRecommendationStubFlagFromCache(mockUserId, mockUserRole);

      // Session cache should now be populated
      const syncResult = getOutfitRecommendationStubFlagSync();
      expect(syncResult).not.toBeNull();
      expect(syncResult?.enabled).toBe(false);
    });

    it('should return existing session cache if already populated', async () => {
      // First, populate session cache via evaluation
      mockedGetAppEnvironment.mockReturnValue('development');
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          flags: { outfit_recommendation_stub_enabled: true },
        },
        error: null,
      });

      const evalPromise = evaluateOutfitRecommendationStubFlag(mockUserId, mockUserRole);
      jest.runAllTimers();
      await evalPromise;

      // Now call initialize - should return session cache, not read AsyncStorage
      const result = await initializeOutfitRecommendationStubFlagFromCache(
        mockUserId,
        mockUserRole
      );

      expect(result?.source).toBe('remote'); // From evaluation, not 'cached'
    });
  });

  // ==========================================================================
  // Session Cache and Concurrency
  // ==========================================================================

  describe('session cache behavior', () => {
    const mockUserId = 'user-abc';
    const mockUserRole = 'standard';

    it('should return cached result on subsequent calls', async () => {
      mockedGetAppEnvironment.mockReturnValue('production');
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          flags: { outfit_recommendation_stub_enabled: true },
        },
        error: null,
      });

      // First call
      const promise1 = evaluateOutfitRecommendationStubFlag(mockUserId, mockUserRole);
      jest.runAllTimers();
      await promise1;

      // Second call should use cached value
      const promise2 = evaluateOutfitRecommendationStubFlag(mockUserId, mockUserRole);
      jest.runAllTimers();
      const result2 = await promise2;

      // Should only invoke once
      expect(mockedSupabase.functions.invoke).toHaveBeenCalledTimes(1);
      expect(result2.enabled).toBe(true);
    });

    it('should prevent concurrent evaluations', async () => {
      mockedGetAppEnvironment.mockReturnValue('production');
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          flags: { outfit_recommendation_stub_enabled: true },
        },
        error: null,
      });

      // Start two concurrent evaluations
      const promise1 = evaluateOutfitRecommendationStubFlag(mockUserId, mockUserRole);
      const promise2 = evaluateOutfitRecommendationStubFlag(mockUserId, mockUserRole);

      jest.runAllTimers();

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Should only invoke once despite two calls
      expect(mockedSupabase.functions.invoke).toHaveBeenCalledTimes(1);

      // Both should get the same result
      expect(result1).toEqual(result2);
    });
  });

  // ==========================================================================
  // Synchronous Accessors
  // ==========================================================================

  describe('getOutfitRecommendationStubFlagSync', () => {
    it('should return null before evaluation', () => {
      const result = getOutfitRecommendationStubFlagSync();
      expect(result).toBeNull();
    });

    it('should return result after evaluation', async () => {
      mockedGetAppEnvironment.mockReturnValue('development');
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          flags: { outfit_recommendation_stub_enabled: true },
        },
        error: null,
      });

      const evalPromise = evaluateOutfitRecommendationStubFlag('user-123', 'standard');
      jest.runAllTimers();
      await evalPromise;

      const syncResult = getOutfitRecommendationStubFlagSync();
      expect(syncResult).not.toBeNull();
      expect(syncResult?.enabled).toBe(true);
    });
  });

  describe('isOutfitRecommendationStubFlagEvaluated', () => {
    it('should return false before evaluation', () => {
      expect(isOutfitRecommendationStubFlagEvaluated()).toBe(false);
    });

    it('should return true after evaluation', async () => {
      mockedGetAppEnvironment.mockReturnValue('development');
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          flags: { outfit_recommendation_stub_enabled: true },
        },
        error: null,
      });

      const evalPromise = evaluateOutfitRecommendationStubFlag('user-123', 'standard');
      jest.runAllTimers();
      await evalPromise;

      expect(isOutfitRecommendationStubFlagEvaluated()).toBe(true);
    });
  });

  describe('getOutfitRecommendationStubFlagWithFallback', () => {
    it('should return session cache if available', async () => {
      mockedGetAppEnvironment.mockReturnValue('production');
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          flags: { outfit_recommendation_stub_enabled: true },
        },
        error: null,
      });

      const evalPromise = evaluateOutfitRecommendationStubFlag('user-123', 'standard');
      jest.runAllTimers();
      await evalPromise;

      const result = getOutfitRecommendationStubFlagWithFallback('standard');
      expect(result.source).toBe('remote');
      expect(result.enabled).toBe(true);
    });

    it('should return fallback if session cache not available', () => {
      mockedGetAppEnvironment.mockReturnValue('development');

      const result = getOutfitRecommendationStubFlagWithFallback('standard');
      expect(result.source).toBe('fallback');
      expect(result.enabled).toBe(true); // Development default
    });
  });

  // ==========================================================================
  // Navigation Guard
  // ==========================================================================

  describe('canAccessRecommendations', () => {
    it('should return allowed=false with reason flag_not_evaluated when not evaluated', () => {
      const result = canAccessRecommendations();

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('flag_not_evaluated');
      expect(result.flagResult).toBeNull();
    });

    it('should return allowed=true when flag is enabled', async () => {
      mockedGetAppEnvironment.mockReturnValue('development');
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          flags: { outfit_recommendation_stub_enabled: true },
        },
        error: null,
      });

      const evalPromise = evaluateOutfitRecommendationStubFlag('user-123', 'standard');
      jest.runAllTimers();
      await evalPromise;

      const result = canAccessRecommendations();

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('flag_enabled');
      expect(result.flagResult).not.toBeNull();
    });

    it('should return allowed=false when flag is disabled', async () => {
      mockedGetAppEnvironment.mockReturnValue('production');
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          flags: { outfit_recommendation_stub_enabled: false },
        },
        error: null,
      });

      const evalPromise = evaluateOutfitRecommendationStubFlag('user-123', 'standard');
      jest.runAllTimers();
      await evalPromise;

      const result = canAccessRecommendations();

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('flag_disabled');
      expect(result.flagResult?.enabled).toBe(false);
    });
  });

  // ==========================================================================
  // resetSessionCache
  // ==========================================================================

  describe('resetSessionCache', () => {
    it('should clear session cache', async () => {
      // First populate session cache
      mockedGetAppEnvironment.mockReturnValue('development');
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          flags: { outfit_recommendation_stub_enabled: true },
        },
        error: null,
      });

      const evalPromise = evaluateOutfitRecommendationStubFlag('user-123', 'standard');
      jest.runAllTimers();
      await evalPromise;

      expect(getOutfitRecommendationStubFlagSync()).not.toBeNull();

      // Reset
      resetSessionCache();

      expect(getOutfitRecommendationStubFlagSync()).toBeNull();
      expect(isOutfitRecommendationStubFlagEvaluated()).toBe(false);
    });

    it('should allow re-evaluation after reset', async () => {
      mockedGetAppEnvironment.mockReturnValue('development');
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          flags: { outfit_recommendation_stub_enabled: true },
        },
        error: null,
      });

      // First evaluation
      const promise1 = evaluateOutfitRecommendationStubFlag('user-123', 'standard');
      jest.runAllTimers();
      await promise1;

      // Reset
      resetSessionCache();

      // Should invoke again
      const promise2 = evaluateOutfitRecommendationStubFlag('user-123', 'standard');
      jest.runAllTimers();
      await promise2;

      expect(mockedSupabase.functions.invoke).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // Telemetry Tracking
  // ==========================================================================

  describe('telemetry tracking', () => {
    const mockUserId = 'user-telemetry';
    const mockUserRole = 'standard';

    it('should track evaluated event with complete metadata on remote success', async () => {
      mockedGetAppEnvironment.mockReturnValue('production');
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          flags: { outfit_recommendation_stub_enabled: true },
        },
        error: null,
      });

      const resultPromise = evaluateOutfitRecommendationStubFlag(mockUserId, mockUserRole);
      jest.runAllTimers();
      await resultPromise;

      // Validate complete FeatureFlagEventMetadata structure
      expect(mockedTrackFeatureFlagEvent).toHaveBeenCalledWith(
        'feature_flag.outfit_recommendation_stub.evaluated',
        expect.objectContaining({
          userId: mockUserId,
          flagKey: 'outfit_recommendation_stub',
          enabled: true,
          source: 'remote',
          environment: 'production',
          userRole: mockUserRole,
          latencyMs: expect.any(Number),
        })
      );
    });

    it('should track fallback event with complete metadata when offline', async () => {
      mockedGetAppEnvironment.mockReturnValue('production');
      mockedCheckIsOffline.mockResolvedValue(true);

      const resultPromise = evaluateOutfitRecommendationStubFlag(mockUserId, mockUserRole);
      jest.runAllTimers();
      await resultPromise;

      // Validate complete FeatureFlagEventMetadata structure for fallback
      expect(mockedTrackFeatureFlagEvent).toHaveBeenCalledWith(
        'feature_flag.outfit_recommendation_stub.fallback',
        expect.objectContaining({
          userId: mockUserId,
          flagKey: 'outfit_recommendation_stub',
          enabled: false, // Production default for standard user
          source: 'fallback',
          environment: 'production',
          userRole: mockUserRole,
          latencyMs: expect.any(Number),
          metadata: expect.objectContaining({
            isOffline: true,
            reason: 'offline',
          }),
        })
      );
    });

    it('should track fallback event with remote_fetch_failed reason on network error', async () => {
      mockedGetAppEnvironment.mockReturnValue('staging');
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Network error' },
      });

      const resultPromise = evaluateOutfitRecommendationStubFlag(mockUserId, 'internal');
      jest.runAllTimers();
      await resultPromise;

      // Should track fallback after remote fetch failure (no cache available)
      expect(mockedTrackFeatureFlagEvent).toHaveBeenCalledWith(
        'feature_flag.outfit_recommendation_stub.fallback',
        expect.objectContaining({
          userId: mockUserId,
          flagKey: 'outfit_recommendation_stub',
          enabled: true, // Staging default for internal user
          source: 'fallback',
          environment: 'staging',
          userRole: 'internal',
          metadata: expect.objectContaining({
            isOffline: false,
            reason: 'remote_fetch_failed',
          }),
        })
      );
    });

    it('should track cached event with complete metadata including cache age', async () => {
      mockedGetAppEnvironment.mockReturnValue('production');

      // Set up cached value with known timestamp
      const cachedAt = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
      const cachedValue = {
        enabled: true,
        userId: mockUserId,
        userRole: mockUserRole,
        cachedAt,
        environment: 'production',
      };
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(cachedValue));

      // Simulate network error to trigger cache usage
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Network error' },
      });

      const resultPromise = evaluateOutfitRecommendationStubFlag(mockUserId, mockUserRole);
      jest.runAllTimers();
      await resultPromise;

      // Validate cached event includes cache age metadata
      expect(mockedTrackFeatureFlagEvent).toHaveBeenCalledWith(
        'feature_flag.outfit_recommendation_stub.cached',
        expect.objectContaining({
          userId: mockUserId,
          flagKey: 'outfit_recommendation_stub',
          enabled: true,
          source: 'cached',
          environment: 'production',
          userRole: mockUserRole,
          latencyMs: expect.any(Number),
          metadata: expect.objectContaining({
            cacheAgeHours: expect.any(Number),
            isStale: false, // 1 hour is not stale (< 24 hours)
            isOffline: false,
          }),
        })
      );
    });

    it('should track timeout event with complete metadata', async () => {
      mockedGetAppEnvironment.mockReturnValue('production');
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'timeout' },
      });

      const resultPromise = evaluateOutfitRecommendationStubFlag(mockUserId, mockUserRole);
      jest.runAllTimers();
      await resultPromise;

      // Validate timeout event includes all required fields
      expect(mockedTrackFeatureFlagEvent).toHaveBeenCalledWith(
        'feature_flag.outfit_recommendation_stub.timeout',
        expect.objectContaining({
          userId: mockUserId,
          flagKey: 'outfit_recommendation_stub',
          enabled: false,
          source: 'fallback',
          environment: 'production',
          userRole: mockUserRole,
          latencyMs: expect.any(Number),
          errorCode: 'timeout',
          metadata: expect.objectContaining({
            timeoutMs: 400,
          }),
        })
      );
    });

    it('should track error event with supabase_error code and message', async () => {
      mockedGetAppEnvironment.mockReturnValue('production');
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' },
      });

      const resultPromise = evaluateOutfitRecommendationStubFlag(mockUserId, mockUserRole);
      jest.runAllTimers();
      await resultPromise;

      expect(mockedTrackFeatureFlagEvent).toHaveBeenCalledWith(
        'feature_flag.outfit_recommendation_stub.error',
        expect.objectContaining({
          userId: mockUserId,
          flagKey: 'outfit_recommendation_stub',
          enabled: false,
          source: 'fallback',
          environment: 'production',
          userRole: mockUserRole,
          latencyMs: expect.any(Number),
          errorCode: 'supabase_error',
          metadata: expect.objectContaining({
            errorMessage: 'Database connection failed',
          }),
        })
      );
    });

    it('should track error event with invalid_response code', async () => {
      mockedGetAppEnvironment.mockReturnValue('development');
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { success: true }, // Missing flags property
        error: null,
      });

      const resultPromise = evaluateOutfitRecommendationStubFlag(mockUserId, mockUserRole);
      jest.runAllTimers();
      await resultPromise;

      expect(mockedTrackFeatureFlagEvent).toHaveBeenCalledWith(
        'feature_flag.outfit_recommendation_stub.error',
        expect.objectContaining({
          errorCode: 'invalid_response',
          metadata: expect.objectContaining({
            hasData: true,
            success: true,
            hasFlags: false,
          }),
        })
      );
    });

    it('should track error event with fetch_error code on exception', async () => {
      mockedGetAppEnvironment.mockReturnValue('production');
      (mockedSupabase.functions.invoke as jest.Mock).mockRejectedValue(
        new Error('Connection reset by peer')
      );

      const resultPromise = evaluateOutfitRecommendationStubFlag(mockUserId, mockUserRole);
      jest.runAllTimers();
      await resultPromise;

      expect(mockedTrackFeatureFlagEvent).toHaveBeenCalledWith(
        'feature_flag.outfit_recommendation_stub.error',
        expect.objectContaining({
          userId: mockUserId,
          flagKey: 'outfit_recommendation_stub',
          errorCode: 'fetch_error',
          metadata: expect.objectContaining({
            errorMessage: 'Connection reset by peer',
          }),
        })
      );
    });

    it('should include latencyMs in all telemetry events', async () => {
      mockedGetAppEnvironment.mockReturnValue('development');
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          flags: { outfit_recommendation_stub_enabled: true },
        },
        error: null,
      });

      const resultPromise = evaluateOutfitRecommendationStubFlag(mockUserId, mockUserRole);
      jest.runAllTimers();
      await resultPromise;

      // Verify latencyMs is a non-negative number
      const call = mockedTrackFeatureFlagEvent.mock.calls[0];
      expect(call[1].latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // Edge Cases and Error Handling
  // ==========================================================================

  describe('edge cases and error handling', () => {
    it('should handle AsyncStorage.setItem failure gracefully', async () => {
      mockedGetAppEnvironment.mockReturnValue('development');
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          flags: { outfit_recommendation_stub_enabled: true },
        },
        error: null,
      });
      (AsyncStorage.setItem as jest.Mock).mockRejectedValue(new Error('Storage full'));

      // Should not throw
      const resultPromise = evaluateOutfitRecommendationStubFlag('user-123', 'standard');
      jest.runAllTimers();
      const result = await resultPromise;

      expect(result.enabled).toBe(true);
      expect(result.source).toBe('remote');
    });

    it('should handle AsyncStorage.removeItem failure gracefully', async () => {
      (AsyncStorage.removeItem as jest.Mock).mockRejectedValue(new Error('Storage error'));

      // Should not throw
      await expect(clearOutfitRecommendationStubFlagCache()).resolves.not.toThrow();
    });

    it('should handle AsyncStorage.getItem failure gracefully', async () => {
      mockedGetAppEnvironment.mockReturnValue('production');
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage error'));
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Network error' },
      });

      const resultPromise = evaluateOutfitRecommendationStubFlag('user-123', 'standard');
      jest.runAllTimers();
      const result = await resultPromise;

      // Should fall through to fallback
      expect(result.source).toBe('fallback');
    });

    it('should handle fetch exception gracefully', async () => {
      mockedGetAppEnvironment.mockReturnValue('production');
      (mockedSupabase.functions.invoke as jest.Mock).mockRejectedValue(
        new Error('Connection reset')
      );

      const resultPromise = evaluateOutfitRecommendationStubFlag('user-123', 'standard');
      jest.runAllTimers();
      const result = await resultPromise;

      expect(result.source).toBe('fallback');
      expect(mockedTrackFeatureFlagEvent).toHaveBeenCalledWith(
        'feature_flag.outfit_recommendation_stub.error',
        expect.objectContaining({
          errorCode: 'fetch_error',
        })
      );
    });
  });

  // ==========================================================================
  // Result Structure Validation
  // ==========================================================================

  describe('result structure validation', () => {
    it('should always return valid OutfitRecommendationStubFlagResult', async () => {
      mockedGetAppEnvironment.mockReturnValue('development');
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          flags: { outfit_recommendation_stub_enabled: true },
        },
        error: null,
      });

      const resultPromise = evaluateOutfitRecommendationStubFlag('user-123', 'standard');
      jest.runAllTimers();
      const result = await resultPromise;

      // Validate structure
      expect(result).toHaveProperty('enabled');
      expect(result).toHaveProperty('source');
      expect(result).toHaveProperty('environment');
      expect(result).toHaveProperty('userRole');
      expect(result).toHaveProperty('evaluatedAt');

      // Validate types
      expect(typeof result.enabled).toBe('boolean');
      expect(['remote', 'cached', 'fallback']).toContain(result.source);
      expect(['development', 'staging', 'production']).toContain(result.environment);
      expect(['internal', 'beta', 'standard']).toContain(result.userRole);
      expect(typeof result.evaluatedAt).toBe('string');
    });

    it('should return valid timestamp in ISO format', async () => {
      mockedGetAppEnvironment.mockReturnValue('development');
      (mockedSupabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: {
          success: true,
          flags: { outfit_recommendation_stub_enabled: true },
        },
        error: null,
      });

      const resultPromise = evaluateOutfitRecommendationStubFlag('user-123', 'standard');
      jest.runAllTimers();
      const result = await resultPromise;

      // Should be valid ISO timestamp
      expect(new Date(result.evaluatedAt).toISOString()).toBe(result.evaluatedAt);
    });
  });
});
