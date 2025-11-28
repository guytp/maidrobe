/**
 * Unit tests for useGalleryPicker hook.
 *
 * Tests gallery picker hook with mocked expo-image-picker, validation,
 * and telemetry.
 *
 * @module __tests__/wardrobe/hooks/useGalleryPicker
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useGalleryPicker } from '../../../src/features/wardrobe/hooks/useGalleryPicker';
import * as ImagePicker from 'expo-image-picker';
import { trackCaptureEvent } from '../../../src/core/telemetry';
import { validateCapturedImage } from '../../../src/core/utils/imageValidation';

// Type alias for ImagePicker result to allow partial mocking in tests
type MockImagePickerResult = ImagePicker.ImagePickerResult;

// Type for pick result from hook
interface PickResult {
  success: boolean;
  uri?: string;
  width?: number;
  height?: number;
  type?: string;
  error?: string;
}

// Mock dependencies
jest.mock('expo-image-picker');
jest.mock('../../../src/core/telemetry', () => ({
  trackCaptureEvent: jest.fn(),
}));
jest.mock('../../../src/core/utils/imageValidation', () => ({
  validateCapturedImage: jest.fn(),
}));
jest.mock('../../../src/core/state/store', () => ({
  useStore: jest.fn((selector) =>
    selector({
      user: { id: 'test-user-id' },
    })
  ),
}));

const mockLaunchImageLibraryAsync = ImagePicker.launchImageLibraryAsync as jest.MockedFunction<
  typeof ImagePicker.launchImageLibraryAsync
>;
const mockTrackCaptureEvent = trackCaptureEvent as jest.Mock;
const mockValidateCapturedImage = validateCapturedImage as jest.Mock;

describe('useGalleryPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('starts with isLoading false', () => {
      const { result } = renderHook(() => useGalleryPicker('wardrobe'));
      expect(result.current.isLoading).toBe(false);
    });

    it('provides pickImage function', () => {
      const { result } = renderHook(() => useGalleryPicker('wardrobe'));
      expect(typeof result.current.pickImage).toBe('function');
    });
  });

  describe('pickImage success', () => {
    it('returns success result for valid image', async () => {
      mockLaunchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [
          {
            uri: 'file:///path/to/image.jpg',
            width: 1920,
            height: 1080,
            type: 'image/jpeg',
          },
        ],
      } as unknown as MockImagePickerResult);

      mockValidateCapturedImage.mockReturnValue({
        isValid: true,
      });

      const { result } = renderHook(() => useGalleryPicker('wardrobe'));

      let pickResult: PickResult;
      await act(async () => {
        pickResult = await result.current.pickImage();
      });

      expect(pickResult.success).toBe(true);
      expect(pickResult.uri).toBe('file:///path/to/image.jpg');
      expect(pickResult.width).toBe(1920);
      expect(pickResult.height).toBe(1080);
      expect(pickResult.type).toBe('image/jpeg');
    });

    it('tracks gallery_opened event', async () => {
      mockLaunchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [
          {
            uri: 'file:///image.jpg',
            width: 1920,
            height: 1080,
          },
        ],
      } as unknown as MockImagePickerResult);

      mockValidateCapturedImage.mockReturnValue({ isValid: true });

      const { result } = renderHook(() => useGalleryPicker('onboarding'));

      await act(async () => {
        await result.current.pickImage();
      });

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('gallery_opened', {
        userId: 'test-user-id',
        origin: 'onboarding',
      });
    });

    it('tracks gallery_image_selected event on success', async () => {
      mockLaunchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [
          {
            uri: 'file:///image.jpg',
            width: 1920,
            height: 1080,
            type: 'image/jpeg',
          },
        ],
      } as unknown as MockImagePickerResult);

      mockValidateCapturedImage.mockReturnValue({ isValid: true });

      const { result } = renderHook(() => useGalleryPicker('wardrobe'));

      await act(async () => {
        await result.current.pickImage();
      });

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('gallery_image_selected', {
        userId: 'test-user-id',
        origin: 'wardrobe',
        width: 1920,
        height: 1080,
        type: 'image/jpeg',
      });
    });

    it('sets loading state during operation', async () => {
      mockLaunchImageLibraryAsync.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  canceled: false,
                  assets: [{ uri: 'file:///image.jpg', width: 1920, height: 1080 }],
                } as unknown as MockImagePickerResult),
              100
            )
          )
      );

      mockValidateCapturedImage.mockReturnValue({ isValid: true });

      const { result } = renderHook(() => useGalleryPicker('wardrobe'));

      expect(result.current.isLoading).toBe(false);

      const pickPromise = act(async () => {
        return result.current.pickImage();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await pickPromise;
    });
  });

  describe('pickImage cancellation', () => {
    it('returns cancelled result when user cancels picker', async () => {
      mockLaunchImageLibraryAsync.mockResolvedValue({
        canceled: true,
      } as unknown as MockImagePickerResult);

      const { result } = renderHook(() => useGalleryPicker('wardrobe'));

      let pickResult: PickResult;
      await act(async () => {
        pickResult = await result.current.pickImage();
      });

      expect(pickResult.success).toBe(false);
      expect(pickResult.reason).toBe('cancelled');
    });

    it('tracks gallery_picker_cancelled event', async () => {
      mockLaunchImageLibraryAsync.mockResolvedValue({
        canceled: true,
      } as unknown as MockImagePickerResult);

      const { result } = renderHook(() => useGalleryPicker('wardrobe'));

      await act(async () => {
        await result.current.pickImage();
      });

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('gallery_picker_cancelled', {
        userId: 'test-user-id',
        origin: 'wardrobe',
      });
    });

    it('resets loading state after cancellation', async () => {
      mockLaunchImageLibraryAsync.mockResolvedValue({
        canceled: true,
      } as unknown as MockImagePickerResult);

      const { result } = renderHook(() => useGalleryPicker('wardrobe'));

      await act(async () => {
        await result.current.pickImage();
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('pickImage validation failure', () => {
    it('returns invalid result for failed validation', async () => {
      mockLaunchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [
          {
            uri: 'file:///image.jpg',
            width: 100,
            height: 100,
          },
        ],
      } as unknown as MockImagePickerResult);

      mockValidateCapturedImage.mockReturnValue({
        isValid: false,
        error: 'invalid_dimensions',
        errorMessage: 'Image is too small',
      });

      const { result } = renderHook(() => useGalleryPicker('wardrobe'));

      let pickResult: PickResult;
      await act(async () => {
        pickResult = await result.current.pickImage();
      });

      expect(pickResult.success).toBe(false);
      expect(pickResult.reason).toBe('invalid');
      expect(pickResult.error).toBe('Image is too small');
    });

    it('tracks image_validation_failed event', async () => {
      mockLaunchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [
          {
            uri: 'file:///image.jpg',
            width: 100,
            height: 100,
          },
        ],
      } as unknown as MockImagePickerResult);

      mockValidateCapturedImage.mockReturnValue({
        isValid: false,
        error: 'invalid_dimensions',
        errorMessage: 'Too small',
      });

      const { result } = renderHook(() => useGalleryPicker('wardrobe'));

      await act(async () => {
        await result.current.pickImage();
      });

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('image_validation_failed', {
        userId: 'test-user-id',
        origin: 'wardrobe',
        source: 'gallery',
        errorCode: 'invalid_dimensions',
        errorMessage: 'Too small',
      });
    });
  });

  describe('pickImage no asset', () => {
    it('returns error when no asset is returned', async () => {
      mockLaunchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [],
      } as unknown as MockImagePickerResult);

      const { result } = renderHook(() => useGalleryPicker('wardrobe'));

      let pickResult: PickResult;
      await act(async () => {
        pickResult = await result.current.pickImage();
      });

      expect(pickResult.success).toBe(false);
      expect(pickResult.reason).toBe('error');
      expect(pickResult.error).toContain('No image');
    });

    it('tracks gallery_selection_failed event', async () => {
      mockLaunchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: undefined,
      } as unknown as MockImagePickerResult);

      const { result } = renderHook(() => useGalleryPicker('wardrobe'));

      await act(async () => {
        await result.current.pickImage();
      });

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('gallery_selection_failed', {
        userId: 'test-user-id',
        origin: 'wardrobe',
        errorCode: 'no_asset',
      });
    });
  });

  describe('pickImage permission error', () => {
    it('returns permission_denied for permission errors', async () => {
      mockLaunchImageLibraryAsync.mockRejectedValue(new Error('permission denied'));

      const { result } = renderHook(() => useGalleryPicker('wardrobe'));

      let pickResult: PickResult;
      await act(async () => {
        pickResult = await result.current.pickImage();
      });

      expect(pickResult.success).toBe(false);
      expect(pickResult.reason).toBe('permission_denied');
      expect(pickResult.error).toContain('Gallery access was denied');
    });

    it('tracks gallery_permission_error event', async () => {
      mockLaunchImageLibraryAsync.mockRejectedValue(new Error('User denied permission'));

      const { result } = renderHook(() => useGalleryPicker('wardrobe'));

      await act(async () => {
        await result.current.pickImage();
      });

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('gallery_permission_error', {
        userId: 'test-user-id',
        origin: 'wardrobe',
        errorMessage: 'User denied permission',
      });
    });
  });

  describe('pickImage generic error', () => {
    it('returns error for generic failures', async () => {
      mockLaunchImageLibraryAsync.mockRejectedValue(new Error('Something went wrong'));

      const { result } = renderHook(() => useGalleryPicker('wardrobe'));

      let pickResult: PickResult;
      await act(async () => {
        pickResult = await result.current.pickImage();
      });

      expect(pickResult.success).toBe(false);
      expect(pickResult.reason).toBe('error');
      expect(pickResult.error).toBe('Something went wrong');
    });

    it('tracks gallery_error event', async () => {
      mockLaunchImageLibraryAsync.mockRejectedValue(new Error('Unexpected failure'));

      const { result } = renderHook(() => useGalleryPicker('wardrobe'));

      await act(async () => {
        await result.current.pickImage();
      });

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('gallery_error', {
        userId: 'test-user-id',
        origin: 'wardrobe',
        errorMessage: 'Unexpected failure',
      });
    });

    it('handles non-Error thrown values', async () => {
      mockLaunchImageLibraryAsync.mockRejectedValue('string error');

      const { result } = renderHook(() => useGalleryPicker('wardrobe'));

      let pickResult: PickResult;
      await act(async () => {
        pickResult = await result.current.pickImage();
      });

      expect(pickResult.success).toBe(false);
      expect(pickResult.reason).toBe('error');
    });
  });

  describe('image metadata handling', () => {
    it('rejects image with missing width and height', async () => {
      mockLaunchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [
          {
            uri: 'file:///image.jpg',
            type: 'image/jpeg',
          },
        ],
      } as unknown as MockImagePickerResult);

      mockValidateCapturedImage.mockReturnValue({ isValid: true });

      const { result } = renderHook(() => useGalleryPicker('wardrobe'));

      let pickResult: PickResult;
      await act(async () => {
        pickResult = await result.current.pickImage();
      });

      expect(pickResult.success).toBe(false);
      expect(pickResult.reason).toBe('invalid');
      expect(pickResult.error).toContain('dimensions');
    });

    it('rejects image with undefined width', async () => {
      mockLaunchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [
          {
            uri: 'file:///image.jpg',
            width: undefined,
            height: 1080,
            type: 'image/jpeg',
          },
        ],
      } as unknown as MockImagePickerResult);

      mockValidateCapturedImage.mockReturnValue({ isValid: true });

      const { result } = renderHook(() => useGalleryPicker('wardrobe'));

      let pickResult: PickResult;
      await act(async () => {
        pickResult = await result.current.pickImage();
      });

      expect(pickResult.success).toBe(false);
      expect(pickResult.reason).toBe('invalid');
      expect(pickResult.error).toContain('dimensions');
    });

    it('rejects image with undefined height', async () => {
      mockLaunchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [
          {
            uri: 'file:///image.jpg',
            width: 1920,
            height: undefined,
            type: 'image/jpeg',
          },
        ],
      } as unknown as MockImagePickerResult);

      mockValidateCapturedImage.mockReturnValue({ isValid: true });

      const { result } = renderHook(() => useGalleryPicker('wardrobe'));

      let pickResult: PickResult;
      await act(async () => {
        pickResult = await result.current.pickImage();
      });

      expect(pickResult.success).toBe(false);
      expect(pickResult.reason).toBe('invalid');
      expect(pickResult.error).toContain('dimensions');
    });

    it('rejects image with zero width', async () => {
      mockLaunchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [
          {
            uri: 'file:///image.jpg',
            width: 0,
            height: 1080,
            type: 'image/jpeg',
          },
        ],
      } as unknown as MockImagePickerResult);

      mockValidateCapturedImage.mockReturnValue({ isValid: true });

      const { result } = renderHook(() => useGalleryPicker('wardrobe'));

      let pickResult: PickResult;
      await act(async () => {
        pickResult = await result.current.pickImage();
      });

      expect(pickResult.success).toBe(false);
      expect(pickResult.reason).toBe('invalid');
      expect(pickResult.error).toContain('dimensions');
    });

    it('rejects image with zero height', async () => {
      mockLaunchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [
          {
            uri: 'file:///image.jpg',
            width: 1920,
            height: 0,
            type: 'image/jpeg',
          },
        ],
      } as unknown as MockImagePickerResult);

      mockValidateCapturedImage.mockReturnValue({ isValid: true });

      const { result } = renderHook(() => useGalleryPicker('wardrobe'));

      let pickResult: PickResult;
      await act(async () => {
        pickResult = await result.current.pickImage();
      });

      expect(pickResult.success).toBe(false);
      expect(pickResult.reason).toBe('invalid');
      expect(pickResult.error).toContain('dimensions');
    });

    it('rejects image with negative width', async () => {
      mockLaunchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [
          {
            uri: 'file:///image.jpg',
            width: -1920,
            height: 1080,
            type: 'image/jpeg',
          },
        ],
      } as unknown as MockImagePickerResult);

      mockValidateCapturedImage.mockReturnValue({ isValid: true });

      const { result } = renderHook(() => useGalleryPicker('wardrobe'));

      let pickResult: PickResult;
      await act(async () => {
        pickResult = await result.current.pickImage();
      });

      expect(pickResult.success).toBe(false);
      expect(pickResult.reason).toBe('invalid');
      expect(pickResult.error).toContain('dimensions');
    });

    it('rejects image with negative height', async () => {
      mockLaunchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [
          {
            uri: 'file:///image.jpg',
            width: 1920,
            height: -1080,
            type: 'image/jpeg',
          },
        ],
      } as unknown as MockImagePickerResult);

      mockValidateCapturedImage.mockReturnValue({ isValid: true });

      const { result } = renderHook(() => useGalleryPicker('wardrobe'));

      let pickResult: PickResult;
      await act(async () => {
        pickResult = await result.current.pickImage();
      });

      expect(pickResult.success).toBe(false);
      expect(pickResult.reason).toBe('invalid');
      expect(pickResult.error).toContain('dimensions');
    });

    it('tracks validation failed event for missing dimensions', async () => {
      mockLaunchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [
          {
            uri: 'file:///image.jpg',
            width: 0,
            height: 0,
            type: 'image/jpeg',
          },
        ],
      } as unknown as MockImagePickerResult);

      mockValidateCapturedImage.mockReturnValue({ isValid: true });

      const { result } = renderHook(() => useGalleryPicker('wardrobe'));

      await act(async () => {
        await result.current.pickImage();
      });

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('image_validation_failed', {
        userId: 'test-user-id',
        origin: 'wardrobe',
        source: 'gallery',
        errorCode: 'missing_dimensions',
        errorMessage: 'Image dimensions are missing or invalid',
      });
    });

    it('uses mimeType if type is not available', async () => {
      mockLaunchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [
          {
            uri: 'file:///image.jpg',
            width: 1920,
            height: 1080,
            mimeType: 'image/jpeg',
          },
        ],
      } as unknown as MockImagePickerResult);

      mockValidateCapturedImage.mockReturnValue({ isValid: true });

      const { result } = renderHook(() => useGalleryPicker('wardrobe'));

      let pickResult: PickResult;
      await act(async () => {
        pickResult = await result.current.pickImage();
      });

      expect(pickResult.type).toBe('image/jpeg');
    });
  });

  describe('with null origin', () => {
    it('handles null origin in telemetry', async () => {
      mockLaunchImageLibraryAsync.mockResolvedValue({
        canceled: true,
      } as unknown as MockImagePickerResult);

      const { result } = renderHook(() => useGalleryPicker(null));

      await act(async () => {
        await result.current.pickImage();
      });

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('gallery_opened', {
        userId: 'test-user-id',
        origin: undefined,
      });
    });
  });
});
