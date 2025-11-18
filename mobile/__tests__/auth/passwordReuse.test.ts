import { checkPasswordReuse, PASSWORD_HISTORY_LIMIT } from '../../src/features/auth/utils/passwordReuse';
import { supabase } from '../../src/services/supabase';

// Mock dependencies
jest.mock('../../src/services/supabase', () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

describe('passwordReuse', () => {
  // Mock console.error to verify error logging without polluting test output
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('PASSWORD_HISTORY_LIMIT constant', () => {
    it('should be set to 3 as per requirements', () => {
      expect(PASSWORD_HISTORY_LIMIT).toBe(3);
    });
  });

  describe('checkPasswordReuse - Password is reused', () => {
    it('should return isReused: true when backend detects password reuse', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { isReused: true },
        error: null,
      });

      const result = await checkPasswordReuse('user-123', 'Password123!');

      expect(result).toEqual({
        isReused: true,
        error: undefined,
      });
      expect(supabase.functions.invoke).toHaveBeenCalledWith('check-password-reuse', {
        body: {
          userId: 'user-123',
          newPassword: 'Password123!',
        },
      });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should return isReused: true with error message from backend', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { isReused: true, error: 'Password was used 2 times ago' },
        error: null,
      });

      const result = await checkPasswordReuse('user-456', 'OldPassword123!');

      expect(result).toEqual({
        isReused: true,
        error: 'Password was used 2 times ago',
      });
    });
  });

  describe('checkPasswordReuse - Password is not reused', () => {
    it('should return isReused: false when password is unique', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { isReused: false },
        error: null,
      });

      const result = await checkPasswordReuse('user-789', 'NewPassword123!');

      expect(result).toEqual({
        isReused: false,
        error: undefined,
      });
      expect(supabase.functions.invoke).toHaveBeenCalledWith('check-password-reuse', {
        body: {
          userId: 'user-789',
          newPassword: 'NewPassword123!',
        },
      });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should return isReused: false with no error when check passes', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { isReused: false, error: undefined },
        error: null,
      });

      const result = await checkPasswordReuse('user-abc', 'UniquePass123!');

      expect(result).toEqual({
        isReused: false,
        error: undefined,
      });
    });
  });

  describe('checkPasswordReuse - Backend returns errors', () => {
    it('should fail-open when Edge Function returns error', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Function execution failed', status: 500 },
      });

      const result = await checkPasswordReuse('user-error', 'Password123!');

      expect(result).toEqual({
        isReused: false,
        error: 'Unable to verify password history',
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[PasswordReuse] Edge Function error:',
        { message: 'Function execution failed', status: 500 }
      );
    });

    it('should fail-open when Edge Function returns network error', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Network request failed' },
      });

      const result = await checkPasswordReuse('user-network', 'Password123!');

      expect(result).toEqual({
        isReused: false,
        error: 'Unable to verify password history',
      });
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should fail-open when Edge Function returns database error', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed', status: 503 },
      });

      const result = await checkPasswordReuse('user-db', 'Password123!');

      expect(result).toEqual({
        isReused: false,
        error: 'Unable to verify password history',
      });
    });
  });

  describe('checkPasswordReuse - Malformed responses', () => {
    it('should fail-open when response data is null', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await checkPasswordReuse('user-null', 'Password123!');

      expect(result).toEqual({
        isReused: false,
        error: 'Invalid response from password check service',
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[PasswordReuse] Invalid response format:',
        null
      );
    });

    it('should fail-open when response data is undefined', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: undefined,
        error: null,
      });

      const result = await checkPasswordReuse('user-undefined', 'Password123!');

      expect(result).toEqual({
        isReused: false,
        error: 'Invalid response from password check service',
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[PasswordReuse] Invalid response format:',
        undefined
      );
    });

    it('should fail-open when isReused is a string instead of boolean', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { isReused: 'true' },
        error: null,
      });

      const result = await checkPasswordReuse('user-string', 'Password123!');

      expect(result).toEqual({
        isReused: false,
        error: 'Invalid response from password check service',
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[PasswordReuse] Invalid response format:',
        { isReused: 'true' }
      );
    });

    it('should fail-open when isReused is a number instead of boolean', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { isReused: 1 },
        error: null,
      });

      const result = await checkPasswordReuse('user-number', 'Password123!');

      expect(result).toEqual({
        isReused: false,
        error: 'Invalid response from password check service',
      });
    });

    it('should fail-open when isReused field is missing', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { someOtherField: 'value' },
        error: null,
      });

      const result = await checkPasswordReuse('user-missing', 'Password123!');

      expect(result).toEqual({
        isReused: false,
        error: 'Invalid response from password check service',
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[PasswordReuse] Invalid response format:',
        { someOtherField: 'value' }
      );
    });

    it('should fail-open when response is an empty object', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: {},
        error: null,
      });

      const result = await checkPasswordReuse('user-empty', 'Password123!');

      expect(result).toEqual({
        isReused: false,
        error: 'Invalid response from password check service',
      });
    });
  });

  describe('checkPasswordReuse - Network and unexpected errors', () => {
    it('should fail-open when invoke throws an exception', async () => {
      (supabase.functions.invoke as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      const result = await checkPasswordReuse('user-exception', 'Password123!');

      expect(result).toEqual({
        isReused: false,
        error: 'Unable to verify password history',
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[PasswordReuse] Unexpected error:',
        expect.any(Error)
      );
    });

    it('should fail-open when invoke throws a non-Error exception', async () => {
      (supabase.functions.invoke as jest.Mock).mockRejectedValue(
        'Unexpected string error'
      );

      const result = await checkPasswordReuse('user-string-error', 'Password123!');

      expect(result).toEqual({
        isReused: false,
        error: 'Unable to verify password history',
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[PasswordReuse] Unexpected error:',
        'Unexpected string error'
      );
    });

    it('should fail-open when invoke throws timeout error', async () => {
      const timeoutError = new Error('Request timeout');
      (supabase.functions.invoke as jest.Mock).mockRejectedValue(timeoutError);

      const result = await checkPasswordReuse('user-timeout', 'Password123!');

      expect(result).toEqual({
        isReused: false,
        error: 'Unable to verify password history',
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[PasswordReuse] Unexpected error:',
        timeoutError
      );
    });
  });

  describe('checkPasswordReuse - Backend error in response data', () => {
    it('should pass through backend error when isReused is false', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { isReused: false, error: 'Password history table not found' },
        error: null,
      });

      const result = await checkPasswordReuse('user-backend-error', 'Password123!');

      expect(result).toEqual({
        isReused: false,
        error: 'Password history table not found',
      });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should pass through backend warning when isReused is false', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { isReused: false, error: 'Only 2 historical passwords available' },
        error: null,
      });

      const result = await checkPasswordReuse('user-warning', 'Password123!');

      expect(result).toEqual({
        isReused: false,
        error: 'Only 2 historical passwords available',
      });
    });
  });

  describe('checkPasswordReuse - Correct parameters', () => {
    it('should send correct userId and newPassword to Edge Function', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { isReused: false },
        error: null,
      });

      await checkPasswordReuse('test-user-id', 'TestPassword123!');

      expect(supabase.functions.invoke).toHaveBeenCalledWith('check-password-reuse', {
        body: {
          userId: 'test-user-id',
          newPassword: 'TestPassword123!',
        },
      });
    });

    it('should call the correct Edge Function endpoint', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { isReused: false },
        error: null,
      });

      await checkPasswordReuse('user-123', 'Password123!');

      expect(supabase.functions.invoke).toHaveBeenCalledWith(
        'check-password-reuse',
        expect.any(Object)
      );
    });

    it('should handle special characters in password correctly', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { isReused: false },
        error: null,
      });

      const specialPassword = 'P@$$w0rd!#%&*()';
      await checkPasswordReuse('user-special', specialPassword);

      expect(supabase.functions.invoke).toHaveBeenCalledWith('check-password-reuse', {
        body: {
          userId: 'user-special',
          newPassword: specialPassword,
        },
      });
    });

    it('should handle unicode characters in password correctly', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { isReused: false },
        error: null,
      });

      const unicodePassword = 'Pässwörd123!';
      await checkPasswordReuse('user-unicode', unicodePassword);

      expect(supabase.functions.invoke).toHaveBeenCalledWith('check-password-reuse', {
        body: {
          userId: 'user-unicode',
          newPassword: unicodePassword,
        },
      });
    });
  });

  describe('checkPasswordReuse - No sensitive data leakage', () => {
    it('should not log plaintext password in error messages', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Error' },
      });

      const sensitivePassword = 'SuperSecret123!';
      await checkPasswordReuse('user-123', sensitivePassword);

      // Verify console.error was called but does not contain the password
      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorCalls = consoleErrorSpy.mock.calls;
      errorCalls.forEach((call) => {
        call.forEach((arg: unknown) => {
          const argStr = JSON.stringify(arg);
          expect(argStr).not.toContain(sensitivePassword);
        });
      });
    });

    it('should not expose password in returned error messages', async () => {
      (supabase.functions.invoke as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      const sensitivePassword = 'MyPassword123!';
      const result = await checkPasswordReuse('user-123', sensitivePassword);

      expect(result.error).toBe('Unable to verify password history');
      expect(result.error).not.toContain(sensitivePassword);
    });

    it('should only return boolean result, never password hashes', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { isReused: true },
        error: null,
      });

      const result = await checkPasswordReuse('user-123', 'Password123!');

      // Verify only expected fields are present
      expect(Object.keys(result)).toEqual(expect.arrayContaining(['isReused']));
      expect(result).not.toHaveProperty('hash');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('password');
    });

    it('should not log passwords when backend returns malformed response', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { isReused: 'invalid' },
        error: null,
      });

      const sensitivePassword = 'SecretPass123!';
      await checkPasswordReuse('user-123', sensitivePassword);

      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorCalls = consoleErrorSpy.mock.calls;
      errorCalls.forEach((call) => {
        call.forEach((arg: unknown) => {
          if (typeof arg === 'string') {
            expect(arg).not.toContain(sensitivePassword);
          }
        });
      });
    });
  });

  describe('checkPasswordReuse - Typed results', () => {
    it('should return PasswordReuseCheckResult with isReused as boolean', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { isReused: true },
        error: null,
      });

      const result = await checkPasswordReuse('user-123', 'Password123!');

      expect(typeof result.isReused).toBe('boolean');
      expect(result.isReused).toBe(true);
    });

    it('should return error as optional string when present', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { isReused: false, error: 'Some error message' },
        error: null,
      });

      const result = await checkPasswordReuse('user-123', 'Password123!');

      expect(typeof result.error).toBe('string');
      expect(result.error).toBe('Some error message');
    });

    it('should return error as undefined when not present', async () => {
      (supabase.functions.invoke as jest.Mock).mockResolvedValue({
        data: { isReused: false },
        error: null,
      });

      const result = await checkPasswordReuse('user-123', 'Password123!');

      expect(result.error).toBeUndefined();
    });

    it('should always return isReused as boolean in fail-open scenarios', async () => {
      (supabase.functions.invoke as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      const result = await checkPasswordReuse('user-123', 'Password123!');

      expect(typeof result.isReused).toBe('boolean');
      expect(result.isReused).toBe(false);
      expect(typeof result.error).toBe('string');
    });

    it('should return consistent type structure across all scenarios', async () => {
      const scenarios = [
        { data: { isReused: true }, error: null },
        { data: { isReused: false }, error: null },
        { data: null, error: { message: 'Error' } },
        { data: { isReused: 'invalid' }, error: null },
      ];

      for (const scenario of scenarios) {
        (supabase.functions.invoke as jest.Mock).mockResolvedValue(scenario);
        const result = await checkPasswordReuse('user-123', 'Password123!');

        expect(result).toHaveProperty('isReused');
        expect(typeof result.isReused).toBe('boolean');
        if (result.error !== undefined) {
          expect(typeof result.error).toBe('string');
        }
      }
    });
  });

  describe('checkPasswordReuse - Fail-open behavior verification', () => {
    it('should fail-open on all error scenarios to prevent user lockout', async () => {
      const errorScenarios = [
        { data: null, error: { message: 'Error' } },
        { data: undefined, error: null },
        { data: { isReused: 'string' }, error: null },
        { data: {}, error: null },
      ];

      for (const scenario of errorScenarios) {
        (supabase.functions.invoke as jest.Mock).mockResolvedValue(scenario);
        const result = await checkPasswordReuse('user-123', 'Password123!');

        expect(result.isReused).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it('should fail-open on exceptions to prevent user lockout', async () => {
      const exceptions = [
        new Error('Network error'),
        new Error('Timeout'),
        'String error',
        { message: 'Object error' },
      ];

      for (const exception of exceptions) {
        (supabase.functions.invoke as jest.Mock).mockRejectedValue(exception);
        const result = await checkPasswordReuse('user-123', 'Password123!');

        expect(result.isReused).toBe(false);
        expect(result.error).toBe('Unable to verify password history');
      }
    });
  });
});
