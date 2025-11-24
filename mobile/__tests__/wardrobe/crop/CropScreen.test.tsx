/**
 * Component tests for CropScreen.
 *
 * Tests the crop & adjust screen including:
 * - Initial render with valid/invalid payload
 * - Button interactions (retake, confirm, retry)
 * - Image processing pipeline triggering
 * - Error state handling and display
 * - Accessibility labels and hints
 *
 * Note: Gesture handling (pan, pinch-to-zoom) is difficult to test
 * in JSDOM environment. The pure helper functions are tested separately
 * in imageProcessing.test.ts.
 *
 * @module __tests__/wardrobe/crop/CropScreen
 */

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { CropScreen } from '../../../src/features/wardrobe/crop/components/CropScreen';

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));

// Mock expo-screen-orientation
jest.mock('expo-screen-orientation', () => ({
  lockAsync: jest.fn().mockResolvedValue(undefined),
  unlockAsync: jest.fn().mockResolvedValue(undefined),
  OrientationLock: {
    PORTRAIT_UP: 'PORTRAIT_UP',
  },
}));

// Mock expo-file-system
jest.mock('expo-file-system', () => ({
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}));

// Mock expo-status-bar
jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

// Mock core store
jest.mock('../../../src/core/state/store');

// Mock core theme
jest.mock('../../../src/core/theme', () => ({
  useTheme: () => ({
    colors: {
      background: '#FFFFFF',
      textPrimary: '#000000',
      textSecondary: '#666666',
      primary: '#007AFF',
      error: '#FF3B30',
      maskOverlay: 0.5,
    },
    colorScheme: 'light',
    spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
    sizing: { touchTarget: 44, controlAreaHeight: 92 },
  }),
}));

// Mock core i18n
jest.mock('../../../src/core/i18n', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'screens.crop.title': 'Adjust Photo',
      'screens.crop.confirm': 'Confirm',
      'screens.crop.retake': 'Retake',
      'screens.crop.goBack': 'Go back',
      'screens.crop.errors.noImage': 'No image to adjust',
      'screens.crop.errors.invalidPayload': 'Invalid image data',
      'screens.crop.errors.loadFailed': 'Unable to load image',
      'screens.crop.errors.loadFailedMessage': 'We could not crop this photo',
      'screens.crop.accessibility.screenLabel': 'Photo adjustment screen',
      'screens.crop.accessibility.screenHint': 'Crop and adjust your captured photo',
      'screens.crop.accessibility.errorIcon': 'Warning: No image available',
      'screens.crop.accessibility.goBackButton': 'Go back button',
      'screens.crop.accessibility.goBackHint': 'Return to capture screen',
      'screens.crop.accessibility.confirmButton': 'Confirm crop button',
      'screens.crop.accessibility.confirmHint': 'Confirm crop and proceed',
      'screens.crop.accessibility.retakeButton': 'Retake photo button',
      'screens.crop.accessibility.retakeHint': 'Return to camera',
      'screens.crop.accessibility.retryButton': 'Retry processing',
      'screens.crop.accessibility.retryHint': 'Retry the image processing',
      'processing_image': 'Processing image...',
      'processing_failed': 'Failed to process image',
      'retry': 'Retry',
    };
    return translations[key] || key;
  },
}));

// Mock core telemetry
jest.mock('../../../src/core/telemetry', () => ({
  trackCaptureEvent: jest.fn(),
  logError: jest.fn(),
  logSuccess: jest.fn(),
}));

// Mock imageProcessing utilities
jest.mock('../../../src/features/wardrobe/crop/utils/imageProcessing', () => ({
  computeCropRectangle: jest.fn().mockReturnValue({
    x: 0,
    y: 0,
    width: 800,
    height: 1000,
  }),
  cropAndProcessImage: jest.fn(),
}));

// Mock errors utilities
jest.mock('../../../src/features/wardrobe/crop/utils/errors', () => ({
  CropError: class CropError extends Error {
    code: string;
    cause?: Error;
    constructor(message: string, code: string, cause?: Error) {
      super(message);
      this.name = 'CropError';
      this.code = code;
      this.cause = cause;
    }
  },
  classifyError: jest.fn().mockReturnValue('processing'),
  formatErrorForLogging: jest.fn().mockReturnValue({
    message: 'Test error',
    name: 'CropError',
    code: 'processing',
    causeChain: [],
  }),
}));

