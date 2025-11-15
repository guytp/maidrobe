import { logAuthErrorToSentry, isAuthErrorLoggingAvailable } from '../../src/features/auth/utils/logAuthErrorToSentry';
import type { NormalizedAuthError } from '../../src/features/auth/utils/authErrorTypes';
import type { AuthErrorLoggingContext } from '../../src/features/auth/utils/logAuthErrorToSentry';

// Mock dependencies
jest.mock('../../../src/core/featureFlags/config', () => ({
  getFlagConfig: jest.fn(() => ({
    enabled: true,
    minVersion: '0.0.0',
    message: '',
  })),
}));

jest.mock('../../../src/core/telemetry/sentry', () => ({
  captureException: jest.fn(),
  getSentryClient: jest.fn(() => ({ enabled: true, dsn: undefined, environment: 'development' })),
}));

jest.mock('../../../src/core/telemetry', () => ({
  sanitizeAuthMetadata: jest.fn((metadata) => metadata),
}));

jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
}));

import { getFlagConfig } from '../../src/core/featureFlags/config';
import { captureException, getSentryClient } from '../../src/core/telemetry/sentry';
import { sanitizeAuthMetadata } from '../../src/core/telemetry';

describe('logAuthErrorToSentry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Feature flag control', () => {
    it('should not log when feature flag is disabled', () => {
      (getFlagConfig as jest.Mock).mockReturnValue({
        enabled: false,
        minVersion: '0.0.0',
        message: '',
      });

      const error: NormalizedAuthError = {
        category: 'network',
        uiMessage: 'test',
        severity: 'error',
        isRetryable: true,
      };
      const context: AuthErrorLoggingContext = {
        flow: 'login',
      };

      logAuthErrorToSentry(error, new Error('test'), context);

      expect(captureException).not.toHaveBeenCalled();
    });

    it('should log when feature flag is enabled', () => {
      (getFlagConfig as jest.Mock).mockReturnValue({
        enabled: true,
        minVersion: '0.0.0',
        message: '',
      });

      const error: NormalizedAuthError = {
        category: 'network',
        uiMessage: 'test',
        severity: 'error',
        isRetryable: true,
      };
      const context: AuthErrorLoggingContext = {
        flow: 'login',
      };

      logAuthErrorToSentry(error, new Error('test'), context);

      expect(captureException).toHaveBeenCalled();
    });
  });

  describe('PII sanitization', () => {
    it('should sanitize metadata', () => {
      (getFlagConfig as jest.Mock).mockReturnValue({
        enabled: true,
        minVersion: '0.0.0',
        message: '',
      });

      const error: NormalizedAuthError = {
        category: 'network',
        uiMessage: 'test',
        severity: 'error',
        isRetryable: true,
      };
      const context: AuthErrorLoggingContext = {
        flow: 'login',
        metadata: {
          password: 'secret123',
          email: 'user@example.com',
        },
      };

      logAuthErrorToSentry(error, new Error('test'), context);

      expect(sanitizeAuthMetadata).toHaveBeenCalled();
    });
  });

  describe('Metadata enrichment', () => {
    it('should include flow in metadata', () => {
      (getFlagConfig as jest.Mock).mockReturnValue({
        enabled: true,
        minVersion: '0.0.0',
        message: '',
      });

      const error: NormalizedAuthError = {
        category: 'network',
        uiMessage: 'test',
        severity: 'error',
        isRetryable: true,
      };
      const context: AuthErrorLoggingContext = {
        flow: 'login',
      };

      logAuthErrorToSentry(error, new Error('test'), context);

      const captureCall = (captureException as jest.Mock).mock.calls[0];
      expect(captureCall).toBeDefined();
    });

    it('should include category in tags', () => {
      (getFlagConfig as jest.Mock).mockReturnValue({
        enabled: true,
        minVersion: '0.0.0',
        message: '',
      });

      const error: NormalizedAuthError = {
        category: 'invalid_credentials',
        uiMessage: 'test',
        severity: 'warning',
        isRetryable: false,
      };
      const context: AuthErrorLoggingContext = {
        flow: 'login',
      };

      logAuthErrorToSentry(error, new Error('test'), context);

      expect(captureException).toHaveBeenCalled();
    });

    it('should include platform', () => {
      (getFlagConfig as jest.Mock).mockReturnValue({
        enabled: true,
        minVersion: '0.0.0',
        message: '',
      });

      const error: NormalizedAuthError = {
        category: 'network',
        uiMessage: 'test',
        severity: 'error',
        isRetryable: true,
      };
      const context: AuthErrorLoggingContext = {
        flow: 'login',
        platform: 'android',
      };

      logAuthErrorToSentry(error, new Error('test'), context);

      expect(captureException).toHaveBeenCalled();
    });
  });

  describe('Graceful degradation', () => {
    it('should not throw when Sentry is unavailable', () => {
      (getFlagConfig as jest.Mock).mockReturnValue({
        enabled: true,
        minVersion: '0.0.0',
        message: '',
      });
      (getSentryClient as jest.Mock).mockReturnValue({ enabled: false, dsn: undefined, environment: 'development' });

      const error: NormalizedAuthError = {
        category: 'network',
        uiMessage: 'test',
        severity: 'error',
        isRetryable: true,
      };
      const context: AuthErrorLoggingContext = {
        flow: 'login',
      };

      expect(() => {
        logAuthErrorToSentry(error, new Error('test'), context);
      }).not.toThrow();
    });

    it('should not throw when captureException fails', () => {
      (getFlagConfig as jest.Mock).mockReturnValue({
        enabled: true,
        minVersion: '0.0.0',
        message: '',
      });
      (captureException as jest.Mock).mockImplementation(() => {
        throw new Error('Sentry error');
      });

      const error: NormalizedAuthError = {
        category: 'network',
        uiMessage: 'test',
        severity: 'error',
        isRetryable: true,
      };
      const context: AuthErrorLoggingContext = {
        flow: 'login',
      };

      expect(() => {
        logAuthErrorToSentry(error, new Error('test'), context);
      }).not.toThrow();
    });
  });

  describe('Severity mapping', () => {
    it('should map error severity', () => {
      (getFlagConfig as jest.Mock).mockReturnValue({
        enabled: true,
        minVersion: '0.0.0',
        message: '',
      });

      const error: NormalizedAuthError = {
        category: 'unknown',
        uiMessage: 'test',
        severity: 'error',
        isRetryable: false,
      };
      const context: AuthErrorLoggingContext = {
        flow: 'login',
      };

      logAuthErrorToSentry(error, new Error('test'), context);

      expect(captureException).toHaveBeenCalled();
    });

    it('should map warning severity', () => {
      (getFlagConfig as jest.Mock).mockReturnValue({
        enabled: true,
        minVersion: '0.0.0',
        message: '',
      });

      const error: NormalizedAuthError = {
        category: 'invalid_credentials',
        uiMessage: 'test',
        severity: 'warning',
        isRetryable: false,
      };
      const context: AuthErrorLoggingContext = {
        flow: 'login',
      };

      logAuthErrorToSentry(error, new Error('test'), context);

      expect(captureException).toHaveBeenCalled();
    });

    it('should map info severity', () => {
      (getFlagConfig as jest.Mock).mockReturnValue({
        enabled: true,
        minVersion: '0.0.0',
        message: '',
      });

      const error: NormalizedAuthError = {
        category: 'unverified_email',
        uiMessage: 'test',
        severity: 'info',
        isRetryable: false,
      };
      const context: AuthErrorLoggingContext = {
        flow: 'login',
      };

      logAuthErrorToSentry(error, new Error('test'), context);

      expect(captureException).toHaveBeenCalled();
    });
  });

  describe('isAuthErrorLoggingAvailable', () => {
    it('should return true when feature flag is enabled and Sentry is available', () => {
      (getFlagConfig as jest.Mock).mockReturnValue({
        enabled: true,
        minVersion: '0.0.0',
        message: '',
      });
      (getSentryClient as jest.Mock).mockReturnValue({ enabled: true, dsn: 'test', environment: 'test' });

      const result = isAuthErrorLoggingAvailable();

      expect(result).toBe(true);
    });

    it('should return false when feature flag is disabled', () => {
      (getFlagConfig as jest.Mock).mockReturnValue({
        enabled: false,
        minVersion: '0.0.0',
        message: '',
      });
      (getSentryClient as jest.Mock).mockReturnValue({ enabled: true, dsn: 'test', environment: 'test' });

      const result = isAuthErrorLoggingAvailable();

      expect(result).toBe(false);
    });

    it('should return false when Sentry is unavailable', () => {
      (getFlagConfig as jest.Mock).mockReturnValue({
        enabled: true,
        minVersion: '0.0.0',
        message: '',
      });
      (getSentryClient as jest.Mock).mockReturnValue({ enabled: false, dsn: undefined, environment: 'test' });

      const result = isAuthErrorLoggingAvailable();

      expect(result).toBe(false);
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
      it(`should log ${flow} flow errors`, () => {
        (getFlagConfig as jest.Mock).mockReturnValue({
          enabled: true,
          minVersion: '0.0.0',
          message: '',
        });

        const error: NormalizedAuthError = {
          category: 'network',
          uiMessage: 'test',
          severity: 'error',
          isRetryable: true,
        };
        const context: AuthErrorLoggingContext = {
          flow,
        };

        logAuthErrorToSentry(error, new Error('test'), context);

        expect(captureException).toHaveBeenCalled();
      });
    });
  });
});
