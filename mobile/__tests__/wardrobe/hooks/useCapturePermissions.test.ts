/**
 * Unit tests for useCapturePermissions hook.
 *
 * Tests permission management hook with mocked permission utilities
 * and telemetry.
 *
 * @module __tests__/wardrobe/hooks/useCapturePermissions
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useCapturePermissions } from '../../../src/features/wardrobe/hooks/useCapturePermissions';

// Mock dependencies
jest.mock('../../../src/core/utils/permissions');
jest.mock('../../../src/core/telemetry', () => ({
  trackCaptureEvent: jest.fn(),
}));
jest.mock('../../../src/core/state/store', () => ({
  useStore: jest.fn((selector) =>
    selector({
      user: { id: 'test-user-id' },
    })
  ),
}));

const mockPermissions = require('../../../src/core/utils/permissions');
const mockTrackCaptureEvent = require('../../../src/core/telemetry').trackCaptureEvent;

describe('useCapturePermissions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPermissions.isCameraAvailable.mockResolvedValue(true);
    mockPermissions.checkCameraPermission.mockResolvedValue('undetermined');
    mockPermissions.checkGalleryPermission.mockResolvedValue('undetermined');
  });

  describe('initial state', () => {
    it('starts with loading true', () => {
      const { result } = renderHook(() => useCapturePermissions('wardrobe'));
      expect(result.current.isLoading).toBe(true);
    });

    it('loads permission statuses on mount', async () => {
      mockPermissions.checkCameraPermission.mockResolvedValue('granted');
      mockPermissions.checkGalleryPermission.mockResolvedValue('granted');

      const { result } = renderHook(() => useCapturePermissions('wardrobe'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.camera.status).toBe('granted');
      expect(result.current.gallery.status).toBe('granted');
      expect(result.current.camera.isAvailable).toBe(true);
    });

    it('handles permission check errors gracefully', async () => {
      mockPermissions.checkCameraPermission.mockRejectedValue(new Error('Check failed'));
      mockPermissions.checkGalleryPermission.mockRejectedValue(new Error('Check failed'));

      const { result } = renderHook(() => useCapturePermissions('wardrobe'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.camera.status).toBe('undetermined');
      expect(result.current.gallery.status).toBe('undetermined');
      expect(result.current.camera.isAvailable).toBe(false);
    });
  });

  describe('camera permission request', () => {
    it('requests camera permission and returns granted', async () => {
      mockPermissions.requestCameraPermission.mockResolvedValue('granted');

      const { result } = renderHook(() => useCapturePermissions('wardrobe'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let status: string = '';
      await act(async () => {
        status = await result.current.camera.request();
      });

      expect(status).toBe('granted');
      expect(mockPermissions.requestCameraPermission).toHaveBeenCalledTimes(1);
    });

    it('tracks camera_permission_requested event', async () => {
      mockPermissions.requestCameraPermission.mockResolvedValue('granted');

      const { result } = renderHook(() => useCapturePermissions('onboarding'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.camera.request();
      });

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('camera_permission_requested', {
        userId: 'test-user-id',
        origin: 'onboarding',
      });
    });

    it('tracks camera_permission_granted event on success', async () => {
      mockPermissions.requestCameraPermission.mockResolvedValue('granted');

      const { result } = renderHook(() => useCapturePermissions('wardrobe'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.camera.request();
      });

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('camera_permission_granted', {
        userId: 'test-user-id',
        origin: 'wardrobe',
      });
    });

    it('tracks camera_permission_denied event on denial', async () => {
      mockPermissions.requestCameraPermission.mockResolvedValue('denied');

      const { result } = renderHook(() => useCapturePermissions('wardrobe'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.camera.request();
      });

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('camera_permission_denied', {
        userId: 'test-user-id',
        origin: 'wardrobe',
      });
    });

    it('tracks camera_permission_blocked event when blocked', async () => {
      mockPermissions.requestCameraPermission.mockResolvedValue('blocked');

      const { result } = renderHook(() => useCapturePermissions('wardrobe'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.camera.request();
      });

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('camera_permission_blocked', {
        userId: 'test-user-id',
        origin: 'wardrobe',
      });
    });

    it('updates camera status after request', async () => {
      mockPermissions.requestCameraPermission.mockResolvedValue('granted');

      const { result } = renderHook(() => useCapturePermissions('wardrobe'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.camera.status).toBe('undetermined');

      await act(async () => {
        await result.current.camera.request();
      });

      expect(result.current.camera.status).toBe('granted');
    });

    it('handles request errors', async () => {
      mockPermissions.requestCameraPermission.mockRejectedValue(new Error('Request failed'));

      const { result } = renderHook(() => useCapturePermissions('wardrobe'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let status: string = '';
      await act(async () => {
        status = await result.current.camera.request();
      });

      expect(status).toBe('denied');
      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('camera_permission_denied', {
        userId: 'test-user-id',
        origin: 'wardrobe',
        errorCode: 'permission_request_failed',
      });
    });
  });

  describe('gallery permission request', () => {
    it('requests gallery permission and returns granted', async () => {
      mockPermissions.requestGalleryPermission.mockResolvedValue('granted');

      const { result } = renderHook(() => useCapturePermissions('wardrobe'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let status: string = '';
      await act(async () => {
        status = await result.current.gallery.request();
      });

      expect(status).toBe('granted');
      expect(mockPermissions.requestGalleryPermission).toHaveBeenCalledTimes(1);
    });

    it('tracks gallery_permission_requested event', async () => {
      mockPermissions.requestGalleryPermission.mockResolvedValue('granted');

      const { result } = renderHook(() => useCapturePermissions('wardrobe'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.gallery.request();
      });

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('gallery_permission_requested', {
        userId: 'test-user-id',
        origin: 'wardrobe',
      });
    });

    it('tracks gallery_permission_granted event on success', async () => {
      mockPermissions.requestGalleryPermission.mockResolvedValue('granted');

      const { result } = renderHook(() => useCapturePermissions('wardrobe'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.gallery.request();
      });

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('gallery_permission_granted', {
        userId: 'test-user-id',
        origin: 'wardrobe',
      });
    });

    it('tracks gallery_permission_denied event on denial', async () => {
      mockPermissions.requestGalleryPermission.mockResolvedValue('denied');

      const { result } = renderHook(() => useCapturePermissions('wardrobe'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.gallery.request();
      });

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('gallery_permission_denied', {
        userId: 'test-user-id',
        origin: 'wardrobe',
      });
    });

    it('tracks gallery_permission_blocked event when blocked', async () => {
      mockPermissions.requestGalleryPermission.mockResolvedValue('blocked');

      const { result } = renderHook(() => useCapturePermissions('wardrobe'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.gallery.request();
      });

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('gallery_permission_blocked', {
        userId: 'test-user-id',
        origin: 'wardrobe',
      });
    });

    it('handles request errors', async () => {
      mockPermissions.requestGalleryPermission.mockRejectedValue(new Error('Request failed'));

      const { result } = renderHook(() => useCapturePermissions('wardrobe'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let status: string = '';
      await act(async () => {
        status = await result.current.gallery.request();
      });

      expect(status).toBe('denied');
    });
  });

  describe('openSettings', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('opens app settings', async () => {
      mockPermissions.openAppSettings.mockResolvedValue(true);

      const { result } = renderHook(() => useCapturePermissions('wardrobe'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.camera.openSettings();
      });

      expect(mockPermissions.openAppSettings).toHaveBeenCalledTimes(1);
    });

    it('tracks settings_opened event', async () => {
      mockPermissions.openAppSettings.mockResolvedValue(true);

      const { result } = renderHook(() => useCapturePermissions('wardrobe'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.camera.openSettings();
      });

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('settings_opened', {
        userId: 'test-user-id',
        origin: 'wardrobe',
      });
    });

    it('re-checks permissions after returning from settings', async () => {
      mockPermissions.openAppSettings.mockResolvedValue(true);
      mockPermissions.checkCameraPermission.mockResolvedValue('granted');
      mockPermissions.checkGalleryPermission.mockResolvedValue('granted');

      const { result } = renderHook(() => useCapturePermissions('wardrobe'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.camera.openSettings();
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(mockPermissions.checkCameraPermission).toHaveBeenCalled();
        expect(mockPermissions.checkGalleryPermission).toHaveBeenCalled();
      });
    });
  });

  describe('with null origin', () => {
    it('handles null origin in telemetry', async () => {
      mockPermissions.requestCameraPermission.mockResolvedValue('granted');

      const { result } = renderHook(() => useCapturePermissions(null));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.camera.request();
      });

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('camera_permission_requested', {
        userId: 'test-user-id',
        origin: undefined,
      });
    });
  });

  describe('cleanup', () => {
    it('cleans up on unmount', async () => {
      const { unmount } = renderHook(() => useCapturePermissions('wardrobe'));

      await waitFor(() => {
        expect(mockPermissions.isCameraAvailable).toHaveBeenCalled();
      });

      unmount();
      // No errors should occur
    });
  });
});
