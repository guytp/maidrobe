/**
 * Tests for useGallerySelection hook.
 *
 * Tests the shared gallery selection logic used by CaptureScreen and
 * CaptureCameraScreen. Covers permission checks, gallery picker launch,
 * result processing, payload construction, navigation, and error handling.
 *
 * @module __tests__/wardrobe/hooks/useGallerySelection
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useGallerySelection, UseGallerySelectionOptions } from '../../../src/features/wardrobe/hooks/useGallerySelection';
import { CaptureImagePayload } from '../../../src/core/types/capture';
import * as telemetry from '../../../src/core/telemetry';
import * as imageValidation from '../../../src/core/utils/imageValidation';

// Mock dependencies
jest.mock('../../../src/core/i18n', () => ({
  t: (key: string) => key,
}));

jest.mock('../../../src/core/telemetry');
jest.mock('../../../src/core/utils/imageValidation');

// Mock Alert.alert
jest.spyOn(Alert, 'alert');

describe('useGallerySelection', () => {
  const mockTrackCaptureEvent = telemetry.trackCaptureEvent as jest.Mock;
  const mockGetValidationErrorMessage = imageValidation.getValidationErrorMessage as jest.Mock;

  // Default mock options
  let defaultOptions: UseGallerySelectionOptions;

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetValidationErrorMessage.mockReturnValue('Validation error message');

    // Create fresh mocks for each test
    defaultOptions = {
      origin: 'wardrobe',
      permissions: {
        isLoading: false,
        camera: {
          status: 'granted',
          isAvailable: true,
          request: jest.fn(),
          openSettings: jest.fn(),
        },
        gallery: {
          status: 'granted',
          request: jest.fn(),
          openSettings: jest.fn(),
        },
      },
      galleryPicker: {
        pickImage: jest.fn().mockResolvedValue({
          success: true,
          uri: 'file:///image.jpg',
          width: 1920,
          height: 1080,
          type: 'image/jpeg',
        }),
        isLoading: false,
      },
      isNavigating: false,
      setIsNavigating: jest.fn(),
      setSource: jest.fn(),
      setPayload: jest.fn(),
      router: {
        push: jest.fn(),
        replace: jest.fn(),
        back: jest.fn(),
        canGoBack: jest.fn(),
        setParams: jest.fn(),
      } as any,
      user: { id: 'user-123' },
    };
  });

  describe('guard conditions', () => {
    it('does not execute if isNavigating is true', async () => {
      const options = { ...defaultOptions, isNavigating: true };
      const { result } = renderHook(() => useGallerySelection(options));

      await act(async () => {
        await result.current.handleGallerySelection();
      });

      expect(options.galleryPicker.pickImage).not.toHaveBeenCalled();
    });

    it('does not execute if permissions are loading', async () => {
      const options = {
        ...defaultOptions,
        permissions: { ...defaultOptions.permissions, isLoading: true },
      };
      const { result } = renderHook(() => useGallerySelection(options));

      await act(async () => {
        await result.current.handleGallerySelection();
      });

      expect(options.galleryPicker.pickImage).not.toHaveBeenCalled();
    });

    it('does not execute if gallery picker is loading', async () => {
      const options = {
        ...defaultOptions,
        galleryPicker: { ...defaultOptions.galleryPicker, isLoading: true },
      };
      const { result } = renderHook(() => useGallerySelection(options));

      await act(async () => {
        await result.current.handleGallerySelection();
      });

      expect(options.galleryPicker.pickImage).not.toHaveBeenCalled();
    });

    it('does not execute if additionalGuardCondition is true', async () => {
      const options = { ...defaultOptions, additionalGuardCondition: true };
      const { result } = renderHook(() => useGallerySelection(options));

      await act(async () => {
        await result.current.handleGallerySelection();
      });

      expect(options.galleryPicker.pickImage).not.toHaveBeenCalled();
    });
  });

  describe('permission status: granted', () => {
    it('launches gallery picker and navigates on success', async () => {
      const { result } = renderHook(() => useGallerySelection(defaultOptions));

      await act(async () => {
        await result.current.handleGallerySelection();
      });

      // Should set navigation state and source
      expect(defaultOptions.setIsNavigating).toHaveBeenCalledWith(true);
      expect(defaultOptions.setSource).toHaveBeenCalledWith('gallery');

      // Should track telemetry
      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('capture_source_selected', {
        userId: 'user-123',
        origin: 'wardrobe',
        source: 'gallery',
      });

      // Should launch gallery picker
      expect(defaultOptions.galleryPicker.pickImage).toHaveBeenCalled();

      // Should construct payload and navigate
      expect(defaultOptions.setPayload).toHaveBeenCalledWith(
        expect.objectContaining({
          uri: 'file:///image.jpg',
          width: 1920,
          height: 1080,
          origin: 'wardrobe',
          source: 'gallery',
          createdAt: expect.any(String),
        })
      );
      expect(defaultOptions.router.push).toHaveBeenCalledWith('/crop');

      // Should reset navigation state after delay
      await waitFor(
        () => {
          expect(defaultOptions.setIsNavigating).toHaveBeenCalledWith(false);
        },
        { timeout: 600 }
      );
    });

    it('uses onboarding origin if provided', async () => {
      const options = { ...defaultOptions, origin: 'onboarding' as const };
      const { result } = renderHook(() => useGallerySelection(options));

      await act(async () => {
        await result.current.handleGallerySelection();
      });

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('capture_source_selected', {
        userId: 'user-123',
        origin: 'onboarding',
        source: 'gallery',
      });

      expect(options.setPayload).toHaveBeenCalledWith(
        expect.objectContaining({
          origin: 'onboarding',
        })
      );
    });

    it('falls back to wardrobe origin if null', async () => {
      const options = { ...defaultOptions, origin: null };
      const { result } = renderHook(() => useGallerySelection(options));

      await act(async () => {
        await result.current.handleGallerySelection();
      });

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('capture_source_selected', {
        userId: 'user-123',
        origin: undefined,
        source: 'gallery',
      });

      expect(options.setPayload).toHaveBeenCalledWith(
        expect.objectContaining({
          origin: 'wardrobe',
        })
      );
    });

    it('resets navigation state when user cancels picker', async () => {
      const options = {
        ...defaultOptions,
        galleryPicker: {
          ...defaultOptions.galleryPicker,
          pickImage: jest.fn().mockResolvedValue({
            success: false,
            reason: 'cancelled',
          }),
        },
      };
      const { result } = renderHook(() => useGallerySelection(options));

      await act(async () => {
        await result.current.handleGallerySelection();
      });

      expect(options.setIsNavigating).toHaveBeenCalledWith(true);
      expect(options.setIsNavigating).toHaveBeenCalledWith(false);
      expect(options.router.push).not.toHaveBeenCalled();
    });

    it('shows error alert on invalid image with retry option', async () => {
      const options = {
        ...defaultOptions,
        galleryPicker: {
          ...defaultOptions.galleryPicker,
          pickImage: jest.fn().mockResolvedValue({
            success: false,
            reason: 'invalid',
            error: 'Invalid dimensions',
          }),
        },
      };
      const { result } = renderHook(() => useGallerySelection(options));

      await act(async () => {
        await result.current.handleGallerySelection();
      });

      expect(Alert.alert).toHaveBeenCalledWith(
        'screens.capture.errors.invalidImage',
        'Invalid dimensions',
        expect.arrayContaining([
          expect.objectContaining({ text: 'screens.capture.errors.tryAgain' }),
          expect.objectContaining({ text: 'screens.capture.errors.cancel' }),
        ])
      );
      expect(options.setIsNavigating).toHaveBeenCalledWith(false);
    });

    it('shows error alert on picker error with retry option', async () => {
      const options = {
        ...defaultOptions,
        galleryPicker: {
          ...defaultOptions.galleryPicker,
          pickImage: jest.fn().mockResolvedValue({
            success: false,
            reason: 'error',
            error: 'Picker failed',
          }),
        },
      };
      const { result } = renderHook(() => useGallerySelection(options));

      await act(async () => {
        await result.current.handleGallerySelection();
      });

      expect(Alert.alert).toHaveBeenCalledWith(
        'screens.capture.errors.galleryError',
        'Picker failed',
        expect.arrayContaining([
          expect.objectContaining({ text: 'screens.capture.errors.tryAgain' }),
          expect.objectContaining({ text: 'screens.capture.errors.cancel' }),
        ])
      );
      expect(options.setIsNavigating).toHaveBeenCalledWith(false);
    });

    it('shows error alert on permission_denied error', async () => {
      const options = {
        ...defaultOptions,
        galleryPicker: {
          ...defaultOptions.galleryPicker,
          pickImage: jest.fn().mockResolvedValue({
            success: false,
            reason: 'permission_denied',
            error: 'Permission denied',
          }),
        },
      };
      const { result } = renderHook(() => useGallerySelection(options));

      await act(async () => {
        await result.current.handleGallerySelection();
      });

      expect(Alert.alert).toHaveBeenCalledWith(
        'screens.capture.errors.galleryError',
        'Permission denied',
        expect.any(Array)
      );
    });
  });

  describe('permission status: blocked', () => {
    it('shows blocked dialog with settings option', async () => {
      const options = {
        ...defaultOptions,
        permissions: {
          ...defaultOptions.permissions,
          gallery: {
            ...defaultOptions.permissions.gallery,
            status: 'blocked' as const,
          },
        },
      };
      const { result } = renderHook(() => useGallerySelection(options));

      await act(async () => {
        await result.current.handleGallerySelection();
      });

      expect(Alert.alert).toHaveBeenCalledWith(
        'screens.capture.permissions.gallery.blockedTitle',
        'screens.capture.permissions.gallery.blockedMessage',
        expect.arrayContaining([
          expect.objectContaining({
            text: 'screens.capture.permissions.actions.openSettings',
          }),
          expect.objectContaining({
            text: 'screens.capture.permissions.actions.cancel',
          }),
        ])
      );

      expect(options.galleryPicker.pickImage).not.toHaveBeenCalled();
    });

    it('includes camera fallback option if provided', async () => {
      const mockOnCameraFallback = jest.fn();
      const options = {
        ...defaultOptions,
        permissions: {
          ...defaultOptions.permissions,
          gallery: {
            ...defaultOptions.permissions.gallery,
            status: 'blocked' as const,
          },
        },
        onCameraFallback: mockOnCameraFallback,
      };
      const { result } = renderHook(() => useGallerySelection(options));

      await act(async () => {
        await result.current.handleGallerySelection();
      });

      expect(Alert.alert).toHaveBeenCalledWith(
        'screens.capture.permissions.gallery.blockedTitle',
        'screens.capture.permissions.gallery.blockedMessage',
        expect.arrayContaining([
          expect.objectContaining({
            text: 'screens.capture.permissions.actions.openSettings',
          }),
          expect.objectContaining({
            text: 'screens.capture.permissions.actions.useCamera',
          }),
          expect.objectContaining({
            text: 'screens.capture.permissions.actions.cancel',
          }),
        ])
      );
    });

    it('does not include camera fallback if not provided', async () => {
      const options = {
        ...defaultOptions,
        permissions: {
          ...defaultOptions.permissions,
          gallery: {
            ...defaultOptions.permissions.gallery,
            status: 'blocked' as const,
          },
        },
        onCameraFallback: undefined,
      };
      const { result } = renderHook(() => useGallerySelection(options));

      await act(async () => {
        await result.current.handleGallerySelection();
      });

      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const actions = alertCall[2];
      const hasUseCamera = actions.some(
        (action: any) => action.text === 'screens.capture.permissions.actions.useCamera'
      );

      expect(hasUseCamera).toBe(false);
    });
  });

  describe('permission status: denied/undetermined', () => {
    it('shows request dialog for denied permission', async () => {
      const options = {
        ...defaultOptions,
        permissions: {
          ...defaultOptions.permissions,
          gallery: {
            ...defaultOptions.permissions.gallery,
            status: 'denied' as const,
          },
        },
      };
      const { result } = renderHook(() => useGallerySelection(options));

      await act(async () => {
        await result.current.handleGallerySelection();
      });

      expect(Alert.alert).toHaveBeenCalledWith(
        'screens.capture.permissions.gallery.deniedTitle',
        'screens.capture.permissions.gallery.deniedMessage',
        expect.arrayContaining([
          expect.objectContaining({
            text: 'screens.capture.permissions.actions.allowAccess',
          }),
          expect.objectContaining({
            text: 'screens.capture.permissions.actions.cancel',
          }),
        ])
      );

      expect(options.galleryPicker.pickImage).not.toHaveBeenCalled();
    });

    it('shows request dialog for undetermined permission', async () => {
      const options = {
        ...defaultOptions,
        permissions: {
          ...defaultOptions.permissions,
          gallery: {
            ...defaultOptions.permissions.gallery,
            status: 'undetermined' as const,
          },
        },
      };
      const { result } = renderHook(() => useGallerySelection(options));

      await act(async () => {
        await result.current.handleGallerySelection();
      });

      expect(Alert.alert).toHaveBeenCalledWith(
        'screens.capture.permissions.gallery.deniedTitle',
        'screens.capture.permissions.gallery.deniedMessage',
        expect.any(Array)
      );
    });

    it('launches picker after permission granted', async () => {
      const mockRequest = jest.fn().mockResolvedValue('granted');
      const options = {
        ...defaultOptions,
        permissions: {
          ...defaultOptions.permissions,
          gallery: {
            ...defaultOptions.permissions.gallery,
            status: 'denied' as const,
            request: mockRequest,
          },
        },
      };
      const { result } = renderHook(() => useGallerySelection(options));

      await act(async () => {
        await result.current.handleGallerySelection();
      });

      // Get the onPress handler for "Allow Access" button
      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const actions = alertCall[2];
      const allowAction = actions.find(
        (action: any) => action.text === 'screens.capture.permissions.actions.allowAccess'
      );

      // Simulate pressing "Allow Access"
      await act(async () => {
        await allowAction.onPress();
      });

      expect(mockRequest).toHaveBeenCalled();
      expect(options.galleryPicker.pickImage).toHaveBeenCalled();
    });

    it('does not launch picker if permission not granted', async () => {
      const mockRequest = jest.fn().mockResolvedValue('denied');
      const options = {
        ...defaultOptions,
        permissions: {
          ...defaultOptions.permissions,
          gallery: {
            ...defaultOptions.permissions.gallery,
            status: 'denied' as const,
            request: mockRequest,
          },
        },
      };
      const { result } = renderHook(() => useGallerySelection(options));

      await act(async () => {
        await result.current.handleGallerySelection();
      });

      // Get the onPress handler for "Allow Access" button
      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const actions = alertCall[2];
      const allowAction = actions.find(
        (action: any) => action.text === 'screens.capture.permissions.actions.allowAccess'
      );

      // Simulate pressing "Allow Access"
      await act(async () => {
        await allowAction.onPress();
      });

      expect(mockRequest).toHaveBeenCalled();
      expect(options.galleryPicker.pickImage).not.toHaveBeenCalled();
    });
  });

  describe('payload construction', () => {
    it('constructs valid CaptureImagePayload', async () => {
      const { result } = renderHook(() => useGallerySelection(defaultOptions));

      await act(async () => {
        await result.current.handleGallerySelection();
      });

      const payload = (defaultOptions.setPayload as jest.Mock).mock.calls[0][0] as CaptureImagePayload;

      expect(payload).toEqual({
        uri: 'file:///image.jpg',
        width: 1920,
        height: 1080,
        origin: 'wardrobe',
        source: 'gallery',
        createdAt: expect.any(String),
      });

      // Validate timestamp format
      expect(new Date(payload.createdAt).toISOString()).toBe(payload.createdAt);
    });

    it('includes all required fields with correct types', async () => {
      const { result } = renderHook(() => useGallerySelection(defaultOptions));

      await act(async () => {
        await result.current.handleGallerySelection();
      });

      const payload = (defaultOptions.setPayload as jest.Mock).mock.calls[0][0];

      expect(typeof payload.uri).toBe('string');
      expect(typeof payload.width).toBe('number');
      expect(typeof payload.height).toBe('number');
      expect(payload.width).toBeGreaterThan(0);
      expect(payload.height).toBeGreaterThan(0);
      expect(['wardrobe', 'onboarding']).toContain(payload.origin);
      expect(['camera', 'gallery']).toContain(payload.source);
      expect(typeof payload.createdAt).toBe('string');
    });
  });

  describe('telemetry tracking', () => {
    it('tracks capture_source_selected event', async () => {
      const { result } = renderHook(() => useGallerySelection(defaultOptions));

      await act(async () => {
        await result.current.handleGallerySelection();
      });

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('capture_source_selected', {
        userId: 'user-123',
        origin: 'wardrobe',
        source: 'gallery',
      });
    });

    it('tracks event with null origin', async () => {
      const options = { ...defaultOptions, origin: null };
      const { result } = renderHook(() => useGallerySelection(options));

      await act(async () => {
        await result.current.handleGallerySelection();
      });

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('capture_source_selected', {
        userId: 'user-123',
        origin: undefined,
        source: 'gallery',
      });
    });

    it('tracks event with null user', async () => {
      const options = { ...defaultOptions, user: null };
      const { result } = renderHook(() => useGallerySelection(options));

      await act(async () => {
        await result.current.handleGallerySelection();
      });

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('capture_source_selected', {
        userId: undefined,
        origin: 'wardrobe',
        source: 'gallery',
      });
    });
  });

  describe('error handling', () => {
    it('uses fallback validation message when error is missing', async () => {
      const options = {
        ...defaultOptions,
        galleryPicker: {
          ...defaultOptions.galleryPicker,
          pickImage: jest.fn().mockResolvedValue({
            success: false,
            reason: 'invalid',
            // error is undefined
          }),
        },
      };
      const { result } = renderHook(() => useGallerySelection(options));

      await act(async () => {
        await result.current.handleGallerySelection();
      });

      expect(mockGetValidationErrorMessage).toHaveBeenCalledWith('invalid_dimensions');
      expect(Alert.alert).toHaveBeenCalledWith(
        'screens.capture.errors.invalidImage',
        'Validation error message',
        expect.any(Array)
      );
    });

    it('uses fallback error message for generic errors', async () => {
      const options = {
        ...defaultOptions,
        galleryPicker: {
          ...defaultOptions.galleryPicker,
          pickImage: jest.fn().mockResolvedValue({
            success: false,
            reason: 'error',
            // error is undefined
          }),
        },
      };
      const { result } = renderHook(() => useGallerySelection(options));

      await act(async () => {
        await result.current.handleGallerySelection();
      });

      expect(Alert.alert).toHaveBeenCalledWith(
        'screens.capture.errors.galleryError',
        'screens.capture.errors.galleryErrorMessage',
        expect.any(Array)
      );
    });
  });

  describe('navigation state management', () => {
    it('sets and resets navigation state correctly', async () => {
      const { result } = renderHook(() => useGallerySelection(defaultOptions));

      await act(async () => {
        await result.current.handleGallerySelection();
      });

      // Should set to true initially
      expect(defaultOptions.setIsNavigating).toHaveBeenCalledWith(true);

      // Should reset to false after timeout
      await waitFor(
        () => {
          expect(defaultOptions.setIsNavigating).toHaveBeenCalledWith(false);
        },
        { timeout: 600 }
      );
    });

    it('resets navigation state on cancellation', async () => {
      const options = {
        ...defaultOptions,
        galleryPicker: {
          ...defaultOptions.galleryPicker,
          pickImage: jest.fn().mockResolvedValue({
            success: false,
            reason: 'cancelled',
          }),
        },
      };
      const { result } = renderHook(() => useGallerySelection(options));

      await act(async () => {
        await result.current.handleGallerySelection();
      });

      expect(options.setIsNavigating).toHaveBeenCalledWith(true);
      expect(options.setIsNavigating).toHaveBeenCalledWith(false);
    });

    it('resets navigation state on error', async () => {
      const options = {
        ...defaultOptions,
        galleryPicker: {
          ...defaultOptions.galleryPicker,
          pickImage: jest.fn().mockResolvedValue({
            success: false,
            reason: 'error',
            error: 'Failed',
          }),
        },
      };
      const { result } = renderHook(() => useGallerySelection(options));

      await act(async () => {
        await result.current.handleGallerySelection();
      });

      expect(options.setIsNavigating).toHaveBeenCalledWith(true);
      expect(options.setIsNavigating).toHaveBeenCalledWith(false);
    });
  });
});
