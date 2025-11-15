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
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
          JSON.stringify(invalidBundle)
        );
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
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
          JSON.stringify(invalidBundle)
        );
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
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
          JSON.stringify(invalidBundle)
        );
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
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
          JSON.stringify(invalidBundle)
        );
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
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
          JSON.stringify(invalidBundle)
        );
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
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
          JSON.stringify(invalidBundle)
        );
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
      expect(SecureStore.getItemAsync).toHaveBeenCalledWith(
        storageKey,
        expect.any(Object)
      );

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
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
        storageKey,
        expect.any(Object)
      );
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
});
