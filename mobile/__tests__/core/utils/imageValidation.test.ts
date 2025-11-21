/**
 * Unit tests for image validation utilities.
 *
 * Tests validation logic for captured/selected images:
 * - validateCapturedImage: validates URI, type, and dimensions
 * - getValidationErrorMessage: maps error codes to user messages
 *
 * @module __tests__/core/utils/imageValidation
 */

import {
  validateCapturedImage,
  getValidationErrorMessage,
  ImageValidationResult,
} from '../../../src/core/utils/imageValidation';

describe('imageValidation', () => {
  describe('validateCapturedImage', () => {
    describe('URI validation', () => {
      it('accepts valid file:// URI', () => {
        const result = validateCapturedImage('file:///path/to/image.jpg', 1920, 1080, 'image/jpeg');
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('accepts valid content:// URI (Android)', () => {
        const result = validateCapturedImage('content://media/external/images/1', 1920, 1080, 'image/jpeg');
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('rejects null URI', () => {
        const result = validateCapturedImage(null, 1920, 1080, 'image/jpeg');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('invalid_uri');
        expect(result.errorMessage).toContain('missing or empty');
      });

      it('rejects undefined URI', () => {
        const result = validateCapturedImage(undefined, 1920, 1080, 'image/jpeg');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('invalid_uri');
        expect(result.errorMessage).toContain('missing or empty');
      });

      it('rejects empty URI', () => {
        const result = validateCapturedImage('', 1920, 1080, 'image/jpeg');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('invalid_uri');
        expect(result.errorMessage).toContain('missing or empty');
      });

      it('rejects whitespace-only URI', () => {
        const result = validateCapturedImage('   ', 1920, 1080, 'image/jpeg');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('invalid_uri');
        expect(result.errorMessage).toContain('missing or empty');
      });

      it('rejects http:// scheme', () => {
        const result = validateCapturedImage('http://example.com/image.jpg', 1920, 1080, 'image/jpeg');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('invalid_uri');
        expect(result.errorMessage).toContain('file:// or content://');
      });

      it('rejects https:// scheme', () => {
        const result = validateCapturedImage('https://example.com/image.jpg', 1920, 1080, 'image/jpeg');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('invalid_uri');
        expect(result.errorMessage).toContain('file:// or content://');
      });

      it('rejects plain path without scheme', () => {
        const result = validateCapturedImage('/path/to/image.jpg', 1920, 1080, 'image/jpeg');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('invalid_uri');
        expect(result.errorMessage).toContain('file:// or content://');
      });
    });

    describe('type validation', () => {
      const validUri = 'file:///path/to/image.jpg';

      it('accepts image/jpeg', () => {
        const result = validateCapturedImage(validUri, 1920, 1080, 'image/jpeg');
        expect(result.isValid).toBe(true);
      });

      it('accepts image/jpg', () => {
        const result = validateCapturedImage(validUri, 1920, 1080, 'image/jpg');
        expect(result.isValid).toBe(true);
      });

      it('accepts image/png', () => {
        const result = validateCapturedImage(validUri, 1920, 1080, 'image/png');
        expect(result.isValid).toBe(true);
      });

      it('accepts type with mixed case', () => {
        const result = validateCapturedImage(validUri, 1920, 1080, 'IMAGE/JPEG');
        expect(result.isValid).toBe(true);
      });

      it('accepts type with whitespace', () => {
        const result = validateCapturedImage(validUri, 1920, 1080, '  image/jpeg  ');
        expect(result.isValid).toBe(true);
      });

      it('rejects image/gif', () => {
        const result = validateCapturedImage(validUri, 1920, 1080, 'image/gif');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('invalid_type');
        expect(result.errorMessage).toContain('not supported');
      });

      it('rejects image/webp', () => {
        const result = validateCapturedImage(validUri, 1920, 1080, 'image/webp');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('invalid_type');
        expect(result.errorMessage).toContain('not supported');
      });

      it('rejects video/mp4', () => {
        const result = validateCapturedImage(validUri, 1920, 1080, 'video/mp4');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('invalid_type');
        expect(result.errorMessage).toContain('not supported');
      });

      it('rejects application/pdf', () => {
        const result = validateCapturedImage(validUri, 1920, 1080, 'application/pdf');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('invalid_type');
        expect(result.errorMessage).toContain('not supported');
      });

      it('accepts null type (skips type check)', () => {
        const result = validateCapturedImage(validUri, 1920, 1080, null);
        expect(result.isValid).toBe(true);
      });

      it('accepts undefined type (skips type check)', () => {
        const result = validateCapturedImage(validUri, 1920, 1080, undefined);
        expect(result.isValid).toBe(true);
      });
    });

    describe('width validation', () => {
      const validUri = 'file:///path/to/image.jpg';

      it('accepts valid width', () => {
        const result = validateCapturedImage(validUri, 1920, 1080, 'image/jpeg');
        expect(result.isValid).toBe(true);
      });

      it('accepts minimum width (256px)', () => {
        const result = validateCapturedImage(validUri, 256, 1080, 'image/jpeg');
        expect(result.isValid).toBe(true);
      });

      it('accepts maximum width (8000px)', () => {
        const result = validateCapturedImage(validUri, 8000, 1080, 'image/jpeg');
        expect(result.isValid).toBe(true);
      });

      it('rejects width below minimum (255px)', () => {
        const result = validateCapturedImage(validUri, 255, 1080, 'image/jpeg');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('invalid_dimensions');
        expect(result.errorMessage).toContain('too small');
        expect(result.errorMessage).toContain('256');
      });

      it('rejects very small width (1px)', () => {
        const result = validateCapturedImage(validUri, 1, 1080, 'image/jpeg');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('invalid_dimensions');
      });

      it('rejects width above maximum (8001px)', () => {
        const result = validateCapturedImage(validUri, 8001, 1080, 'image/jpeg');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('invalid_dimensions');
        expect(result.errorMessage).toContain('too large');
        expect(result.errorMessage).toContain('8000');
      });

      it('rejects very large width (20000px)', () => {
        const result = validateCapturedImage(validUri, 20000, 1080, 'image/jpeg');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('invalid_dimensions');
      });

      it('accepts null width (skips width check)', () => {
        const result = validateCapturedImage(validUri, null, 1080, 'image/jpeg');
        expect(result.isValid).toBe(true);
      });

      it('accepts undefined width (skips width check)', () => {
        const result = validateCapturedImage(validUri, undefined, 1080, 'image/jpeg');
        expect(result.isValid).toBe(true);
      });
    });

    describe('height validation', () => {
      const validUri = 'file:///path/to/image.jpg';

      it('accepts valid height', () => {
        const result = validateCapturedImage(validUri, 1920, 1080, 'image/jpeg');
        expect(result.isValid).toBe(true);
      });

      it('accepts minimum height (256px)', () => {
        const result = validateCapturedImage(validUri, 1920, 256, 'image/jpeg');
        expect(result.isValid).toBe(true);
      });

      it('accepts maximum height (8000px)', () => {
        const result = validateCapturedImage(validUri, 1920, 8000, 'image/jpeg');
        expect(result.isValid).toBe(true);
      });

      it('rejects height below minimum (255px)', () => {
        const result = validateCapturedImage(validUri, 1920, 255, 'image/jpeg');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('invalid_dimensions');
        expect(result.errorMessage).toContain('too small');
        expect(result.errorMessage).toContain('256');
      });

      it('rejects very small height (1px)', () => {
        const result = validateCapturedImage(validUri, 1920, 1, 'image/jpeg');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('invalid_dimensions');
      });

      it('rejects height above maximum (8001px)', () => {
        const result = validateCapturedImage(validUri, 1920, 8001, 'image/jpeg');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('invalid_dimensions');
        expect(result.errorMessage).toContain('too large');
        expect(result.errorMessage).toContain('8000');
      });

      it('rejects very large height (20000px)', () => {
        const result = validateCapturedImage(validUri, 1920, 20000, 'image/jpeg');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('invalid_dimensions');
      });

      it('accepts null height (skips height check)', () => {
        const result = validateCapturedImage(validUri, 1920, null, 'image/jpeg');
        expect(result.isValid).toBe(true);
      });

      it('accepts undefined height (skips height check)', () => {
        const result = validateCapturedImage(validUri, 1920, undefined, 'image/jpeg');
        expect(result.isValid).toBe(true);
      });
    });

    describe('combined validation', () => {
      it('validates all aspects together', () => {
        const result = validateCapturedImage('file:///image.jpg', 1920, 1080, 'image/jpeg');
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.errorMessage).toBeUndefined();
      });

      it('fails on first invalid field (URI)', () => {
        const result = validateCapturedImage('', 1920, 1080, 'image/jpeg');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('invalid_uri');
      });

      it('fails on type if URI is valid', () => {
        const result = validateCapturedImage('file:///image.jpg', 1920, 1080, 'image/gif');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('invalid_type');
      });

      it('fails on width if URI and type are valid', () => {
        const result = validateCapturedImage('file:///image.jpg', 100, 1080, 'image/jpeg');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('invalid_dimensions');
      });

      it('fails on height if URI, type, and width are valid', () => {
        const result = validateCapturedImage('file:///image.jpg', 1920, 100, 'image/jpeg');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('invalid_dimensions');
      });
    });
  });

  describe('getValidationErrorMessage', () => {
    it('returns message for invalid_uri', () => {
      const message = getValidationErrorMessage('invalid_uri');
      expect(message).toContain('image could not be accessed');
    });

    it('returns message for invalid_type', () => {
      const message = getValidationErrorMessage('invalid_type');
      expect(message).toContain('file type is not supported');
      expect(message).toContain('JPEG or PNG');
    });

    it('returns message for invalid_dimensions', () => {
      const message = getValidationErrorMessage('invalid_dimensions');
      expect(message).toContain('image does not meet size requirements');
    });

    it('returns message for missing_data', () => {
      const message = getValidationErrorMessage('missing_data');
      expect(message).toContain('Image information is incomplete');
    });

    it('returns message for unknown', () => {
      const message = getValidationErrorMessage('unknown');
      expect(message).toContain('unknown error');
    });

    it('returns default message for undefined', () => {
      const message = getValidationErrorMessage(undefined);
      expect(message).toContain('validation failed');
    });

    it('returns default message for invalid error code', () => {
      const message = getValidationErrorMessage('not_a_real_error' as any);
      expect(message).toContain('validation failed');
    });
  });
});
