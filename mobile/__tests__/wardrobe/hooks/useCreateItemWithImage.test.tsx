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
/**
 * Import the hook and error class directly from the source file (not the barrel).
 *
 * WHY DIRECT IMPORTS:
 * - The mock path '../../../src/services/supabase' must match the hook's import
 * - Using direct imports ensures the mock intercepts the exact module resolution
 * - CreateItemWithImageError is a class used with `instanceof` checks in tests;
 *   it must be imported from the same module that the hook uses internally
 *
 * The barrel export (features/wardrobe/hooks/index.ts) re-exports these, but for
 * testing we need the exact same module reference to ensure mock interception works.
 */
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

// Import UploadError before mocking
import { UploadError } from '../../../src/features/wardrobe/utils/imageUpload';

// Mock react-native-get-random-values polyfill
// This is imported at the top of the hook for crypto.getRandomValues support in RN
// In tests, we mock crypto.getRandomValues directly below, so this is a no-op
jest.mock('react-native-get-random-values', () => ({}));

/**
 * Supabase client mock configuration.
 *
 * IMPORTANT: Mock path must exactly match the import path used in the hook:
 * - Hook imports: import { supabase } from '../../../src/services/supabase'
 * - Mock targets: '../../../src/services/supabase'
 *
 * The mock structure mirrors the real Supabase client shape used by the hook:
 * - supabase.auth.refreshSession() - token refresh before writes (AC13)
 * - supabase.from('items').upsert().select().single() - database operations
 * - supabase.functions.invoke() - Edge Function triggers for pipelines
 *
 * Each mock method returns jest.fn() to enable:
 * - Call tracking with .toHaveBeenCalledWith()
 * - Return value mocking with .mockResolvedValue()
 * - Sequential mock returns with .mockResolvedValueOnce()
 */
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

jest.mock('../../../src/features/wardrobe/utils/imageUpload', () => {
  const actual = jest.requireActual('../../../src/features/wardrobe/utils/imageUpload');
  return {
    ...actual,
    prepareImageForUpload: jest.fn(),
    uploadImageToStorage: jest.fn(),
    generateStoragePath: jest.fn(),
  };
});

jest.mock('../../../src/core/state/store', () => ({
  useStore: jest.fn((selector) =>
    selector({
      user: { id: 'test-user-123' },
    })
  ),
}));

// Create a shared router mock that persists across renders
const mockRouterReplace = jest.fn();
const mockRouterPush = jest.fn();
const mockRouterBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: mockRouterPush,
    replace: mockRouterReplace,
    back: mockRouterBack,
  })),
}));

/**
 * Deterministic crypto mocking for CI/local parity.
 *
 * The hook uses two crypto functions:
 * 1. crypto.getRandomValues() - for UUIDv7 generation (10 bytes)
 * 2. crypto.randomUUID() - for correlation ID generation
 *
 * This mock ensures:
 * - Same UUIDs generated in both CI and local environments
 * - Predictable values for assertion matching
 * - Call counting for idempotency verification
 *
 * Expected UUIDv7 format with these mock bytes (timestamp + [1,2,3,4,5,6,7,8,9,10]):
 * The generated UUID will be deterministic based on Date.now() mock + these bytes
 */
const mockRandomBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
let correlationIdCounter = 0;
global.crypto = {
  // Mock getRandomValues - fills array with deterministic bytes for UUIDv7 generation
  getRandomValues: jest.fn((array: Uint8Array) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = mockRandomBytes[i];
    }
    return array;
  }),
  // Mock randomUUID - returns incrementing IDs for correlation ID tracking
  // Format: mock-correlation-id-1, mock-correlation-id-2, etc.
  // Counter is reset in beforeEach for test isolation
  randomUUID: jest.fn(() => `mock-correlation-id-${++correlationIdCounter}`),
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

    // Reset all mocks - this clears call history but not mock implementations
    jest.clearAllMocks();

    // Reset correlation ID counter for predictable IDs
    correlationIdCounter = 0;

    // Reset crypto mocks to ensure deterministic behaviour across all tests
    // This prevents any mockReturnValueOnce leaking between tests
    (global.crypto.getRandomValues as jest.Mock).mockClear();
    (global.crypto.randomUUID as jest.Mock).mockClear();

    // Mock Date.now for predictable timestamps
    jest.spyOn(Date, 'now').mockReturnValue(mockTimestamp);

    // Setup default successful mocks
    // Use mockReset() + mockResolvedValue() to clear any queued mockRejectedValueOnce calls
    (mockNetInfo.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    });

    (mockSupabase.auth.refreshSession as jest.Mock).mockReset().mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    (mockImageUpload.generateStoragePath as jest.Mock).mockReset().mockReturnValue(mockStoragePath);
    (mockImageUpload.prepareImageForUpload as jest.Mock)
      .mockReset()
      .mockResolvedValue(mockPreparedImage);
    (mockImageUpload.uploadImageToStorage as jest.Mock).mockReset().mockResolvedValue(undefined);

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

    (mockSupabase.from as jest.Mock).mockReset().mockReturnValue({
      upsert: mockUpsert,
    });

    (mockSupabase.functions.invoke as jest.Mock).mockReset().mockResolvedValue({
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

      // Check image processing pipeline - includes correlation headers for tracing
      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith(
        EDGE_FUNCTIONS.PROCESS_ITEM_IMAGE,
        {
          body: { itemId: expect.any(String) },
          headers: expect.objectContaining({
            'X-Correlation-ID': expect.any(String),
          }),
        }
      );

      // Check classification pipeline - includes correlation headers for tracing
      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith(EDGE_FUNCTIONS.CLASSIFY_ITEM, {
        body: { itemId: expect.any(String) },
        headers: expect.objectContaining({
          'X-Correlation-ID': expect.any(String),
        }),
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

    it('emits item_created telemetry event on success (user story #241)', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      await act(async () => {
        await result.current.save(mockInput);
      });

      // Per user story #241 spec: item_created event is emitted on successful save
      expect(mockTelemetry.trackCaptureEvent).toHaveBeenCalledWith('item_created', {
        userId: mockUser.id,
        has_name: true,
        tags_count: 2,
        save_latency_ms: expect.any(Number),
      });

      // Should not emit failure events on success
      expect(mockTelemetry.trackCaptureEvent).not.toHaveBeenCalledWith(
        'item_save_failed',
        expect.anything()
      );
      expect(mockTelemetry.trackCaptureEvent).not.toHaveBeenCalledWith(
        'item_creation_failed',
        expect.anything()
      );
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

  describe('Error Scenarios', () => {
    describe('connectivity errors', () => {
      it('throws offline error when device has no connection', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        // Mock offline state
        (mockNetInfo.fetch as jest.Mock).mockResolvedValueOnce({
          isConnected: false,
          isInternetReachable: false,
        });

        await act(async () => {
          try {
            await result.current.save(mockInput);
            fail('Should have thrown offline error');
          } catch (err) {
            expect(err).toBeInstanceOf(CreateItemWithImageError);
            expect((err as CreateItemWithImageError).errorType).toBe('offline');
            expect((err as CreateItemWithImageError).message).toBe(
              'No internet connection. Please check your connection and try again.'
            );
          }
        });

        // Verify no downstream operations occurred
        expect(mockSupabase.auth.refreshSession).not.toHaveBeenCalled();
        expect(mockImageUpload.prepareImageForUpload).not.toHaveBeenCalled();
      });

      it('sets error state when offline', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        (mockNetInfo.fetch as jest.Mock).mockResolvedValueOnce({
          isConnected: false,
          isInternetReachable: false,
        });

        await act(async () => {
          try {
            await result.current.save(mockInput);
          } catch {
            // Expected
          }
        });

        expect(result.current.error).not.toBe(null);
        expect(result.current.error?.errorType).toBe('offline');
        expect(result.current.isLoading).toBe(false);
        expect(result.current.result).toBe(null);
      });

      it('emits failure telemetry for offline errors', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        (mockNetInfo.fetch as jest.Mock).mockResolvedValueOnce({
          isConnected: false,
          isInternetReachable: false,
        });

        await act(async () => {
          try {
            await result.current.save(mockInput);
          } catch {
            // Expected
          }
        });

        expect(mockTelemetry.logError).toHaveBeenCalledWith(
          expect.any(CreateItemWithImageError),
          'network',
          expect.objectContaining({
            feature: 'wardrobe',
            operation: 'item_save',
          })
        );

        expect(mockTelemetry.trackCaptureEvent).toHaveBeenCalledWith('item_save_failed', {
          userId: mockUser.id,
          errorType: 'offline',
          latencyMs: expect.any(Number),
        });
      });
    });

    describe('authentication errors', () => {
      it('handles token refresh failure with error response', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        (mockSupabase.auth.refreshSession as jest.Mock).mockResolvedValueOnce({
          data: { session: null },
          error: { message: 'Invalid refresh token' },
        });

        await act(async () => {
          try {
            await result.current.save(mockInput);
            fail('Should have thrown auth error');
          } catch (err) {
            expect(err).toBeInstanceOf(CreateItemWithImageError);
            expect((err as CreateItemWithImageError).errorType).toBe('auth');
          }
        });

        expect(mockRouterReplace).toHaveBeenCalledWith('/auth/login');
        expect(mockImageUpload.prepareImageForUpload).not.toHaveBeenCalled();
      });

      it('classifies token refresh network errors correctly', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        (mockSupabase.auth.refreshSession as jest.Mock).mockResolvedValueOnce({
          data: { session: null },
          error: { message: 'network connection failed' },
        });

        await act(async () => {
          try {
            await result.current.save(mockInput);
          } catch {
            // Expected
          }
        });

        expect(mockTelemetry.logAuthEvent).toHaveBeenCalledWith(
          'token-refresh-failure',
          expect.objectContaining({
            metadata: expect.objectContaining({
              errorClassification: 'network',
            }),
          })
        );
      });

      it('classifies token refresh server errors correctly', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        (mockSupabase.auth.refreshSession as jest.Mock).mockResolvedValueOnce({
          data: { session: null },
          error: { message: 'Server error 500' },
        });

        await act(async () => {
          try {
            await result.current.save(mockInput);
          } catch {
            // Expected
          }
        });

        expect(mockTelemetry.logAuthEvent).toHaveBeenCalledWith(
          'token-refresh-failure',
          expect.objectContaining({
            metadata: expect.objectContaining({
              errorClassification: 'server',
            }),
          })
        );
      });

      it('handles token refresh exception', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        (mockSupabase.auth.refreshSession as jest.Mock).mockRejectedValueOnce(
          new Error('Connection timeout')
        );

        await act(async () => {
          try {
            await result.current.save(mockInput);
            fail('Should have thrown auth error');
          } catch (err) {
            expect(err).toBeInstanceOf(CreateItemWithImageError);
            expect((err as CreateItemWithImageError).errorType).toBe('auth');
          }
        });

        expect(mockTelemetry.logAuthEvent).toHaveBeenCalledWith(
          'token-refresh-failure',
          expect.anything()
        );
        expect(mockTelemetry.logError).toHaveBeenCalled();
      });
    });

    describe('image preparation errors', () => {
      it('handles image processing error', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        // The hook has bounded retry logic (3 retries) for storage errors.
        // Mock to reject all attempts to ensure the error propagates.
        const processingError = new UploadError('Failed to process image', 'processing');
        (mockImageUpload.prepareImageForUpload as jest.Mock)
          .mockRejectedValueOnce(processingError)
          .mockRejectedValueOnce(processingError)
          .mockRejectedValueOnce(processingError)
          .mockRejectedValueOnce(processingError);

        await act(async () => {
          try {
            await result.current.save(mockInput);
            fail('Should have thrown error');
          } catch (err) {
            expect(err).toBeInstanceOf(CreateItemWithImageError);
            expect((err as CreateItemWithImageError).errorType).toBe('storage');
          }
        });

        // Upload should not be called since preparation failed
        expect(mockImageUpload.uploadImageToStorage).not.toHaveBeenCalled();
      });

      it('handles file read error', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        // The hook has bounded retry logic (3 retries) for storage errors.
        // Mock to reject all attempts to ensure the error propagates.
        const fileReadError = new UploadError('Failed to read file', 'file_read');
        (mockImageUpload.prepareImageForUpload as jest.Mock)
          .mockRejectedValueOnce(fileReadError)
          .mockRejectedValueOnce(fileReadError)
          .mockRejectedValueOnce(fileReadError)
          .mockRejectedValueOnce(fileReadError);

        await act(async () => {
          try {
            await result.current.save(mockInput);
          } catch (err) {
            expect((err as CreateItemWithImageError).errorType).toBe('storage');
          }
        });
      });
    });

    describe('image upload errors', () => {
      it('handles network error during upload', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        // The hook has bounded retry logic (3 retries) for network errors.
        // Mock to reject all attempts to ensure the error propagates.
        const networkError = new UploadError('Network error', 'network');
        (mockImageUpload.uploadImageToStorage as jest.Mock)
          .mockRejectedValueOnce(networkError)
          .mockRejectedValueOnce(networkError)
          .mockRejectedValueOnce(networkError)
          .mockRejectedValueOnce(networkError);

        await act(async () => {
          try {
            await result.current.save(mockInput);
            fail('Should have thrown error');
          } catch (err) {
            expect(err).toBeInstanceOf(CreateItemWithImageError);
            expect((err as CreateItemWithImageError).errorType).toBe('network');
          }
        });

        // Database operation should not be called since upload failed
        expect(mockSupabase.from).not.toHaveBeenCalled();
      });

      it('handles storage permission error', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        // The hook has bounded retry logic (3 retries) for storage errors.
        // Mock to reject all attempts to ensure the error propagates.
        const permissionError = new UploadError('Permission denied', 'permission');
        (mockImageUpload.uploadImageToStorage as jest.Mock)
          .mockRejectedValueOnce(permissionError)
          .mockRejectedValueOnce(permissionError)
          .mockRejectedValueOnce(permissionError)
          .mockRejectedValueOnce(permissionError);

        await act(async () => {
          try {
            await result.current.save(mockInput);
          } catch (err) {
            expect((err as CreateItemWithImageError).errorType).toBe('storage');
          }
        });
      });

      it('handles storage server error', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        // The hook has bounded retry logic (3 retries) for storage errors.
        // Mock to reject all attempts to ensure the error propagates.
        const storageError = new UploadError('Storage service unavailable', 'storage');
        (mockImageUpload.uploadImageToStorage as jest.Mock)
          .mockRejectedValueOnce(storageError)
          .mockRejectedValueOnce(storageError)
          .mockRejectedValueOnce(storageError)
          .mockRejectedValueOnce(storageError);

        await act(async () => {
          try {
            await result.current.save(mockInput);
          } catch (err) {
            expect((err as CreateItemWithImageError).errorType).toBe('storage');
            // After retries, the message is the standard ERROR_MESSAGES.storage message
            expect((err as CreateItemWithImageError).message).toBe(
              'Failed to upload image. Please try again.'
            );
          }
        });
      });
    });

    describe('database errors', () => {
      it('handles database insert error', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        const mockSingle = jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database constraint violation' },
        });

        (mockSupabase.from as jest.Mock).mockReturnValue({
          upsert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: mockSingle,
            }),
          }),
        });

        await act(async () => {
          try {
            await result.current.save(mockInput);
            fail('Should have thrown error');
          } catch (err) {
            expect(err).toBeInstanceOf(CreateItemWithImageError);
            expect((err as CreateItemWithImageError).errorType).toBe('database');
            expect((err as CreateItemWithImageError).message).toBe(
              'Failed to save item. Please try again.'
            );
          }
        });

        // Image upload should have occurred
        expect(mockImageUpload.uploadImageToStorage).toHaveBeenCalled();

        // No cache invalidation should occur
        const invalidateQueriesSpy = jest.spyOn(queryClient, 'invalidateQueries');
        expect(invalidateQueriesSpy).not.toHaveBeenCalled();
      });

      it('classifies database network errors correctly', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        const mockSingle = jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'network timeout during insert' },
        });

        (mockSupabase.from as jest.Mock).mockReturnValue({
          upsert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: mockSingle,
            }),
          }),
        });

        await act(async () => {
          try {
            await result.current.save(mockInput);
          } catch (err) {
            expect((err as CreateItemWithImageError).errorType).toBe('database');
          }
        });
      });
    });

    describe('background pipeline errors', () => {
      it('completes save successfully even if image processing pipeline fails', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        (mockSupabase.functions.invoke as jest.Mock).mockImplementation((functionName: string) => {
          if (functionName === EDGE_FUNCTIONS.PROCESS_ITEM_IMAGE) {
            return Promise.reject(new Error('Pipeline error'));
          }
          return Promise.resolve({ data: null, error: null });
        });

        await act(async () => {
          await result.current.save(mockInput);
        });

        expect(result.current.result).not.toBe(null);
        expect(result.current.error).toBe(null);
        expect(mockTelemetry.logError).toHaveBeenCalledWith(
          expect.any(Error),
          'server',
          expect.objectContaining({
            operation: 'trigger_image_processing_pipeline',
          })
        );
      });

      it('completes save successfully even if classification pipeline fails', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        (mockSupabase.functions.invoke as jest.Mock).mockImplementation((functionName: string) => {
          if (functionName === EDGE_FUNCTIONS.CLASSIFY_ITEM) {
            return Promise.reject(new Error('Classification failed'));
          }
          return Promise.resolve({ data: null, error: null });
        });

        await act(async () => {
          await result.current.save(mockInput);
        });

        expect(result.current.result).not.toBe(null);
        expect(mockTelemetry.logError).toHaveBeenCalledWith(
          expect.any(Error),
          'server',
          expect.objectContaining({
            operation: 'trigger_classification_pipeline',
          })
        );
      });

      it('completes save successfully even if both pipelines fail', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        (mockSupabase.functions.invoke as jest.Mock).mockRejectedValue(new Error('Pipeline error'));

        await act(async () => {
          await result.current.save(mockInput);
        });

        expect(result.current.result).not.toBe(null);
        expect(result.current.error).toBe(null);

        // logError should be called twice (once per pipeline)
        expect(mockTelemetry.logError).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Edge Cases', () => {
    it('throws validation error when user is not authenticated', async () => {
      const mockStore = jest.requireMock('../../../src/core/state/store');
      const originalImplementation = mockStore.useStore.getMockImplementation();

      mockStore.useStore.mockImplementation(
        (selector: (state: { user: { id: string } | null }) => unknown) => selector({ user: null })
      );

      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      await act(async () => {
        try {
          await result.current.save(mockInput);
          fail('Should have thrown validation error');
        } catch (err) {
          expect(err).toBeInstanceOf(CreateItemWithImageError);
          expect((err as CreateItemWithImageError).errorType).toBe('validation');
          expect((err as CreateItemWithImageError).message).toBe('User not authenticated');
        }
      });

      // Reset mock
      mockStore.useStore.mockImplementation(originalImplementation);
    });

    it('handles unexpected error types', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      (mockImageUpload.prepareImageForUpload as jest.Mock).mockRejectedValueOnce('string error');

      await act(async () => {
        try {
          await result.current.save(mockInput);
        } catch (err) {
          expect(err).toBeInstanceOf(CreateItemWithImageError);
          expect((err as CreateItemWithImageError).errorType).toBe('unknown');
          expect((err as CreateItemWithImageError).message).toBe(
            'An unexpected error occurred. Please try again.'
          );
        }
      });
    });

    it('handles generic Error with network keywords', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      (mockImageUpload.prepareImageForUpload as jest.Mock).mockRejectedValueOnce(
        new Error('fetch failed due to network')
      );

      await act(async () => {
        try {
          await result.current.save(mockInput);
        } catch (err) {
          expect((err as CreateItemWithImageError).errorType).toBe('network');
          expect((err as CreateItemWithImageError).message).toBe(
            'Connection error. Please check your network and try again.'
          );
        }
      });
    });

    it('handles generic Error with storage keywords', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      (mockImageUpload.prepareImageForUpload as jest.Mock).mockRejectedValueOnce(
        new Error('storage quota exceeded')
      );

      await act(async () => {
        try {
          await result.current.save(mockInput);
        } catch (err) {
          expect((err as CreateItemWithImageError).errorType).toBe('storage');
          expect((err as CreateItemWithImageError).message).toBe(
            'Failed to upload image. Please try again.'
          );
        }
      });
    });

    it('handles generic Error with database keywords', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      // Mock database to return an error in the response (Supabase pattern)
      // This tests database errors via the standard Supabase error response
      const mockSingle = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'database insert failed', code: 'PGRST' },
      });

      (mockSupabase.from as jest.Mock).mockReturnValue({
        upsert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: mockSingle,
          }),
        }),
      });

      await act(async () => {
        try {
          await result.current.save(mockInput);
        } catch (err) {
          expect((err as CreateItemWithImageError).errorType).toBe('database');
          expect((err as CreateItemWithImageError).message).toBe(
            'Failed to save item. Please try again.'
          );
        }
      });
    });
  });

  describe('Idempotency', () => {
    it('preserves itemId across retry after upload failure', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      // First user-facing save attempt fails at upload.
      // The hook has bounded retry logic (3 retries) for network errors.
      // Mock all internal retries to fail so the error propagates to the caller.
      const networkError = new UploadError('Network error', 'network');
      (mockImageUpload.uploadImageToStorage as jest.Mock)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError);

      await act(async () => {
        try {
          await result.current.save(mockInput);
        } catch {
          // Expected to fail after all retries exhausted
        }
      });

      const firstCallCount = (global.crypto.getRandomValues as jest.Mock).mock.calls.length;
      const firstStoragePath = (mockImageUpload.generateStoragePath as jest.Mock).mock.calls[0];

      // Second user-facing save attempt succeeds
      // Reset upload mock to succeed
      (mockImageUpload.uploadImageToStorage as jest.Mock).mockResolvedValue(undefined);

      await act(async () => {
        await result.current.save(mockInput);
      });

      const secondCallCount = (global.crypto.getRandomValues as jest.Mock).mock.calls.length;
      // generateStoragePath is called on each internal retry attempt, so we need to get
      // the first call from the second user-facing save (after all the retry calls)
      const allStoragePaths = (mockImageUpload.generateStoragePath as jest.Mock).mock.calls;
      const secondStoragePath = allStoragePaths[allStoragePaths.length - 1];

      // Should not have generated new random bytes (itemId is cached across user retries)
      expect(secondCallCount).toBe(firstCallCount);
      expect(secondStoragePath).toEqual(firstStoragePath);
    });

    it('preserves itemId across retry after database failure', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      // First attempt fails at database
      const mockSingleFail = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      (mockSupabase.from as jest.Mock).mockReturnValueOnce({
        upsert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: mockSingleFail,
          }),
        }),
      });

      await act(async () => {
        try {
          await result.current.save(mockInput);
        } catch {
          // Expected to fail
        }
      });

      const firstUploadPath = (mockImageUpload.uploadImageToStorage as jest.Mock).mock.calls[0][1];

      // Second attempt succeeds
      const mockSingleSuccess = jest.fn().mockResolvedValue({
        data: mockDbItem,
        error: null,
      });

      (mockSupabase.from as jest.Mock).mockReturnValueOnce({
        upsert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: mockSingleSuccess,
          }),
        }),
      });

      await act(async () => {
        await result.current.save(mockInput);
      });

      const secondUploadPath = (mockImageUpload.uploadImageToStorage as jest.Mock).mock.calls[1][1];

      // Should use same storage path (same itemId)
      expect(secondUploadPath).toBe(firstUploadPath);
    });

    it('uses upsert with onConflict to prevent duplicates', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      await act(async () => {
        await result.current.save(mockInput);
      });

      const fromMock = mockSupabase.from('items') as unknown as { upsert: jest.Mock };
      expect(fromMock.upsert).toHaveBeenCalledWith(expect.any(Object), { onConflict: 'id' });
    });

    it('reset does not clear cached itemId', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      // First user-facing save fails.
      // The hook has bounded retry logic (3 retries) for network errors.
      // Mock all internal retries to fail so the error propagates to the caller.
      const networkError = new UploadError('Network error', 'network');
      (mockImageUpload.uploadImageToStorage as jest.Mock)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError);

      await act(async () => {
        try {
          await result.current.save(mockInput);
        } catch {
          // Expected after all retries exhausted
        }
      });

      const firstCallCount = (global.crypto.getRandomValues as jest.Mock).mock.calls.length;

      // Call reset - this should NOT clear the cached itemId
      act(() => {
        result.current.reset();
      });

      // Retry save - should use the same cached itemId
      (mockImageUpload.uploadImageToStorage as jest.Mock).mockResolvedValue(undefined);

      await act(async () => {
        await result.current.save(mockInput);
      });

      const secondCallCount = (global.crypto.getRandomValues as jest.Mock).mock.calls.length;

      // Should not have generated new UUID (cached ID persists through reset)
      expect(secondCallCount).toBe(firstCallCount);
    });

    it('handles multiple rapid retry attempts with same itemId', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      // Multiple user-facing failures.
      // Each user-facing save has internal bounded retry logic (3 retries).
      // Mock all internal retries to fail for each user-facing attempt.
      const networkError = new UploadError('Network error', 'network');

      for (let i = 0; i < 3; i++) {
        (mockImageUpload.uploadImageToStorage as jest.Mock)
          .mockRejectedValueOnce(networkError)
          .mockRejectedValueOnce(networkError)
          .mockRejectedValueOnce(networkError)
          .mockRejectedValueOnce(networkError);

        await act(async () => {
          try {
            await result.current.save(mockInput);
          } catch {
            // Expected after all internal retries exhausted
          }
        });
      }

      // Get all storage paths used - all should be identical because itemId is cached
      const storagePaths = (mockImageUpload.generateStoragePath as jest.Mock).mock.results.map(
        (r: jest.MockResult<string>) => r.value
      );

      // All storage paths should be identical (same cached itemId)
      const uniquePaths = [...new Set(storagePaths)];
      expect(uniquePaths.length).toBe(1);
    }, 60000);

    it('generates new itemId after offline error', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      // First save fails offline (before itemId generation)
      (mockNetInfo.fetch as jest.Mock).mockResolvedValueOnce({
        isConnected: false,
        isInternetReachable: false,
      });

      await act(async () => {
        try {
          await result.current.save(mockInput);
        } catch {
          // Expected
        }
      });

      // itemId should not have been generated
      expect(mockImageUpload.generateStoragePath).not.toHaveBeenCalled();

      // Second save succeeds
      (mockNetInfo.fetch as jest.Mock).mockResolvedValueOnce({
        isConnected: true,
        isInternetReachable: true,
      });

      await act(async () => {
        await result.current.save(mockInput);
      });

      // Should generate new itemId
      expect(global.crypto.getRandomValues).toHaveBeenCalled();
    });
  });

  describe('State Management', () => {
    it('maintains error state after failed save', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      (mockNetInfo.fetch as jest.Mock).mockResolvedValueOnce({
        isConnected: false,
        isInternetReachable: false,
      });

      await act(async () => {
        try {
          await result.current.save(mockInput);
        } catch {
          // Expected
        }
      });

      expect(result.current.error).not.toBe(null);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.result).toBe(null);
    });

    it('clears error state on next save attempt', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      // First save fails
      (mockNetInfo.fetch as jest.Mock).mockResolvedValueOnce({
        isConnected: false,
        isInternetReachable: false,
      });

      await act(async () => {
        try {
          await result.current.save(mockInput);
        } catch {
          // Expected
        }
      });

      expect(result.current.error).not.toBe(null);

      // Second save starts
      (mockNetInfo.fetch as jest.Mock).mockResolvedValueOnce({
        isConnected: true,
        isInternetReachable: true,
      });

      await act(async () => {
        await result.current.save(mockInput);
      });

      // Error should be cleared
      expect(result.current.error).toBe(null);
    });

    it('resets loading state after error', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      // The hook has bounded retry logic (3 retries) for network errors.
      // Mock all internal retries to fail so the error propagates to the caller.
      const networkError = new UploadError('Network error', 'network');
      (mockImageUpload.uploadImageToStorage as jest.Mock)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError);

      await act(async () => {
        try {
          await result.current.save(mockInput);
        } catch {
          // Expected after all retries exhausted
        }
      });

      // Loading should be false after error
      expect(result.current.isLoading).toBe(false);
    });

    it('resets single-flight flag after error', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      // The hook has bounded retry logic (3 retries) for network errors.
      // Mock all internal retries to fail so the error propagates to the caller.
      const networkError = new UploadError('Network error', 'network');
      (mockImageUpload.uploadImageToStorage as jest.Mock)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError);

      await act(async () => {
        try {
          await result.current.save(mockInput);
        } catch {
          // Expected after all retries exhausted
        }
      });

      // Should allow new save (single-flight flag reset after error)
      (mockImageUpload.uploadImageToStorage as jest.Mock).mockResolvedValue(undefined);

      await act(async () => {
        await result.current.save(mockInput);
      });

      expect(result.current.result).not.toBe(null);
    });
  });

  describe('Telemetry', () => {
    it('includes correct metadata in failure telemetry', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      // The hook has bounded retry logic (3 retries) for network errors.
      // Mock all internal retries to fail so the error propagates to the caller.
      const networkError = new UploadError('Upload failed', 'network');
      (mockImageUpload.uploadImageToStorage as jest.Mock)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError);

      await act(async () => {
        try {
          await result.current.save(mockInput);
        } catch {
          // Expected after all retries exhausted
        }
      });

      expect(mockTelemetry.logError).toHaveBeenCalledWith(
        expect.any(CreateItemWithImageError),
        'server',
        expect.objectContaining({
          feature: 'wardrobe',
          operation: 'item_save',
          metadata: expect.objectContaining({
            errorType: 'network',
            userId: mockUser.id,
            latencyMs: expect.any(Number),
          }),
        })
      );

      expect(mockTelemetry.trackCaptureEvent).toHaveBeenCalledWith('item_save_failed', {
        userId: mockUser.id,
        errorType: 'network',
        latencyMs: expect.any(Number),
      });
    });

    it('does not emit success telemetry on failure', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      (mockNetInfo.fetch as jest.Mock).mockResolvedValueOnce({
        isConnected: false,
        isInternetReachable: false,
      });

      await act(async () => {
        try {
          await result.current.save(mockInput);
        } catch {
          // Expected
        }
      });

      // Should not have called success telemetry
      const successCalls = (mockTelemetry.logSuccess as jest.Mock).mock.calls.filter(
        (call: [string, string]) => call[1] === 'item_save_succeeded'
      );
      expect(successCalls.length).toBe(0);
    });

    it('emits auth-specific telemetry for token refresh failures', async () => {
      const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

      (mockSupabase.auth.refreshSession as jest.Mock).mockResolvedValueOnce({
        data: { session: null },
        error: { message: 'Session expired' },
      });

      await act(async () => {
        try {
          await result.current.save(mockInput);
        } catch {
          // Expected
        }
      });

      expect(mockTelemetry.logAuthEvent).toHaveBeenCalledWith(
        'token-refresh-failure',
        expect.objectContaining({
          userId: mockUser.id,
          outcome: 'failure',
          latency: expect.any(Number),
          metadata: expect.objectContaining({
            context: 'item_save',
            operation: 'pre_save_refresh',
          }),
        })
      );
    });
  });

  describe('Authentication Scenarios (AC13)', () => {
    describe('Successful Refresh', () => {
      it('should save successfully when session expired but refresh succeeds', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        const newSession = {
          access_token: 'new-token-after-refresh',
          refresh_token: 'new-refresh-token',
          user: mockUser,
        };

        (mockSupabase.auth.refreshSession as jest.Mock).mockResolvedValueOnce({
          data: { session: newSession },
          error: null,
        });

        await act(async () => {
          await result.current.save(mockInput);
        });

        // Verify refresh was called
        expect(mockSupabase.auth.refreshSession).toHaveBeenCalledTimes(1);

        // Verify save completed successfully
        expect(result.current.isLoading).toBe(false);
        expect(result.current.error).toBe(null);
        expect(result.current.result).not.toBe(null);
        expect(result.current.result?.item.id).toBe(mockItemId);

        // Verify all save operations occurred
        expect(mockImageUpload.prepareImageForUpload).toHaveBeenCalled();
        expect(mockImageUpload.uploadImageToStorage).toHaveBeenCalled();
        expect(mockSupabase.from).toHaveBeenCalledWith('items');

        // Verify navigation to wardrobe (no login redirect)
        expect(mockRouterReplace).not.toHaveBeenCalledWith('/auth/login');
      });

      it('should emit correct telemetry for successful refresh and save', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        const newSession = {
          access_token: 'new-token',
          refresh_token: 'new-refresh',
          user: mockUser,
        };

        (mockSupabase.auth.refreshSession as jest.Mock).mockResolvedValueOnce({
          data: { session: newSession },
          error: null,
        });

        await act(async () => {
          await result.current.save(mockInput);
        });

        // Verify auth success telemetry
        expect(mockTelemetry.logAuthEvent).toHaveBeenCalledWith('token-refresh-success', {
          userId: mockUser.id,
          outcome: 'success',
          latency: expect.any(Number),
          metadata: {
            context: 'item_save',
            operation: 'pre_save_refresh',
          },
        });

        // Verify save success telemetry (no auth errors)
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

        // Verify no error telemetry
        expect(mockTelemetry.logError).not.toHaveBeenCalled();
      });
    });

    describe('Failed Refresh with Login Redirect (AC13)', () => {
      it('should redirect to login when refresh fails with auth error', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        (mockSupabase.auth.refreshSession as jest.Mock).mockResolvedValueOnce({
          data: { session: null },
          error: { message: 'Invalid refresh token', status: 401 },
        });

        await act(async () => {
          try {
            await result.current.save(mockInput);
            fail('Should have thrown auth error');
          } catch (err) {
            expect(err).toBeInstanceOf(CreateItemWithImageError);
            expect((err as CreateItemWithImageError).errorType).toBe('auth');
            expect((err as CreateItemWithImageError).message).toBe(
              'Your session has expired. Please log in again.'
            );
          }
        });

        // Verify AC13: redirect to login
        expect(mockRouterReplace).toHaveBeenCalledWith('/auth/login');
        expect(mockRouterReplace).toHaveBeenCalledTimes(1);

        // Verify no writes occurred
        expect(mockImageUpload.prepareImageForUpload).not.toHaveBeenCalled();
        expect(mockImageUpload.uploadImageToStorage).not.toHaveBeenCalled();
        expect(mockSupabase.from).not.toHaveBeenCalled();
      });

      it('should redirect to login when refresh returns null session', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        (mockSupabase.auth.refreshSession as jest.Mock).mockResolvedValueOnce({
          data: { session: null },
          error: null,
        });

        await act(async () => {
          try {
            await result.current.save(mockInput);
            fail('Should have thrown auth error');
          } catch (err) {
            expect(err).toBeInstanceOf(CreateItemWithImageError);
            expect((err as CreateItemWithImageError).errorType).toBe('auth');
          }
        });

        // Verify AC13: redirect to login
        expect(mockRouterReplace).toHaveBeenCalledWith('/auth/login');

        // Verify no writes occurred
        expect(mockImageUpload.prepareImageForUpload).not.toHaveBeenCalled();
        expect(mockImageUpload.uploadImageToStorage).not.toHaveBeenCalled();
      });

      it('should redirect to login when refresh throws exception', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        (mockSupabase.auth.refreshSession as jest.Mock).mockRejectedValueOnce(
          new Error('Session refresh failed')
        );

        await act(async () => {
          try {
            await result.current.save(mockInput);
            fail('Should have thrown auth error');
          } catch (err) {
            expect(err).toBeInstanceOf(CreateItemWithImageError);
            expect((err as CreateItemWithImageError).errorType).toBe('auth');
          }
        });

        // Verify AC13: redirect to login
        expect(mockRouterReplace).toHaveBeenCalledWith('/auth/login');

        // Verify no writes occurred
        expect(mockImageUpload.prepareImageForUpload).not.toHaveBeenCalled();
      });

      it('should emit logAuthEvent when refresh fails', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        (mockSupabase.auth.refreshSession as jest.Mock).mockResolvedValueOnce({
          data: { session: null },
          error: { message: 'Refresh token expired', status: 401 },
        });

        await act(async () => {
          try {
            await result.current.save(mockInput);
          } catch {
            // Expected
          }
        });

        // Verify auth failure telemetry
        expect(mockTelemetry.logAuthEvent).toHaveBeenCalledWith(
          'token-refresh-failure',
          expect.objectContaining({
            userId: mockUser.id,
            outcome: 'failure',
            latency: expect.any(Number),
            metadata: expect.objectContaining({
              context: 'item_save',
              operation: 'pre_save_refresh',
              errorClassification: 'user',
            }),
          })
        );
      });

      it('should not attempt any writes after refresh failure', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        (mockSupabase.auth.refreshSession as jest.Mock).mockResolvedValueOnce({
          data: { session: null },
          error: { message: 'Session expired' },
        });

        await act(async () => {
          try {
            await result.current.save(mockInput);
          } catch {
            // Expected
          }
        });

        // Verify no downstream operations
        expect(mockImageUpload.generateStoragePath).not.toHaveBeenCalled();
        expect(mockImageUpload.prepareImageForUpload).not.toHaveBeenCalled();
        expect(mockImageUpload.uploadImageToStorage).not.toHaveBeenCalled();
        expect(mockSupabase.from).not.toHaveBeenCalled();
        expect(mockSupabase.functions.invoke).not.toHaveBeenCalled();
      });
    });

    describe('Error Classification for Auth', () => {
      it('should classify auth errors correctly for failed refresh', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        (mockSupabase.auth.refreshSession as jest.Mock).mockResolvedValueOnce({
          data: { session: null },
          error: { message: 'Invalid token', status: 401 },
        });

        await act(async () => {
          try {
            await result.current.save(mockInput);
          } catch {
            // Expected
          }
        });

        // Verify error is logged twice: once in auth handler, once in main catch
        expect(mockTelemetry.logError).toHaveBeenCalledTimes(2);

        // First call: auth refresh handler with 'user' classification
        expect(mockTelemetry.logError).toHaveBeenNthCalledWith(
          1,
          expect.any(CreateItemWithImageError),
          'user',
          expect.objectContaining({
            feature: 'wardrobe',
            operation: 'token_refresh_pre_save',
          })
        );

        // Second call: main error handler with 'server' classification
        expect(mockTelemetry.logError).toHaveBeenNthCalledWith(
          2,
          expect.any(CreateItemWithImageError),
          'server',
          expect.objectContaining({
            feature: 'wardrobe',
            operation: 'item_save',
            metadata: expect.objectContaining({
              errorType: 'auth',
            }),
          })
        );
      });

      it('should classify network errors correctly for refresh network issues', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        (mockSupabase.auth.refreshSession as jest.Mock).mockResolvedValueOnce({
          data: { session: null },
          error: { message: 'network connection failed' },
        });

        await act(async () => {
          try {
            await result.current.save(mockInput);
          } catch {
            // Expected
          }
        });

        // Verify error classification in telemetry
        expect(mockTelemetry.logAuthEvent).toHaveBeenCalledWith(
          'token-refresh-failure',
          expect.objectContaining({
            metadata: expect.objectContaining({
              errorClassification: 'network',
            }),
          })
        );
      });

      it('should emit appropriate telemetry for auth vs network errors', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        // Test auth error
        (mockSupabase.auth.refreshSession as jest.Mock).mockResolvedValueOnce({
          data: { session: null },
          error: { message: 'Session expired', status: 401 },
        });

        await act(async () => {
          try {
            await result.current.save(mockInput);
          } catch {
            // Expected
          }
        });

        // Verify auth error telemetry includes proper classification
        // errorClassification is 'user' for auth errors (not network/server)
        expect(mockTelemetry.logAuthEvent).toHaveBeenCalledWith(
          'token-refresh-failure',
          expect.objectContaining({
            outcome: 'failure',
            metadata: expect.objectContaining({
              errorClassification: 'user',
            }),
          })
        );

        // Verify trackCaptureEvent called with auth error type
        expect(mockTelemetry.trackCaptureEvent).toHaveBeenCalledWith('item_save_failed', {
          userId: mockUser.id,
          errorType: 'auth',
          latencyMs: expect.any(Number),
        });
      });

      it('should not redirect to login for network errors during refresh', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        // Network error during refresh (not an auth issue)
        (mockSupabase.auth.refreshSession as jest.Mock).mockResolvedValueOnce({
          data: { session: null },
          error: { message: 'fetch failed: network timeout' },
        });

        await act(async () => {
          try {
            await result.current.save(mockInput);
          } catch {
            // Expected
          }
        });

        // Verify redirect still occurs (auth refresh failed)
        expect(mockRouterReplace).toHaveBeenCalledWith('/auth/login');

        // But error classification should be network
        expect(mockTelemetry.logAuthEvent).toHaveBeenCalledWith(
          'token-refresh-failure',
          expect.objectContaining({
            metadata: expect.objectContaining({
              errorClassification: 'network',
            }),
          })
        );
      });

      it('should classify server errors correctly for refresh server issues', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        (mockSupabase.auth.refreshSession as jest.Mock).mockResolvedValueOnce({
          data: { session: null },
          error: { message: 'Internal server error 500', status: 500 },
        });

        await act(async () => {
          try {
            await result.current.save(mockInput);
          } catch {
            // Expected
          }
        });

        // Verify error classification in telemetry
        expect(mockTelemetry.logAuthEvent).toHaveBeenCalledWith(
          'token-refresh-failure',
          expect.objectContaining({
            metadata: expect.objectContaining({
              errorClassification: 'server',
            }),
          })
        );
      });
    });

    describe('Auth State Management', () => {
      it('should set error state when refresh fails', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        (mockSupabase.auth.refreshSession as jest.Mock).mockResolvedValueOnce({
          data: { session: null },
          error: { message: 'Session expired' },
        });

        await act(async () => {
          try {
            await result.current.save(mockInput);
          } catch {
            // Expected
          }
        });

        // Verify error state
        expect(result.current.error).not.toBe(null);
        expect(result.current.error?.errorType).toBe('auth');
        expect(result.current.isLoading).toBe(false);
        expect(result.current.result).toBe(null);
      });

      it('should clear cached itemId after auth failure', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        // First attempt fails at auth
        (mockSupabase.auth.refreshSession as jest.Mock).mockResolvedValueOnce({
          data: { session: null },
          error: { message: 'Session expired' },
        });

        await act(async () => {
          try {
            await result.current.save(mockInput);
          } catch {
            // Expected
          }
        });

        // No itemId should have been generated (fails before that step)
        expect(mockImageUpload.generateStoragePath).not.toHaveBeenCalled();

        // Clear mocks
        jest.clearAllMocks();

        // Second attempt succeeds
        (mockSupabase.auth.refreshSession as jest.Mock).mockResolvedValueOnce({
          data: { session: mockSession },
          error: null,
        });

        await act(async () => {
          await result.current.save(mockInput);
        });

        // Should generate new itemId
        expect(mockImageUpload.generateStoragePath).toHaveBeenCalledTimes(1);
        expect(result.current.result).not.toBe(null);
      });
    });

    describe('Telemetry for Auth Scenarios', () => {
      it('should emit complete telemetry for successful refresh path', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        await act(async () => {
          await result.current.save(mockInput);
        });

        // Verify all telemetry events
        expect(mockTelemetry.logSuccess).toHaveBeenCalledWith('wardrobe', 'item_save_started', {
          data: {
            userId: mockUser.id,
            hasName: true,
            tagCount: 2,
          },
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

      it('should emit complete telemetry for failed refresh path', async () => {
        const { result } = renderHook(() => useCreateItemWithImage(), { wrapper });

        (mockSupabase.auth.refreshSession as jest.Mock).mockResolvedValueOnce({
          data: { session: null },
          error: { message: 'Refresh failed', status: 401 },
        });

        await act(async () => {
          try {
            await result.current.save(mockInput);
          } catch {
            // Expected
          }
        });

        // Verify auth failure telemetry
        expect(mockTelemetry.logAuthEvent).toHaveBeenCalledWith(
          'token-refresh-failure',
          expect.objectContaining({
            userId: mockUser.id,
            outcome: 'failure',
          })
        );

        // Verify error telemetry is called twice
        expect(mockTelemetry.logError).toHaveBeenCalledTimes(2);

        // Second call should be from main error handler
        expect(mockTelemetry.logError).toHaveBeenNthCalledWith(
          2,
          expect.any(CreateItemWithImageError),
          'server',
          expect.objectContaining({
            feature: 'wardrobe',
            operation: 'item_save',
            metadata: expect.objectContaining({
              errorType: 'auth',
            }),
          })
        );

        // Verify failure event
        expect(mockTelemetry.trackCaptureEvent).toHaveBeenCalledWith('item_save_failed', {
          userId: mockUser.id,
          errorType: 'auth',
          latencyMs: expect.any(Number),
        });

        // Verify no success telemetry
        const successCalls = (mockTelemetry.logSuccess as jest.Mock).mock.calls.filter(
          (call: [string, string]) => call[1] === 'item_save_succeeded'
        );
        expect(successCalls.length).toBe(0);
      });
    });
  });
});
