/**
 * Unit tests for permission utilities.
 *
 * Tests camera and gallery permission management functions with mocked
 * expo-camera and expo-image-picker modules.
 *
 * @module __tests__/core/utils/permissions
 */

import {
  PermissionStatus,
  isCameraAvailable,
  checkCameraPermission,
  requestCameraPermission,
  checkGalleryPermission,
  requestGalleryPermission,
  openAppSettings,
  ensureCameraPermission,
  ensureMediaLibraryPermission,
} from '../../../src/core/utils/permissions';

// Mock expo-camera
const mockGetCameraPermissionsAsync = jest.fn();
const mockRequestCameraPermissionsAsync = jest.fn();
jest.mock('expo-camera', () => ({
  Camera: {
    getCameraPermissionsAsync: () => mockGetCameraPermissionsAsync(),
    requestCameraPermissionsAsync: () => mockRequestCameraPermissionsAsync(),
  },
}));

// Mock expo-image-picker
const mockGetMediaLibraryPermissionsAsync = jest.fn();
const mockRequestMediaLibraryPermissionsAsync = jest.fn();
jest.mock('expo-image-picker', () => ({
  getMediaLibraryPermissionsAsync: () => mockGetMediaLibraryPermissionsAsync(),
  requestMediaLibraryPermissionsAsync: () => mockRequestMediaLibraryPermissionsAsync(),
}));

// Mock expo-linking
const mockOpenSettings = jest.fn();
jest.mock('expo-linking', () => ({
  openSettings: () => mockOpenSettings(),
}));

// Mock Platform
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
}));

