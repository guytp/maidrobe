/**
 * Unit tests for useCreateItemWithImage hook - Happy Path.
 *
 * Tests the complete happy path flow for item creation with image upload,
 * covering all 8 steps: connectivity check, token refresh, UUID generation,
 * image preparation, upload, database insert, pipeline triggering, and
 * cache invalidation.
 *
 * @module __tests__/wardrobe/hooks/useCreateItemWithImage
 */

import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';
import {
  useCreateItemWithImage,
  type CreateItemInput,
  type CreateItemResult,
  CreateItemWithImageError,
} from '../../../src/features/wardrobe/hooks/useCreateItemWithImage';
import { supabase } from '../../../src/services/supabase';
import * as telemetry from '../../../src/core/telemetry';
import * as imageUpload from '../../../src/features/wardrobe/utils/imageUpload';
import { EDGE_FUNCTIONS } from '../../../src/features/wardrobe/constants';
import NetInfo from '@react-native-community/netinfo';
import { ItemType } from '../../../src/features/onboarding/types/itemMetadata';

// Mock dependencies
jest.mock('../../../src/services/supabase', () => ({
  supabase: {
    auth: {
      refreshSession: jest.fn(),
    },
    from: jest.fn(),
    functions: {
      invoke: jest.fn(),
    },
  },
}));

jest.mock('@react-native-community/netinfo');

jest.mock('../../../src/core/telemetry', () => ({
  logSuccess: jest.fn(),
  logError: jest.fn(),
  trackCaptureEvent: jest.fn(),
  logAuthEvent: jest.fn(),
}));

jest.mock('../../../src/features/wardrobe/utils/imageUpload', () => ({
  prepareImageForUpload: jest.fn(),
  uploadImageToStorage: jest.fn(),
  generateStoragePath: jest.fn(),
}));

jest.mock('../../../src/core/state/store', () => ({
  useStore: jest.fn((selector) =>
    selector({
      user: { id: 'test-user-123' },
    })
  ),
}));

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  })),
}));

// Mock crypto.getRandomValues for predictable UUIDs in tests
const mockRandomBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
global.crypto = {
  getRandomValues: jest.fn((array: Uint8Array) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = mockRandomBytes[i];
    }
    return array;
  }),
} as unknown as Crypto;

