/**
 * Component tests for CaptureCameraScreen.
 *
 * Tests camera capture screen with camera controls, validation,
 * and navigation.
 *
 * @module __tests__/wardrobe/components/CaptureCameraScreen
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { CaptureCameraScreen } from '../../../src/features/wardrobe/components/CaptureCameraScreen';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { trackCaptureEvent } from '../../../src/core/telemetry';
import { useStore } from '../../../src/core/state/store';
import { useCapturePermissions } from '../../../src/features/wardrobe/hooks/useCapturePermissions';
import { useGalleryPicker } from '../../../src/features/wardrobe/hooks/useGalleryPicker';
import { validateCapturedImage } from '../../../src/core/utils/imageValidation';

// Mock CameraView
jest.mock('expo-camera', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const { View, Text } = require('react-native');
  return {
    CameraView: ({ onCameraReady, onMountError, ...props }: { onCameraReady?: () => void; onMountError?: () => void }) => {
      return (
        <View testID="camera-view">
          <Text>Camera Preview</Text>
        </View>
      );
    },
  };
});

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
jest.mock('../../../src/core/utils/imageValidation');

jest.mock('../../../src/core/theme', () => ({
  useTheme: () => ({
    colors: {
      background: '#FFFFFF',
      textPrimary: '#000000',
      textSecondary: '#666666',
      primary: '#007AFF',
    },
    spacing: { sm: 8, md: 16, lg: 24, xl: 32 },
  }),
}));

const mockUseRouter = useRouter as jest.Mock;
const mockUseLocalSearchParams = useLocalSearchParams as jest.Mock;
const mockTrackCaptureEvent = trackCaptureEvent as jest.Mock;
const mockUseStore = useStore as unknown as jest.Mock;
const mockUseCapturePermissions = useCapturePermissions as jest.Mock;
const mockUseGalleryPicker = useGalleryPicker as jest.Mock;
const mockValidateCapturedImage = validateCapturedImage as jest.Mock;

describe('CaptureCameraScreen', () => {
  let mockRouter: any;
  let mockSetPayload: jest.Mock;
  let mockSetSource: jest.Mock;
  let mockSetErrorMessage: jest.Mock;
  let mockSetIsNavigating: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert');

    mockRouter = {
      push: jest.fn(),
    };
    mockUseRouter.mockReturnValue(mockRouter);
    mockUseLocalSearchParams.mockReturnValue({ origin: 'wardrobe' });

    mockSetPayload = jest.fn();
    mockSetSource = jest.fn();
    mockSetErrorMessage = jest.fn();
    mockSetIsNavigating = jest.fn();

    mockUseStore.mockImplementation((selector: any) =>
      selector({
        user: { id: 'test-user-id' },
        origin: 'wardrobe',
        source: 'camera',
        errorMessage: null,
        setPayload: mockSetPayload,
        setSource: mockSetSource,
        setErrorMessage: mockSetErrorMessage,
        setIsNavigating: mockSetIsNavigating,
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

    mockValidateCapturedImage.mockReturnValue({
      isValid: true,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('initial render', () => {
    it('renders camera view', () => {
      const { getByTestId } = render(<CaptureCameraScreen />);
      expect(getByTestId('camera-view')).toBeTruthy();
    });

    it('tracks camera_opened event', () => {
      render(<CaptureCameraScreen />);
      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('camera_opened', {
        userId: 'test-user-id',
        origin: 'wardrobe',
      });
    });

    it('displays guidance text', () => {
      const { getByText } = render(<CaptureCameraScreen />);
      expect(getByText(/Lay your item flat/i)).toBeTruthy();
    });
  });

  describe('cancel navigation', () => {
    it('navigates to wardrobe when origin is wardrobe', () => {
      mockUseLocalSearchParams.mockReturnValue({ origin: 'wardrobe' });
      mockUseStore.mockImplementation((selector: any) =>
        selector({
          user: { id: 'test-user-id' },
          origin: 'wardrobe',
          source: 'camera',
          errorMessage: null,
          setPayload: mockSetPayload,
          setSource: mockSetSource,
          setErrorMessage: mockSetErrorMessage,
          setIsNavigating: mockSetIsNavigating,
        })
      );

      const { getByText } = render(<CaptureCameraScreen />);
      fireEvent.press(getByText('Cancel'));

      expect(mockRouter.push).toHaveBeenCalledWith('/wardrobe');
    });

    it('navigates to onboarding when origin is onboarding', () => {
      mockUseLocalSearchParams.mockReturnValue({ origin: 'onboarding' });
      mockUseStore.mockImplementation((selector: any) =>
        selector({
          user: { id: 'test-user-id' },
          origin: 'onboarding',
          source: 'camera',
          errorMessage: null,
          setPayload: mockSetPayload,
          setSource: mockSetSource,
          setErrorMessage: mockSetErrorMessage,
          setIsNavigating: mockSetIsNavigating,
        })
      );

      const { getByText } = render(<CaptureCameraScreen />);
      fireEvent.press(getByText('Cancel'));

      expect(mockRouter.push).toHaveBeenCalledWith('/onboarding/first-item');
    });

    it('tracks capture_cancelled event with camera source', () => {
      const { getByText } = render(<CaptureCameraScreen />);
      fireEvent.press(getByText('Cancel'));

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('capture_cancelled', {
        userId: 'test-user-id',
        origin: 'wardrobe',
        source: 'camera',
      });
    });
  });

  describe('flash control', () => {
    it('toggles flash mode from off to on to auto', () => {
      const { getByText, getByLabelText } = render(<CaptureCameraScreen />);

      // Initially off
      expect(getByText('Flash: Off')).toBeTruthy();

      // Toggle to on
      const flashButton = getByLabelText('Toggle flash mode');
      fireEvent.press(flashButton);
      expect(getByText('Flash: On')).toBeTruthy();

      // Toggle to auto
      fireEvent.press(flashButton);
      expect(getByText('Flash: Auto')).toBeTruthy();

      // Toggle back to off
      fireEvent.press(flashButton);
      expect(getByText('Flash: Off')).toBeTruthy();
    });
  });

  describe('gallery button from camera', () => {
    it('launches gallery picker when pressed', async () => {
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

      const { getByText } = render(<CaptureCameraScreen />);
      await fireEvent.press(getByText('Gallery'));

      await waitFor(() => {
        expect(mockPickImage).toHaveBeenCalled();
      });
    });

    it('navigates to crop on successful gallery selection', async () => {
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

      const { getByText } = render(<CaptureCameraScreen />);
      await fireEvent.press(getByText('Gallery'));

      await waitFor(() => {
        expect(mockSetPayload).toHaveBeenCalled();
        expect(mockRouter.push).toHaveBeenCalledWith('/crop');
      });
    });
  });

  describe('accessibility', () => {
    it('has accessible labels for controls', () => {
      const { getByLabelText } = render(<CaptureCameraScreen />);

      expect(getByLabelText('Capture photo')).toBeTruthy();
      expect(getByLabelText('Toggle flash mode')).toBeTruthy();
      expect(getByLabelText('Cancel and go back')).toBeTruthy();
    });

    it('has accessible hints for shutter button', () => {
      const { getByLabelText } = render(<CaptureCameraScreen />);
      const shutterButton = getByLabelText('Capture photo');
      expect(shutterButton.props.accessibilityHint).toContain('Take a photo');
    });
  });

  describe('error states', () => {
    it('displays error message when camera fails', () => {
      mockUseStore.mockImplementation((selector: any) =>
        selector({
          user: { id: 'test-user-id' },
          origin: 'wardrobe',
          source: 'camera',
          errorMessage: 'Camera initialization failed',
          setPayload: mockSetPayload,
          setSource: mockSetSource,
          setErrorMessage: mockSetErrorMessage,
          setIsNavigating: mockSetIsNavigating,
        })
      );

      const { getByText } = render(<CaptureCameraScreen />);
      expect(getByText('Camera initialization failed')).toBeTruthy();
    });

    it('provides retry option on error', () => {
      mockUseStore.mockImplementation((selector: any) =>
        selector({
          user: { id: 'test-user-id' },
          origin: 'wardrobe',
          source: 'camera',
          errorMessage: 'Camera error',
          setPayload: mockSetPayload,
          setSource: mockSetSource,
          setErrorMessage: mockSetErrorMessage,
          setIsNavigating: mockSetIsNavigating,
        })
      );

      const { getByText } = render(<CaptureCameraScreen />);
      expect(getByText('Retry')).toBeTruthy();
    });

    it('provides gallery fallback option on error', () => {
      mockUseStore.mockImplementation((selector: any) =>
        selector({
          user: { id: 'test-user-id' },
          origin: 'wardrobe',
          source: 'camera',
          errorMessage: 'Camera error',
          setPayload: mockSetPayload,
          setSource: mockSetSource,
          setErrorMessage: mockSetErrorMessage,
          setIsNavigating: mockSetIsNavigating,
        })
      );

      const { getByText } = render(<CaptureCameraScreen />);
      expect(getByText('Use Gallery Instead')).toBeTruthy();
    });
  });
});
