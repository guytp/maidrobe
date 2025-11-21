/**
 * Contract tests for capture flow payload passing.
 *
 * Validates that CaptureImagePayload structure and semantics are maintained
 * correctly as payloads pass from capture screens to crop screen.
 *
 * @module __tests__/wardrobe/captureFlowContract
 */

import {
  CaptureImagePayload,
  isCaptureImagePayload,
} from '../../src/core/types/capture';

describe('capture flow contract', () => {
  describe('CaptureImagePayload structure', () => {
    it('validates complete payload with all required fields', () => {
      const payload: CaptureImagePayload = {
        uri: 'file:///path/to/image.jpg',
        width: 1920,
        height: 1080,
        origin: 'wardrobe',
        source: 'camera',
        createdAt: '2024-01-15T10:30:00.000Z',
      };

      expect(isCaptureImagePayload(payload)).toBe(true);
    });

    it('requires uri to be non-empty string', () => {
      const payload = {
        uri: '',
        width: 1920,
        height: 1080,
        origin: 'wardrobe',
        source: 'camera',
        createdAt: '2024-01-15T10:30:00.000Z',
      };

      expect(isCaptureImagePayload(payload)).toBe(false);
    });

    it('requires width to be positive number', () => {
      const payload = {
        uri: 'file:///image.jpg',
        width: 0,
        height: 1080,
        origin: 'wardrobe',
        source: 'camera',
        createdAt: '2024-01-15T10:30:00.000Z',
      };

      expect(isCaptureImagePayload(payload)).toBe(false);
    });

    it('requires height to be positive number', () => {
      const payload = {
        uri: 'file:///image.jpg',
        width: 1920,
        height: 0,
        origin: 'wardrobe',
        source: 'camera',
        createdAt: '2024-01-15T10:30:00.000Z',
      };

      expect(isCaptureImagePayload(payload)).toBe(false);
    });

    it('requires origin to be valid CaptureOrigin', () => {
      const payload = {
        uri: 'file:///image.jpg',
        width: 1920,
        height: 1080,
        origin: 'invalid',
        source: 'camera',
        createdAt: '2024-01-15T10:30:00.000Z',
      };

      expect(isCaptureImagePayload(payload)).toBe(false);
    });

    it('requires source to be valid CaptureSource', () => {
      const payload = {
        uri: 'file:///image.jpg',
        width: 1920,
        height: 1080,
        origin: 'wardrobe',
        source: 'invalid',
        createdAt: '2024-01-15T10:30:00.000Z',
      };

      expect(isCaptureImagePayload(payload)).toBe(false);
    });

    it('requires createdAt to be non-empty string', () => {
      const payload = {
        uri: 'file:///image.jpg',
        width: 1920,
        height: 1080,
        origin: 'wardrobe',
        source: 'camera',
        createdAt: '',
      };

      expect(isCaptureImagePayload(payload)).toBe(false);
    });
  });

  describe('URI format contract', () => {
    it('accepts file:// URI scheme', () => {
      const payload: CaptureImagePayload = {
        uri: 'file:///var/mobile/Containers/Data/image.jpg',
        width: 1920,
        height: 1080,
        origin: 'wardrobe',
        source: 'camera',
        createdAt: '2024-01-15T10:30:00.000Z',
      };

      expect(isCaptureImagePayload(payload)).toBe(true);
      expect(payload.uri.startsWith('file://')).toBe(true);
    });

    it('accepts content:// URI scheme (Android)', () => {
      const payload: CaptureImagePayload = {
        uri: 'content://media/external/images/media/12345',
        width: 1920,
        height: 1080,
        origin: 'wardrobe',
        source: 'gallery',
        createdAt: '2024-01-15T10:30:00.000Z',
      };

      expect(isCaptureImagePayload(payload)).toBe(true);
      expect(payload.uri.startsWith('content://')).toBe(true);
    });
  });

  describe('dimension contract', () => {
    it('accepts minimum valid dimensions (1x1)', () => {
      const payload: CaptureImagePayload = {
        uri: 'file:///image.jpg',
        width: 1,
        height: 1,
        origin: 'wardrobe',
        source: 'camera',
        createdAt: '2024-01-15T10:30:00.000Z',
      };

      expect(isCaptureImagePayload(payload)).toBe(true);
    });

    it('accepts typical phone camera dimensions', () => {
      const payload: CaptureImagePayload = {
        uri: 'file:///image.jpg',
        width: 4032,
        height: 3024,
        origin: 'wardrobe',
        source: 'camera',
        createdAt: '2024-01-15T10:30:00.000Z',
      };

      expect(isCaptureImagePayload(payload)).toBe(true);
    });

    it('accepts large dimensions', () => {
      const payload: CaptureImagePayload = {
        uri: 'file:///image.jpg',
        width: 8000,
        height: 6000,
        origin: 'wardrobe',
        source: 'camera',
        createdAt: '2024-01-15T10:30:00.000Z',
      };

      expect(isCaptureImagePayload(payload)).toBe(true);
    });

    it('rejects zero width', () => {
      const payload = {
        uri: 'file:///image.jpg',
        width: 0,
        height: 1080,
        origin: 'wardrobe',
        source: 'camera',
        createdAt: '2024-01-15T10:30:00.000Z',
      };

      expect(isCaptureImagePayload(payload)).toBe(false);
    });

    it('rejects negative dimensions', () => {
      const payload = {
        uri: 'file:///image.jpg',
        width: -1920,
        height: 1080,
        origin: 'wardrobe',
        source: 'camera',
        createdAt: '2024-01-15T10:30:00.000Z',
      };

      expect(isCaptureImagePayload(payload)).toBe(false);
    });
  });

  describe('origin contract', () => {
    it('accepts wardrobe origin', () => {
      const payload: CaptureImagePayload = {
        uri: 'file:///image.jpg',
        width: 1920,
        height: 1080,
        origin: 'wardrobe',
        source: 'camera',
        createdAt: '2024-01-15T10:30:00.000Z',
      };

      expect(isCaptureImagePayload(payload)).toBe(true);
      expect(payload.origin).toBe('wardrobe');
    });

    it('accepts onboarding origin', () => {
      const payload: CaptureImagePayload = {
        uri: 'file:///image.jpg',
        width: 1920,
        height: 1080,
        origin: 'onboarding',
        source: 'camera',
        createdAt: '2024-01-15T10:30:00.000Z',
      };

      expect(isCaptureImagePayload(payload)).toBe(true);
      expect(payload.origin).toBe('onboarding');
    });

    it('rejects invalid origin values', () => {
      const payload = {
        uri: 'file:///image.jpg',
        width: 1920,
        height: 1080,
        origin: 'settings',
        source: 'camera',
        createdAt: '2024-01-15T10:30:00.000Z',
      };

      expect(isCaptureImagePayload(payload)).toBe(false);
    });
  });

  describe('source contract', () => {
    it('accepts camera source', () => {
      const payload: CaptureImagePayload = {
        uri: 'file:///image.jpg',
        width: 1920,
        height: 1080,
        origin: 'wardrobe',
        source: 'camera',
        createdAt: '2024-01-15T10:30:00.000Z',
      };

      expect(isCaptureImagePayload(payload)).toBe(true);
      expect(payload.source).toBe('camera');
    });

    it('accepts gallery source', () => {
      const payload: CaptureImagePayload = {
        uri: 'file:///image.jpg',
        width: 1920,
        height: 1080,
        origin: 'wardrobe',
        source: 'gallery',
        createdAt: '2024-01-15T10:30:00.000Z',
      };

      expect(isCaptureImagePayload(payload)).toBe(true);
      expect(payload.source).toBe('gallery');
    });

    it('rejects invalid source values', () => {
      const payload = {
        uri: 'file:///image.jpg',
        width: 1920,
        height: 1080,
        origin: 'wardrobe',
        source: 'upload',
        createdAt: '2024-01-15T10:30:00.000Z',
      };

      expect(isCaptureImagePayload(payload)).toBe(false);
    });
  });

  describe('createdAt contract', () => {
    it('accepts ISO 8601 timestamp', () => {
      const payload: CaptureImagePayload = {
        uri: 'file:///image.jpg',
        width: 1920,
        height: 1080,
        origin: 'wardrobe',
        source: 'camera',
        createdAt: '2024-01-15T10:30:00.000Z',
      };

      expect(isCaptureImagePayload(payload)).toBe(true);
      expect(payload.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('accepts timestamp with milliseconds', () => {
      const payload: CaptureImagePayload = {
        uri: 'file:///image.jpg',
        width: 1920,
        height: 1080,
        origin: 'wardrobe',
        source: 'camera',
        createdAt: '2024-01-15T10:30:00.123Z',
      };

      expect(isCaptureImagePayload(payload)).toBe(true);
    });

    it('accepts any non-empty string for createdAt', () => {
      const payload: CaptureImagePayload = {
        uri: 'file:///image.jpg',
        width: 1920,
        height: 1080,
        origin: 'wardrobe',
        source: 'camera',
        createdAt: 'custom-timestamp',
      };

      expect(isCaptureImagePayload(payload)).toBe(true);
    });

    it('rejects empty createdAt', () => {
      const payload = {
        uri: 'file:///image.jpg',
        width: 1920,
        height: 1080,
        origin: 'wardrobe',
        source: 'camera',
        createdAt: '',
      };

      expect(isCaptureImagePayload(payload)).toBe(false);
    });
  });

  describe('payload immutability', () => {
    it('maintains all fields through type guard', () => {
      const originalPayload = {
        uri: 'file:///image.jpg',
        width: 1920,
        height: 1080,
        origin: 'wardrobe' as const,
        source: 'camera' as const,
        createdAt: '2024-01-15T10:30:00.000Z',
      };

      const isValid = isCaptureImagePayload(originalPayload);

      if (isValid) {
        const typedPayload = originalPayload as CaptureImagePayload;
        expect(typedPayload.uri).toBe('file:///image.jpg');
        expect(typedPayload.width).toBe(1920);
        expect(typedPayload.height).toBe(1080);
        expect(typedPayload.origin).toBe('wardrobe');
        expect(typedPayload.source).toBe('camera');
        expect(typedPayload.createdAt).toBe('2024-01-15T10:30:00.000Z');
      }

      expect(isValid).toBe(true);
    });
  });

  describe('extra fields tolerance', () => {
    it('accepts payload with additional fields', () => {
      const payload = {
        uri: 'file:///image.jpg',
        width: 1920,
        height: 1080,
        origin: 'wardrobe',
        source: 'camera',
        createdAt: '2024-01-15T10:30:00.000Z',
        extraField: 'some value',
        anotherField: 123,
      };

      expect(isCaptureImagePayload(payload)).toBe(true);
    });
  });
});