describe('useCreateItemWithImage - Happy Path', () => {
  let queryClient: QueryClient;

  const mockSupabase = supabase as jest.Mocked<typeof supabase>;
  const mockNetInfo = NetInfo as jest.Mocked<typeof NetInfo>;
  const mockTelemetry = telemetry as jest.Mocked<typeof telemetry>;
  const mockImageUpload = imageUpload as jest.Mocked<typeof imageUpload>;

  const mockUser = { id: 'test-user-123' };
  const mockTimestamp = 1234567890000;
  const mockItemId = '000004d2-04d2-7101-8203-040506070809';
  const mockStoragePath = `user/${mockUser.id}/items/${mockItemId}/original.jpg`;

  const mockInput: CreateItemInput = {
    imageUri: 'file:///test-image.jpg',
    imageWidth: 1920,
    imageHeight: 1080,
    name: 'Test Item',
    tags: ['Casual', 'Summer'],
  };

  const mockPreparedImage = {
    uri: 'file:///processed-image.jpg',
    width: 1600,
    height: 900,
    fileSize: 1500000,
  };

  const mockDbItem = {
    id: mockItemId,
    user_id: mockUser.id,
    name: 'Test Item',
    tags: ['casual', 'summer'],
    original_key: mockStoragePath,
    image_processing_status: 'pending',
    attribute_status: 'pending',
    created_at: '2024-01-01T00:00:00Z',
  };

  const mockSession = {
    access_token: 'mock-token',
    refresh_token: 'mock-refresh-token',
    user: mockUser,
  };

  beforeEach(() => {
    // Create fresh QueryClient for each test
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    // Reset all mocks
    jest.clearAllMocks();

    // Mock Date.now for predictable timestamps
    jest.spyOn(Date, 'now').mockReturnValue(mockTimestamp);

    // Setup default successful mocks
    (mockNetInfo.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    });

    (mockSupabase.auth.refreshSession as jest.Mock).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    (mockImageUpload.generateStoragePath as jest.Mock).mockReturnValue(mockStoragePath);
    (mockImageUpload.prepareImageForUpload as jest.Mock).mockResolvedValue(mockPreparedImage);
    (mockImageUpload.uploadImageToStorage as jest.Mock).mockResolvedValue(undefined);

    const mockSingle = jest.fn().mockResolvedValue({
      data: mockDbItem,
      error: null,
    });

    const mockSelect = jest.fn().mockReturnValue({
      single: mockSingle,
    });

    const mockUpsert = jest.fn().mockReturnValue({
      select: mockSelect,
    });

    (mockSupabase.from as jest.Mock).mockReturnValue({
      upsert: mockUpsert,
    });

    (mockSupabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: null,
      error: null,
    });
  });

  afterEach(() => {
    queryClient.clear();
    jest.restoreAllMocks();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  describe('initial state', () => {
    it('starts with correct default values', () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
      expect(result.current.result).toBe(null);
      expect(typeof result.current.save).toBe('function');
      expect(typeof result.current.reset).toBe('function');
    });
  });

  describe('successful save flow', () => {
    it('completes full save flow with correct state updates', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      let saveResult: CreateItemResult | undefined;

      await act(async () => {
        saveResult = await result.current.save(mockInput);
      });

      // Should have completed successfully
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
      expect(result.current.result).not.toBe(null);
      expect(saveResult).toBeDefined();
      expect(saveResult?.item.id).toBe(mockItemId);
      expect(saveResult?.item.name).toBe('Test Item');
      expect(saveResult?.item.tags).toEqual(['casual', 'summer']);
    });

    it('checks connectivity before starting save', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      await act(async () => {
        await result.current.save(mockInput);
      });

      expect(mockNetInfo.fetch).toHaveBeenCalledTimes(1);
    });

    it('performs token refresh before any writes (AC13)', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      await act(async () => {
        await result.current.save(mockInput);
      });

      // Token refresh should be called before image processing
      expect(mockSupabase.auth.refreshSession).toHaveBeenCalledTimes(1);

      // Verify it was called before image preparation
      const refreshCallOrder = (mockSupabase.auth.refreshSession as jest.Mock).mock
        .invocationCallOrder[0];
      const prepareCallOrder = (mockImageUpload.prepareImageForUpload as jest.Mock).mock
        .invocationCallOrder[0];
      expect(refreshCallOrder).toBeLessThan(prepareCallOrder);
    });

    it('logs token refresh success with correct metadata', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      await act(async () => {
        await result.current.save(mockInput);
      });

      expect(mockTelemetry.logAuthEvent).toHaveBeenCalledWith('token-refresh-success', {
        userId: mockUser.id,
        outcome: 'success',
        latency: expect.any(Number),
        metadata: {
          context: 'item_save',
          operation: 'pre_save_refresh',
        },
      });
    });

    it('generates valid UUIDv7 with cryptographic randomness', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      await act(async () => {
        await result.current.save(mockInput);
      });

      // Verify crypto.getRandomValues was called
      expect(global.crypto.getRandomValues).toHaveBeenCalledWith(expect.any(Uint8Array));
      const callArg = (global.crypto.getRandomValues as jest.Mock).mock.calls[0][0];
      expect(callArg.length).toBe(10);

      // Verify generateStoragePath was called with generated ID
      expect(mockImageUpload.generateStoragePath).toHaveBeenCalledWith(
        mockUser.id,
        expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
        )
      );
    });

    it('prepares and uploads image with correct parameters', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      await act(async () => {
        await result.current.save(mockInput);
      });

      // Verify image preparation
      expect(mockImageUpload.prepareImageForUpload).toHaveBeenCalledWith(
        mockInput.imageUri,
        mockInput.imageWidth,
        mockInput.imageHeight
      );

      // Verify image upload
      expect(mockImageUpload.uploadImageToStorage).toHaveBeenCalledWith(
        mockPreparedImage,
        mockStoragePath
      );
    });

    it('creates database record with correct structure', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      await act(async () => {
        await result.current.save(mockInput);
      });

      expect(mockSupabase.from).toHaveBeenCalledWith('items');

      // Get the upsert mock to check what was passed
      const fromMock = mockSupabase.from('items') as unknown as { upsert: jest.Mock };
      expect(fromMock.upsert).toHaveBeenCalledWith(
        {
          id: expect.stringMatching(/^[0-9a-f-]+$/),
          user_id: mockUser.id,
          name: 'Test Item',
          tags: ['casual', 'summer'], // Should be normalized to lowercase
          original_key: mockStoragePath,
          image_processing_status: 'pending',
          attribute_status: 'pending',
        },
        { onConflict: 'id' }
      );
    });

    it('normalizes tags to lowercase in database insert', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      await act(async () => {
        await result.current.save(mockInput);
      });

      const fromMock = mockSupabase.from('items') as unknown as { upsert: jest.Mock };
      const upsertCall = fromMock.upsert.mock.calls[0][0];
      expect(upsertCall.tags).toEqual(['casual', 'summer']);
    });

    it('trims item name before saving', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      const inputWithWhitespace = {
        ...mockInput,
        name: '  Test Item  ',
      };

      await act(async () => {
        await result.current.save(inputWithWhitespace);
      });

      const fromMock = mockSupabase.from('items') as unknown as { upsert: jest.Mock };
      const upsertCall = fromMock.upsert.mock.calls[0][0];
      expect(upsertCall.name).toBe('Test Item');
    });

    it('handles empty name by setting to null', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      const inputWithEmptyName = {
        ...mockInput,
        name: '   ',
      };

      await act(async () => {
        await result.current.save(inputWithEmptyName);
      });

      const fromMock = mockSupabase.from('items') as unknown as { upsert: jest.Mock };
      const upsertCall = fromMock.upsert.mock.calls[0][0];
      expect(upsertCall.name).toBe(null);
    });

    it('handles empty tags by setting to null', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      const inputWithNoTags = {
        ...mockInput,
        tags: [],
      };

      await act(async () => {
        await result.current.save(inputWithNoTags);
      });

      const fromMock = mockSupabase.from('items') as unknown as { upsert: jest.Mock };
      const upsertCall = fromMock.upsert.mock.calls[0][0];
      expect(upsertCall.tags).toBe(null);
    });

    it('triggers both background pipelines without awaiting', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      await act(async () => {
        await result.current.save(mockInput);
      });

      // Both Edge Functions should be invoked
      expect(mockSupabase.functions.invoke).toHaveBeenCalledTimes(2);

      // Check image processing pipeline
      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith(
        EDGE_FUNCTIONS.PROCESS_ITEM_IMAGE,
        {
          body: { itemId: expect.any(String) },
        }
      );

      // Check classification pipeline
      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith(EDGE_FUNCTIONS.CLASSIFY_ITEM, {
        body: { itemId: expect.any(String) },
      });
    });

    it('uses EDGE_FUNCTIONS constants for pipeline names', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      await act(async () => {
        await result.current.save(mockInput);
      });

      const invokeCalls = (mockSupabase.functions.invoke as jest.Mock).mock.calls;
      const functionNames = invokeCalls.map((call: string[]) => call[0]);

      expect(functionNames).toContain('process-item-image');
      expect(functionNames).toContain('classify-item');
    });

    it('does not fail save if pipeline triggers fail', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      // Make pipeline invocations reject
      (mockSupabase.functions.invoke as jest.Mock).mockRejectedValue(new Error('Pipeline error'));

      await act(async () => {
        await result.current.save(mockInput);
      });

      // Save should still succeed
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
      expect(result.current.result).not.toBe(null);
    });

    it('invalidates React Query caches for wardrobe items', async () => {
      const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      await act(async () => {
        await result.current.save(mockInput);
      });

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['wardrobe', 'items', mockUser.id],
      });

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['onboarding', 'hasWardrobeItems', mockUser.id],
      });
    });

    it('emits save_started telemetry event', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      await act(async () => {
        await result.current.save(mockInput);
      });

      expect(mockTelemetry.logSuccess).toHaveBeenCalledWith('wardrobe', 'item_save_started', {
        data: {
          userId: mockUser.id,
          hasName: true,
          tagCount: 2,
        },
      });
    });

    it('emits save_succeeded telemetry event with latency', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      await act(async () => {
        await result.current.save(mockInput);
      });

      expect(mockTelemetry.logSuccess).toHaveBeenCalledWith('wardrobe', 'item_save_succeeded', {
        latency: expect.any(Number),
        data: {
          itemId: expect.any(String),
          userId: mockUser.id,
          hasName: true,
          tagCount: 2,
          latencyMs: expect.any(Number),
        },
      });
    });

    it('does not emit failure telemetry on success', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      await act(async () => {
        await result.current.save(mockInput);
      });

      expect(mockTelemetry.trackCaptureEvent).not.toHaveBeenCalled();
      expect(mockTelemetry.logError).not.toHaveBeenCalled();
    });

    it('returns created item with correct structure', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      let saveResult: CreateItemResult | undefined;

      await act(async () => {
        saveResult = await result.current.save(mockInput);
      });

      expect(saveResult).toEqual({
        item: {
          id: mockItemId,
          userId: mockUser.id,
          photos: [mockStoragePath],
          type: ItemType.Top,
          colour: [],
          name: 'Test Item',
          tags: ['casual', 'summer'],
          createdAt: '2024-01-01T00:00:00Z',
        },
      });
    });

    it('updates hook state with result', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      await act(async () => {
        await result.current.save(mockInput);
      });

      expect(result.current.result).toEqual({
        item: expect.objectContaining({
          id: mockItemId,
          userId: mockUser.id,
          name: 'Test Item',
        }),
      });
    });

    it('clears cached itemId after successful save', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      // First save
      await act(async () => {
        await result.current.save(mockInput);
      });

      // Clear mocks
      jest.clearAllMocks();

      // Second save should generate new ID (crypto.getRandomValues called again)
      await act(async () => {
        await result.current.save(mockInput);
      });

      // crypto.getRandomValues should be called again for new ID
      expect(global.crypto.getRandomValues).toHaveBeenCalled();
    });

    it('executes all steps in correct order', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      await act(async () => {
        await result.current.save(mockInput);
      });

      const callOrder = {
        connectivity: (mockNetInfo.fetch as jest.Mock).mock.invocationCallOrder[0],
        tokenRefresh: (mockSupabase.auth.refreshSession as jest.Mock).mock.invocationCallOrder[0],
        imagePrepare: (mockImageUpload.prepareImageForUpload as jest.Mock).mock
          .invocationCallOrder[0],
        imageUpload: (mockImageUpload.uploadImageToStorage as jest.Mock).mock
          .invocationCallOrder[0],
        dbInsert: (mockSupabase.from as jest.Mock).mock.invocationCallOrder[0],
      };

      // Verify order
      expect(callOrder.connectivity).toBeLessThan(callOrder.tokenRefresh);
      expect(callOrder.tokenRefresh).toBeLessThan(callOrder.imagePrepare);
      expect(callOrder.imagePrepare).toBeLessThan(callOrder.imageUpload);
      expect(callOrder.imageUpload).toBeLessThan(callOrder.dbInsert);
    });
  });

  describe('reset functionality', () => {
    it('clears error state', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      // Create an error by making connectivity fail
      (mockNetInfo.fetch as jest.Mock).mockResolvedValueOnce({
        isConnected: false,
        isInternetReachable: false,
      });

      await act(async () => {
        try {
          await result.current.save(mockInput);
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.error).not.toBe(null);

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.error).toBe(null);
    });

    it('clears result state', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      await act(async () => {
        await result.current.save(mockInput);
      });

      expect(result.current.result).not.toBe(null);

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.result).toBe(null);
    });
  });

  describe('single-flight semantics', () => {
    it('prevents concurrent save operations', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      // Make first save slow
      mockImageUpload.prepareImageForUpload.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockPreparedImage), 100))
      );

      // Start first save
      const firstSave = act(async () => {
        return result.current.save(mockInput);
      });

      // Try to start second save immediately
      await act(async () => {
        try {
          await result.current.save(mockInput);
          fail('Should have thrown validation error');
        } catch (err) {
          expect(err).toBeInstanceOf(CreateItemWithImageError);
          expect((err as CreateItemWithImageError).errorType).toBe('validation');
          expect((err as CreateItemWithImageError).message).toBe('Save already in progress');
        }
      });

      // Wait for first save to complete
      await firstSave;
    });
  });

  describe('idempotent itemId generation', () => {
    it('generates new itemId for each independent save', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      // First save
      await act(async () => {
        await result.current.save(mockInput);
      });

      const firstCallCount = (global.crypto.getRandomValues as jest.Mock).mock.calls.length;

      // Second save
      await act(async () => {
        await result.current.save(mockInput);
      });

      const secondCallCount = (global.crypto.getRandomValues as jest.Mock).mock.calls.length;

      // Should have called getRandomValues twice (once per save)
      expect(secondCallCount).toBeGreaterThan(firstCallCount);
    });
  });
});
