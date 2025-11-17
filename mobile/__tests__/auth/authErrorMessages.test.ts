import { getAuthErrorMessage } from '../../src/features/auth/utils/authErrorMessages';
import type { NormalizedAuthError } from '../../src/features/auth/utils/authErrorTypes';

// Mock i18n
jest.mock('../../src/core/i18n', () => ({
  t: (key: string) => {
    const messages: Record<string, string> = {
      // Common errors
      'screens.auth.common.errors.networkError': 'Unable to connect. Please check your internet connection.',
      'screens.auth.common.errors.invalidCredentials': 'Invalid email or password.',
      'screens.auth.common.errors.unverifiedEmail': 'Please verify your email address to continue.',
      'screens.auth.common.errors.emailAlreadyInUse': 'Unable to create account. Please try a different email.',
      'screens.auth.common.errors.passwordPolicy': 'Password does not meet requirements.',
      'screens.auth.common.errors.rateLimited': 'Too many attempts. Please wait and try again.',
      'screens.auth.common.errors.unknown': 'Something went wrong. Please try again.',
      // Flow-specific errors - login
      'screens.auth.login.errors.invalidCredentials': 'Invalid email or password.',
      'screens.auth.login.errors.networkError': 'Unable to connect. Please check your internet connection.',
      'screens.auth.login.errors.rateLimitExceeded': 'Too many attempts. Please wait and try again.',
      'screens.auth.login.sessionMessages.sessionExpired': 'Your session has expired. Please log in again.',
      // Flow-specific errors - signup
      'screens.auth.signup.errors.signupFailed': 'Unable to create account. Please try again.',
      'screens.auth.signup.errors.networkError': 'Unable to connect. Please check your internet connection.',
      'screens.auth.signup.errors.weakPassword': 'Password does not meet requirements.',
      // Flow-specific errors - reset
      'screens.auth.resetPassword.errors.tokenInvalid': 'This reset link is no longer valid.',
      'screens.auth.resetPassword.errors.networkError': 'Unable to connect. Please check your internet connection.',
      'screens.auth.resetPassword.errors.weakPassword': 'Password does not meet requirements.',
      'screens.auth.resetPassword.errors.rateLimitExceeded': 'Too many attempts. Please wait and try again.',
      // Flow-specific errors - verify
      'screens.auth.verify.errors.tooManyRequests': 'Too many attempts. Please wait and try again.',
    };
    return messages[key] || key;
  },
}));

