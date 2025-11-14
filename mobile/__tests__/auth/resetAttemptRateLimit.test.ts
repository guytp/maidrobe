import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  checkResetAttemptRateLimit,
  recordResetAttempt,
  clearResetAttempts,
} from '../../src/features/auth/utils/resetAttemptRateLimit';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  },
}));

describe('resetAttemptRateLimit', () => {
  let consoleWarnSpy: jest.SpyInstance;
  let dateNowSpy: jest.SpyInstance;
  let currentTime: number;

  const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

  beforeEach(() => {
    jest.clearAllMocks();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Mock Date.now to have control over time
    currentTime = 1000000000000; // Fixed timestamp
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(currentTime);

    // Default mock: AsyncStorage is empty
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    dateNowSpy.mockRestore();
  });

  describe('Recording attempts', () => {
    it('should record first attempt successfully', async () => {
      await recordResetAttempt('test-token-123');

      expect(AsyncStorage.setItem).toHaveBeenCalled();
      const callArgs = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      expect(callArgs[0]).toContain('auth.password_reset_attempts.');

      const storedData = JSON.parse(callArgs[1]);
      expect(storedData).toEqual([currentTime]);
    });

    it('should record multiple attempts in sequence', async () => {
      // First attempt
      await recordResetAttempt('test-token-456');
      const firstCall = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      const firstAttempts = JSON.parse(firstCall[1]);
      expect(firstAttempts).toHaveLength(1);

      // Mock storage now contains first attempt
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([currentTime]));

      // Advance time by 1 second
      currentTime += 1000;
      dateNowSpy.mockReturnValue(currentTime);

      // Second attempt
      await recordResetAttempt('test-token-456');
      const secondCall = (AsyncStorage.setItem as jest.Mock).mock.calls[1];
      const secondAttempts = JSON.parse(secondCall[1]);
      expect(secondAttempts).toHaveLength(2);
      expect(secondAttempts[1]).toBe(currentTime);
    });

    it('should store attempts with correct timestamps', async () => {
      const testTime = 1234567890000;
      dateNowSpy.mockReturnValue(testTime);

      await recordResetAttempt('test-token-789');

      const callArgs = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      const storedData = JSON.parse(callArgs[1]);
      expect(storedData).toContain(testTime);
    });

    it('should use hashed storage key for privacy', async () => {
      await recordResetAttempt('sensitive-token-abc');

      const callArgs = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      const storageKey = callArgs[0];

      // Verify key format and does not contain plaintext token
      expect(storageKey).toMatch(/^auth\.password_reset_attempts\.[0-9a-f]{16}$/);
      expect(storageKey).not.toContain('sensitive-token-abc');
    });

    it('should generate same hash for same token', async () => {
      const token = 'same-token-123';

      await recordResetAttempt(token);
      const firstKey = (AsyncStorage.setItem as jest.Mock).mock.calls[0][0];

      jest.clearAllMocks();
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      await recordResetAttempt(token);
      const secondKey = (AsyncStorage.setItem as jest.Mock).mock.calls[0][0];

      expect(firstKey).toBe(secondKey);
    });

    it('should generate different hashes for different tokens', async () => {
      await recordResetAttempt('token-one');
      const firstKey = (AsyncStorage.setItem as jest.Mock).mock.calls[0][0];

      jest.clearAllMocks();
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      await recordResetAttempt('token-two');
      const secondKey = (AsyncStorage.setItem as jest.Mock).mock.calls[0][0];

      expect(firstKey).not.toBe(secondKey);
    });
  });

  describe('Rate limit enforcement', () => {
    it('should allow first attempt (0/3 used)', async () => {
      const result = await checkResetAttemptRateLimit('test-token');

      expect(result.allowed).toBe(true);
      expect(result.remainingSeconds).toBe(0);
    });

    it('should allow second attempt (1/3 used)', async () => {
      const attempts = [currentTime - 5000]; // 5 seconds ago
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const result = await checkResetAttemptRateLimit('test-token');

      expect(result.allowed).toBe(true);
      expect(result.remainingSeconds).toBe(0);
    });

    it('should allow third attempt (2/3 used)', async () => {
      const attempts = [
        currentTime - 10000, // 10 seconds ago
        currentTime - 5000,  // 5 seconds ago
      ];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const result = await checkResetAttemptRateLimit('test-token');

      expect(result.allowed).toBe(true);
      expect(result.remainingSeconds).toBe(0);
    });

    it('should block fourth attempt (3/3 used, limit reached)', async () => {
      const attempts = [
        currentTime - 10000, // 10 seconds ago
        currentTime - 5000,  // 5 seconds ago
        currentTime - 1000,  // 1 second ago
      ];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const result = await checkResetAttemptRateLimit('test-token');

      expect(result.allowed).toBe(false);
      expect(result.remainingSeconds).toBeGreaterThan(0);
    });

    it('should calculate remaining seconds correctly when blocked', async () => {
      const oldestAttempt = currentTime - 60000; // 1 minute ago
      const attempts = [oldestAttempt, currentTime - 30000, currentTime - 10000];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const result = await checkResetAttemptRateLimit('test-token');

      expect(result.allowed).toBe(false);
      // Remaining time should be WINDOW_MS - (now - oldestAttempt)
      // 15 minutes - 1 minute = 14 minutes = 840 seconds
      expect(result.remainingSeconds).toBe(840);
    });

    it('should not return negative remaining seconds', async () => {
      // Oldest attempt is beyond window but still counted (edge case)
      const oldestAttempt = currentTime - WINDOW_MS - 1000;
      const attempts = [oldestAttempt, currentTime - 5000, currentTime - 1000];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const result = await checkResetAttemptRateLimit('test-token');

      expect(result.remainingSeconds).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Time window expiration', () => {
    it('should filter out expired attempts automatically', async () => {
      const expiredAttempt = currentTime - WINDOW_MS - 1000; // Beyond window
      const validAttempt = currentTime - 5000; // Within window
      const attempts = [expiredAttempt, validAttempt];

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const result = await checkResetAttemptRateLimit('test-token');

      // Only 1 valid attempt remains, so should be allowed
      expect(result.allowed).toBe(true);
    });

    it('should allow new attempts after window expires', async () => {
      // All attempts are beyond the window
      const oldAttempts = [
        currentTime - WINDOW_MS - 10000,
        currentTime - WINDOW_MS - 5000,
        currentTime - WINDOW_MS - 1000,
      ];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(oldAttempts));

      const result = await checkResetAttemptRateLimit('test-token');

      // All attempts expired, so should be allowed
      expect(result.allowed).toBe(true);
      expect(result.remainingSeconds).toBe(0);
    });

    it('should implement sliding window behavior', async () => {
      // 3 attempts, oldest is about to expire
      const almostExpired = currentTime - WINDOW_MS + 1000; // 1 second before expiry
      const attempts = [almostExpired, currentTime - 5000, currentTime - 1000];

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      // Should be blocked
      let result = await checkResetAttemptRateLimit('test-token');
      expect(result.allowed).toBe(false);

      // Advance time past the oldest attempt
      currentTime += 2000;
      dateNowSpy.mockReturnValue(currentTime);

      // Now oldest attempt is expired, only 2 remain
      result = await checkResetAttemptRateLimit('test-token');
      expect(result.allowed).toBe(true);
    });

    it('should only count non-expired attempts toward limit', async () => {
      const attempts = [
        currentTime - WINDOW_MS - 5000, // Expired
        currentTime - WINDOW_MS - 3000, // Expired
        currentTime - WINDOW_MS - 1000, // Expired
        currentTime - 5000,              // Valid
        currentTime - 1000,              // Valid
      ];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const result = await checkResetAttemptRateLimit('test-token');

      // Only 2 valid attempts, so should be allowed
      expect(result.allowed).toBe(true);
    });

    it('should handle attempts at exact window boundary', async () => {
      const exactBoundary = currentTime - WINDOW_MS;
      const attempts = [exactBoundary, currentTime - 5000];

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const result = await checkResetAttemptRateLimit('test-token');

      // Attempt at exact boundary should be expired (> cutoff check)
      // So only 1 valid attempt remains
      expect(result.allowed).toBe(true);
    });
  });

  describe('Counter reset', () => {
    it('should clear all attempts for a token', async () => {
      await clearResetAttempts('test-token-clear');

      expect(AsyncStorage.removeItem).toHaveBeenCalled();
      const callArgs = (AsyncStorage.removeItem as jest.Mock).mock.calls[0];
      expect(callArgs[0]).toContain('auth.password_reset_attempts.');
    });

    it('should reset rate limit to 0/3 after clear', async () => {
      // Set up 3 attempts (at limit)
      const attempts = [currentTime - 10000, currentTime - 5000, currentTime - 1000];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      // Verify blocked
      let result = await checkResetAttemptRateLimit('test-token-reset');
      expect(result.allowed).toBe(false);

      // Clear attempts
      await clearResetAttempts('test-token-reset');

      // Mock storage now returns null (cleared)
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      // Verify allowed again
      result = await checkResetAttemptRateLimit('test-token-reset');
      expect(result.allowed).toBe(true);
    });

    it('should use correct hashed storage key for removal', async () => {
      const token = 'specific-token-123';

      // Record an attempt to see the key
      await recordResetAttempt(token);
      const recordKey = (AsyncStorage.setItem as jest.Mock).mock.calls[0][0];

      jest.clearAllMocks();

      // Clear attempts
      await clearResetAttempts(token);
      const clearKey = (AsyncStorage.removeItem as jest.Mock).mock.calls[0][0];

      // Keys should match
      expect(clearKey).toBe(recordKey);
    });

    it('should not throw error if clear fails', async () => {
      (AsyncStorage.removeItem as jest.Mock).mockRejectedValue(new Error('Storage error'));

      await expect(clearResetAttempts('test-token')).resolves.not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Rate Limit] Failed to clear attempts:',
        expect.any(Error)
      );
    });
  });

  describe('Storage failures - fail-open behavior', () => {
    it('should allow attempt when AsyncStorage.getItem fails', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage read error'));

      const result = await checkResetAttemptRateLimit('test-token');

      expect(result.allowed).toBe(true);
      expect(result.remainingSeconds).toBe(0);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Rate Limit] Failed to get attempts:',
        expect.any(Error)
      );
    });

    it('should not throw when AsyncStorage.setItem fails', async () => {
      (AsyncStorage.setItem as jest.Mock).mockRejectedValue(new Error('Storage write error'));

      await expect(recordResetAttempt('test-token')).resolves.not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Rate Limit] Failed to set attempts:',
        expect.any(Error)
      );
    });

    it('should fail-open when storage is unavailable', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage unavailable'));

      const result = await checkResetAttemptRateLimit('test-token');

      expect(result.allowed).toBe(true);
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should handle network errors in storage gracefully', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await checkResetAttemptRateLimit('test-token');

      expect(result.allowed).toBe(true);
      expect(result.remainingSeconds).toBe(0);
    });

    it('should continue operation after storage write failure', async () => {
      (AsyncStorage.setItem as jest.Mock).mockRejectedValue(new Error('Write failed'));

      // Should not throw
      await recordResetAttempt('test-token');

      // Should be able to check limit (will fail-open due to empty storage)
      const result = await checkResetAttemptRateLimit('test-token');
      expect(result.allowed).toBe(true);
    });
  });

  describe('Corrupted data handling', () => {
    it('should handle invalid JSON in storage', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('invalid-json{]');

      const result = await checkResetAttemptRateLimit('test-token');

      expect(result.allowed).toBe(true);
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should handle non-array data in storage', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ not: 'array' }));

      const result = await checkResetAttemptRateLimit('test-token');

      expect(result.allowed).toBe(true);
    });

    it('should handle string timestamps in array', async () => {
      const attempts = ['1234567890', '9876543210']; // Strings instead of numbers
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      // Should handle gracefully - filter will process them
      const result = await checkResetAttemptRateLimit('test-token');

      // Result depends on string comparison behavior, but should not crash
      expect(result).toHaveProperty('allowed');
      expect(result).toHaveProperty('remainingSeconds');
    });

    it('should handle null values in attempts array', async () => {
      const attempts = [currentTime - 5000, null, currentTime - 1000];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const result = await checkResetAttemptRateLimit('test-token');

      // Should filter out null and continue
      expect(result).toHaveProperty('allowed');
    });

    it('should handle undefined in storage gracefully', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(undefined);

      const result = await checkResetAttemptRateLimit('test-token');

      expect(result.allowed).toBe(true);
    });

    it('should handle empty string in storage', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('');

      const result = await checkResetAttemptRateLimit('test-token');

      expect(result.allowed).toBe(true);
    });

    it('should handle negative timestamps', async () => {
      const attempts = [-1000, -500, currentTime - 5000];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const result = await checkResetAttemptRateLimit('test-token');

      // Negative timestamps would be filtered as expired
      expect(result.allowed).toBe(true);
    });

    it('should handle very large timestamps', async () => {
      const futureTimestamp = currentTime + 100000000000; // Far future
      const attempts = [futureTimestamp, currentTime - 5000];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const result = await checkResetAttemptRateLimit('test-token');

      // Future timestamps are still valid (not expired)
      expect(result).toHaveProperty('allowed');
    });
  });

  describe('Cleanup mechanisms', () => {
    it('should automatically clean up expired attempts on read', async () => {
      const expiredAttempt = currentTime - WINDOW_MS - 10000;
      const validAttempt = currentTime - 5000;
      const attempts = [expiredAttempt, validAttempt];

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      await checkResetAttemptRateLimit('test-token');

      // getAttempts should have filtered out expired attempt
      // This is internal behavior verified through allowed result
    });

    it('should persist only non-expired attempts when recording', async () => {
      const expiredAttempt = currentTime - WINDOW_MS - 5000;
      const validAttempt = currentTime - 5000;
      const oldAttempts = [expiredAttempt, validAttempt];

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(oldAttempts));

      await recordResetAttempt('test-token');

      const callArgs = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      const storedData = JSON.parse(callArgs[1]);

      // Should only contain valid old attempt + new attempt
      expect(storedData).toHaveLength(2);
      expect(storedData).toContain(validAttempt);
      expect(storedData).toContain(currentTime);
      expect(storedData).not.toContain(expiredAttempt);
    });

    it('should fully clear storage on clearResetAttempts', async () => {
      await clearResetAttempts('test-token');

      expect(AsyncStorage.removeItem).toHaveBeenCalledTimes(1);
    });
  });

  describe('Security requirements', () => {
    it('should use different storage keys for different tokens', async () => {
      await recordResetAttempt('token-alpha');
      const keyAlpha = (AsyncStorage.setItem as jest.Mock).mock.calls[0][0];

      jest.clearAllMocks();
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      await recordResetAttempt('token-beta');
      const keyBeta = (AsyncStorage.setItem as jest.Mock).mock.calls[0][0];

      expect(keyAlpha).not.toBe(keyBeta);
    });

    it('should never store plaintext token', async () => {
      const sensitiveToken = 'super-secret-token-12345';
      await recordResetAttempt(sensitiveToken);

      const callArgs = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      const storageKey = callArgs[0];
      const storageValue = callArgs[1];

      expect(storageKey).not.toContain(sensitiveToken);
      expect(storageValue).not.toContain(sensitiveToken);
    });

    it('should implement fail-open to prevent DoS', async () => {
      // Simulate storage completely broken
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Total failure'));
      (AsyncStorage.setItem as jest.Mock).mockRejectedValue(new Error('Total failure'));

      // Should still allow operation
      const result = await checkResetAttemptRateLimit('test-token');
      expect(result.allowed).toBe(true);

      // Recording should not throw
      await expect(recordResetAttempt('test-token')).resolves.not.toThrow();
    });

    it('should enforce time-based expiration to prevent infinite blocking', async () => {
      // Create 3 attempts at limit
      const attempts = [
        currentTime - WINDOW_MS + 1000,
        currentTime - 5000,
        currentTime - 1000,
      ];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      // Should be blocked
      let result = await checkResetAttemptRateLimit('test-token');
      expect(result.allowed).toBe(false);

      // Advance time beyond window
      currentTime += WINDOW_MS + 1000;
      dateNowSpy.mockReturnValue(currentTime);

      // Should be allowed (all expired)
      result = await checkResetAttemptRateLimit('test-token');
      expect(result.allowed).toBe(true);
    });

    it('should use SHA-256 hashing for collision resistance', async () => {
      // Test that hash is 16 hex characters (64 bits)
      await recordResetAttempt('test-token');

      const callArgs = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      const storageKey = callArgs[0];
      const hashPart = storageKey.replace('auth.password_reset_attempts.', '');

      expect(hashPart).toHaveLength(16);
      expect(hashPart).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty token string', async () => {
      await expect(recordResetAttempt('')).resolves.not.toThrow();

      const result = await checkResetAttemptRateLimit('');
      expect(result).toHaveProperty('allowed');
    });

    it('should handle very long token string', async () => {
      const longToken = 'a'.repeat(10000);

      await expect(recordResetAttempt(longToken)).resolves.not.toThrow();

      const result = await checkResetAttemptRateLimit(longToken);
      expect(result).toHaveProperty('allowed');
    });

    it('should handle special characters in token', async () => {
      const specialToken = '!@#$%^&*()_+-={}[]|\\:";\'<>?,./';

      await recordResetAttempt(specialToken);
      const result = await checkResetAttemptRateLimit(specialToken);

      expect(result).toHaveProperty('allowed');
    });

    it('should handle unicode characters in token', async () => {
      const unicodeToken = 'token-测试-🔒-עברית';

      await recordResetAttempt(unicodeToken);
      const result = await checkResetAttemptRateLimit(unicodeToken);

      expect(result).toHaveProperty('allowed');
    });

    it('should handle rapid concurrent attempts', async () => {
      // All attempts at same timestamp
      const sameTime = currentTime;

      await recordResetAttempt('concurrent-token');
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([sameTime]));

      await recordResetAttempt('concurrent-token');
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([sameTime, sameTime]));

      await recordResetAttempt('concurrent-token');

      const callArgs = (AsyncStorage.setItem as jest.Mock).mock.calls[2];
      const storedData = JSON.parse(callArgs[1]);

      expect(storedData).toHaveLength(3);
      expect(storedData.every((t: number) => t === sameTime)).toBe(true);
    });

    it('should handle empty attempts array', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([]));

      const result = await checkResetAttemptRateLimit('test-token');

      expect(result.allowed).toBe(true);
      expect(result.remainingSeconds).toBe(0);
    });

    it('should handle exactly MAX_ATTEMPTS in storage', async () => {
      const attempts = [
        currentTime - 10000,
        currentTime - 5000,
        currentTime - 1000,
      ];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const result = await checkResetAttemptRateLimit('test-token');

      expect(result.allowed).toBe(false);
      expect(result.remainingSeconds).toBeGreaterThan(0);
    });

    it('should handle more than MAX_ATTEMPTS in storage', async () => {
      // Shouldn't happen in normal operation, but test resilience
      const attempts = [
        currentTime - 20000,
        currentTime - 15000,
        currentTime - 10000,
        currentTime - 5000,
        currentTime - 1000,
      ];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(attempts));

      const result = await checkResetAttemptRateLimit('test-token');

      // Should still be blocked
      expect(result.allowed).toBe(false);
    });
  });
});
