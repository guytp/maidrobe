/**
 * Unit tests for wear history repository functions.
 *
 * Tests cover:
 * - createOrUpdateWearEvent: Insert, update (upsert), validation
 * - getWearHistoryForUser: Pagination, sorting, error handling
 * - getWearHistoryForWindow: Date range queries, validation
 *
 * @module features/wearHistory/api/wearHistoryRepository.test
 */

import {
  createOrUpdateWearEvent,
  getWearHistoryForUser,
  getWearHistoryForWindow,
  WearHistoryError,
} from './wearHistoryRepository';
import { supabase } from '../../../services/supabase';
import type { WearHistoryRow, WearHistorySource } from '../types';

// Mock the Supabase client
jest.mock('../../../services/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

describe('wearHistoryRepository', () => {
  // Common test data
  const validUserId = '550e8400-e29b-41d4-a716-446655440000';
  const validOutfitId = '660e8400-e29b-41d4-a716-446655440001';
  const validItemIds = [
    '770e8400-e29b-41d4-a716-446655440002',
    '880e8400-e29b-41d4-a716-446655440003',
  ];
  const validWornDate = '2024-12-03';

  const mockWearHistoryRow: WearHistoryRow = {
    id: '990e8400-e29b-41d4-a716-446655440004',
    user_id: validUserId,
    outfit_id: validOutfitId,
    item_ids: validItemIds,
    worn_date: validWornDate,
    worn_at: '2024-12-03T10:30:00.000Z',
    context: 'Client meeting',
    source: 'ai_recommendation',
    notes: 'Great outfit choice',
    created_at: '2024-12-03T10:30:00.000Z',
    updated_at: '2024-12-03T10:30:00.000Z',
  };

  // Mock chain builders
  let mockUpsert: jest.Mock;
  let mockSelect: jest.Mock;
  let mockSingle: jest.Mock;
  let mockEq: jest.Mock;
  let mockGte: jest.Mock;
  let mockLte: jest.Mock;
  let mockOrder: jest.Mock;
  let mockOrderSecond: jest.Mock;
  let mockRange: jest.Mock;
  let mockFrom: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock chain
    mockSingle = jest.fn();
    mockRange = jest.fn();
    // Second order call (for worn_at) returns range or final result
    mockOrderSecond = jest.fn(() => ({ range: mockRange }));
    // First order call (for worn_date) returns second order
    mockOrder = jest.fn(() => ({ order: mockOrderSecond, range: mockRange }));
    mockLte = jest.fn(() => ({ order: mockOrder }));
    mockGte = jest.fn(() => ({ lte: mockLte }));
    mockEq = jest.fn(() => ({ order: mockOrder, gte: mockGte }));
    mockSelect = jest.fn(() => ({ eq: mockEq, single: mockSingle }));
    mockUpsert = jest.fn(() => ({ select: mockSelect }));
    mockFrom = jest.fn(() => ({
      upsert: mockUpsert,
      select: mockSelect,
    }));

    (supabase.from as jest.Mock) = mockFrom;
  });

  describe('createOrUpdateWearEvent', () => {
    describe('successful operations', () => {
      it('should create a new wear event', async () => {
        mockSingle.mockResolvedValue({ data: mockWearHistoryRow, error: null });

        const result = await createOrUpdateWearEvent(
          validUserId,
          validOutfitId,
          validWornDate,
          {
            item_ids: validItemIds,
            source: 'ai_recommendation',
            context: 'Client meeting',
            notes: 'Great outfit choice',
          }
        );

        expect(mockFrom).toHaveBeenCalledWith('wear_history');
        expect(mockUpsert).toHaveBeenCalledWith(
          expect.objectContaining({
            user_id: validUserId,
            outfit_id: validOutfitId,
            worn_date: validWornDate,
            item_ids: validItemIds,
            source: 'ai_recommendation',
            context: 'Client meeting',
            notes: 'Great outfit choice',
          }),
          {
            onConflict: 'user_id,outfit_id,worn_date',
            ignoreDuplicates: false,
          }
        );
        expect(result).toEqual(mockWearHistoryRow);
      });

      it('should update existing wear event on conflict (upsert)', async () => {
        const updatedRow = {
          ...mockWearHistoryRow,
          context: 'Updated context',
          updated_at: '2024-12-03T14:00:00.000Z',
        };
        mockSingle.mockResolvedValue({ data: updatedRow, error: null });

        const result = await createOrUpdateWearEvent(
          validUserId,
          validOutfitId,
          validWornDate,
          {
            item_ids: validItemIds,
            source: 'saved_outfit',
            context: 'Updated context',
          }
        );

        expect(mockUpsert).toHaveBeenCalledWith(
          expect.objectContaining({
            context: 'Updated context',
            source: 'saved_outfit',
          }),
          expect.any(Object)
        );
        expect(result.context).toBe('Updated context');
      });

      it('should use current timestamp if worn_at not provided', async () => {
        mockSingle.mockResolvedValue({ data: mockWearHistoryRow, error: null });

        await createOrUpdateWearEvent(validUserId, validOutfitId, validWornDate, {
          item_ids: validItemIds,
          source: 'manual_outfit',
        });

        expect(mockUpsert).toHaveBeenCalledWith(
          expect.objectContaining({
            worn_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
          }),
          expect.any(Object)
        );
      });

      it('should set context and notes to null if not provided', async () => {
        mockSingle.mockResolvedValue({ data: mockWearHistoryRow, error: null });

        await createOrUpdateWearEvent(validUserId, validOutfitId, validWornDate, {
          item_ids: validItemIds,
          source: 'imported',
        });

        expect(mockUpsert).toHaveBeenCalledWith(
          expect.objectContaining({
            context: null,
            notes: null,
          }),
          expect.any(Object)
        );
      });

      it('should accept all valid source types', async () => {
        const sources: WearHistorySource[] = [
          'ai_recommendation',
          'saved_outfit',
          'manual_outfit',
          'imported',
        ];

        for (const source of sources) {
          mockSingle.mockResolvedValue({ data: mockWearHistoryRow, error: null });

          await createOrUpdateWearEvent(
            validUserId,
            validOutfitId,
            validWornDate,
            {
              item_ids: validItemIds,
              source,
            }
          );

          expect(mockUpsert).toHaveBeenCalledWith(
            expect.objectContaining({ source }),
            expect.any(Object)
          );

          jest.clearAllMocks();
          (supabase.from as jest.Mock) = mockFrom;
        }
      });
    });

    describe('validation errors', () => {
      it('should throw validation error for invalid user ID', async () => {
        await expect(
          createOrUpdateWearEvent('invalid-uuid', validOutfitId, validWornDate, {
            item_ids: validItemIds,
            source: 'ai_recommendation',
          })
        ).rejects.toThrow(WearHistoryError);

        await expect(
          createOrUpdateWearEvent('invalid-uuid', validOutfitId, validWornDate, {
            item_ids: validItemIds,
            source: 'ai_recommendation',
          })
        ).rejects.toMatchObject({
          code: 'validation',
          message: 'Invalid user ID',
        });
      });

      it('should throw validation error for empty user ID', async () => {
        await expect(
          createOrUpdateWearEvent('', validOutfitId, validWornDate, {
            item_ids: validItemIds,
            source: 'ai_recommendation',
          })
        ).rejects.toMatchObject({
          code: 'validation',
          message: 'Invalid user ID',
        });
      });

      it('should throw validation error for invalid outfit ID', async () => {
        await expect(
          createOrUpdateWearEvent(validUserId, 'not-a-uuid', validWornDate, {
            item_ids: validItemIds,
            source: 'ai_recommendation',
          })
        ).rejects.toMatchObject({
          code: 'validation',
          message: 'Invalid outfit ID',
        });
      });

      it('should throw validation error for invalid date format', async () => {
        await expect(
          createOrUpdateWearEvent(validUserId, validOutfitId, '12-03-2024', {
            item_ids: validItemIds,
            source: 'ai_recommendation',
          })
        ).rejects.toMatchObject({
          code: 'validation',
          message: 'Invalid worn date format (expected YYYY-MM-DD)',
        });
      });

      it('should throw validation error for invalid date value', async () => {
        await expect(
          createOrUpdateWearEvent(validUserId, validOutfitId, '2024-13-45', {
            item_ids: validItemIds,
            source: 'ai_recommendation',
          })
        ).rejects.toMatchObject({
          code: 'validation',
          message: 'Invalid worn date format (expected YYYY-MM-DD)',
        });
      });

      it('should throw validation error for empty item_ids', async () => {
        await expect(
          createOrUpdateWearEvent(validUserId, validOutfitId, validWornDate, {
            item_ids: [],
            source: 'ai_recommendation',
          })
        ).rejects.toMatchObject({
          code: 'validation',
          message: 'item_ids cannot be empty',
        });
      });

      it('should throw validation error for invalid item ID in array', async () => {
        await expect(
          createOrUpdateWearEvent(validUserId, validOutfitId, validWornDate, {
            item_ids: [validItemIds[0], 'bad-uuid'],
            source: 'ai_recommendation',
          })
        ).rejects.toMatchObject({
          code: 'validation',
          message: 'Invalid item ID: bad-uuid',
        });
      });

      it('should throw validation error for missing source', async () => {
        await expect(
          createOrUpdateWearEvent(validUserId, validOutfitId, validWornDate, {
            item_ids: validItemIds,
            source: '' as WearHistorySource,
          })
        ).rejects.toMatchObject({
          code: 'validation',
          message: 'source is required',
        });
      });

      it('should throw validation error for invalid source', async () => {
        await expect(
          createOrUpdateWearEvent(validUserId, validOutfitId, validWornDate, {
            item_ids: validItemIds,
            source: 'invalid_source' as WearHistorySource,
          })
        ).rejects.toMatchObject({
          code: 'validation',
          message: 'Invalid source: invalid_source',
        });
      });
    });

    describe('error handling', () => {
      it('should throw WearHistoryError on Supabase error', async () => {
        const supabaseError = new Error('Database connection failed');
        mockSingle.mockResolvedValue({ data: null, error: supabaseError });

        await expect(
          createOrUpdateWearEvent(validUserId, validOutfitId, validWornDate, {
            item_ids: validItemIds,
            source: 'ai_recommendation',
          })
        ).rejects.toThrow(WearHistoryError);
      });

      it('should classify network errors correctly', async () => {
        const networkError = new Error('Network request failed');
        mockSingle.mockResolvedValue({ data: null, error: networkError });

        await expect(
          createOrUpdateWearEvent(validUserId, validOutfitId, validWornDate, {
            item_ids: validItemIds,
            source: 'ai_recommendation',
          })
        ).rejects.toMatchObject({
          code: 'network',
        });
      });

      it('should classify auth errors correctly', async () => {
        const authError = new Error('JWT token expired');
        mockSingle.mockResolvedValue({ data: null, error: authError });

        await expect(
          createOrUpdateWearEvent(validUserId, validOutfitId, validWornDate, {
            item_ids: validItemIds,
            source: 'ai_recommendation',
          })
        ).rejects.toMatchObject({
          code: 'auth',
        });
      });

      it('should throw error when no data returned', async () => {
        mockSingle.mockResolvedValue({ data: null, error: null });

        await expect(
          createOrUpdateWearEvent(validUserId, validOutfitId, validWornDate, {
            item_ids: validItemIds,
            source: 'ai_recommendation',
          })
        ).rejects.toMatchObject({
          code: 'server',
          message: 'No data returned from upsert operation',
        });
      });
    });
  });

  describe('getWearHistoryForUser', () => {
    beforeEach(() => {
      // Reset for paginated query chain
      mockRange.mockResolvedValue({
        data: [mockWearHistoryRow],
        error: null,
        count: 1,
      });
    });

    describe('successful queries', () => {
      it('should fetch wear history with default pagination', async () => {
        const result = await getWearHistoryForUser(validUserId);

        expect(mockFrom).toHaveBeenCalledWith('wear_history');
        expect(mockSelect).toHaveBeenCalledWith(
          expect.any(String),
          { count: 'exact' }
        );
        expect(mockEq).toHaveBeenCalledWith('user_id', validUserId);
        expect(mockOrder).toHaveBeenCalledWith('worn_date', { ascending: false });
        expect(mockOrderSecond).toHaveBeenCalledWith('worn_at', { ascending: false });
        expect(mockRange).toHaveBeenCalledWith(0, 19); // Default: offset 0, limit 20

        expect(result).toEqual({
          events: [mockWearHistoryRow],
          total: 1,
          hasMore: false,
        });
      });

      it('should apply custom limit and offset', async () => {
        await getWearHistoryForUser(validUserId, { limit: 10, offset: 20 });

        expect(mockRange).toHaveBeenCalledWith(20, 29); // offset 20, limit 10
      });

      it('should calculate hasMore correctly when more items exist', async () => {
        mockRange.mockResolvedValue({
          data: [mockWearHistoryRow],
          error: null,
          count: 50, // More items exist
        });

        const result = await getWearHistoryForUser(validUserId, { limit: 20 });

        expect(result.hasMore).toBe(true);
        expect(result.total).toBe(50);
      });

      it('should calculate hasMore correctly when no more items', async () => {
        mockRange.mockResolvedValue({
          data: [mockWearHistoryRow],
          error: null,
          count: 1,
        });

        const result = await getWearHistoryForUser(validUserId);

        expect(result.hasMore).toBe(false);
      });

      it('should return empty array when no events exist', async () => {
        mockRange.mockResolvedValue({
          data: [],
          error: null,
          count: 0,
        });

        const result = await getWearHistoryForUser(validUserId);

        expect(result).toEqual({
          events: [],
          total: 0,
          hasMore: false,
        });
      });
    });

    describe('validation errors', () => {
      it('should throw validation error for invalid user ID', async () => {
        await expect(
          getWearHistoryForUser('not-a-uuid')
        ).rejects.toMatchObject({
          code: 'validation',
          message: 'Invalid user ID',
        });
      });

      it('should throw validation error for limit out of range', async () => {
        await expect(
          getWearHistoryForUser(validUserId, { limit: 0 })
        ).rejects.toMatchObject({
          code: 'validation',
          message: 'limit must be between 1 and 100',
        });

        await expect(
          getWearHistoryForUser(validUserId, { limit: 101 })
        ).rejects.toMatchObject({
          code: 'validation',
          message: 'limit must be between 1 and 100',
        });
      });

      it('should throw validation error for negative offset', async () => {
        await expect(
          getWearHistoryForUser(validUserId, { offset: -1 })
        ).rejects.toMatchObject({
          code: 'validation',
          message: 'offset must be non-negative',
        });
      });
    });

    describe('error handling', () => {
      it('should throw WearHistoryError on Supabase error', async () => {
        mockRange.mockResolvedValue({
          data: null,
          error: new Error('Database error'),
          count: null,
        });

        await expect(getWearHistoryForUser(validUserId)).rejects.toThrow(
          WearHistoryError
        );
      });
    });
  });

  describe('getWearHistoryForWindow', () => {
    const fromDate = '2024-11-01';
    const toDate = '2024-12-03';

    beforeEach(() => {
      // Reset for window query chain - second order returns final result
      mockOrderSecond.mockResolvedValue({
        data: [mockWearHistoryRow],
        error: null,
      });
    });

    describe('successful queries', () => {
      it('should fetch wear history within date range', async () => {
        const result = await getWearHistoryForWindow(
          validUserId,
          fromDate,
          toDate
        );

        expect(mockFrom).toHaveBeenCalledWith('wear_history');
        expect(mockEq).toHaveBeenCalledWith('user_id', validUserId);
        expect(mockGte).toHaveBeenCalledWith('worn_date', fromDate);
        expect(mockLte).toHaveBeenCalledWith('worn_date', toDate);
        expect(mockOrder).toHaveBeenCalledWith('worn_date', { ascending: false });
        expect(mockOrderSecond).toHaveBeenCalledWith('worn_at', { ascending: false });

        expect(result).toEqual({
          events: [mockWearHistoryRow],
        });
      });

      it('should accept same date for from and to (single day)', async () => {
        const sameDate = '2024-12-03';

        const result = await getWearHistoryForWindow(
          validUserId,
          sameDate,
          sameDate
        );

        expect(mockGte).toHaveBeenCalledWith('worn_date', sameDate);
        expect(mockLte).toHaveBeenCalledWith('worn_date', sameDate);
        expect(result.events).toHaveLength(1);
      });

      it('should return empty array when no events in range', async () => {
        mockOrderSecond.mockResolvedValue({
          data: [],
          error: null,
        });

        const result = await getWearHistoryForWindow(
          validUserId,
          fromDate,
          toDate
        );

        expect(result.events).toEqual([]);
      });
    });

    describe('validation errors', () => {
      it('should throw validation error for invalid user ID', async () => {
        await expect(
          getWearHistoryForWindow('bad-uuid', fromDate, toDate)
        ).rejects.toMatchObject({
          code: 'validation',
          message: 'Invalid user ID',
        });
      });

      it('should throw validation error for invalid fromDate format', async () => {
        await expect(
          getWearHistoryForWindow(validUserId, '12/01/2024', toDate)
        ).rejects.toMatchObject({
          code: 'validation',
          message: 'Invalid fromDate format (expected YYYY-MM-DD)',
        });
      });

      it('should throw validation error for invalid toDate format', async () => {
        await expect(
          getWearHistoryForWindow(validUserId, fromDate, 'December 3, 2024')
        ).rejects.toMatchObject({
          code: 'validation',
          message: 'Invalid toDate format (expected YYYY-MM-DD)',
        });
      });

      it('should throw validation error when fromDate is after toDate', async () => {
        await expect(
          getWearHistoryForWindow(validUserId, '2024-12-15', '2024-12-01')
        ).rejects.toMatchObject({
          code: 'validation',
          message: 'fromDate must be before or equal to toDate',
        });
      });
    });

    describe('error handling', () => {
      it('should throw WearHistoryError on Supabase error', async () => {
        mockOrderSecond.mockResolvedValue({
          data: null,
          error: new Error('Query failed'),
        });

        await expect(
          getWearHistoryForWindow(validUserId, fromDate, toDate)
        ).rejects.toThrow(WearHistoryError);
      });

      it('should classify connection errors as network', async () => {
        mockOrderSecond.mockResolvedValue({
          data: null,
          error: new Error('Connection refused'),
        });

        await expect(
          getWearHistoryForWindow(validUserId, fromDate, toDate)
        ).rejects.toMatchObject({
          code: 'network',
        });
      });
    });
  });

  describe('WearHistoryError', () => {
    it('should have correct name property', () => {
      const error = new WearHistoryError('Test error', 'server');
      expect(error.name).toBe('WearHistoryError');
    });

    it('should store original error', () => {
      const originalError = new Error('Original');
      const error = new WearHistoryError('Wrapped', 'server', originalError);
      expect(error.originalError).toBe(originalError);
    });

    it('should be instanceof Error', () => {
      const error = new WearHistoryError('Test', 'validation');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(WearHistoryError);
    });
  });
});
