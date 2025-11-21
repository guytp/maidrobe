/**
 * Unit tests for capture flow type guards.
 *
 * Tests type guard functions that validate capture flow types:
 * - isCaptureOrigin: validates origin parameter
 * - isCaptureSource: validates source parameter
 * - isCaptureImagePayload: validates complete payload object
 *
 * These type guards are critical security/correctness boundaries that prevent
 * invalid data from entering the capture flow.
 *
 * @module __tests__/core/types/capture
 */

import {
  isCaptureOrigin,
  isCaptureSource,
  isCaptureImagePayload,
  CaptureOrigin,
  CaptureSource,
  CaptureImagePayload,
} from '../../../src/core/types/capture';

describe('capture type guards', () => {
  describe('isCaptureOrigin', () => {
    it('validates "wardrobe" as valid origin', () => {
      expect(isCaptureOrigin('wardrobe')).toBe(true);
    });

    it('validates "onboarding" as valid origin', () => {
      expect(isCaptureOrigin('onboarding')).toBe(true);
    });

    it('rejects null', () => {
      expect(isCaptureOrigin(null)).toBe(false);
    });

    it('rejects undefined', () => {
      expect(isCaptureOrigin(undefined)).toBe(false);
    });

    it('rejects empty string', () => {
      expect(isCaptureOrigin('')).toBe(false);
    });

    it('rejects invalid string', () => {
      expect(isCaptureOrigin('invalid')).toBe(false);
      expect(isCaptureOrigin('camera')).toBe(false);
      expect(isCaptureOrigin('gallery')).toBe(false);
    });

    it('rejects number', () => {
      expect(isCaptureOrigin(123)).toBe(false);
      expect(isCaptureOrigin(0)).toBe(false);
    });

    it('rejects boolean', () => {
      expect(isCaptureOrigin(true)).toBe(false);
      expect(isCaptureOrigin(false)).toBe(false);
    });

    it('rejects object', () => {
      expect(isCaptureOrigin({})).toBe(false);
      expect(isCaptureOrigin({ origin: 'wardrobe' })).toBe(false);
    });

    it('rejects array', () => {
      expect(isCaptureOrigin([])).toBe(false);
      expect(isCaptureOrigin(['wardrobe'])).toBe(false);
    });
  });

  describe('isCaptureSource', () => {
    it('validates "camera" as valid source', () => {
      expect(isCaptureSource('camera')).toBe(true);
    });

    it('validates "gallery" as valid source', () => {
      expect(isCaptureSource('gallery')).toBe(true);
    });

    it('rejects null', () => {
      expect(isCaptureSource(null)).toBe(false);
    });

    it('rejects undefined', () => {
      expect(isCaptureSource(undefined)).toBe(false);
    });

    it('rejects empty string', () => {
      expect(isCaptureSource('')).toBe(false);
    });

    it('rejects invalid string', () => {
      expect(isCaptureSource('invalid')).toBe(false);
      expect(isCaptureSource('wardrobe')).toBe(false);
      expect(isCaptureSource('onboarding')).toBe(false);
    });

    it('rejects number', () => {
      expect(isCaptureSource(123)).toBe(false);
      expect(isCaptureSource(0)).toBe(false);
    });

    it('rejects boolean', () => {
      expect(isCaptureSource(true)).toBe(false);
      expect(isCaptureSource(false)).toBe(false);
    });

    it('rejects object', () => {
      expect(isCaptureSource({})).toBe(false);
      expect(isCaptureSource({ source: 'camera' })).toBe(false);
    });

    it('rejects array', () => {
      expect(isCaptureSource([])).toBe(false);
      expect(isCaptureSource(['camera'])).toBe(false);
    });
  });

  describe('isCaptureImagePayload', () => {
    const validPayload: CaptureImagePayload = {
      uri: 'file:///path/to/image.jpg',
      width: 1920,
      height: 1080,
      origin: 'wardrobe',
      source: 'camera',
      createdAt: '2024-01-15T10:30:00.000Z',
    };

    it('validates complete valid payload', () => {
      expect(isCaptureImagePayload(validPayload)).toBe(true);
    });

    it('validates payload with onboarding origin', () => {
      const payload = { ...validPayload, origin: 'onboarding' as CaptureOrigin };
      expect(isCaptureImagePayload(payload)).toBe(true);
    });

    it('validates payload with gallery source', () => {
      const payload = { ...validPayload, source: 'gallery' as CaptureSource };
      expect(isCaptureImagePayload(payload)).toBe(true);
    });

    it('validates payload with minimum valid dimensions', () => {
      const payload = { ...validPayload, width: 1, height: 1 };
      expect(isCaptureImagePayload(payload)).toBe(true);
    });

    it('validates payload with large dimensions', () => {
      const payload = { ...validPayload, width: 8000, height: 6000 };
      expect(isCaptureImagePayload(payload)).toBe(true);
    });

    it('rejects null', () => {
      expect(isCaptureImagePayload(null)).toBe(false);
    });

    it('rejects undefined', () => {
      expect(isCaptureImagePayload(undefined)).toBe(false);
    });

    it('rejects non-object', () => {
      expect(isCaptureImagePayload('string')).toBe(false);
      expect(isCaptureImagePayload(123)).toBe(false);
      expect(isCaptureImagePayload(true)).toBe(false);
    });

    it('rejects empty object', () => {
      expect(isCaptureImagePayload({})).toBe(false);
    });

    it('rejects payload with missing uri', () => {
      const payload = { ...validPayload };
      delete (payload as any).uri;
      expect(isCaptureImagePayload(payload)).toBe(false);
    });

    it('rejects payload with empty uri', () => {
      const payload = { ...validPayload, uri: '' };
      expect(isCaptureImagePayload(payload)).toBe(false);
    });

    it('rejects payload with non-string uri', () => {
      const payload = { ...validPayload, uri: 123 as any };
      expect(isCaptureImagePayload(payload)).toBe(false);
    });

    it('rejects payload with missing width', () => {
      const payload = { ...validPayload };
      delete (payload as any).width;
      expect(isCaptureImagePayload(payload)).toBe(false);
    });

    it('rejects payload with zero width', () => {
      const payload = { ...validPayload, width: 0 };
      expect(isCaptureImagePayload(payload)).toBe(false);
    });

    it('rejects payload with negative width', () => {
      const payload = { ...validPayload, width: -100 };
      expect(isCaptureImagePayload(payload)).toBe(false);
    });

    it('rejects payload with non-number width', () => {
      const payload = { ...validPayload, width: '1920' as any };
      expect(isCaptureImagePayload(payload)).toBe(false);
    });

    it('rejects payload with missing height', () => {
      const payload = { ...validPayload };
      delete (payload as any).height;
      expect(isCaptureImagePayload(payload)).toBe(false);
    });

    it('rejects payload with zero height', () => {
      const payload = { ...validPayload, height: 0 };
      expect(isCaptureImagePayload(payload)).toBe(false);
    });

    it('rejects payload with negative height', () => {
      const payload = { ...validPayload, height: -100 };
      expect(isCaptureImagePayload(payload)).toBe(false);
    });

    it('rejects payload with non-number height', () => {
      const payload = { ...validPayload, height: '1080' as any };
      expect(isCaptureImagePayload(payload)).toBe(false);
    });

    it('rejects payload with missing origin', () => {
      const payload = { ...validPayload };
      delete (payload as any).origin;
      expect(isCaptureImagePayload(payload)).toBe(false);
    });

    it('rejects payload with invalid origin', () => {
      const payload = { ...validPayload, origin: 'invalid' as any };
      expect(isCaptureImagePayload(payload)).toBe(false);
    });

    it('rejects payload with missing source', () => {
      const payload = { ...validPayload };
      delete (payload as any).source;
      expect(isCaptureImagePayload(payload)).toBe(false);
    });

    it('rejects payload with invalid source', () => {
      const payload = { ...validPayload, source: 'invalid' as any };
      expect(isCaptureImagePayload(payload)).toBe(false);
    });

    it('rejects payload with missing createdAt', () => {
      const payload = { ...validPayload };
      delete (payload as any).createdAt;
      expect(isCaptureImagePayload(payload)).toBe(false);
    });

    it('rejects payload with empty createdAt', () => {
      const payload = { ...validPayload, createdAt: '' };
      expect(isCaptureImagePayload(payload)).toBe(false);
    });

    it('rejects payload with non-string createdAt', () => {
      const payload = { ...validPayload, createdAt: 123 as any };
      expect(isCaptureImagePayload(payload)).toBe(false);
    });

    it('accepts payload with extra fields', () => {
      const payload = { ...validPayload, extraField: 'value' };
      expect(isCaptureImagePayload(payload)).toBe(true);
    });
  });
});
