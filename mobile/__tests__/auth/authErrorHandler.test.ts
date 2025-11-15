import { handleAuthError } from '../../src/features/auth/utils/authErrorHandler';
import type { AuthErrorContext } from '../../src/features/auth/utils/authErrorHandler';

describe('authErrorHandler', () => {
  describe('HTTP status code classification', () => {
    it('should classify 401 as invalid_credentials', () => {
      const error = {
        status: 401,
        message: 'Unauthorized',
      };
      const context: AuthErrorContext = {
        flow: 'login',
        supabaseOperation: 'signInWithPassword',
      };

      const result = handleAuthError(error, context);

      expect(result.category).toBe('invalid_credentials');
      expect(result.isRetryable).toBe(false);
    });

    it('should classify 403 as invalid_credentials', () => {
      const error = {
        status: 403,
        message: 'Forbidden',
      };
      const context: AuthErrorContext = {
        flow: 'login',
        supabaseOperation: 'signInWithPassword',
      };

      const result = handleAuthError(error, context);

      expect(result.category).toBe('invalid_credentials');
    });

    it('should classify 429 as rate_limited', () => {
      const error = {
        status: 429,
        message: 'Too Many Requests',
      };
      const context: AuthErrorContext = {
        flow: 'login',
        supabaseOperation: 'signInWithPassword',
      };

      const result = handleAuthError(error, context);

      expect(result.category).toBe('rate_limited');
      expect(result.isRetryable).toBe(true);
    });

    it('should classify 500 as unknown server error', () => {
      const error = {
        status: 500,
        message: 'Internal Server Error',
      };
      const context: AuthErrorContext = {
        flow: 'login',
        supabaseOperation: 'signInWithPassword',
      };

      const result = handleAuthError(error, context);

      expect(result.category).toBe('unknown');
      expect(result.severity).toBe('error');
    });

    it('should classify 503 as unknown server error', () => {
      const error = {
        status: 503,
        message: 'Service Unavailable',
      };
      const context: AuthErrorContext = {
        flow: 'login',
        supabaseOperation: 'signInWithPassword',
      };

      const result = handleAuthError(error, context);

      expect(result.category).toBe('unknown');
    });
  });

  describe('Message pattern classification', () => {
    it('should classify network errors from message', () => {
      const error = new Error('Network request failed');
      const context: AuthErrorContext = {
        flow: 'login',
        supabaseOperation: 'signInWithPassword',
      };

      const result = handleAuthError(error, context);

      expect(result.category).toBe('network');
      expect(result.isRetryable).toBe(true);
    });

    it('should classify timeout as network error', () => {
      const error = new Error('Request timeout');
      const context: AuthErrorContext = {
        flow: 'login',
        supabaseOperation: 'signInWithPassword',
      };

      const result = handleAuthError(error, context);

      expect(result.category).toBe('network');
    });

    it('should classify email already in use', () => {
      const error = new Error('User already registered');
      const context: AuthErrorContext = {
        flow: 'signup',
        supabaseOperation: 'signUp',
      };

      const result = handleAuthError(error, context);

      expect(result.category).toBe('email_already_in_use');
      expect(result.isRetryable).toBe(false);
    });

    it('should classify weak password', () => {
      const error = new Error('Password is too weak');
      const context: AuthErrorContext = {
        flow: 'signup',
        supabaseOperation: 'signUp',
      };

      const result = handleAuthError(error, context);

      expect(result.category).toBe('password_policy');
      expect(result.isRetryable).toBe(false);
    });
  });

  describe('Unknown and malformed errors', () => {
    it('should handle null error', () => {
      const context: AuthErrorContext = {
        flow: 'login',
        supabaseOperation: 'signInWithPassword',
      };

      const result = handleAuthError(null, context);

      expect(result.category).toBe('unknown');
      expect(result.severity).toBe('error');
    });

    it('should handle undefined error', () => {
      const context: AuthErrorContext = {
        flow: 'login',
        supabaseOperation: 'signInWithPassword',
      };

      const result = handleAuthError(undefined, context);

      expect(result.category).toBe('unknown');
    });

    it('should handle string error', () => {
      const context: AuthErrorContext = {
        flow: 'login',
        supabaseOperation: 'signInWithPassword',
      };

      const result = handleAuthError('Something went wrong', context);

      expect(result.category).toBe('unknown');
    });

    it('should handle number error', () => {
      const context: AuthErrorContext = {
        flow: 'login',
        supabaseOperation: 'signInWithPassword',
      };

      const result = handleAuthError(500, context);

      expect(result.category).toBe('unknown');
    });

    it('should handle empty object', () => {
      const context: AuthErrorContext = {
        flow: 'login',
        supabaseOperation: 'signInWithPassword',
      };

      const result = handleAuthError({}, context);

      expect(result.category).toBe('unknown');
    });
  });

  describe('Defensive programming', () => {
    it('should never throw on any input', () => {
      const context: AuthErrorContext = {
        flow: 'login',
        supabaseOperation: 'signInWithPassword',
      };

      const inputs = [
        null,
        undefined,
        '',
        0,
        {},
        [],
        new Error('test'),
        { status: 'invalid' },
        { message: null },
        Symbol('test'),
      ];

      inputs.forEach((input) => {
        expect(() => handleAuthError(input as any, context)).not.toThrow();
      });
    });

    it('should always return valid NormalizedAuthError', () => {
      const error = new Error('test');
      const context: AuthErrorContext = {
        flow: 'login',
        supabaseOperation: 'signInWithPassword',
      };

      const result = handleAuthError(error, context);

      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('uiMessage');
      expect(result).toHaveProperty('severity');
      expect(result).toHaveProperty('isRetryable');
      expect(typeof result.category).toBe('string');
      expect(typeof result.uiMessage).toBe('string');
      expect(typeof result.severity).toBe('string');
      expect(typeof result.isRetryable).toBe('boolean');
    });
  });

  describe('Context-aware classification', () => {
    it('should handle login context', () => {
      const error = new Error('Invalid credentials');
      const context: AuthErrorContext = {
        flow: 'login',
        supabaseOperation: 'signInWithPassword',
      };

      const result = handleAuthError(error, context);

      expect(result.category).toBe('invalid_credentials');
    });

    it('should handle signup context', () => {
      const error = new Error('User already exists');
      const context: AuthErrorContext = {
        flow: 'signup',
        supabaseOperation: 'signUp',
      };

      const result = handleAuthError(error, context);

      expect(result.category).toBe('email_already_in_use');
    });

    it('should handle reset context', () => {
      const error = new Error('Invalid token');
      const context: AuthErrorContext = {
        flow: 'reset',
        supabaseOperation: 'updateUser',
      };

      const result = handleAuthError(error, context);

      expect(result.category).toBe('session_expired');
    });
  });

  describe('Severity classification', () => {
    it('should assign error severity to critical issues', () => {
      const error = {
        status: 500,
        message: 'Internal Server Error',
      };
      const context: AuthErrorContext = {
        flow: 'login',
        supabaseOperation: 'signInWithPassword',
      };

      const result = handleAuthError(error, context);

      expect(result.severity).toBe('error');
    });

    it('should assign warning severity to user errors', () => {
      const error = new Error('Invalid credentials');
      const context: AuthErrorContext = {
        flow: 'login',
        supabaseOperation: 'signInWithPassword',
      };

      const result = handleAuthError(error, context);

      expect(result.severity).toBe('warning');
    });

    it('should assign info severity to informational messages', () => {
      const error = new Error('Please verify your email');
      const context: AuthErrorContext = {
        flow: 'signup',
        supabaseOperation: 'signUp',
      };

      const result = handleAuthError(error, context);

      expect(result.category).toBe('unverified_email');
      expect(result.severity).toBe('info');
    });
  });
});
