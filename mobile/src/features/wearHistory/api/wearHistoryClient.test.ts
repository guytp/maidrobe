/**
 * Tests for wearHistoryClient module.
 *
 * Tests cover:
 * - createOrUpdateWearEventForClient function
 * - Query key factory
 * - Error handling and classification
 * - Utility functions (getTodayDateString, validateWearDate)
 *
 * @module features/wearHistory/api/wearHistoryClient.test
 */

import {
  createOrUpdateWearEventForClient,
  wearHistoryQueryKey,
  WearHistoryClientError,
  getTodayDateString,
  validateWearDate,
  type CreateWearEventForClientPayload,
} from './wearHistoryClient';
import { createOrUpdateWearEvent, WearHistoryError } from './wearHistoryRepository';
import type { WearHistoryRow } from '../types';

// Mock only the createOrUpdateWearEvent function, not the WearHistoryError class
jest.mock('./wearHistoryRepository', () => {
  const actual = jest.requireActual('./wearHistoryRepository');
  return {
    ...actual,
    createOrUpdateWearEvent: jest.fn(),
  };
});

const mockCreateOrUpdateWearEvent = createOrUpdateWearEvent as jest.MockedFunction<
  typeof createOrUpdateWearEvent
>;

describe('wearHistoryClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('wearHistoryQueryKey', () => {
    it('should generate correct base key', () => {
      expect(wearHistoryQueryKey.all).toEqual(['wear-history']);
    });

    it('should generate correct user key', () => {
      const userId = 'user-123';
      expect(wearHistoryQueryKey.user(userId)).toEqual(['wear-history', userId]);
    });

    it('should generate correct paginated key with page', () => {
      const userId = 'user-123';
      expect(wearHistoryQueryKey.userPaginated(userId, 2)).toEqual([
        'wear-history',
        userId,
        { page: 2 },
      ]);
    });

    it('should generate correct paginated key without page (defaults to 0)', () => {
      const userId = 'user-123';
      expect(wearHistoryQueryKey.userPaginated(userId)).toEqual([
        'wear-history',
        userId,
        { page: 0 },
      ]);
    });

    it('should generate correct window key', () => {
      const userId = 'user-123';
      const fromDate = '2024-12-01';
      const toDate = '2024-12-07';
      expect(wearHistoryQueryKey.window(userId, fromDate, toDate)).toEqual([
        'wear-history',
        userId,
        'window',
        fromDate,
        toDate,
      ]);
    });

    it('should generate correct outfit+date key', () => {
      const userId = 'user-123';
      const outfitId = 'outfit-456';
      const wornDate = '2024-12-03';
      expect(wearHistoryQueryKey.forOutfitDate(userId, outfitId, wornDate)).toEqual([
        'wear-history',
        userId,
        'outfit',
        outfitId,
        wornDate,
      ]);
    });
  });

  describe('WearHistoryClientError', () => {
    it('should create error with correct properties', () => {
      const error = new WearHistoryClientError('Test message', 'network', true);

      expect(error.message).toBe('Test message');
      expect(error.code).toBe('network');
      expect(error.isRetryable).toBe(true);
      expect(error.name).toBe('WearHistoryClientError');
    });

    it('should create error from repository network error', () => {
      const repositoryError = new WearHistoryError('Connection failed', 'network');
      const clientError = WearHistoryClientError.fromRepositoryError(repositoryError);

      expect(clientError.code).toBe('network');
      expect(clientError.isRetryable).toBe(true);
      expect(clientError.originalError).toBe(repositoryError);
    });

    it('should create error from repository auth error', () => {
      const repositoryError = new WearHistoryError('Unauthorized', 'auth');
      const clientError = WearHistoryClientError.fromRepositoryError(repositoryError);

      expect(clientError.code).toBe('auth');
      expect(clientError.isRetryable).toBe(false);
    });

    it('should create error from repository validation error', () => {
      const repositoryError = new WearHistoryError('Invalid date', 'validation');
      const clientError = WearHistoryClientError.fromRepositoryError(repositoryError);

      expect(clientError.code).toBe('validation');
      expect(clientError.isRetryable).toBe(false);
      expect(clientError.message).toBe('Invalid date'); // Preserves original message
    });

    it('should create error from repository server error', () => {
      const repositoryError = new WearHistoryError('Database error', 'server');
      const clientError = WearHistoryClientError.fromRepositoryError(repositoryError);

      expect(clientError.code).toBe('server');
      expect(clientError.isRetryable).toBe(true);
    });

    it('should create error from unknown error', () => {
      const unknownError = new Error('Something went wrong');
      const clientError = WearHistoryClientError.fromUnknown(unknownError);

      expect(clientError.code).toBe('server');
      expect(clientError.isRetryable).toBe(true);
    });

    it('should detect network-like errors from unknown errors', () => {
      const networkError = new Error('Network request failed');
      const clientError = WearHistoryClientError.fromUnknown(networkError);

      expect(clientError.code).toBe('network');
      expect(clientError.isRetryable).toBe(true);
    });

    it('should return same error if already WearHistoryClientError', () => {
      const original = new WearHistoryClientError('Test', 'validation', false);
      const result = WearHistoryClientError.fromUnknown(original);

      expect(result).toBe(original);
    });
  });

  describe('createOrUpdateWearEventForClient', () => {
    const validPayload: CreateWearEventForClientPayload = {
      userId: '550e8400-e29b-41d4-a716-446655440000',
      outfitId: '550e8400-e29b-41d4-a716-446655440001',
      itemIds: ['550e8400-e29b-41d4-a716-446655440002'],
      wornDate: '2024-12-03',
      source: 'ai_recommendation',
    };

    const mockWearHistoryRow: WearHistoryRow = {
      id: '550e8400-e29b-41d4-a716-446655440003',
      user_id: validPayload.userId,
      outfit_id: validPayload.outfitId,
      item_ids: validPayload.itemIds,
      worn_date: validPayload.wornDate,
      worn_at: '2024-12-03T10:00:00Z',
      context: null,
      source: 'ai_recommendation',
      notes: null,
      created_at: '2024-12-03T10:00:00Z',
      updated_at: '2024-12-03T10:00:00Z',
    };

    describe('successful operations', () => {
      it('should return success result on successful creation', async () => {
        mockCreateOrUpdateWearEvent.mockResolvedValue(mockWearHistoryRow);

        const result = await createOrUpdateWearEventForClient(validPayload);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual(mockWearHistoryRow);
          expect(result.isUpdate).toBe(false); // created_at === updated_at
        }
      });

      it('should detect update when timestamps differ', async () => {
        const updatedRow: WearHistoryRow = {
          ...mockWearHistoryRow,
          updated_at: '2024-12-03T11:00:00Z', // Different from created_at
        };
        mockCreateOrUpdateWearEvent.mockResolvedValue(updatedRow);

        const result = await createOrUpdateWearEventForClient(validPayload);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.isUpdate).toBe(true);
        }
      });

      it('should pass optional context to repository', async () => {
        mockCreateOrUpdateWearEvent.mockResolvedValue(mockWearHistoryRow);

        await createOrUpdateWearEventForClient({
          ...validPayload,
          context: 'Work meeting',
        });

        expect(mockCreateOrUpdateWearEvent).toHaveBeenCalledWith(
          validPayload.userId,
          validPayload.outfitId,
          validPayload.wornDate,
          expect.objectContaining({
            context: 'Work meeting',
          })
        );
      });

      it('should pass wornAt to repository', async () => {
        mockCreateOrUpdateWearEvent.mockResolvedValue(mockWearHistoryRow);
        const wornAt = '2024-12-03T15:30:00Z';

        await createOrUpdateWearEventForClient({
          ...validPayload,
          wornAt,
        });

        expect(mockCreateOrUpdateWearEvent).toHaveBeenCalledWith(
          validPayload.userId,
          validPayload.outfitId,
          validPayload.wornDate,
          expect.objectContaining({
            worn_at: wornAt,
          })
        );
      });
    });

    describe('validation errors', () => {
      it('should return failure for missing userId', async () => {
        const result = await createOrUpdateWearEventForClient({
          ...validPayload,
          userId: '',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('auth');
          expect(result.error.isRetryable).toBe(false);
        }
      });

      it('should return failure for missing outfitId', async () => {
        const result = await createOrUpdateWearEventForClient({
          ...validPayload,
          outfitId: '',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('validation');
        }
      });

      it('should return failure for empty itemIds', async () => {
        const result = await createOrUpdateWearEventForClient({
          ...validPayload,
          itemIds: [],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('validation');
          expect(result.error.message).toContain('at least one item');
        }
      });

      it('should return failure for missing wornDate', async () => {
        const result = await createOrUpdateWearEventForClient({
          ...validPayload,
          wornDate: '',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('validation');
        }
      });

      it('should return failure for missing source', async () => {
        const result = await createOrUpdateWearEventForClient({
          ...validPayload,
          source: '' as 'ai_recommendation',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('validation');
        }
      });
    });

    describe('error handling', () => {
      it('should convert repository errors to client errors', async () => {
        const repositoryError = new WearHistoryError('Database error', 'server');
        mockCreateOrUpdateWearEvent.mockRejectedValue(repositoryError);

        const result = await createOrUpdateWearEventForClient(validPayload);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('server');
          expect(result.error.isRetryable).toBe(true);
        }
      });

      it('should handle network errors', async () => {
        const networkError = new WearHistoryError('Network failed', 'network');
        mockCreateOrUpdateWearEvent.mockRejectedValue(networkError);

        const result = await createOrUpdateWearEventForClient(validPayload);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('network');
          expect(result.error.isRetryable).toBe(true);
        }
      });

      it('should handle unknown errors', async () => {
        mockCreateOrUpdateWearEvent.mockRejectedValue(new Error('Unknown'));

        const result = await createOrUpdateWearEventForClient(validPayload);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.isRetryable).toBe(true);
        }
      });
    });
  });

  describe('getTodayDateString', () => {
    it('should return date in YYYY-MM-DD format', () => {
      const result = getTodayDateString();

      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should return current date', () => {
      const result = getTodayDateString();
      const now = new Date();
      const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      expect(result).toBe(expected);
    });
  });

  describe('validateWearDate', () => {
    // Use a fixed "today" for consistent testing
    const originalDate = Date;

    beforeAll(() => {
      // Mock Date to return consistent "today"
      const mockToday = new Date('2024-12-03T12:00:00Z');
      jest.spyOn(global, 'Date').mockImplementation((value?: unknown) => {
        if (value !== undefined) {
          return new originalDate(value as string);
        }
        return mockToday;
      });
    });

    afterAll(() => {
      jest.restoreAllMocks();
    });

    it('should accept today', () => {
      const result = validateWearDate('2024-12-03');
      expect(result.isValid).toBe(true);
    });

    it('should accept yesterday', () => {
      const result = validateWearDate('2024-12-02');
      expect(result.isValid).toBe(true);
    });

    it('should accept date 30 days ago', () => {
      const result = validateWearDate('2024-11-03');
      expect(result.isValid).toBe(true);
    });

    it('should reject date more than 30 days ago', () => {
      const result = validateWearDate('2024-11-02');
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain('30 days');
    });

    it('should reject future dates', () => {
      const result = validateWearDate('2024-12-04');
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain('future');
    });

    it('should reject invalid date format', () => {
      const result = validateWearDate('12-03-2024');
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain('Invalid date format');
    });

    it('should reject invalid date values', () => {
      const result = validateWearDate('2024-13-45');
      expect(result.isValid).toBe(false);
    });
  });
});
