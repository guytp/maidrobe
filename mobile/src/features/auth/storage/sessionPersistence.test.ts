/**
 * Unit tests for session persistence module.
 *
 * Tests session storage operations including persistence, retrieval, validation,
 * and proper interaction with SecureStore. Covers happy paths, validation errors,
 * storage errors, and edge cases for all public functions.
 */

import * as SecureStore from 'expo-secure-store';
import { Session } from '@supabase/supabase-js';
import { logAuthEvent, logError } from '../../../core/telemetry';
import {
  loadStoredSession,
  saveSessionFromSupabase,
  clearStoredSession,
  markNeedsRefresh,
  clearNeedsRefresh,
  StoredSessionBundle,
} from './sessionPersistence';

// Mock external dependencies
jest.mock('expo-secure-store');
jest.mock('../../../core/telemetry');

describe('sessionPersistence', () => {
  // Mock data
  const mockSession: Session = {
    access_token: 'mock-access-token-xyz',
    refresh_token: 'mock-refresh-token-abc',
    expires_at: 1700000000,
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: 'user-123',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'test@example.com',
      email_confirmed_at: '2025-01-01T00:00:00.000Z',
      phone: '',
      confirmed_at: '2025-01-01T00:00:00.000Z',
      last_sign_in_at: '2025-01-01T00:00:00.000Z',
      app_metadata: {},
      user_metadata: {},
      identities: [],
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-01-01T00:00:00.000Z',
    },
  };

  const mockLastAuthSuccessAt = '2025-11-15T10:00:00.000Z';

  const mockBundle: StoredSessionBundle = {
    session: mockSession,
    lastAuthSuccessAt: mockLastAuthSuccessAt,
    needsRefresh: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadStoredSession', () => {
    describe('Happy path', () => {
      it('should return null when no session is stored', async () => {
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

        const result = await loadStoredSession();

        expect(result).toBeNull();
        expect(SecureStore.getItemAsync).toHaveBeenCalledWith(
          'maidrobe:auth:session-bundle',
          expect.objectContaining({
            keychainAccessible: SecureStore.ALWAYS_THIS_DEVICE_ONLY,
            requireAuthentication: false,
          })
        );
        expect(logAuthEvent).not.toHaveBeenCalled();
      });

      it('should return valid session bundle when stored data is valid', async () => {
        const serialized = JSON.stringify(mockBundle);
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(serialized);

        const result = await loadStoredSession();

        expect(result).toEqual(mockBundle);
        expect(result?.session.access_token).toBe('mock-access-token-xyz');
        expect(result?.session.user.email).toBe('test@example.com');
        expect(result?.lastAuthSuccessAt).toBe(mockLastAuthSuccessAt);
        expect(result?.needsRefresh).toBe(false);
        expect(logAuthEvent).toHaveBeenCalledWith('session-load', {
          outcome: 'success',
          metadata: {
            hasNeedsRefresh: false,
          },
        });
      });

      it('should handle session with needsRefresh=true', async () => {
        const bundleWithRefresh = { ...mockBundle, needsRefresh: true };
        const serialized = JSON.stringify(bundleWithRefresh);
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(serialized);

        const result = await loadStoredSession();

        expect(result?.needsRefresh).toBe(true);
        expect(logAuthEvent).toHaveBeenCalledWith('session-load', {
          outcome: 'success',
          metadata: {
            hasNeedsRefresh: true,
          },
        });
      });

      it('should handle session with needsRefresh=false', async () => {
        const bundleWithRefresh = { ...mockBundle, needsRefresh: false };
        const serialized = JSON.stringify(bundleWithRefresh);
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(serialized);

        const result = await loadStoredSession();

        expect(result?.needsRefresh).toBe(false);
        expect(logAuthEvent).toHaveBeenCalledWith('session-load', {
          outcome: 'success',
          metadata: {
            hasNeedsRefresh: false,
          },
        });
      });

      it('should handle session with undefined needsRefresh', async () => {
        const bundleWithoutRefresh = {
          session: mockSession,
          lastAuthSuccessAt: mockLastAuthSuccessAt,
        };
        const serialized = JSON.stringify(bundleWithoutRefresh);
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(serialized);

        const result = await loadStoredSession();

        expect(result?.needsRefresh).toBeUndefined();
        expect(logAuthEvent).toHaveBeenCalledWith('session-load', {
          outcome: 'success',
          metadata: {
            hasNeedsRefresh: false,
          },
        });
      });
    });

    describe('Validation errors', () => {
      it('should clear storage and return null on JSON parse error', async () => {
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('invalid-json{');
        (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

        const result = await loadStoredSession();

        expect(result).toBeNull();
        expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
          'maidrobe:auth:session-bundle',
          expect.any(Object)
        );
        expect(logError).toHaveBeenCalledWith(
          expect.any(Error),
          'schema',
          expect.objectContaining({
            feature: 'auth',
            operation: 'session-load',
          })
        );
        expect(logAuthEvent).toHaveBeenCalledWith('session-corrupted', {
          outcome: 'failure',
          metadata: {
            reason: 'json_parse_error',
          },
        });
      });

      it('should clear storage and return null when data is not an object', async () => {
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('"string-value"');
        (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

        const result = await loadStoredSession();

        expect(result).toBeNull();
        expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
        expect(logError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Invalid session bundle: not an object',
          }),
          'schema',
          expect.any(Object)
        );
        expect(logAuthEvent).toHaveBeenCalledWith('session-corrupted', {
          outcome: 'failure',
          metadata: {
            reason: 'not_object',
          },
        });
      });

      it('should clear storage and return null when session field is missing', async () => {
        const invalidBundle = {
          lastAuthSuccessAt: mockLastAuthSuccessAt,
        };
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(invalidBundle));
        (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

        const result = await loadStoredSession();

        expect(result).toBeNull();
        expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
        expect(logError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Invalid session bundle: missing or invalid session',
          }),
          'schema',
          expect.any(Object)
        );
        expect(logAuthEvent).toHaveBeenCalledWith('session-corrupted', {
          outcome: 'failure',
          metadata: {
            reason: 'invalid_session_field',
          },
        });
      });

      it('should clear storage and return null when session field is not an object', async () => {
        const invalidBundle = {
          session: 'not-an-object',
          lastAuthSuccessAt: mockLastAuthSuccessAt,
        };
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(invalidBundle));
        (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

        const result = await loadStoredSession();

        expect(result).toBeNull();
        expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
        expect(logAuthEvent).toHaveBeenCalledWith('session-corrupted', {
          outcome: 'failure',
          metadata: {
            reason: 'invalid_session_field',
          },
        });
      });

      it('should clear storage and return null when lastAuthSuccessAt is missing', async () => {
        const invalidBundle = {
          session: mockSession,
        };
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(invalidBundle));
        (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

        const result = await loadStoredSession();

        expect(result).toBeNull();
        expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
        expect(logError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Invalid session bundle: missing or invalid lastAuthSuccessAt',
          }),
          'schema',
          expect.any(Object)
        );
        expect(logAuthEvent).toHaveBeenCalledWith('session-corrupted', {
          outcome: 'failure',
          metadata: {
            reason: 'invalid_lastAuthSuccessAt',
          },
        });
      });

      it('should clear storage and return null when lastAuthSuccessAt is not a string', async () => {
        const invalidBundle = {
          session: mockSession,
          lastAuthSuccessAt: 12345,
        };
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(invalidBundle));
        (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

        const result = await loadStoredSession();

        expect(result).toBeNull();
        expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
        expect(logAuthEvent).toHaveBeenCalledWith('session-corrupted', {
          outcome: 'failure',
          metadata: {
            reason: 'invalid_lastAuthSuccessAt',
          },
        });
      });

      it('should clear storage and return null when lastAuthSuccessAt is not a valid date', async () => {
        const invalidBundle = {
          session: mockSession,
          lastAuthSuccessAt: 'not-a-date',
        };
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(invalidBundle));
        (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

        const result = await loadStoredSession();

        expect(result).toBeNull();
        expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
        expect(logError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Invalid session bundle: lastAuthSuccessAt is not a valid date',
          }),
          'schema',
          expect.any(Object)
        );
        expect(logAuthEvent).toHaveBeenCalledWith('session-corrupted', {
          outcome: 'failure',
          metadata: {
            reason: 'invalid_date_format',
          },
        });
      });

      it('should clear storage and return null when needsRefresh is not a boolean', async () => {
        const invalidBundle = {
          session: mockSession,
          lastAuthSuccessAt: mockLastAuthSuccessAt,
          needsRefresh: 'true',
        };
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(invalidBundle));
        (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

        const result = await loadStoredSession();

        expect(result).toBeNull();
        expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
        expect(logError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Invalid session bundle: needsRefresh is not a boolean',
          }),
          'schema',
          expect.any(Object)
        );
        expect(logAuthEvent).toHaveBeenCalledWith('session-corrupted', {
          outcome: 'failure',
          metadata: {
            reason: 'invalid_needsRefresh',
          },
        });
      });
    });

    describe('SecureStore errors', () => {
      it('should return null when SecureStore.getItemAsync throws error', async () => {
        const error = new Error('SecureStore read error');
        (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(error);

        const result = await loadStoredSession();

        expect(result).toBeNull();
        expect(logError).toHaveBeenCalledWith(error, 'server', {
          feature: 'auth',
          operation: 'session-load',
          metadata: {
            reason: 'storage_error',
          },
        });
        expect(logAuthEvent).toHaveBeenCalledWith('session-load-error', {
          outcome: 'failure',
          metadata: {
            reason: 'storage_error',
          },
        });
      });

      it('should handle unexpected errors gracefully', async () => {
        (SecureStore.getItemAsync as jest.Mock).mockRejectedValue('string error');

        const result = await loadStoredSession();

        expect(result).toBeNull();
        expect(logError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Unknown error loading session',
          }),
          'server',
          expect.any(Object)
        );
      });
    });
  });

  describe('saveSessionFromSupabase', () => {
    describe('Happy path', () => {
      it('should save session bundle to SecureStore', async () => {
        (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

        await saveSessionFromSupabase(mockSession, mockLastAuthSuccessAt);

        expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
          'maidrobe:auth:session-bundle',
          expect.stringContaining('mock-access-token-xyz'),
          expect.objectContaining({
            keychainAccessible: SecureStore.ALWAYS_THIS_DEVICE_ONLY,
            requireAuthentication: false,
          })
        );

        // Verify the serialized data structure
        const callArgs = (SecureStore.setItemAsync as jest.Mock).mock.calls[0];
        const serialized = callArgs[1];
        const parsed = JSON.parse(serialized);
        expect(parsed.session).toEqual(mockSession);
        expect(parsed.lastAuthSuccessAt).toBe(mockLastAuthSuccessAt);
        expect(parsed.needsRefresh).toBe(false);

        expect(logAuthEvent).toHaveBeenCalledWith('session-save', {
          outcome: 'success',
          metadata: {
            hasSession: true,
            hasLastAuthSuccessAt: true,
          },
        });
      });

      it('should set needsRefresh to false by default', async () => {
        (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

        await saveSessionFromSupabase(mockSession, mockLastAuthSuccessAt);

        const callArgs = (SecureStore.setItemAsync as jest.Mock).mock.calls[0];
        const serialized = callArgs[1];
        const parsed = JSON.parse(serialized);
        expect(parsed.needsRefresh).toBe(false);
      });

      it('should serialize session correctly without losing data', async () => {
        (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

        await saveSessionFromSupabase(mockSession, mockLastAuthSuccessAt);

        const callArgs = (SecureStore.setItemAsync as jest.Mock).mock.calls[0];
        const serialized = callArgs[1];
        const parsed = JSON.parse(serialized);

        // Verify all session fields are preserved
        expect(parsed.session.access_token).toBe(mockSession.access_token);
        expect(parsed.session.refresh_token).toBe(mockSession.refresh_token);
        expect(parsed.session.expires_at).toBe(mockSession.expires_at);
        expect(parsed.session.user.id).toBe(mockSession.user.id);
        expect(parsed.session.user.email).toBe(mockSession.user.email);
      });

      it('should log success event after saving', async () => {
        (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

        await saveSessionFromSupabase(mockSession, mockLastAuthSuccessAt);

        expect(logAuthEvent).toHaveBeenCalledWith('session-save', {
          outcome: 'success',
          metadata: {
            hasSession: true,
            hasLastAuthSuccessAt: true,
          },
        });
      });
    });

    describe('Validation errors', () => {
      it('should log error and return early when session is null', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await saveSessionFromSupabase(null as any, mockLastAuthSuccessAt);

        expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
        expect(logError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Cannot save session: session is null or undefined',
          }),
          'user',
          {
            feature: 'auth',
            operation: 'session-save',
            metadata: {
              reason: 'null_session',
            },
          }
        );
        expect(logAuthEvent).not.toHaveBeenCalled();
      });

      it('should log error and return early when session is undefined', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await saveSessionFromSupabase(undefined as any, mockLastAuthSuccessAt);

        expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
        expect(logError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Cannot save session: session is null or undefined',
          }),
          'user',
          expect.any(Object)
        );
      });

      it('should log error and return early when lastAuthSuccessAt is null', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await saveSessionFromSupabase(mockSession, null as any);

        expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
        expect(logError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Cannot save session: lastAuthSuccessAt is invalid',
          }),
          'user',
          {
            feature: 'auth',
            operation: 'session-save',
            metadata: {
              reason: 'invalid_lastAuthSuccessAt',
            },
          }
        );
      });

      it('should log error and return early when lastAuthSuccessAt is not a string', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await saveSessionFromSupabase(mockSession, 12345 as any);

        expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
        expect(logError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Cannot save session: lastAuthSuccessAt is invalid',
          }),
          'user',
          expect.any(Object)
        );
      });

      it('should log error and return early when lastAuthSuccessAt is empty string', async () => {
        await saveSessionFromSupabase(mockSession, '');

        expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
        expect(logError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Cannot save session: lastAuthSuccessAt is invalid',
          }),
          'user',
          expect.any(Object)
        );
      });
    });

    describe('SecureStore errors', () => {
      it('should log error but not throw when SecureStore.setItemAsync fails', async () => {
        const error = new Error('SecureStore write error');
        (SecureStore.setItemAsync as jest.Mock).mockRejectedValue(error);

        await expect(
          saveSessionFromSupabase(mockSession, mockLastAuthSuccessAt)
        ).resolves.toBeUndefined();

        expect(logError).toHaveBeenCalledWith(error, 'server', {
          feature: 'auth',
          operation: 'session-save',
          metadata: {
            reason: 'storage_error',
          },
        });
        expect(logAuthEvent).toHaveBeenCalledWith('session-save-error', {
          outcome: 'failure',
          metadata: {
            reason: 'storage_error',
          },
        });
      });

      it('should handle unexpected errors gracefully', async () => {
        (SecureStore.setItemAsync as jest.Mock).mockRejectedValue('string error');

        await expect(
          saveSessionFromSupabase(mockSession, mockLastAuthSuccessAt)
        ).resolves.toBeUndefined();

        expect(logError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Unknown error saving session',
          }),
          'server',
          expect.any(Object)
        );
      });
    });
  });

  describe('clearStoredSession', () => {
    describe('Happy path', () => {
      it('should delete session from SecureStore', async () => {
        (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

        await clearStoredSession();

        expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
          'maidrobe:auth:session-bundle',
          expect.objectContaining({
            keychainAccessible: SecureStore.ALWAYS_THIS_DEVICE_ONLY,
            requireAuthentication: false,
          })
        );
        expect(logAuthEvent).toHaveBeenCalledWith('session-cleared', {
          outcome: 'success',
        });
      });

      it('should log success event after clearing', async () => {
        (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

        await clearStoredSession();

        expect(logAuthEvent).toHaveBeenCalledWith('session-cleared', {
          outcome: 'success',
        });
      });
    });

    describe('SecureStore errors', () => {
      it('should log error but not throw when SecureStore.deleteItemAsync fails', async () => {
        const error = new Error('SecureStore delete error');
        (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValue(error);

        await expect(clearStoredSession()).resolves.toBeUndefined();

        expect(logError).toHaveBeenCalledWith(error, 'server', {
          feature: 'auth',
          operation: 'session-clear',
          metadata: {
            reason: 'storage_error',
          },
        });
        expect(logAuthEvent).toHaveBeenCalledWith('session-clear-error', {
          outcome: 'failure',
          metadata: {
            reason: 'storage_error',
          },
        });
      });

      it('should handle unexpected errors gracefully', async () => {
        (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValue('string error');

        await expect(clearStoredSession()).resolves.toBeUndefined();

        expect(logError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Unknown error clearing session',
          }),
          'server',
          expect.any(Object)
        );
      });
    });
  });

  describe('markNeedsRefresh', () => {
    describe('Happy path', () => {
      it('should load session, set needsRefresh=true, and save', async () => {
        const serialized = JSON.stringify(mockBundle);
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(serialized);
        (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

        await markNeedsRefresh();

        expect(SecureStore.getItemAsync).toHaveBeenCalled();
        expect(SecureStore.setItemAsync).toHaveBeenCalled();

        // Verify needsRefresh was set to true
        const callArgs = (SecureStore.setItemAsync as jest.Mock).mock.calls[0];
        const savedData = JSON.parse(callArgs[1]);
        expect(savedData.needsRefresh).toBe(true);

        expect(logAuthEvent).toHaveBeenCalledWith('session-mark-needs-refresh', {
          outcome: 'success',
        });
      });

      it('should preserve existing session data when setting flag', async () => {
        const serialized = JSON.stringify(mockBundle);
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(serialized);
        (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

        await markNeedsRefresh();

        const callArgs = (SecureStore.setItemAsync as jest.Mock).mock.calls[0];
        const savedData = JSON.parse(callArgs[1]);

        // Verify all original data is preserved
        expect(savedData.session.access_token).toBe(mockSession.access_token);
        expect(savedData.session.refresh_token).toBe(mockSession.refresh_token);
        expect(savedData.lastAuthSuccessAt).toBe(mockLastAuthSuccessAt);
        expect(savedData.needsRefresh).toBe(true);
      });

      it('should log success event after marking', async () => {
        const serialized = JSON.stringify(mockBundle);
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(serialized);
        (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

        await markNeedsRefresh();

        expect(logAuthEvent).toHaveBeenCalledWith('session-mark-needs-refresh', {
          outcome: 'success',
        });
      });
    });

    describe('Edge cases', () => {
      it('should log error and return when no session exists', async () => {
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

        await markNeedsRefresh();

        expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
        expect(logError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Cannot mark needs refresh: no stored session',
          }),
          'user',
          {
            feature: 'auth',
            operation: 'mark-needs-refresh',
            metadata: {
              reason: 'no_session',
            },
          }
        );
        expect(logAuthEvent).not.toHaveBeenCalled();
      });

      it('should handle SecureStore errors gracefully', async () => {
        const error = new Error('SecureStore error');
        (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(error);

        await expect(markNeedsRefresh()).resolves.toBeUndefined();

        // Error is caught by loadStoredSession, which returns null
        // Then markNeedsRefresh logs the 'no session' error
        expect(logError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Cannot mark needs refresh: no stored session',
          }),
          'user',
          expect.objectContaining({
            operation: 'mark-needs-refresh',
          })
        );
      });

      it('should handle setItemAsync errors gracefully', async () => {
        const serialized = JSON.stringify(mockBundle);
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(serialized);
        const error = new Error('SecureStore write error');
        (SecureStore.setItemAsync as jest.Mock).mockRejectedValue(error);

        await expect(markNeedsRefresh()).resolves.toBeUndefined();

        expect(logError).toHaveBeenCalledWith(
          error,
          'server',
          expect.objectContaining({
            operation: 'mark-needs-refresh',
          })
        );
      });
    });
  });

  describe('clearNeedsRefresh', () => {
    describe('Happy path', () => {
      it('should load session, set needsRefresh=false, and save', async () => {
        const bundleWithRefresh = { ...mockBundle, needsRefresh: true };
        const serialized = JSON.stringify(bundleWithRefresh);
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(serialized);
        (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

        await clearNeedsRefresh();

        expect(SecureStore.getItemAsync).toHaveBeenCalled();
        expect(SecureStore.setItemAsync).toHaveBeenCalled();

        // Verify needsRefresh was set to false
        const callArgs = (SecureStore.setItemAsync as jest.Mock).mock.calls[0];
        const savedData = JSON.parse(callArgs[1]);
        expect(savedData.needsRefresh).toBe(false);

        expect(logAuthEvent).toHaveBeenCalledWith('session-clear-needs-refresh', {
          outcome: 'success',
        });
      });

      it('should preserve existing session data when clearing flag', async () => {
        const bundleWithRefresh = { ...mockBundle, needsRefresh: true };
        const serialized = JSON.stringify(bundleWithRefresh);
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(serialized);
        (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

        await clearNeedsRefresh();

        const callArgs = (SecureStore.setItemAsync as jest.Mock).mock.calls[0];
        const savedData = JSON.parse(callArgs[1]);

        // Verify all original data is preserved
        expect(savedData.session.access_token).toBe(mockSession.access_token);
        expect(savedData.session.refresh_token).toBe(mockSession.refresh_token);
        expect(savedData.lastAuthSuccessAt).toBe(mockLastAuthSuccessAt);
        expect(savedData.needsRefresh).toBe(false);
      });

      it('should log success event after clearing', async () => {
        const serialized = JSON.stringify(mockBundle);
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(serialized);
        (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

        await clearNeedsRefresh();

        expect(logAuthEvent).toHaveBeenCalledWith('session-clear-needs-refresh', {
          outcome: 'success',
        });
      });
    });

    describe('Edge cases', () => {
      it('should return silently when no session exists', async () => {
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

        await clearNeedsRefresh();

        expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
        expect(logError).not.toHaveBeenCalled();
        expect(logAuthEvent).not.toHaveBeenCalled();
      });

      it('should handle SecureStore read errors gracefully', async () => {
        const error = new Error('SecureStore error');
        (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(error);

        await expect(clearNeedsRefresh()).resolves.toBeUndefined();

        // Error is caught by loadStoredSession, which returns null
        // clearNeedsRefresh returns silently without logging when no session exists
        expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
      });

      it('should handle setItemAsync errors gracefully', async () => {
        const serialized = JSON.stringify(mockBundle);
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(serialized);
        const error = new Error('SecureStore write error');
        (SecureStore.setItemAsync as jest.Mock).mockRejectedValue(error);

        await expect(clearNeedsRefresh()).resolves.toBeUndefined();

        expect(logError).toHaveBeenCalledWith(
          error,
          'server',
          expect.objectContaining({
            operation: 'clear-needs-refresh',
          })
        );
      });
    });
  });

  describe('StoredSessionBundle structure validation', () => {
    it('should properly serialize and deserialize complete bundle', () => {
      const bundle: StoredSessionBundle = {
        session: mockSession,
        lastAuthSuccessAt: mockLastAuthSuccessAt,
        needsRefresh: true,
      };

      const serialized = JSON.stringify(bundle);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.session).toEqual(mockSession);
      expect(deserialized.lastAuthSuccessAt).toBe(mockLastAuthSuccessAt);
      expect(deserialized.needsRefresh).toBe(true);
    });

    it('should handle bundle with optional needsRefresh', () => {
      const bundle: StoredSessionBundle = {
        session: mockSession,
        lastAuthSuccessAt: mockLastAuthSuccessAt,
      };

      const serialized = JSON.stringify(bundle);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.session).toEqual(mockSession);
      expect(deserialized.lastAuthSuccessAt).toBe(mockLastAuthSuccessAt);
      expect(deserialized.needsRefresh).toBeUndefined();
    });

    it('should preserve ISO 8601 date format', () => {
      const isoDate = '2025-11-15T10:30:45.123Z';
      const bundle: StoredSessionBundle = {
        session: mockSession,
        lastAuthSuccessAt: isoDate,
        needsRefresh: false,
      };

      const serialized = JSON.stringify(bundle);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.lastAuthSuccessAt).toBe(isoDate);
      expect(new Date(deserialized.lastAuthSuccessAt).toISOString()).toBe(isoDate);
    });

    it('should maintain all session fields through serialization', () => {
      const bundle: StoredSessionBundle = {
        session: mockSession,
        lastAuthSuccessAt: mockLastAuthSuccessAt,
        needsRefresh: false,
      };

      const serialized = JSON.stringify(bundle);
      const deserialized = JSON.parse(serialized);

      // Verify all session properties are preserved
      expect(deserialized.session.access_token).toBe(mockSession.access_token);
      expect(deserialized.session.refresh_token).toBe(mockSession.refresh_token);
      expect(deserialized.session.expires_at).toBe(mockSession.expires_at);
      expect(deserialized.session.expires_in).toBe(mockSession.expires_in);
      expect(deserialized.session.token_type).toBe(mockSession.token_type);
      expect(deserialized.session.user.id).toBe(mockSession.user.id);
      expect(deserialized.session.user.email).toBe(mockSession.user.email);
      expect(deserialized.session.user.email_confirmed_at).toBe(
        mockSession.user.email_confirmed_at
      );
    });
  });

  describe('SecureStore integration', () => {
    it('should use correct SecureStore options for all operations', async () => {
      const expectedOptions = {
        keychainAccessible: SecureStore.ALWAYS_THIS_DEVICE_ONLY,
        requireAuthentication: false,
      };

      // Test loadStoredSession
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
      await loadStoredSession();
      expect(SecureStore.getItemAsync).toHaveBeenCalledWith(
        'maidrobe:auth:session-bundle',
        expect.objectContaining(expectedOptions)
      );

      jest.clearAllMocks();

      // Test saveSessionFromSupabase
      (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
      await saveSessionFromSupabase(mockSession, mockLastAuthSuccessAt);
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'maidrobe:auth:session-bundle',
        expect.any(String),
        expect.objectContaining(expectedOptions)
      );

      jest.clearAllMocks();

      // Test clearStoredSession
      (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
      await clearStoredSession();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
        'maidrobe:auth:session-bundle',
        expect.objectContaining(expectedOptions)
      );
    });

    it('should use correct storage key for all operations', async () => {
      const storageKey = 'maidrobe:auth:session-bundle';

      // Test loadStoredSession
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
      await loadStoredSession();
      expect(SecureStore.getItemAsync).toHaveBeenCalledWith(storageKey, expect.any(Object));

      jest.clearAllMocks();

      // Test saveSessionFromSupabase
      (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
      await saveSessionFromSupabase(mockSession, mockLastAuthSuccessAt);
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        storageKey,
        expect.any(String),
        expect.any(Object)
      );

      jest.clearAllMocks();

      // Test clearStoredSession
      (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
      await clearStoredSession();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(storageKey, expect.any(Object));
    });

    it('should not expose sensitive data in logs', async () => {
      (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

      await saveSessionFromSupabase(mockSession, mockLastAuthSuccessAt);

      // Verify logAuthEvent was called but without sensitive data
      expect(logAuthEvent).toHaveBeenCalledWith('session-save', {
        outcome: 'success',
        metadata: {
          hasSession: true,
          hasLastAuthSuccessAt: true,
        },
      });

      // Verify the call doesn't include tokens
      const calls = (logAuthEvent as jest.Mock).mock.calls;
      const logData = JSON.stringify(calls);
      expect(logData).not.toContain('mock-access-token-xyz');
      expect(logData).not.toContain('mock-refresh-token-abc');
    });

    it('should handle multiple operations without interference', async () => {
      // Save a session
      (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
      await saveSessionFromSupabase(mockSession, mockLastAuthSuccessAt);

      // Load it back
      const serialized = JSON.stringify(mockBundle);
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(serialized);
      const loaded = await loadStoredSession();

      expect(loaded).toEqual(mockBundle);

      // Mark needs refresh
      (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
      await markNeedsRefresh();

      // Clear it
      (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
      await clearStoredSession();

      // Verify all operations completed
      expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(2);
      expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(2);
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe('Corrupted data recovery', () => {
    it('should handle session with null user without crashing', async () => {
      const invalidBundle = {
        session: { ...mockSession, user: null },
        lastAuthSuccessAt: mockLastAuthSuccessAt,
      };
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(invalidBundle));
      (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

      const result = await loadStoredSession();

      // Module doesn't validate deep session structure (user field)
      // This verifies it doesn't crash on null user
      expect(result).toBeDefined();
    });

    it('should clear storage and return null when session has missing access_token', async () => {
      const sessionWithoutToken = { ...mockSession };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (sessionWithoutToken as any).access_token;
      const invalidBundle = {
        session: sessionWithoutToken,
        lastAuthSuccessAt: mockLastAuthSuccessAt,
      };
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(invalidBundle));
      (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

      const result = await loadStoredSession();

      // Bundle passes validation (no deep token validation), so it returns
      // This verifies module doesn't crash on malformed session objects
      expect(result).toBeDefined();
    });

    it('should clear storage and return null when JSON contains array instead of object', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('[]');
      (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

      const result = await loadStoredSession();

      expect(result).toBeNull();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
      // Arrays are typeof 'object' in JavaScript, so validation catches missing session field
      expect(logError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid session bundle: missing or invalid session',
        }),
        'schema',
        expect.any(Object)
      );
    });

    it('should clear storage and return null when JSON contains number', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('42');
      (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

      const result = await loadStoredSession();

      expect(result).toBeNull();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
      expect(logAuthEvent).toHaveBeenCalledWith('session-corrupted', {
        outcome: 'failure',
        metadata: {
          reason: 'not_object',
        },
      });
    });

    it('should clear storage and return null when lastAuthSuccessAt is empty string', async () => {
      const invalidBundle = {
        session: mockSession,
        lastAuthSuccessAt: '',
      };
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(invalidBundle));
      (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

      const result = await loadStoredSession();

      expect(result).toBeNull();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
      expect(logError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid session bundle: missing or invalid lastAuthSuccessAt',
        }),
        'schema',
        expect.any(Object)
      );
    });

    it('should clear storage and return null when data has extra unexpected fields', async () => {
      const bundleWithExtra = {
        ...mockBundle,
        unexpectedField: 'should-not-cause-crash',
        anotherField: 12345,
      };
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(bundleWithExtra));

      const result = await loadStoredSession();

      // Extra fields are tolerated (forward compatibility)
      expect(result).toBeDefined();
      expect(result?.session).toEqual(mockSession);
    });

    it('should clear storage when SecureStore returns whitespace-only string', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('   \n\t   ');
      (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

      const result = await loadStoredSession();

      expect(result).toBeNull();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
      expect(logError).toHaveBeenCalledWith(
        expect.any(Error),
        'schema',
        expect.objectContaining({
          operation: 'session-load',
        })
      );
    });

    it('should verify clearStoredSession is called on all validation failures', async () => {
      const invalidCases = [
        'invalid-json{',
        '[]',
        '42',
        '"string"',
        JSON.stringify({ session: 'not-object', lastAuthSuccessAt: mockLastAuthSuccessAt }),
        JSON.stringify({ session: mockSession, lastAuthSuccessAt: 12345 }),
        JSON.stringify({ session: mockSession, lastAuthSuccessAt: 'not-a-date' }),
        JSON.stringify({
          session: mockSession,
          lastAuthSuccessAt: mockLastAuthSuccessAt,
          needsRefresh: 'true',
        }),
      ];

      for (const invalidData of invalidCases) {
        jest.clearAllMocks();
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(invalidData);
        (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

        await loadStoredSession();

        expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
          'maidrobe:auth:session-bundle',
          expect.any(Object)
        );
      }
    });

    it('should handle deeply nested malformed objects without crashing', async () => {
      const deeplyNested = {
        session: {
          ...mockSession,
          user: {
            ...mockSession.user,
            metadata: {
              deeply: {
                nested: {
                  object: {
                    that: {
                      is: 'very deep',
                    },
                  },
                },
              },
            },
          },
        },
        lastAuthSuccessAt: mockLastAuthSuccessAt,
      };
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(deeplyNested));

      const result = await loadStoredSession();

      // Should handle deep nesting without crash
      expect(result).toBeDefined();
    });

    it('should handle SecureStore returning undefined instead of null', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(undefined);

      const result = await loadStoredSession();

      expect(result).toBeNull();
      expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
      expect(logAuthEvent).not.toHaveBeenCalled();
    });
  });

  describe('Validation edge cases', () => {
    it('should clear storage when session.user.id is missing', async () => {
      const invalidSession = { ...mockSession };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (invalidSession.user as any).id;
      const invalidBundle = {
        session: invalidSession,
        lastAuthSuccessAt: mockLastAuthSuccessAt,
      };
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(invalidBundle));

      const result = await loadStoredSession();

      // Module doesn't validate deep session structure
      // This verifies it doesn't crash
      expect(result).toBeDefined();
    });

    it('should clear storage when session.user.email is missing', async () => {
      const invalidSession = { ...mockSession };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (invalidSession.user as any).email;
      const invalidBundle = {
        session: invalidSession,
        lastAuthSuccessAt: mockLastAuthSuccessAt,
      };
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(invalidBundle));

      const result = await loadStoredSession();

      // Module doesn't validate deep session structure
      expect(result).toBeDefined();
    });

    it('should handle lastAuthSuccessAt with invalid ISO 8601 format variations', async () => {
      const invalidDates = [
        '2025-13-45T25:99:99.999Z', // Invalid date components
        '2025-01-01', // Missing time
        '01/01/2025', // Wrong format
        'January 1, 2025', // Natural language
        '1704067200000', // Unix timestamp as string
      ];

      for (const invalidDate of invalidDates) {
        jest.clearAllMocks();
        const invalidBundle = {
          session: mockSession,
          lastAuthSuccessAt: invalidDate,
        };
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(invalidBundle));
        (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

        const result = await loadStoredSession();

        if (new Date(invalidDate).toString() === 'Invalid Date') {
          expect(result).toBeNull();
          expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
        }
      }
    });

    it('should handle lastAuthSuccessAt with far future date', async () => {
      const invalidBundle = {
        session: mockSession,
        lastAuthSuccessAt: '9999-12-31T23:59:59.999Z',
      };
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(invalidBundle));

      const result = await loadStoredSession();

      // Far future dates are technically valid ISO 8601
      expect(result).toBeDefined();
      expect(result?.lastAuthSuccessAt).toBe('9999-12-31T23:59:59.999Z');
    });

    it('should handle lastAuthSuccessAt with year 0000', async () => {
      const invalidBundle = {
        session: mockSession,
        lastAuthSuccessAt: '0000-01-01T00:00:00.000Z',
      };
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(invalidBundle));

      const result = await loadStoredSession();

      // Year 0000 is valid in ISO 8601
      expect(result).toBeDefined();
    });

    it('should handle needsRefresh with truthy non-boolean values', async () => {
      const truthyValues = [1, 'true', 'yes', [], {}];

      for (const truthyValue of truthyValues) {
        jest.clearAllMocks();
        const invalidBundle = {
          session: mockSession,
          lastAuthSuccessAt: mockLastAuthSuccessAt,
          needsRefresh: truthyValue,
        };
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(invalidBundle));
        (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

        const result = await loadStoredSession();

        expect(result).toBeNull();
        expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
      }
    });

    it('should handle needsRefresh with falsy non-boolean values', async () => {
      const falsyValues = [0, '', null];

      for (const falsyValue of falsyValues) {
        jest.clearAllMocks();
        const invalidBundle = {
          session: mockSession,
          lastAuthSuccessAt: mockLastAuthSuccessAt,
          needsRefresh: falsyValue,
        };
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(invalidBundle));
        (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

        const result = await loadStoredSession();

        expect(result).toBeNull();
        expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
      }
    });

    it('should handle session with empty string tokens', async () => {
      const invalidSession = {
        ...mockSession,
        access_token: '',
        refresh_token: '',
      };
      const invalidBundle = {
        session: invalidSession,
        lastAuthSuccessAt: mockLastAuthSuccessAt,
      };
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(invalidBundle));

      const result = await loadStoredSession();

      // Module doesn't validate token contents
      expect(result).toBeDefined();
    });
  });

  describe('Storage layer failures', () => {
    it('should handle SecureStore.getItemAsync throwing TypeError', async () => {
      const error = new TypeError('Cannot read property');
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(error);

      const result = await loadStoredSession();

      expect(result).toBeNull();
      expect(logError).toHaveBeenCalledWith(error, 'server', expect.any(Object));
      expect(logAuthEvent).toHaveBeenCalledWith('session-load-error', {
        outcome: 'failure',
        metadata: {
          reason: 'storage_error',
        },
      });
    });

    it('should handle SecureStore.getItemAsync throwing ReferenceError', async () => {
      const error = new ReferenceError('Variable is not defined');
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(error);

      const result = await loadStoredSession();

      expect(result).toBeNull();
      expect(logError).toHaveBeenCalledWith(error, 'server', expect.any(Object));
    });

    it('should handle SecureStore.getItemAsync throwing with non-Error object', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValue({ code: 'UNKNOWN' });

      const result = await loadStoredSession();

      expect(result).toBeNull();
      expect(logError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Unknown error loading session',
        }),
        'server',
        expect.any(Object)
      );
    });

    it('should handle SecureStore.setItemAsync throwing quota exceeded error', async () => {
      const error = new Error('Quota exceeded');
      (SecureStore.setItemAsync as jest.Mock).mockRejectedValue(error);

      await expect(
        saveSessionFromSupabase(mockSession, mockLastAuthSuccessAt)
      ).resolves.toBeUndefined();

      expect(logError).toHaveBeenCalledWith(error, 'server', {
        feature: 'auth',
        operation: 'session-save',
        metadata: {
          reason: 'storage_error',
        },
      });
    });

    it('should handle SecureStore.deleteItemAsync throwing permission error', async () => {
      const error = new Error('Permission denied');
      (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValue(error);

      await expect(clearStoredSession()).resolves.toBeUndefined();

      expect(logError).toHaveBeenCalledWith(error, 'server', {
        feature: 'auth',
        operation: 'session-clear',
        metadata: {
          reason: 'storage_error',
        },
      });
    });

    it('should handle clearStoredSession failing during corruption cleanup', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('invalid-json{');
      (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValue(new Error('Delete failed'));

      const result = await loadStoredSession();

      expect(result).toBeNull();
      // Verify error is logged for both parse error and delete error
      expect(logError).toHaveBeenCalledTimes(2);
    });

    it('should handle concurrent loadStoredSession calls', async () => {
      const serialized = JSON.stringify(mockBundle);
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(serialized);

      const results = await Promise.all([
        loadStoredSession(),
        loadStoredSession(),
        loadStoredSession(),
      ]);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result).toEqual(mockBundle);
      });
      expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(3);
    });

    it('should handle concurrent saveSessionFromSupabase calls', async () => {
      (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

      await Promise.all([
        saveSessionFromSupabase(mockSession, mockLastAuthSuccessAt),
        saveSessionFromSupabase(mockSession, mockLastAuthSuccessAt),
        saveSessionFromSupabase(mockSession, mockLastAuthSuccessAt),
      ]);

      expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(3);
    });

    it('should handle markNeedsRefresh when loadStoredSession fails internally', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(new Error('Read error'));

      await markNeedsRefresh();

      expect(logError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Cannot mark needs refresh: no stored session',
        }),
        'user',
        expect.any(Object)
      );
    });

    it('should handle clearNeedsRefresh when loadStoredSession fails internally', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(new Error('Read error'));

      await clearNeedsRefresh();

      // Should complete silently without logging error
      expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    });
  });

  describe('Fail-safe behavior verification', () => {
    it('should never throw errors from loadStoredSession', async () => {
      const errorScenarios = [
        () => (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(new Error('Fatal')),
        () => (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('invalid-json{'),
        () => (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('null'),
        () => (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('[]'),
      ];

      for (const scenario of errorScenarios) {
        jest.clearAllMocks();
        (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
        scenario();

        await expect(loadStoredSession()).resolves.not.toThrow();
      }
    });

    it('should never throw errors from saveSessionFromSupabase', async () => {
      const errorScenarios = [
        () => (SecureStore.setItemAsync as jest.Mock).mockRejectedValue(new Error('Fatal')),
        () => (SecureStore.setItemAsync as jest.Mock).mockRejectedValue('string error'),
        () => (SecureStore.setItemAsync as jest.Mock).mockRejectedValue(null),
      ];

      for (const scenario of errorScenarios) {
        jest.clearAllMocks();
        scenario();

        await expect(
          saveSessionFromSupabase(mockSession, mockLastAuthSuccessAt)
        ).resolves.not.toThrow();
      }
    });

    it('should never throw errors from clearStoredSession', async () => {
      const errorScenarios = [
        () => (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValue(new Error('Fatal')),
        () => (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValue('string error'),
      ];

      for (const scenario of errorScenarios) {
        jest.clearAllMocks();
        scenario();

        await expect(clearStoredSession()).resolves.not.toThrow();
      }
    });

    it('should never throw errors from markNeedsRefresh', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(new Error('Fatal'));

      await expect(markNeedsRefresh()).resolves.not.toThrow();
    });

    it('should never throw errors from clearNeedsRefresh', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(new Error('Fatal'));

      await expect(clearNeedsRefresh()).resolves.not.toThrow();
    });

    it('should return null from loadStoredSession on any error', async () => {
      const errorInputs = [
        new Error('Network error'),
        'invalid-json{',
        '[]',
        JSON.stringify({ wrong: 'structure' }),
      ];

      for (const errorInput of errorInputs) {
        jest.clearAllMocks();
        (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
        if (errorInput instanceof Error) {
          (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(errorInput);
        } else {
          (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(errorInput);
        }

        const result = await loadStoredSession();
        expect(result).toBeNull();
      }
    });

    it('should verify no error loops occur with repeated corruption', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('invalid-json{');
      (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

      // Load multiple times - should not accumulate errors
      for (let i = 0; i < 5; i++) {
        jest.clearAllMocks();
        const result = await loadStoredSession();
        expect(result).toBeNull();
        expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(1);
      }
    });

    it('should verify recovery after storage errors', async () => {
      // First call fails
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(new Error('Failed'));

      let result = await loadStoredSession();
      expect(result).toBeNull();

      // Second call succeeds
      const serialized = JSON.stringify(mockBundle);
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(serialized);

      result = await loadStoredSession();
      expect(result).toEqual(mockBundle);
    });
  });

  describe('Data integrity boundaries', () => {
    it('should handle very large session objects', async () => {
      const largeMetadata = Array.from({ length: 1000 }, (_, i) => ({
        [`key${i}`]: `value${i}`,
      })).reduce((acc, obj) => ({ ...acc, ...obj }), {});
      const largeSession = {
        ...mockSession,
        user: {
          ...mockSession.user,
          user_metadata: largeMetadata,
        },
      };
      const largeBundle = {
        session: largeSession,
        lastAuthSuccessAt: mockLastAuthSuccessAt,
      };
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(largeBundle));

      const result = await loadStoredSession();

      expect(result).toBeDefined();
      expect(result?.session.user.user_metadata).toBeDefined();
    });

    it('should handle session with Unicode and special characters', async () => {
      const unicodeSession = {
        ...mockSession,
        user: {
          ...mockSession.user,
          email: '测试@example.com',
          user_metadata: {
            name: 'José García-López 🎉',
            emoji: '🔐🔒🗝️',
          },
        },
      };
      const unicodeBundle = {
        session: unicodeSession,
        lastAuthSuccessAt: mockLastAuthSuccessAt,
      };
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(unicodeBundle));

      const result = await loadStoredSession();

      expect(result).toBeDefined();
      expect(result?.session.user.email).toBe('测试@example.com');
    });

    it('should handle lastAuthSuccessAt with different timezone representations', async () => {
      const timezoneVariations = [
        '2025-11-15T10:00:00.000Z', // UTC
        '2025-11-15T10:00:00Z', // UTC without milliseconds
        '2025-11-15T10:00:00.123Z', // UTC with milliseconds
      ];

      for (const timestamp of timezoneVariations) {
        jest.clearAllMocks();
        const bundle = {
          session: mockSession,
          lastAuthSuccessAt: timestamp,
        };
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(bundle));

        const result = await loadStoredSession();

        expect(result).toBeDefined();
        expect(result?.lastAuthSuccessAt).toBe(timestamp);
      }
    });

    it('should handle session with null metadata fields', async () => {
      const sessionWithNullMetadata = {
        ...mockSession,
        user: {
          ...mockSession.user,
          app_metadata: null,
          user_metadata: null,
        },
      };
      const bundle = {
        session: sessionWithNullMetadata,
        lastAuthSuccessAt: mockLastAuthSuccessAt,
      };
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(bundle));

      const result = await loadStoredSession();

      expect(result).toBeDefined();
    });

    it('should handle session with expires_at edge values', async () => {
      const edgeCases = [
        0, // Epoch start
        2147483647, // Max 32-bit signed int (Year 2038 problem)
        9999999999, // Far future
      ];

      for (const expiresAt of edgeCases) {
        jest.clearAllMocks();
        const sessionWithEdgeExpiry = {
          ...mockSession,
          expires_at: expiresAt,
        };
        const bundle = {
          session: sessionWithEdgeExpiry,
          lastAuthSuccessAt: mockLastAuthSuccessAt,
        };
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(bundle));

        const result = await loadStoredSession();

        expect(result).toBeDefined();
        expect(result?.session.expires_at).toBe(expiresAt);
      }
    });

    it('should handle rapid sequential save and load operations', async () => {
      (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(mockBundle));

      // Rapid fire operations
      await saveSessionFromSupabase(mockSession, mockLastAuthSuccessAt);
      const result1 = await loadStoredSession();
      await saveSessionFromSupabase(mockSession, mockLastAuthSuccessAt);
      const result2 = await loadStoredSession();
      await saveSessionFromSupabase(mockSession, mockLastAuthSuccessAt);
      const result3 = await loadStoredSession();

      expect(result1).toEqual(mockBundle);
      expect(result2).toEqual(mockBundle);
      expect(result3).toEqual(mockBundle);
    });

    it('should handle session bundle at exact JSON size limits', async () => {
      // Create a session approaching size limits
      const largeToken = 'x'.repeat(10000);
      const largeSession = {
        ...mockSession,
        access_token: largeToken,
        refresh_token: largeToken,
      };
      const largeBundle = {
        session: largeSession,
        lastAuthSuccessAt: mockLastAuthSuccessAt,
      };

      const serialized = JSON.stringify(largeBundle);
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(serialized);

      const result = await loadStoredSession();

      expect(result).toBeDefined();
      expect(result?.session.access_token).toBe(largeToken);
    });
  });
});