describe('permissions utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isCameraAvailable', () => {
    it('resolves to true', async () => {
      const result = await isCameraAvailable();
      expect(result).toBe(true);
    });
  });

  describe('checkCameraPermission', () => {
    it('returns granted when permission is granted', async () => {
      mockGetCameraPermissionsAsync.mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
      });

      const result = await checkCameraPermission();
      expect(result).toBe('granted');
      expect(mockGetCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    it('returns denied when permission is denied and canAskAgain is true', async () => {
      mockGetCameraPermissionsAsync.mockResolvedValue({
        status: 'denied',
        canAskAgain: true,
      });

      const result = await checkCameraPermission();
      expect(result).toBe('denied');
    });

    it('returns blocked when permission is denied and canAskAgain is false', async () => {
      mockGetCameraPermissionsAsync.mockResolvedValue({
        status: 'denied',
        canAskAgain: false,
      });

      const result = await checkCameraPermission();
      expect(result).toBe('blocked');
    });

    it('returns undetermined when status is undetermined', async () => {
      mockGetCameraPermissionsAsync.mockResolvedValue({
        status: 'undetermined',
        canAskAgain: true,
      });

      const result = await checkCameraPermission();
      expect(result).toBe('undetermined');
    });

    it('returns undetermined on error', async () => {
      mockGetCameraPermissionsAsync.mockRejectedValue(new Error('Permission check failed'));

      const result = await checkCameraPermission();
      expect(result).toBe('undetermined');
    });
  });

  describe('requestCameraPermission', () => {
    it('returns granted when user grants permission', async () => {
      mockRequestCameraPermissionsAsync.mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
      });

      const result = await requestCameraPermission();
      expect(result).toBe('granted');
      expect(mockRequestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    it('returns denied when user denies with canAskAgain true', async () => {
      mockRequestCameraPermissionsAsync.mockResolvedValue({
        status: 'denied',
        canAskAgain: true,
      });

      const result = await requestCameraPermission();
      expect(result).toBe('denied');
    });

    it('returns blocked when user denies with canAskAgain false', async () => {
      mockRequestCameraPermissionsAsync.mockResolvedValue({
        status: 'denied',
        canAskAgain: false,
      });

      const result = await requestCameraPermission();
      expect(result).toBe('blocked');
    });

    it('returns denied on error', async () => {
      mockRequestCameraPermissionsAsync.mockRejectedValue(new Error('Request failed'));

      const result = await requestCameraPermission();
      expect(result).toBe('denied');
    });
  });

  describe('checkGalleryPermission', () => {
    it('returns granted when permission is granted', async () => {
      mockGetMediaLibraryPermissionsAsync.mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
      });

      const result = await checkGalleryPermission();
      expect(result).toBe('granted');
      expect(mockGetMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    it('returns denied when permission is denied and canAskAgain is true', async () => {
      mockGetMediaLibraryPermissionsAsync.mockResolvedValue({
        status: 'denied',
        canAskAgain: true,
      });

      const result = await checkGalleryPermission();
      expect(result).toBe('denied');
    });

    it('returns blocked when permission is denied and canAskAgain is false', async () => {
      mockGetMediaLibraryPermissionsAsync.mockResolvedValue({
        status: 'denied',
        canAskAgain: false,
      });

      const result = await checkGalleryPermission();
      expect(result).toBe('blocked');
    });

    it('returns undetermined when status is undetermined', async () => {
      mockGetMediaLibraryPermissionsAsync.mockResolvedValue({
        status: 'undetermined',
        canAskAgain: true,
      });

      const result = await checkGalleryPermission();
      expect(result).toBe('undetermined');
    });

    it('returns undetermined on error', async () => {
      mockGetMediaLibraryPermissionsAsync.mockRejectedValue(new Error('Check failed'));

      const result = await checkGalleryPermission();
      expect(result).toBe('undetermined');
    });
  });

  describe('requestGalleryPermission', () => {
    it('returns granted when user grants permission', async () => {
      mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
      });

      const result = await requestGalleryPermission();
      expect(result).toBe('granted');
      expect(mockRequestMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    it('returns denied when user denies with canAskAgain true', async () => {
      mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({
        status: 'denied',
        canAskAgain: true,
      });

      const result = await requestGalleryPermission();
      expect(result).toBe('denied');
    });

    it('returns blocked when user denies with canAskAgain false', async () => {
      mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({
        status: 'denied',
        canAskAgain: false,
      });

      const result = await requestGalleryPermission();
      expect(result).toBe('blocked');
    });

    it('returns denied on error', async () => {
      mockRequestMediaLibraryPermissionsAsync.mockRejectedValue(new Error('Request failed'));

      const result = await requestGalleryPermission();
      expect(result).toBe('denied');
    });
  });

  describe('openAppSettings', () => {
    it('opens settings on iOS and returns true', async () => {
      mockOpenSettings.mockResolvedValue(undefined);
      const Platform = require('react-native').Platform;
      Platform.OS = 'ios';

      const result = await openAppSettings();
      expect(result).toBe(true);
      expect(mockOpenSettings).toHaveBeenCalledTimes(1);
    });

    it('opens settings on Android and returns true', async () => {
      mockOpenSettings.mockResolvedValue(undefined);
      const Platform = require('react-native').Platform;
      Platform.OS = 'android';

      const result = await openAppSettings();
      expect(result).toBe(true);
      expect(mockOpenSettings).toHaveBeenCalledTimes(1);
    });

    it('returns false on unsupported platform', async () => {
      const Platform = require('react-native').Platform;
      Platform.OS = 'web';

      const result = await openAppSettings();
      expect(result).toBe(false);
      expect(mockOpenSettings).not.toHaveBeenCalled();
    });

    it('returns false on error', async () => {
      mockOpenSettings.mockRejectedValue(new Error('Failed to open settings'));
      const Platform = require('react-native').Platform;
      Platform.OS = 'ios';

      const result = await openAppSettings();
      expect(result).toBe(false);
    });
  });

  describe('ensureCameraPermission', () => {
    it('returns granted immediately if already granted', async () => {
      mockGetCameraPermissionsAsync.mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
      });

      const result = await ensureCameraPermission();
      expect(result).toBe('granted');
      expect(mockGetCameraPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(mockRequestCameraPermissionsAsync).not.toHaveBeenCalled();
    });

    it('returns blocked immediately if already blocked', async () => {
      mockGetCameraPermissionsAsync.mockResolvedValue({
        status: 'denied',
        canAskAgain: false,
      });

      const result = await ensureCameraPermission();
      expect(result).toBe('blocked');
      expect(mockGetCameraPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(mockRequestCameraPermissionsAsync).not.toHaveBeenCalled();
    });

    it('requests permission when undetermined and returns result', async () => {
      mockGetCameraPermissionsAsync.mockResolvedValue({
        status: 'undetermined',
        canAskAgain: true,
      });
      mockRequestCameraPermissionsAsync.mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
      });

      const result = await ensureCameraPermission();
      expect(result).toBe('granted');
      expect(mockGetCameraPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(mockRequestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    it('requests permission when denied (canAskAgain true)', async () => {
      mockGetCameraPermissionsAsync.mockResolvedValue({
        status: 'denied',
        canAskAgain: true,
      });
      mockRequestCameraPermissionsAsync.mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
      });

      const result = await ensureCameraPermission();
      expect(result).toBe('granted');
      expect(mockRequestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    it('returns denied if user denies request', async () => {
      mockGetCameraPermissionsAsync.mockResolvedValue({
        status: 'undetermined',
        canAskAgain: true,
      });
      mockRequestCameraPermissionsAsync.mockResolvedValue({
        status: 'denied',
        canAskAgain: true,
      });

      const result = await ensureCameraPermission();
      expect(result).toBe('denied');
    });
  });

  describe('ensureMediaLibraryPermission', () => {
    it('returns granted immediately if already granted', async () => {
      mockGetMediaLibraryPermissionsAsync.mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
      });

      const result = await ensureMediaLibraryPermission();
      expect(result).toBe('granted');
      expect(mockGetMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(mockRequestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    });

    it('returns blocked immediately if already blocked', async () => {
      mockGetMediaLibraryPermissionsAsync.mockResolvedValue({
        status: 'denied',
        canAskAgain: false,
      });

      const result = await ensureMediaLibraryPermission();
      expect(result).toBe('blocked');
      expect(mockGetMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(mockRequestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    });

    it('requests permission when undetermined and returns result', async () => {
      mockGetMediaLibraryPermissionsAsync.mockResolvedValue({
        status: 'undetermined',
        canAskAgain: true,
      });
      mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
      });

      const result = await ensureMediaLibraryPermission();
      expect(result).toBe('granted');
      expect(mockGetMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(mockRequestMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    it('requests permission when denied (canAskAgain true)', async () => {
      mockGetMediaLibraryPermissionsAsync.mockResolvedValue({
        status: 'denied',
        canAskAgain: true,
      });
      mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({
        status: 'granted',
        canAskAgain: true,
      });

      const result = await ensureMediaLibraryPermission();
      expect(result).toBe('granted');
      expect(mockRequestMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    it('returns denied if user denies request', async () => {
      mockGetMediaLibraryPermissionsAsync.mockResolvedValue({
        status: 'undetermined',
        canAskAgain: true,
      });
      mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({
        status: 'denied',
        canAskAgain: true,
      });

      const result = await ensureMediaLibraryPermission();
      expect(result).toBe('denied');
    });
  });
});
