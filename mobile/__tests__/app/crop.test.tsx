/**
 * Component tests for crop route.
 *
 * Tests the crop entry screen with payload validation and navigation.
 *
 * @module __tests__/app/crop
 */

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import CropRoute from '../../app/crop/index';
import { CaptureImagePayload } from '../../src/core/types/capture';

// Mock dependencies
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));

jest.mock('../../src/features/auth/hooks/useProtectedRoute', () => ({
  useProtectedRoute: jest.fn(),
}));

jest.mock('../../src/core/state/store');

jest.mock('../../src/core/theme', () => ({
  useTheme: () => ({
    colors: {
      background: '#FFFFFF',
      textPrimary: '#000000',
      textSecondary: '#666666',
      primary: '#007AFF',
    },
    colorScheme: 'light',
    spacing: { sm: 8, md: 16, lg: 24, xl: 32 },
  }),
}));

const mockUseRouter = require('expo-router').useRouter;
const mockUseProtectedRoute = require('../../src/features/auth/hooks/useProtectedRoute').useProtectedRoute;
const mockUseStore = require('../../src/core/state/store').useStore;

describe('Crop Route', () => {
  let mockRouter: any;
  let mockClearPayload: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRouter = {
      push: jest.fn(),
    };
    mockUseRouter.mockReturnValue(mockRouter);
    mockUseProtectedRoute.mockReturnValue(true);

    mockClearPayload = jest.fn();
  });

  describe('with valid payload', () => {
    const validPayload: CaptureImagePayload = {
      uri: 'file:///path/to/image.jpg',
      width: 1920,
      height: 1080,
      origin: 'wardrobe',
      source: 'camera',
      createdAt: '2024-01-15T10:30:00.000Z',
    };

    it('renders placeholder UI for valid payload', () => {
      mockUseStore.mockImplementation((selector: any) =>
        selector({
          payload: validPayload,
          clearPayload: mockClearPayload,
        })
      );

      const { getByText } = render(<CropRoute />);
      expect(getByText('Crop & Adjust')).toBeTruthy();
      expect(getByText(/Crop UI will be implemented in Story #205/i)).toBeTruthy();
    });

    it('displays origin and source in debug info', () => {
      mockUseStore.mockImplementation((selector: any) =>
        selector({
          payload: validPayload,
          clearPayload: mockClearPayload,
        })
      );

      const { getByText } = render(<CropRoute />);
      expect(getByText(/Origin: wardrobe/i)).toBeTruthy();
      expect(getByText(/Source: camera/i)).toBeTruthy();
    });

    it('shows go back button', () => {
      mockUseStore.mockImplementation((selector: any) =>
        selector({
          payload: validPayload,
          clearPayload: mockClearPayload,
        })
      );

      const { getByText } = render(<CropRoute />);
      expect(getByText('Go Back')).toBeTruthy();
    });
  });

  describe('with invalid payload', () => {
    it('shows error UI for missing payload', () => {
      mockUseStore.mockImplementation((selector: any) =>
        selector({
          payload: null,
          clearPayload: mockClearPayload,
        })
      );

      const { getByText } = render(<CropRoute />);
      expect(getByText('No Image Selected')).toBeTruthy();
      expect(getByText(/No image was captured or selected/i)).toBeTruthy();
    });

    it('shows error UI for invalid payload structure', () => {
      mockUseStore.mockImplementation((selector: any) =>
        selector({
          payload: { invalid: 'data' },
          clearPayload: mockClearPayload,
        })
      );

      const { getByText } = render(<CropRoute />);
      expect(getByText('No Image Selected')).toBeTruthy();
    });

    it('shows error UI for payload with zero dimensions', () => {
      mockUseStore.mockImplementation((selector: any) =>
        selector({
          payload: {
            uri: 'file:///image.jpg',
            width: 0,
            height: 1080,
            origin: 'wardrobe',
            source: 'camera',
            createdAt: '2024-01-15T10:30:00.000Z',
          },
          clearPayload: mockClearPayload,
        })
      );

      const { getByText } = render(<CropRoute />);
      expect(getByText('No Image Selected')).toBeTruthy();
    });

    it('clears invalid payload on mount', async () => {
      mockUseStore.mockImplementation((selector: any) =>
        selector({
          payload: null,
          clearPayload: mockClearPayload,
        })
      );

      render(<CropRoute />);

      await waitFor(() => {
        expect(mockClearPayload).toHaveBeenCalled();
      });
    });
  });

  describe('navigation - wardrobe origin', () => {
    it('navigates to wardrobe on go back', () => {
      const payload: CaptureImagePayload = {
        uri: 'file:///image.jpg',
        width: 1920,
        height: 1080,
        origin: 'wardrobe',
        source: 'camera',
        createdAt: '2024-01-15T10:30:00.000Z',
      };

      mockUseStore.mockImplementation((selector: any) =>
        selector({
          payload,
          clearPayload: mockClearPayload,
        })
      );

      const { getByText } = render(<CropRoute />);
      fireEvent.press(getByText('Go Back'));

      expect(mockClearPayload).toHaveBeenCalled();
      expect(mockRouter.push).toHaveBeenCalledWith('/wardrobe');
    });
  });

  describe('navigation - onboarding origin', () => {
    it('navigates to onboarding on go back', () => {
      const payload: CaptureImagePayload = {
        uri: 'file:///image.jpg',
        width: 1920,
        height: 1080,
        origin: 'onboarding',
        source: 'gallery',
        createdAt: '2024-01-15T10:30:00.000Z',
      };

      mockUseStore.mockImplementation((selector: any) =>
        selector({
          payload,
          clearPayload: mockClearPayload,
        })
      );

      const { getByText } = render(<CropRoute />);
      fireEvent.press(getByText('Go Back'));

      expect(mockClearPayload).toHaveBeenCalled();
      expect(mockRouter.push).toHaveBeenCalledWith('/onboarding/first-item');
    });
  });

  describe('navigation - invalid payload', () => {
    it('navigates to home when payload is missing', () => {
      mockUseStore.mockImplementation((selector: any) =>
        selector({
          payload: null,
          clearPayload: mockClearPayload,
        })
      );

      const { getByText } = render(<CropRoute />);
      fireEvent.press(getByText('Go Back'));

      expect(mockClearPayload).toHaveBeenCalled();
      expect(mockRouter.push).toHaveBeenCalledWith('/home');
    });

    it('navigates to home when origin is unknown', () => {
      mockUseStore.mockImplementation((selector: any) =>
        selector({
          payload: {
            uri: 'file:///image.jpg',
            width: 1920,
            height: 1080,
            origin: 'unknown' as any,
            source: 'camera',
            createdAt: '2024-01-15T10:30:00.000Z',
          },
          clearPayload: mockClearPayload,
        })
      );

      const { getByText } = render(<CropRoute />);
      fireEvent.press(getByText('Go Back'));

      expect(mockRouter.push).toHaveBeenCalledWith('/home');
    });
  });

  describe('protected route', () => {
    it('shows loading while auth is checking', () => {
      mockUseProtectedRoute.mockReturnValue(false);
      mockUseStore.mockImplementation((selector: any) =>
        selector({
          payload: null,
          clearPayload: mockClearPayload,
        })
      );

      const { getByLabelText } = render(<CropRoute />);
      expect(getByLabelText('Loading crop screen')).toBeTruthy();
    });

    it('renders content when authorized', () => {
      mockUseProtectedRoute.mockReturnValue(true);
      mockUseStore.mockImplementation((selector: any) =>
        selector({
          payload: null,
          clearPayload: mockClearPayload,
        })
      );

      const { getByText } = render(<CropRoute />);
      expect(getByText('No Image Selected')).toBeTruthy();
    });
  });

  describe('accessibility', () => {
    it('has screen label', () => {
      mockUseStore.mockImplementation((selector: any) =>
        selector({
          payload: null,
          clearPayload: mockClearPayload,
        })
      );

      const { getByLabelText } = render(<CropRoute />);
      expect(getByLabelText('Crop and adjust image screen')).toBeTruthy();
    });

    it('has accessible go back button', () => {
      mockUseStore.mockImplementation((selector: any) =>
        selector({
          payload: null,
          clearPayload: mockClearPayload,
        })
      );

      const { getByLabelText } = render(<CropRoute />);
      const backButton = getByLabelText('Go back to previous screen');
      expect(backButton).toBeTruthy();
    });

    it('supports font scaling', () => {
      mockUseStore.mockImplementation((selector: any) =>
        selector({
          payload: null,
          clearPayload: mockClearPayload,
        })
      );

      const { getByText } = render(<CropRoute />);
      const errorTitle = getByText('No Image Selected');
      expect(errorTitle.props.allowFontScaling).toBe(true);
      expect(errorTitle.props.maxFontSizeMultiplier).toBe(2);
    });
  });
});