describe('authErrorMessages', () => {
  describe('Category to message mapping', () => {
    it('should map network error', () => {
      const error: NormalizedAuthError = {
        category: 'network',
        uiMessage: 'test',
        severity: 'error',
        isRetryable: true,
      };

      const message = getAuthErrorMessage(error, 'login');

      expect(message).toBe('Unable to connect. Please check your internet connection.');
    });

    it('should map invalid_credentials', () => {
      const error: NormalizedAuthError = {
        category: 'invalid_credentials',
        uiMessage: 'test',
        severity: 'warning',
        isRetryable: false,
      };

      const message = getAuthErrorMessage(error, 'login');

      expect(message).toBe('Invalid email or password.');
    });

    it('should map unverified_email', () => {
      const error: NormalizedAuthError = {
        category: 'unverified_email',
        uiMessage: 'test',
        severity: 'info',
        isRetryable: false,
      };

      const message = getAuthErrorMessage(error, 'login');

      expect(message).toBe('Please verify your email address to continue.');
    });

    it('should map email_already_in_use', () => {
      const error: NormalizedAuthError = {
        category: 'email_already_in_use',
        uiMessage: 'test',
        severity: 'warning',
        isRetryable: false,
      };

      const message = getAuthErrorMessage(error, 'signup');

      // Non-enumerating: uses generic signup failure message
      expect(message).toBe('Unable to create account. Please try again.');
    });

    it('should map password_policy', () => {
      const error: NormalizedAuthError = {
        category: 'password_policy',
        uiMessage: 'test',
        severity: 'warning',
        isRetryable: false,
      };

      const message = getAuthErrorMessage(error, 'signup');

      expect(message).toBe('Password does not meet requirements.');
    });

    it('should map rate_limited', () => {
      const error: NormalizedAuthError = {
        category: 'rate_limited',
        uiMessage: 'test',
        severity: 'warning',
        isRetryable: true,
      };

      const message = getAuthErrorMessage(error, 'login');

      expect(message).toBe('Too many attempts. Please wait and try again.');
    });

    it('should map unknown errors', () => {
      const error: NormalizedAuthError = {
        category: 'unknown',
        uiMessage: 'test',
        severity: 'error',
        isRetryable: false,
      };

      const message = getAuthErrorMessage(error, 'login');

      expect(message).toBe('Something went wrong. Please try again.');
    });
  });

  describe('Flow-aware messages', () => {
    it('should handle login flow', () => {
      const error: NormalizedAuthError = {
        category: 'invalid_credentials',
        uiMessage: 'test',
        severity: 'warning',
        isRetryable: false,
      };

      const message = getAuthErrorMessage(error, 'login');

      expect(message).toBeTruthy();
      expect(typeof message).toBe('string');
    });

    it('should handle signup flow', () => {
      const error: NormalizedAuthError = {
        category: 'email_already_in_use',
        uiMessage: 'test',
        severity: 'warning',
        isRetryable: false,
      };

      const message = getAuthErrorMessage(error, 'signup');

      expect(message).toBeTruthy();
    });

    it('should handle reset flow', () => {
      const error: NormalizedAuthError = {
        category: 'session_expired',
        uiMessage: 'test',
        severity: 'warning',
        isRetryable: false,
      };

      const message = getAuthErrorMessage(error, 'reset');

      expect(message).toBeTruthy();
    });

    it('should handle refresh flow', () => {
      const error: NormalizedAuthError = {
        category: 'session_expired',
        uiMessage: 'test',
        severity: 'error',
        isRetryable: false,
      };

      const message = getAuthErrorMessage(error, 'refresh');

      expect(message).toBeTruthy();
    });

    it('should handle logout flow', () => {
      const error: NormalizedAuthError = {
        category: 'network',
        uiMessage: 'test',
        severity: 'error',
        isRetryable: true,
      };

      const message = getAuthErrorMessage(error, 'logout');

      expect(message).toBeTruthy();
    });
  });

  describe('Non-enumeration security', () => {
    it('should return non-enumerating messages for invalid_credentials', () => {
      const error: NormalizedAuthError = {
        category: 'invalid_credentials',
        uiMessage: 'test',
        severity: 'warning',
        isRetryable: false,
      };

      const loginMessage = getAuthErrorMessage(error, 'login');
      const signupMessage = getAuthErrorMessage(error, 'signup');

      // Both should use generic error messages that don't reveal whether account exists
      expect(loginMessage).toBe('Invalid email or password.');
      expect(signupMessage).toBe('Unable to create account. Please try again.');
      // Neither message reveals whether the account/email exists
      expect(loginMessage).not.toContain('exists');
      expect(signupMessage).not.toContain('exists');
    });

    it('should not reveal whether email exists', () => {
      const error: NormalizedAuthError = {
        category: 'email_already_in_use',
        uiMessage: 'test',
        severity: 'warning',
        isRetryable: false,
      };

      const message = getAuthErrorMessage(error, 'signup');

      // Should not explicitly say "email already exists"
      expect(message).not.toContain('exists');
      expect(message).not.toContain('already registered');
    });
  });

  describe('All categories covered', () => {
    const allCategories: Array<NormalizedAuthError['category']> = [
      'network',
      'invalid_credentials',
      'unverified_email',
      'email_already_in_use',
      'password_policy',
      'session_expired',
      'rate_limited',
      'unknown',
    ];

    allCategories.forEach((category) => {
      it(`should have message for ${category}`, () => {
        const error: NormalizedAuthError = {
          category,
          uiMessage: 'test',
          severity: 'error',
          isRetryable: false,
        };

        const message = getAuthErrorMessage(error, 'login');

        expect(message).toBeTruthy();
        expect(typeof message).toBe('string');
        expect(message.length).toBeGreaterThan(0);
      });
    });
  });

  describe('All flows supported', () => {
    const allFlows: Array<'login' | 'signup' | 'reset' | 'refresh' | 'logout'> = [
      'login',
      'signup',
      'reset',
      'refresh',
      'logout',
    ];

    allFlows.forEach((flow) => {
      it(`should handle ${flow} flow`, () => {
        const error: NormalizedAuthError = {
          category: 'network',
          uiMessage: 'test',
          severity: 'error',
          isRetryable: true,
        };

        const message = getAuthErrorMessage(error, flow);

        expect(message).toBeTruthy();
        expect(typeof message).toBe('string');
      });
    });
  });
});
