/**
 * Unit tests for error utilities.
 *
 * Tests error classification, wrapping, and chain extraction
 * for the crop & adjust flow.
 *
 * @module __tests__/wardrobe/crop/errors
 */

import {
  CropError,
  classifyError,
  wrapAsCropError,
  getErrorChain,
  formatErrorForLogging,
} from '../../../src/features/wardrobe/crop/utils/errors';

describe('errors', () => {
  describe('CropError', () => {
    it('creates error with message and code', () => {
      const error = new CropError('Test error', 'memory');

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('memory');
      expect(error.name).toBe('CropError');
      expect(error.cause).toBeUndefined();
    });

    it('creates error with cause', () => {
      const cause = new Error('Original error');
      const error = new CropError('Wrapped error', 'file_system', cause);

      expect(error.message).toBe('Wrapped error');
      expect(error.code).toBe('file_system');
      expect(error.cause).toBe(cause);
    });

    it('is instanceof Error', () => {
      const error = new CropError('Test', 'unknown');
      expect(error instanceof Error).toBe(true);
      expect(error instanceof CropError).toBe(true);
    });

    it('has stack trace', () => {
      const error = new CropError('Test', 'processing');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('CropError');
    });
  });

  describe('classifyError', () => {
    it('returns code from CropError directly', () => {
      const error = new CropError('Test', 'permission');
      expect(classifyError(error)).toBe('permission');
    });

    it('returns unknown for non-Error values', () => {
      expect(classifyError('string error')).toBe('unknown');
      expect(classifyError(null)).toBe('unknown');
      expect(classifyError(undefined)).toBe('unknown');
      expect(classifyError(123)).toBe('unknown');
      expect(classifyError({ message: 'object' })).toBe('unknown');
    });

    it('classifies memory errors', () => {
      expect(classifyError(new Error('Out of memory'))).toBe('memory');
      expect(classifyError(new Error('OOM error occurred'))).toBe('memory');
    });

    it('classifies file system errors', () => {
      expect(classifyError(new Error('ENOENT: no such file'))).toBe('file_system');
      expect(classifyError(new Error('File not found'))).toBe('file_system');
      expect(classifyError(new Error('No such file or directory'))).toBe('file_system');
    });

    it('classifies permission errors', () => {
      expect(classifyError(new Error('Permission denied'))).toBe('permission');
      expect(classifyError(new Error('Access denied to file'))).toBe('permission');
    });

    it('classifies corruption errors', () => {
      expect(classifyError(new Error('Corrupt image data'))).toBe('corruption');
      expect(classifyError(new Error('Invalid format'))).toBe('corruption');
      expect(classifyError(new Error('Malformed header'))).toBe('corruption');
    });

    it('classifies network errors', () => {
      expect(classifyError(new Error('Network request failed'))).toBe('network');
      expect(classifyError(new Error('Connection timeout'))).toBe('network');
      expect(classifyError(new Error('Timeout exceeded'))).toBe('network');
    });

    it('defaults to processing for unrecognized errors', () => {
      expect(classifyError(new Error('Something went wrong'))).toBe('processing');
      expect(classifyError(new Error('Unknown failure'))).toBe('processing');
    });
  });

  describe('wrapAsCropError', () => {
    it('returns CropError unchanged', () => {
      const original = new CropError('Test', 'memory');
      const wrapped = wrapAsCropError(original);

      expect(wrapped).toBe(original);
    });

    it('wraps Error with classification and cause', () => {
      const original = new Error('Out of memory');
      const wrapped = wrapAsCropError(original);

      expect(wrapped).toBeInstanceOf(CropError);
      expect(wrapped.message).toBe('Out of memory');
      expect(wrapped.code).toBe('memory');
      expect(wrapped.cause).toBe(original);
    });

    it('uses default message for non-Error values', () => {
      const wrapped = wrapAsCropError('string error');

      expect(wrapped).toBeInstanceOf(CropError);
      expect(wrapped.message).toBe('Image processing failed');
      expect(wrapped.code).toBe('unknown');
      expect(wrapped.cause).toBeUndefined();
    });

    it('uses custom default message', () => {
      const wrapped = wrapAsCropError(null, 'Custom failure message');

      expect(wrapped.message).toBe('Custom failure message');
    });
  });

  describe('getErrorChain', () => {
    it('returns single error for error without cause', () => {
      const error = new Error('Single error');
      const chain = getErrorChain(error);

      expect(chain).toHaveLength(1);
      expect(chain[0]).toBe(error);
    });

    it('returns chain for CropError with cause', () => {
      const root = new Error('Root cause');
      const wrapper = new CropError('Wrapper', 'file_system', root);
      const chain = getErrorChain(wrapper);

      expect(chain).toHaveLength(2);
      expect(chain[0]).toBe(wrapper);
      expect(chain[1]).toBe(root);
    });

    it('returns full chain for deeply nested errors', () => {
      const level3 = new Error('Level 3 - root');
      const level2 = new CropError('Level 2', 'processing', level3);
      const level1 = new CropError('Level 1', 'memory', level2);
      const chain = getErrorChain(level1);

      expect(chain).toHaveLength(3);
      expect(chain[0]).toBe(level1);
      expect(chain[1]).toBe(level2);
      expect(chain[2]).toBe(level3);
    });

    it('returns empty array for non-Error values', () => {
      expect(getErrorChain('string')).toEqual([]);
      expect(getErrorChain(null)).toEqual([]);
      expect(getErrorChain(undefined)).toEqual([]);
    });

    it('respects maxDepth to prevent infinite loops', () => {
      // Create a chain longer than default maxDepth
      let current: Error = new Error('Root');
      for (let i = 0; i < 15; i++) {
        current = new CropError(`Level ${i}`, 'processing', current);
      }

      const chain = getErrorChain(current, 5);
      expect(chain).toHaveLength(5);
    });

    it('handles standard Error with cause property', () => {
      const root = new Error('Root');
      const wrapper = new Error('Wrapper');
      (wrapper as Error & { cause: Error }).cause = root;

      const chain = getErrorChain(wrapper);
      expect(chain).toHaveLength(2);
      expect(chain[0]).toBe(wrapper);
      expect(chain[1]).toBe(root);
    });
  });

  describe('formatErrorForLogging', () => {
    it('formats simple Error', () => {
      const error = new Error('Simple error');
      const logData = formatErrorForLogging(error);

      expect(logData.message).toBe('Simple error');
      expect(logData.name).toBe('Error');
      expect(logData.stack).toBeDefined();
      expect(logData.causeChain).toEqual([]);
      expect(logData.code).toBeUndefined();
    });

    it('formats CropError with code', () => {
      const error = new CropError('Crop failed', 'memory');
      const logData = formatErrorForLogging(error);

      expect(logData.message).toBe('Crop failed');
      expect(logData.name).toBe('CropError');
      expect(logData.code).toBe('memory');
      expect(logData.causeChain).toEqual([]);
    });

    it('includes cause chain in output', () => {
      const root = new Error('File not found');
      const wrapper = new CropError('Processing failed', 'file_system', root);
      const logData = formatErrorForLogging(wrapper);

      expect(logData.message).toBe('Processing failed');
      expect(logData.code).toBe('file_system');
      expect(logData.causeChain).toHaveLength(1);
      expect(logData.causeChain[0].message).toBe('File not found');
      expect(logData.causeChain[0].name).toBe('Error');
      expect(logData.causeChain[0].stack).toBeDefined();
    });

    it('handles deeply nested cause chains', () => {
      const level3 = new Error('Root cause');
      const level2 = new CropError('Mid level', 'processing', level3);
      const level1 = new CropError('Top level', 'memory', level2);
      const logData = formatErrorForLogging(level1);

      expect(logData.causeChain).toHaveLength(2);
      expect(logData.causeChain[0].message).toBe('Mid level');
      expect(logData.causeChain[1].message).toBe('Root cause');
    });

    it('handles non-Error values', () => {
      const logData = formatErrorForLogging('string error');

      expect(logData.message).toBe('string error');
      expect(logData.name).toBe('UnknownError');
      expect(logData.causeChain).toEqual([]);
      expect(logData.code).toBeUndefined();
    });

    it('handles null and undefined', () => {
      expect(formatErrorForLogging(null).message).toBe('null');
      expect(formatErrorForLogging(undefined).message).toBe('undefined');
    });
  });
});