// Mock capture type guard
jest.mock('../../../src/core/types/capture', () => ({
  isCaptureImagePayload: jest.fn(),
}));

const mockUseRouter = require('expo-router').useRouter;
const mockUseStore = require('../../../src/core/state/store').useStore;
const mockTrackCaptureEvent = require('../../../src/core/telemetry').trackCaptureEvent;
const mockLogError = require('../../../src/core/telemetry').logError;
const mockLogSuccess = require('../../../src/core/telemetry').logSuccess;
const mockCropAndProcessImage = require('../../../src/features/wardrobe/crop/utils/imageProcessing').cropAndProcessImage;
const mockComputeCropRectangle = require('../../../src/features/wardrobe/crop/utils/imageProcessing').computeCropRectangle;
const mockIsCaptureImagePayload = require('../../../src/core/types/capture').isCaptureImagePayload;
const mockLockAsync = require('expo-screen-orientation').lockAsync;
const mockDeleteAsync = require('expo-file-system').deleteAsync;

describe('CropScreen', () => {
  let mockRouter: { push: jest.Mock; back: jest.Mock };
  let mockSetPayload: jest.Mock;
  let mockClearPayload: jest.Mock;

  const validPayload = {
    uri: 'file:///test/image.jpg',
    width: 1920,
    height: 1080,
    origin: 'wardrobe' as const,
    source: 'camera' as const,
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockRouter = {
      push: jest.fn(),
      back: jest.fn(),
    };
    mockUseRouter.mockReturnValue(mockRouter);

    mockSetPayload = jest.fn();
    mockClearPayload = jest.fn();

    // Default: valid payload
    mockIsCaptureImagePayload.mockReturnValue(true);

    mockUseStore.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({
        payload: validPayload,
        setPayload: mockSetPayload,
        clearPayload: mockClearPayload,
        user: { id: 'test-user-id' },
      })
    );

    // Default: successful processing
    mockCropAndProcessImage.mockResolvedValue({
      uri: 'file:///processed/image.jpg',
      width: 1280,
      height: 1600,
      source: 'camera',
    });
  });

  describe('initial render', () => {
    it('renders crop interface with valid payload', () => {
      const { getByLabelText, getByText } = render(<CropScreen />);

      expect(getByLabelText('Photo adjustment screen')).toBeTruthy();
      expect(getByText('Retake')).toBeTruthy();
      expect(getByText('Confirm')).toBeTruthy();
    });

    it('shows error UI when payload is invalid', () => {
      mockIsCaptureImagePayload.mockReturnValue(false);

      const { getByText } = render(<CropScreen />);

      expect(getByText('No image to adjust')).toBeTruthy();
      expect(getByText('Go back')).toBeTruthy();
    });

    it('tracks crop_screen_opened event on mount', () => {
      render(<CropScreen />);

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('crop_screen_opened', {
        userId: 'test-user-id',
        origin: 'wardrobe',
        source: 'camera',
        width: 1920,
        height: 1080,
      });
    });

    it('locks orientation to portrait on mount', () => {
      render(<CropScreen />);

      expect(mockLockAsync).toHaveBeenCalledWith('PORTRAIT_UP');
    });

    it('clears payload when invalid', () => {
      mockIsCaptureImagePayload.mockReturnValue(false);

      render(<CropScreen />);

      expect(mockClearPayload).toHaveBeenCalled();
    });
  });

  describe('retake button', () => {
    it('navigates to wardrobe when origin is wardrobe', () => {
      const { getByText } = render(<CropScreen />);

      fireEvent.press(getByText('Retake'));

      expect(mockRouter.push).toHaveBeenCalledWith('/wardrobe');
    });

    it('navigates to onboarding when origin is onboarding', () => {
      mockUseStore.mockImplementation((selector: (state: unknown) => unknown) =>
        selector({
          payload: { ...validPayload, origin: 'onboarding' },
          setPayload: mockSetPayload,
          clearPayload: mockClearPayload,
          user: { id: 'test-user-id' },
        })
      );

      const { getByText } = render(<CropScreen />);

      fireEvent.press(getByText('Retake'));

      expect(mockRouter.push).toHaveBeenCalledWith('/onboarding/first-item');
    });

    it('tracks crop_cancelled event', () => {
      const { getByText } = render(<CropScreen />);

      fireEvent.press(getByText('Retake'));

      expect(mockTrackCaptureEvent).toHaveBeenCalledWith('crop_cancelled', {
        userId: 'test-user-id',
        origin: 'wardrobe',
        source: 'camera',
      });
    });

    it('clears payload on retake', () => {
      const { getByText } = render(<CropScreen />);

      fireEvent.press(getByText('Retake'));

      expect(mockClearPayload).toHaveBeenCalled();
    });
  });

  describe('confirm button', () => {
    it('triggers image processing on press', async () => {
      const { getByText } = render(<CropScreen />);

      fireEvent.press(getByText('Confirm'));

      await waitFor(() => {
        expect(mockComputeCropRectangle).toHaveBeenCalled();
        expect(mockCropAndProcessImage).toHaveBeenCalled();
      });
    });

    it('tracks crop_processing_started event', async () => {
      const { getByText } = render(<CropScreen />);

      fireEvent.press(getByText('Confirm'));

      await waitFor(() => {
        expect(mockTrackCaptureEvent).toHaveBeenCalledWith('crop_processing_started', {
          userId: 'test-user-id',
          origin: 'wardrobe',
          source: 'camera',
        });
      });
    });

    it('updates payload on successful processing', async () => {
      const { getByText } = render(<CropScreen />);

      fireEvent.press(getByText('Confirm'));

      await waitFor(() => {
        expect(mockSetPayload).toHaveBeenCalledWith(
          expect.objectContaining({
            uri: 'file:///processed/image.jpg',
            width: 1280,
            height: 1600,
            source: 'camera',
          })
        );
      });
    });

    it('navigates to item creation on success', async () => {
      const { getByText } = render(<CropScreen />);

      fireEvent.press(getByText('Confirm'));

      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith('/onboarding/first-item');
      });
    });

    it('logs success on successful processing', async () => {
      const { getByText } = render(<CropScreen />);

      fireEvent.press(getByText('Confirm'));

      await waitFor(() => {
        expect(mockLogSuccess).toHaveBeenCalledWith(
          'crop',
          'image_processing',
          expect.objectContaining({
            data: expect.objectContaining({
              inputWidth: 1920,
              inputHeight: 1080,
            }),
          })
        );
      });
    });

    it('cleans up temporary file after success', async () => {
      const { getByText } = render(<CropScreen />);

      fireEvent.press(getByText('Confirm'));

      await waitFor(() => {
        expect(mockDeleteAsync).toHaveBeenCalledWith(
          'file:///test/image.jpg',
          { idempotent: true }
        );
      });
    });
  });

  describe('error handling', () => {
    it('displays error overlay on processing failure', async () => {
      mockCropAndProcessImage.mockRejectedValue(new Error('Processing failed'));

      const { getByText } = render(<CropScreen />);

      fireEvent.press(getByText('Confirm'));

      await waitFor(() => {
        expect(getByText('Failed to process image')).toBeTruthy();
      });
    });

    it('shows retry button on error', async () => {
      mockCropAndProcessImage.mockRejectedValue(new Error('Processing failed'));

      const { getByText } = render(<CropScreen />);

      fireEvent.press(getByText('Confirm'));

      await waitFor(() => {
        expect(getByText('Retry')).toBeTruthy();
      });
    });

    it('logs error with telemetry on failure', async () => {
      const testError = new Error('Test processing error');
      mockCropAndProcessImage.mockRejectedValue(testError);

      const { getByText } = render(<CropScreen />);

      fireEvent.press(getByText('Confirm'));

      await waitFor(() => {
        expect(mockLogError).toHaveBeenCalledWith(
          testError,
          'user',
          expect.objectContaining({
            feature: 'crop',
            operation: 'image_processing',
          })
        );
      });
    });

    it('tracks crop_processing_failed event on error', async () => {
      mockCropAndProcessImage.mockRejectedValue(new Error('Test error'));

      const { getByText } = render(<CropScreen />);

      fireEvent.press(getByText('Confirm'));

      await waitFor(() => {
        expect(mockTrackCaptureEvent).toHaveBeenCalledWith(
          'crop_processing_failed',
          expect.objectContaining({
            userId: 'test-user-id',
            origin: 'wardrobe',
            source: 'camera',
          })
        );
      });
    });

    it('retry button retries processing', async () => {
      mockCropAndProcessImage
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValueOnce({
          uri: 'file:///processed/image.jpg',
          width: 1280,
          height: 1600,
          source: 'camera',
        });

      const { getByText } = render(<CropScreen />);

      // First attempt fails
      fireEvent.press(getByText('Confirm'));

      await waitFor(() => {
        expect(getByText('Retry')).toBeTruthy();
      });

      // Retry
      fireEvent.press(getByText('Retry'));

      await waitFor(() => {
        expect(mockCropAndProcessImage).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('go back button (error state)', () => {
    it('renders go back button when payload is invalid', () => {
      mockIsCaptureImagePayload.mockReturnValue(false);

      const { getByText } = render(<CropScreen />);

      expect(getByText('Go back')).toBeTruthy();
    });

    it('navigates to home when go back is pressed with unknown origin', () => {
      mockIsCaptureImagePayload.mockReturnValue(false);
      mockUseStore.mockImplementation((selector: (state: unknown) => unknown) =>
        selector({
          payload: null,
          setPayload: mockSetPayload,
          clearPayload: mockClearPayload,
          user: { id: 'test-user-id' },
        })
      );

      const { getByText } = render(<CropScreen />);

      fireEvent.press(getByText('Go back'));

      expect(mockRouter.push).toHaveBeenCalledWith('/home');
    });
  });

  describe('accessibility', () => {
    it('screen has accessible label', () => {
      const { getByLabelText } = render(<CropScreen />);

      expect(getByLabelText('Photo adjustment screen')).toBeTruthy();
    });

    it('confirm button has accessible label and hint', () => {
      const { getByLabelText } = render(<CropScreen />);

      const confirmButton = getByLabelText('Confirm crop button');
      expect(confirmButton).toBeTruthy();
      expect(confirmButton.props.accessibilityHint).toBe('Confirm crop and proceed');
    });

    it('retake button has accessible label and hint', () => {
      const { getByLabelText } = render(<CropScreen />);

      const retakeButton = getByLabelText('Retake photo button');
      expect(retakeButton).toBeTruthy();
      expect(retakeButton.props.accessibilityHint).toBe('Return to camera');
    });

    it('error state has accessible go back button', () => {
      mockIsCaptureImagePayload.mockReturnValue(false);

      const { getByLabelText } = render(<CropScreen />);

      const goBackButton = getByLabelText('Go back button');
      expect(goBackButton).toBeTruthy();
      expect(goBackButton.props.accessibilityHint).toBe('Return to capture screen');
    });

    it('retry button has accessible label', async () => {
      mockCropAndProcessImage.mockRejectedValue(new Error('Test error'));

      const { getByText, getByLabelText } = render(<CropScreen />);

      fireEvent.press(getByText('Confirm'));

      await waitFor(() => {
        const retryButton = getByLabelText('Retry processing');
        expect(retryButton).toBeTruthy();
      });
    });

    it('error icon has accessible label in error state', () => {
      mockIsCaptureImagePayload.mockReturnValue(false);

      const { getByLabelText } = render(<CropScreen />);

      expect(getByLabelText('Warning: No image available')).toBeTruthy();
    });
  });

  describe('processing state', () => {
    it('shows processing overlay during processing', async () => {
      // Make processing take time
      mockCropAndProcessImage.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      const { getByText } = render(<CropScreen />);

      fireEvent.press(getByText('Confirm'));

      // Check for processing text
      await waitFor(() => {
        expect(getByText('Processing image...')).toBeTruthy();
      });
    });
  });

  describe('image load error', () => {
    it('shows error UI when image fails to load', async () => {
      const { getByText, UNSAFE_getByType } = render(<CropScreen />);

      // Find the Animated.Image and trigger onError
      const { Animated } = require('react-native');
      const images = UNSAFE_getByType(Animated.Image);

      // Trigger onError callback wrapped in act
      await act(async () => {
        if (images.props.onError) {
          images.props.onError();
        }
      });

      await waitFor(() => {
        expect(getByText('Unable to load image')).toBeTruthy();
      });
    });
  });
});
