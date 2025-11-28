/**
 * Component tests for CaptureScreen.
 *
 * Tests the initial capture choice screen with permission handling,
 * navigation, and error states.
 *
 * @module __tests__/wardrobe/components/CaptureScreen
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { CaptureScreen } from '../../../src/features/wardrobe/components/CaptureScreen';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { trackCaptureEvent } from '../../../src/core/telemetry';
import { useStore } from '../../../src/core/state/store';
import { useCapturePermissions } from '../../../src/features/wardrobe/hooks/useCapturePermissions';
import { useGalleryPicker } from '../../../src/features/wardrobe/hooks/useGalleryPicker';

// Mock dependencies
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(),
}));

jest.mock('../../../src/core/telemetry', () => ({
  trackCaptureEvent: jest.fn(),
}));

jest.mock('../../../src/core/state/store');
jest.mock('../../../src/features/wardrobe/hooks/useCapturePermissions');
jest.mock('../../../src/features/wardrobe/hooks/useGalleryPicker');
jest.mock('../../../src/core/theme', () => ({
  useTheme: () => ({
    colors: {
      background: '#FFFFFF',
      textPrimary: '#000000',
      textSecondary: '#666666',
      primary: '#007AFF',
    },
    colorScheme: 'light',
    spacing: { sm: 8, md: 16, lg: 24, xl: 32 },
    fontSize: { sm: 14, md: 16, lg: 18 },
  }),
}));

const mockUseRouter = useRouter as jest.Mock;
const mockUseLocalSearchParams = useLocalSearchParams as jest.Mock;
const mockTrackCaptureEvent = trackCaptureEvent as jest.Mock;
const mockUseStore = useStore as unknown as jest.Mock;
const mockUseCapturePermissions = useCapturePermissions as jest.Mock;
const mockUseGalleryPicker = useGalleryPicker as jest.Mock;

describe('CaptureScreen', () => {
  let mockRouter: any;
  let mockSetOrigin: jest.Mock;
  let mockSetSource: jest.Mock;
  let mockSetPayload: jest.Mock;
  let mockSetIsNavigating: jest.Mock;
  let mockResetCapture: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert');

    mockRouter = {
      push: jest.fn(),
      replace: jest.fn(),
    };
    mockUseRouter.mockReturnValue(mockRouter);

    mockSetOrigin = jest.fn();
    mockSetSource = jest.fn();
    mockSetPayload = jest.fn();
    mockSetIsNavigating = jest.fn();
    mockResetCapture = jest.fn();

    mockUseStore.mockImplementation((selector: any) =>
      selector({
        user: { id: 'test-user-id' },
        isNavigating: false,
        setOrigin: mockSetOrigin,
        setSource: mockSetSource,
        setPayload: mockSetPayload,
        setIsNavigating: mockSetIsNavigating,
        resetCapture: mockResetCapture,
      })
    );

    mockUseCapturePermissions.mockReturnValue({
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
      isLoading: false,
    });

    mockUseGalleryPicker.mockReturnValue({
      pickImage: jest.fn(),
      isLoading: false,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('with valid origin', () => {
    it('renders with wardrobe origin', () => {
      mockUseLocalSearchParams.mockReturnValue({ origin: 'wardrobe' });

      const { getByText } = render(<CaptureScreen />);
      expect(getByText('Take Photo')).toBeTruthy();
      expect(getByText('Choose from Gallery')).toBeTruthy();
    });

    it('renders with onboarding origin', () => {
      mockUseLocalSearchParams.mockReturnValue({ origin: 'onboarding' });

      const { getByText } = render(<CaptureScreen />);
      expect(getByText('Take Photo')).toBeTruthy();
      expect(getByText('Choose from Gallery')).toBeTruthy();
    });

    it('sets origin in store on mount', () => {
      mockUseLocalSearchParams.mockReturnValue({ origin: 'wardrobe' });

      render(<CaptureScreen />);
      expect(mockSetOrigin).toHaveBeenCalledWith('wardrobe');
    });

    it('tracks capture_flow_opened event with origin', () => {
      mockUseLocalSearchParams.mockReturnValue({ origin: 'wardrobe' });

      render(<CaptureScreen />);
      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('capture_flow_opened', {
        userId: 'test-user-id',
        origin: 'wardrobe',
      });
    });

    it('resets capture state on unmount', () => {
      mockUseLocalSearchParams.mockReturnValue({ origin: 'wardrobe' });

      const { unmount } = render(<CaptureScreen />);
      unmount();
      expect(mockResetCapture).toHaveBeenCalled();
    });
  });

  describe('with invalid origin', () => {
    it('shows alert for missing origin', async () => {
      mockUseLocalSearchParams.mockReturnValue({});

      render(<CaptureScreen />);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalled();
      });
    });

    it('shows alert for invalid origin value', async () => {
      mockUseLocalSearchParams.mockReturnValue({ origin: 'invalid' });

      render(<CaptureScreen />);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalled();
      });
    });

    it('tracks error for invalid origin', () => {
      mockUseLocalSearchParams.mockReturnValue({ origin: 'invalid' });

      render(<CaptureScreen />);

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('capture_flow_opened', {
        userId: 'test-user-id',
        errorCode: 'invalid_origin',
      });
    });
  });

  describe('cancel navigation', () => {
    it('navigates to wardrobe when origin is wardrobe', () => {
      mockUseLocalSearchParams.mockReturnValue({ origin: 'wardrobe' });

      const { getByText } = render(<CaptureScreen />);
      fireEvent.press(getByText('Cancel'));

      expect(mockRouter.push).toHaveBeenCalledWith('/wardrobe');
    });

    it('navigates to onboarding when origin is onboarding', () => {
      mockUseLocalSearchParams.mockReturnValue({ origin: 'onboarding' });

      const { getByText } = render(<CaptureScreen />);
      fireEvent.press(getByText('Cancel'));

      expect(mockRouter.push).toHaveBeenCalledWith('/onboarding/first-item');
    });

    it('tracks capture_cancelled event', () => {
      mockUseLocalSearchParams.mockReturnValue({ origin: 'wardrobe' });

      const { getByText } = render(<CaptureScreen />);
      fireEvent.press(getByText('Cancel'));

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('capture_cancelled', {
        userId: 'test-user-id',
        origin: 'wardrobe',
      });
    });
  });

  describe('camera button - permission granted', () => {
    it('navigates to camera when permission granted', () => {
      mockUseLocalSearchParams.mockReturnValue({ origin: 'wardrobe' });

      const { getByText } = render(<CaptureScreen />);
      fireEvent.press(getByText('Take Photo'));

      expect(mockSetSource).toHaveBeenCalledWith('camera');
      expect(mockRouter.push).toHaveBeenCalledWith('/capture/camera?origin=wardrobe');
    });

    it('tracks capture_source_selected event for camera', () => {
      mockUseLocalSearchParams.mockReturnValue({ origin: 'wardrobe' });

      const { getByText } = render(<CaptureScreen />);
      fireEvent.press(getByText('Take Photo'));

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('capture_source_selected', {
        userId: 'test-user-id',
        origin: 'wardrobe',
        source: 'camera',
      });
    });

    it('sets navigating state', () => {
      mockUseLocalSearchParams.mockReturnValue({ origin: 'wardrobe' });

      const { getByText } = render(<CaptureScreen />);
      fireEvent.press(getByText('Take Photo'));

      expect(mockSetIsNavigating).toHaveBeenCalledWith(true);
    });
  });

  describe('camera button - permission denied', () => {
    it('shows permission request dialog', async () => {
      mockUseLocalSearchParams.mockReturnValue({ origin: 'wardrobe' });
      mockUseCapturePermissions.mockReturnValue({
        camera: {
          status: 'denied',
          isAvailable: true,
          request: jest.fn().mockResolvedValue('granted'),
          openSettings: jest.fn(),
        },
        gallery: { status: 'granted', request: jest.fn(), openSettings: jest.fn() },
        isLoading: false,
      });

      const { getByText } = render(<CaptureScreen />);
      fireEvent.press(getByText('Take Photo'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalled();
      });
    });
  });

  describe('camera button - permission blocked', () => {
    it('shows settings dialog when permission blocked', async () => {
      mockUseLocalSearchParams.mockReturnValue({ origin: 'wardrobe' });
      mockUseCapturePermissions.mockReturnValue({
        camera: {
          status: 'blocked',
          isAvailable: true,
          request: jest.fn(),
          openSettings: jest.fn(),
        },
        gallery: { status: 'granted', request: jest.fn(), openSettings: jest.fn() },
        isLoading: false,
      });

      const { getByText } = render(<CaptureScreen />);
      fireEvent.press(getByText('Take Photo'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalled();
      });
    });
  });

  describe('camera button - camera unavailable', () => {
    it('shows unavailable dialog and offers gallery', async () => {
      mockUseLocalSearchParams.mockReturnValue({ origin: 'wardrobe' });
      mockUseCapturePermissions.mockReturnValue({
        camera: {
          status: 'granted',
          isAvailable: false,
          request: jest.fn(),
          openSettings: jest.fn(),
        },
        gallery: { status: 'granted', request: jest.fn(), openSettings: jest.fn() },
        isLoading: false,
      });

      const { getByText } = render(<CaptureScreen />);
      fireEvent.press(getByText('Take Photo'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalled();
      });
    });
  });

  describe('gallery button - permission granted', () => {
    it('launches gallery picker when permission granted', async () => {
      mockUseLocalSearchParams.mockReturnValue({ origin: 'wardrobe' });
      const mockPickImage = jest.fn().mockResolvedValue({
        success: true,
        uri: 'file:///image.jpg',
        width: 1920,
        height: 1080,
      });
      mockUseGalleryPicker.mockReturnValue({
        pickImage: mockPickImage,
        isLoading: false,
      });

      const { getByText } = render(<CaptureScreen />);
      await fireEvent.press(getByText('Choose from Gallery'));

      await waitFor(() => {
        expect(mockPickImage).toHaveBeenCalled();
      });
    });

    it('creates payload and navigates to crop on success', async () => {
      mockUseLocalSearchParams.mockReturnValue({ origin: 'wardrobe' });
      const mockPickImage = jest.fn().mockResolvedValue({
        success: true,
        uri: 'file:///image.jpg',
        width: 1920,
        height: 1080,
      });
      mockUseGalleryPicker.mockReturnValue({
        pickImage: mockPickImage,
        isLoading: false,
      });

      const { getByText } = render(<CaptureScreen />);
      await fireEvent.press(getByText('Choose from Gallery'));

      await waitFor(() => {
        expect(mockSetPayload).toHaveBeenCalledWith(
          expect.objectContaining({
            uri: 'file:///image.jpg',
            width: 1920,
            height: 1080,
            origin: 'wardrobe',
            source: 'gallery',
          })
        );
        expect(mockRouter.push).toHaveBeenCalledWith('/crop');
      });
    });

    it('handles gallery cancellation', async () => {
      mockUseLocalSearchParams.mockReturnValue({ origin: 'wardrobe' });
      const mockPickImage = jest.fn().mockResolvedValue({
        success: false,
        reason: 'cancelled',
      });
      mockUseGalleryPicker.mockReturnValue({
        pickImage: mockPickImage,
        isLoading: false,
      });

      const { getByText } = render(<CaptureScreen />);
      await fireEvent.press(getByText('Choose from Gallery'));

      await waitFor(() => {
        expect(mockSetPayload).not.toHaveBeenCalled();
        expect(mockRouter.push).not.toHaveBeenCalled();
      });
    });

    it('shows error for invalid image', async () => {
      mockUseLocalSearchParams.mockReturnValue({ origin: 'wardrobe' });
      const mockPickImage = jest.fn().mockResolvedValue({
        success: false,
        reason: 'invalid',
        error: 'Image too small',
      });
      mockUseGalleryPicker.mockReturnValue({
        pickImage: mockPickImage,
        isLoading: false,
      });

      const { getByText } = render(<CaptureScreen />);
      await fireEvent.press(getByText('Choose from Gallery'));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalled();
      });
    });
  });

  describe('navigation debouncing', () => {
    it('prevents double navigation when isNavigating is true', () => {
      mockUseLocalSearchParams.mockReturnValue({ origin: 'wardrobe' });
      mockUseStore.mockImplementation((selector: any) =>
        selector({
          user: { id: 'test-user-id' },
          isNavigating: true,
          setOrigin: mockSetOrigin,
          setSource: mockSetSource,
          setPayload: mockSetPayload,
          setIsNavigating: mockSetIsNavigating,
          resetCapture: mockResetCapture,
        })
      );

      const { getByText } = render(<CaptureScreen />);
      fireEvent.press(getByText('Take Photo'));

      expect(mockRouter.push).not.toHaveBeenCalled();
    });

    it('prevents navigation when permissions are loading', () => {
      mockUseLocalSearchParams.mockReturnValue({ origin: 'wardrobe' });
      mockUseCapturePermissions.mockReturnValue({
        camera: {
          status: 'granted',
          isAvailable: true,
          request: jest.fn(),
          openSettings: jest.fn(),
        },
        gallery: { status: 'granted', request: jest.fn(), openSettings: jest.fn() },
        isLoading: true,
      });

      const { getByText } = render(<CaptureScreen />);
      fireEvent.press(getByText('Take Photo'));

      expect(mockRouter.push).not.toHaveBeenCalled();
    });
  });
});
