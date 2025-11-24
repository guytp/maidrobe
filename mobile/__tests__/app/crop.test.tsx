/**
 * Component tests for crop route.
 *
 * Tests the crop route wrapper including:
 * - Protected route behavior (auth loading state)
 * - Feature flag redirect behavior
 *
 * Note: CropScreen component behavior is tested separately in
 * __tests__/wardrobe/crop/CropScreen.test.tsx with comprehensive
 * coverage of gestures, image processing, and navigation.
 *
 * @module __tests__/app/crop
 */

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import CropRoute from '../../app/crop/index';

// Mock dependencies
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));

jest.mock('../../src/features/auth/hooks/useProtectedRoute', () => ({
  useProtectedRoute: jest.fn(),
}));

jest.mock('../../src/core/featureFlags', () => ({
  checkFeatureFlagSync: jest.fn(),
}));

jest.mock('../../src/core/state/store');

jest.mock('../../src/core/theme', () => ({
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

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
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

// Mock i18n
jest.mock('../../src/core/i18n', () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      'screens.crop.title': 'Adjust Photo',
      'screens.crop.confirm': 'Confirm',
      'screens.crop.retake': 'Retake',
      'screens.crop.goBack': 'Go back',
      'screens.crop.errors.loadFailed': 'Failed to load image',
      'screens.crop.errors.processingFailed': 'Failed to process image',
      'screens.crop.errors.noImage': 'No image to adjust',
      'screens.crop.errors.retry': 'Try again',
      'screens.crop.accessibility.screenLabel': 'Photo adjustment screen',
      'screens.crop.accessibility.screenHint': 'Pinch to zoom and drag to pan',
      'screens.crop.accessibility.retakeButton': 'Retake photo',
      'screens.crop.accessibility.confirmButton': 'Confirm crop',
      'screens.crop.accessibility.retryButton': 'Retry processing',
      'screens.crop.accessibility.errorIcon': 'Error icon',
      'screens.crop.accessibility.goBackButton': 'Go back',
    };
    return translations[key] || key;
  },
}));

// Mock telemetry
jest.mock('../../src/core/telemetry', () => ({
  trackCaptureEvent: jest.fn(),
  logError: jest.fn(),
  logSuccess: jest.fn(),
}));

// Mock image processing
jest.mock('../../src/features/wardrobe/crop/utils/imageProcessing', () => ({
  computeCropRectangle: jest.fn().mockReturnValue({
    originX: 0,
    originY: 0,
    width: 1280,
    height: 1600,
  }),
  cropAndProcessImage: jest.fn().mockResolvedValue({
    uri: 'file:///processed/image.jpg',
    width: 1280,
    height: 1600,
    source: 'camera',
  }),
  TARGET_MAX_DIMENSION: 1600,
  JPEG_QUALITY: 0.85,
  CROP_ASPECT_RATIO: 0.8,
}));

// Mock error utilities
jest.mock('../../src/features/wardrobe/crop/utils/errors', () => ({
  CropError: class CropError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
  classifyError: jest.fn().mockReturnValue('unknown'),
  formatErrorForLogging: jest.fn().mockReturnValue({}),
}));

// Mock capture type guard
jest.mock('../../src/core/types/capture', () => ({
  isCaptureImagePayload: jest.fn().mockReturnValue(true),
}));

const mockUseRouter = require('expo-router').useRouter;
const mockUseProtectedRoute = require('../../src/features/auth/hooks/useProtectedRoute').useProtectedRoute;
const mockCheckFeatureFlagSync = require('../../src/core/featureFlags').checkFeatureFlagSync;
const mockUseStore = require('../../src/core/state/store').useStore;
const mockIsCaptureImagePayload = require('../../src/core/types/capture').isCaptureImagePayload;

describe('Crop Route', () => {
  let mockRouter: any;
  let mockClearPayload: jest.Mock;
  let mockSetPayload: jest.Mock;

  const validPayload = {
    uri: 'file:///path/to/image.jpg',
    width: 1920,
    height: 1080,
    origin: 'wardrobe',
    source: 'camera',
    createdAt: '2024-01-15T10:30:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockRouter = {
      push: jest.fn(),
      replace: jest.fn(),
    };
    mockUseRouter.mockReturnValue(mockRouter);
    mockUseProtectedRoute.mockReturnValue(true);
    mockCheckFeatureFlagSync.mockReturnValue({ enabled: true, requiresUpdate: false });
    mockIsCaptureImagePayload.mockReturnValue(true);

    mockClearPayload = jest.fn();
    mockSetPayload = jest.fn();

    mockUseStore.mockImplementation((selector: any) =>
      selector({
        payload: validPayload,
        setPayload: mockSetPayload,
        clearPayload: mockClearPayload,
        user: { id: 'test-user-id' },
      })
    );
  });

  describe('protected route', () => {
    it('shows loading while auth is checking', () => {
      mockUseProtectedRoute.mockReturnValue(false);

      const { getByLabelText } = render(<CropRoute />);
      expect(getByLabelText('Loading crop screen')).toBeTruthy();
    });

    it('renders CropScreen when authorized', () => {
      mockUseProtectedRoute.mockReturnValue(true);

      const { getByLabelText } = render(<CropRoute />);
      // CropScreen renders with this accessibility label
      expect(getByLabelText('Photo adjustment screen')).toBeTruthy();
    });
  });

  describe('feature flag', () => {
    it('renders normally when feature flag is enabled', () => {
      mockCheckFeatureFlagSync.mockReturnValue({ enabled: true, requiresUpdate: false });

      const { getByLabelText } = render(<CropRoute />);
      expect(getByLabelText('Photo adjustment screen')).toBeTruthy();
      expect(mockRouter.replace).not.toHaveBeenCalled();
    });

    it('redirects to item creation when feature flag is disabled', async () => {
      mockCheckFeatureFlagSync.mockReturnValue({ enabled: false, requiresUpdate: false });

      render(<CropRoute />);

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith('/onboarding/first-item');
      });
    });

    it('redirects when feature flag requires update', async () => {
      mockCheckFeatureFlagSync.mockReturnValue({ enabled: true, requiresUpdate: true });

      render(<CropRoute />);

      await waitFor(() => {
        expect(mockRouter.replace).toHaveBeenCalledWith('/onboarding/first-item');
      });
    });
  });
});
