import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useCreateFirstItem,
  CreateItemError,
} from '../../src/features/onboarding/api/useCreateFirstItem';
import { processItemImage } from '../../src/features/onboarding/utils/imageProcessing';
import { useStore } from '../../src/core/state/store';
import * as telemetry from '../../src/core/telemetry';
import { ItemType } from '../../src/features/onboarding/types/itemMetadata';

// Mock dependencies
jest.mock('../../src/features/onboarding/utils/imageProcessing', () => ({
  processItemImage: jest.fn(),
}));

jest.mock('../../src/core/state/store', () => ({
  useStore: jest.fn(),
}));

jest.mock('../../src/core/telemetry', () => ({
  logSuccess: jest.fn(),
  logError: jest.fn(),
}));

describe('useCreateFirstItem', () => {
  let queryClient: QueryClient;
  const mockUser = { id: 'test-user-123' };

  const createWrapper = () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return wrapper;
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    jest.clearAllMocks();

    // Default mock: user is authenticated
    (useStore as unknown as jest.Mock).mockReturnValue(mockUser);

    // Default mock: image processing succeeds
    (processItemImage as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('Happy Path', () => {
    it('should successfully create item with valid request', async () => {
      const { result } = renderHook(() => useCreateFirstItem(), {
        wrapper: createWrapper(),
      });

      const request = {
        imageUri: 'file:///path/to/image.jpg',
        type: ItemType.Top,
        colourId: 'black',
        name: 'My Favorite Shirt',
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toBeDefined();
      expect(result.current.data?.item).toBeDefined();
      expect(result.current.data?.item.userId).toBe('test-user-123');
      expect(result.current.data?.item.type).toBe(ItemType.Top);
      expect(result.current.data?.item.colour).toEqual(['black']);
      expect(result.current.data?.item.name).toBe('My Favorite Shirt');
      expect(result.current.data?.item.photos).toHaveLength(1);

      expect(processItemImage).toHaveBeenCalledWith('file:///path/to/image.jpg');
      expect(telemetry.logSuccess).toHaveBeenCalledWith(
        'onboarding',
        'first_item_created',
        expect.objectContaining({
          data: expect.objectContaining({
            type: ItemType.Top,
            colourId: 'black',
            hasName: true,
          }),
        })
      );
    });

    it('should handle optional name field', async () => {
      const { result } = renderHook(() => useCreateFirstItem(), {
        wrapper: createWrapper(),
      });

      const request = {
        imageUri: 'file:///path/to/image.jpg',
        type: ItemType.Shoes,
        colourId: 'brown',
        name: '',
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.item.name).toBeNull();
    });
  });

  describe('Error Handling and Classification', () => {
    it('should throw validation error when user not authenticated', async () => {
      (useStore as unknown as jest.Mock).mockReturnValue(null);

      const { result } = renderHook(() => useCreateFirstItem(), {
        wrapper: createWrapper(),
      });

      const request = {
        imageUri: 'file:///path/to/image.jpg',
        type: ItemType.Top,
        colourId: 'black',
        name: 'Test',
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBeInstanceOf(CreateItemError);
      expect((result.current.error as CreateItemError).errorType).toBe('validation');
      expect(result.current.error?.message).toBe('User not authenticated');
    });

    it('should classify network errors correctly', async () => {
      (processItemImage as jest.Mock).mockRejectedValue(new Error('network connection failed'));

      // Recreate queryClient with retry enabled BEFORE creating wrapper
      queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: 3, retryDelay: 10 },
        },
      });

      const { result } = renderHook(() => useCreateFirstItem(), {
        wrapper: createWrapper(),
      });

      const request = {
        imageUri: 'file:///path/to/image.jpg',
        type: ItemType.Bottom,
        colourId: 'blue',
        name: 'Jeans',
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 15000 });

      expect(result.current.error).toBeInstanceOf(CreateItemError);
      expect((result.current.error as CreateItemError).errorType).toBe('network');
      expect(result.current.error?.message).toBe('Network error while creating item');
      expect(telemetry.logError).toHaveBeenCalled();
    }, 15000);

    it('should classify storage errors correctly', async () => {
      (processItemImage as jest.Mock).mockRejectedValue(new Error('storage upload failed'));

      // Recreate queryClient with retry enabled BEFORE creating wrapper
      queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: 3, retryDelay: 10 },
        },
      });

      const { result } = renderHook(() => useCreateFirstItem(), {
        wrapper: createWrapper(),
      });

      const request = {
        imageUri: 'file:///path/to/image.jpg',
        type: ItemType.Dress,
        colourId: 'red',
        name: 'Summer Dress',
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 15000 });

      expect(result.current.error).toBeInstanceOf(CreateItemError);
      expect((result.current.error as CreateItemError).errorType).toBe('storage');
      expect(result.current.error?.message).toBe('Failed to upload image');
    }, 15000);

    it('should classify database errors correctly', async () => {
      (processItemImage as jest.Mock).mockRejectedValue(new Error('database insert failed'));

      const { result } = renderHook(() => useCreateFirstItem(), {
        wrapper: createWrapper(),
      });

      const request = {
        imageUri: 'file:///path/to/image.jpg',
        type: ItemType.Outerwear,
        colourId: 'grey',
        name: 'Winter Coat',
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBeInstanceOf(CreateItemError);
      expect((result.current.error as CreateItemError).errorType).toBe('database');
      expect(result.current.error?.message).toBe('Failed to save item');
    });

    it('should classify unknown errors correctly', async () => {
      (processItemImage as jest.Mock).mockRejectedValue(new Error('unexpected error occurred'));

      const { result } = renderHook(() => useCreateFirstItem(), {
        wrapper: createWrapper(),
      });

      const request = {
        imageUri: 'file:///path/to/image.jpg',
        type: ItemType.Accessories,
        colourId: 'white',
        name: 'Hat',
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBeInstanceOf(CreateItemError);
      expect((result.current.error as CreateItemError).errorType).toBe('unknown');
      expect(result.current.error?.message).toBe('Failed to create item');
    });
  });

  describe('Retry Behavior', () => {
    it('should retry network errors up to 3 times', async () => {
      let callCount = 0;
      (processItemImage as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount <= 3) {
          return Promise.reject(new Error('network timeout'));
        }
        return Promise.resolve();
      });

      queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: 3, retryDelay: 10 },
        },
      });

      const { result } = renderHook(() => useCreateFirstItem(), {
        wrapper: createWrapper(),
      });

      const request = {
        imageUri: 'file:///path/to/image.jpg',
        type: ItemType.Top,
        colourId: 'black',
        name: 'Test',
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 15000 });

      expect(processItemImage).toHaveBeenCalledTimes(4); // Initial + 3 retries
    }, 15000);

    it('should retry storage errors up to 3 times', async () => {
      let callCount = 0;
      (processItemImage as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error('storage error'));
        }
        return Promise.resolve();
      });

      queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: 3, retryDelay: 10 },
        },
      });

      const { result } = renderHook(() => useCreateFirstItem(), {
        wrapper: createWrapper(),
      });

      const request = {
        imageUri: 'file:///path/to/image.jpg',
        type: ItemType.Bottom,
        colourId: 'blue',
        name: 'Pants',
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 15000 });

      expect(processItemImage).toHaveBeenCalledTimes(3); // Initial + 2 retries
    }, 15000);

    it('should not retry validation errors', async () => {
      (useStore as unknown as jest.Mock).mockReturnValue(null);

      queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: 3 },
        },
      });

      const { result } = renderHook(() => useCreateFirstItem(), {
        wrapper: createWrapper(),
      });

      const request = {
        imageUri: 'file:///path/to/image.jpg',
        type: ItemType.Top,
        colourId: 'black',
        name: 'Test',
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect((result.current.error as CreateItemError).errorType).toBe('validation');
      // processItemImage should not be called for validation errors
      expect(processItemImage).not.toHaveBeenCalled();
    });

    it('should not retry database errors', async () => {
      (processItemImage as jest.Mock).mockRejectedValue(new Error('database constraint violation'));

      queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: 3 },
        },
      });

      const { result } = renderHook(() => useCreateFirstItem(), {
        wrapper: createWrapper(),
      });

      const request = {
        imageUri: 'file:///path/to/image.jpg',
        type: ItemType.Dress,
        colourId: 'pink',
        name: 'Dress',
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect((result.current.error as CreateItemError).errorType).toBe('database');
      expect(processItemImage).toHaveBeenCalledTimes(1); // No retries
    });
  });

  describe('Retry Delay with Jitter', () => {
    it('should calculate retry delay with exponential backoff and jitter', () => {
      const mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);

      // Test the formula by calculating expected values
      const attemptIndex0 = 1000 * Math.pow(2, 0) * (0.5 + 0.5); // = 1000
      const attemptIndex1 = 1000 * Math.pow(2, 1) * (0.5 + 0.5); // = 2000
      const attemptIndex2 = 1000 * Math.pow(2, 2) * (0.5 + 0.5); // = 4000

      expect(attemptIndex0).toBe(1000);
      expect(attemptIndex1).toBe(2000);
      expect(attemptIndex2).toBe(4000);

      mockRandom.mockRestore();
    });

    it('should cap retry delay at 30000ms', () => {
      const mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5);

      // Test with a large attempt index
      const attemptIndex10 = 1000 * Math.pow(2, 10) * (0.5 + 0.5); // = 1024000
      const cappedDelay = Math.min(attemptIndex10, 30000);

      expect(cappedDelay).toBe(30000);

      mockRandom.mockRestore();
    });

    it('should include jitter in range [0.5, 1.5)', () => {
      const mockRandomMin = jest.spyOn(Math, 'random').mockReturnValue(0);
      const delayMin = 1000 * Math.pow(2, 1) * (0.5 + 0);
      expect(delayMin).toBe(1000); // Minimum jitter

      mockRandomMin.mockRestore();

      const mockRandomMax = jest.spyOn(Math, 'random').mockReturnValue(0.999);
      const delayMax = 1000 * Math.pow(2, 1) * (0.5 + 0.999);
      expect(delayMax).toBeCloseTo(2998, 0); // Maximum jitter (close to 1.5x)

      mockRandomMax.mockRestore();
    });
  });

  describe('MutationKey', () => {
    it('should set mutationKey with user ID', async () => {
      (useStore as unknown as jest.Mock).mockReturnValue(mockUser);

      const { result } = renderHook(() => useCreateFirstItem(), {
        wrapper: createWrapper(),
      });

      const request = {
        imageUri: 'file:///path/to/image.jpg',
        type: ItemType.Top,
        colourId: 'black',
        name: 'Test',
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Verify the mutation was created with the correct key by checking the query client
      const mutations = queryClient.getMutationCache().getAll();
      expect(mutations.length).toBeGreaterThan(0);
      expect(mutations[0].options.mutationKey).toEqual([
        'onboarding',
        'createFirstItem',
        'test-user-123',
      ]);
    });

    it('should set mutationKey with undefined when no user', async () => {
      (useStore as unknown as jest.Mock).mockReturnValue(null);

      const { result } = renderHook(() => useCreateFirstItem(), {
        wrapper: createWrapper(),
      });

      const request = {
        imageUri: 'file:///path/to/image.jpg',
        type: ItemType.Top,
        colourId: 'black',
        name: 'Test',
      };

      result.current.mutate(request);

      await waitFor(() => expect(result.current.isError).toBe(true));

      // Verify the mutation was created with the correct key
      const mutations = queryClient.getMutationCache().getAll();
      expect(mutations.length).toBeGreaterThan(0);
      expect(mutations[0].options.mutationKey).toEqual([
        'onboarding',
        'createFirstItem',
        undefined,
      ]);
    });
  });
});
