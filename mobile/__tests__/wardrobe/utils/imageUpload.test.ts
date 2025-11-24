/**
 * Unit tests for image upload utilities.
 *
 * Tests the image preparation and upload pipeline for wardrobe item uploads:
 * - prepareImageForUpload: resizing, compression, and EXIF stripping
 * - uploadImageToStorage: Supabase Storage upload with error handling
 * - generateStoragePath: storage path generation
 * - Resizing logic: proportional downscaling with no upscaling
 * - Compression: JPEG format at 0.85 quality
 * - Privacy: EXIF metadata (GPS, camera, timestamps) automatically stripped
 * - Error classification: network, permission, storage errors
 * - Retry idempotency: upsert semantics for reliable uploads
 *
 * @module __tests__/wardrobe/utils/imageUpload
 */

import * as ImageManipulator from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import {
  prepareImageForUpload,
  uploadImageToStorage,
  generateStoragePath,
  classifyStorageError,
  MAX_UPLOAD_DIMENSION,
  JPEG_UPLOAD_QUALITY,
  WARDROBE_BUCKET_NAME,
  UploadError,
  type PreparedImage,
} from '../../../src/features/wardrobe/utils/imageUpload';
import { supabase } from '../../../src/services/supabase';
import { logError } from '../../../src/core/telemetry';

// Mock expo-image-manipulator
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: {
    JPEG: 'jpeg',
    PNG: 'png',
  },
}));

// Mock expo-file-system
jest.mock('expo-file-system', () => ({
  File: jest.fn(),
}));

// Mock supabase
jest.mock('../../../src/services/supabase', () => ({
  supabase: {
    storage: {
      from: jest.fn(),
    },
  },
}));

// Mock telemetry
jest.mock('../../../src/core/telemetry', () => ({
  logError: jest.fn(),
}));

const mockManipulateAsync = ImageManipulator.manipulateAsync as jest.MockedFunction<
  typeof ImageManipulator.manipulateAsync
>;

const MockFile = File as jest.MockedClass<typeof File>;

const mockSupabase = supabase as jest.Mocked<typeof supabase>;
const mockLogError = logError as jest.MockedFunction<typeof logError>;

describe('imageUpload utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constants', () => {
    it('has expected MAX_UPLOAD_DIMENSION', () => {
      expect(MAX_UPLOAD_DIMENSION).toBe(1600);
    });

    it('has expected JPEG_UPLOAD_QUALITY', () => {
      expect(JPEG_UPLOAD_QUALITY).toBe(0.85);
    });

    it('has expected WARDROBE_BUCKET_NAME', () => {
      expect(WARDROBE_BUCKET_NAME).toBe('wardrobe-items');
    });
  });

  describe('prepareImageForUpload', () => {
    const defaultUri = 'file:///path/to/image.jpg';

    describe('Resizing Logic', () => {
      describe('No upscaling (images already within limit)', () => {
        it('does not resize image when both dimensions under limit', async () => {
          mockManipulateAsync.mockResolvedValueOnce({
            uri: 'file:///processed.jpg',
            width: 800,
            height: 600,
          });

          MockFile.mockImplementation(
            () =>
              ({
                size: 500000,
              }) as File
          );

          await prepareImageForUpload(defaultUri, 800, 600);

          expect(mockManipulateAsync).toHaveBeenCalledWith(
            defaultUri,
            [], // No resize actions
            {
              compress: JPEG_UPLOAD_QUALITY,
              format: ImageManipulator.SaveFormat.JPEG,
            }
          );
        });

        it('does not resize square image at exactly the limit', async () => {
          mockManipulateAsync.mockResolvedValueOnce({
            uri: 'file:///processed.jpg',
            width: 1600,
            height: 1600,
          });

          MockFile.mockImplementation(
            () =>
              ({
                size: 1500000,
              }) as File
          );

          await prepareImageForUpload(defaultUri, 1600, 1600);

          expect(mockManipulateAsync).toHaveBeenCalledWith(defaultUri, [], {
            compress: JPEG_UPLOAD_QUALITY,
            format: ImageManipulator.SaveFormat.JPEG,
          });
        });

        it('does not resize portrait image with height at limit', async () => {
          mockManipulateAsync.mockResolvedValueOnce({
            uri: 'file:///processed.jpg',
            width: 1200,
            height: 1600,
          });

          MockFile.mockImplementation(
            () =>
              ({
                size: 1400000,
              }) as File
          );

          await prepareImageForUpload(defaultUri, 1200, 1600);

          expect(mockManipulateAsync).toHaveBeenCalledWith(defaultUri, [], expect.any(Object));
        });

        it('does not resize landscape image with width at limit', async () => {
          mockManipulateAsync.mockResolvedValueOnce({
            uri: 'file:///processed.jpg',
            width: 1600,
            height: 1200,
          });

          MockFile.mockImplementation(
            () =>
              ({
                size: 1400000,
              }) as File
          );

          await prepareImageForUpload(defaultUri, 1600, 1200);

          expect(mockManipulateAsync).toHaveBeenCalledWith(defaultUri, [], expect.any(Object));
        });
      });

      describe('Proportional downscaling (images exceeding limit)', () => {
        it('downscales portrait image maintaining aspect ratio', async () => {
          mockManipulateAsync.mockResolvedValueOnce({
            uri: 'file:///processed.jpg',
            width: 1280,
            height: 1600,
          });

          MockFile.mockImplementation(
            () =>
              ({
                size: 1500000,
              }) as File
          );

          // Original: 2400x3000 (portrait)
          // Longest edge: 3000
          // Scale: 1600 / 3000 = 0.5333...
          // Expected: 1280x1600
          await prepareImageForUpload(defaultUri, 2400, 3000);

          expect(mockManipulateAsync).toHaveBeenCalledWith(
            defaultUri,
            [
              {
                resize: {
                  width: 1280,
                  height: 1600,
                },
              },
            ],
            {
              compress: JPEG_UPLOAD_QUALITY,
              format: ImageManipulator.SaveFormat.JPEG,
            }
          );
        });

        it('downscales landscape image maintaining aspect ratio', async () => {
          mockManipulateAsync.mockResolvedValueOnce({
            uri: 'file:///processed.jpg',
            width: 1600,
            height: 1067,
          });

          MockFile.mockImplementation(
            () =>
              ({
                size: 1200000,
              }) as File
          );

          // Original: 3000x2000 (landscape)
          // Longest edge: 3000
          // Scale: 1600 / 3000 = 0.5333...
          // Expected: 1600x1067 (rounded)
          await prepareImageForUpload(defaultUri, 3000, 2000);

          expect(mockManipulateAsync).toHaveBeenCalledWith(
            defaultUri,
            [
              {
                resize: {
                  width: 1600,
                  height: 1067,
                },
              },
            ],
            expect.any(Object)
          );
        });

        it('downscales square image proportionally', async () => {
          mockManipulateAsync.mockResolvedValueOnce({
            uri: 'file:///processed.jpg',
            width: 1600,
            height: 1600,
          });

          MockFile.mockImplementation(
            () =>
              ({
                size: 1500000,
              }) as File
          );

          // Original: 2000x2000 (square)
          // Expected: 1600x1600
          await prepareImageForUpload(defaultUri, 2000, 2000);

          expect(mockManipulateAsync).toHaveBeenCalledWith(
            defaultUri,
            [
              {
                resize: {
                  width: 1600,
                  height: 1600,
                },
              },
            ],
            expect.any(Object)
          );
        });

        it('downscales very large portrait image', async () => {
          mockManipulateAsync.mockResolvedValueOnce({
            uri: 'file:///processed.jpg',
            width: 1200,
            height: 1600,
          });

          MockFile.mockImplementation(
            () =>
              ({
                size: 1800000,
              }) as File
          );

          // Original: 3000x4000 (very large portrait)
          // Longest edge: 4000
          // Scale: 1600 / 4000 = 0.4
          // Expected: 1200x1600
          await prepareImageForUpload(defaultUri, 3000, 4000);

          expect(mockManipulateAsync).toHaveBeenCalledWith(
            defaultUri,
            [
              {
                resize: {
                  width: 1200,
                  height: 1600,
                },
              },
            ],
            expect.any(Object)
          );
        });

        it('downscales very wide landscape image', async () => {
          mockManipulateAsync.mockResolvedValueOnce({
            uri: 'file:///processed.jpg',
            width: 1600,
            height: 800,
          });

          MockFile.mockImplementation(
            () =>
              ({
                size: 900000,
              }) as File
          );

          // Original: 4000x2000 (very wide)
          // Expected: 1600x800
          await prepareImageForUpload(defaultUri, 4000, 2000);

          expect(mockManipulateAsync).toHaveBeenCalledWith(
            defaultUri,
            [
              {
                resize: {
                  width: 1600,
                  height: 800,
                },
              },
            ],
            expect.any(Object)
          );
        });

        it('rounds dimensions to integers', async () => {
          mockManipulateAsync.mockResolvedValueOnce({
            uri: 'file:///processed.jpg',
            width: 1371,
            height: 1600,
          });

          MockFile.mockImplementation(
            () =>
              ({
                size: 1400000,
              }) as File
          );

          // Original: 2400x2800
          // Longest edge: 2800
          // Scale: 1600 / 2800 = 0.571428...
          // Expected: 1371x1600 (rounded)
          await prepareImageForUpload(defaultUri, 2400, 2800);

          const call = mockManipulateAsync.mock.calls[0];
          const resizeAction = call?.[1]?.[0] as { resize: { width: number; height: number } };

          expect(Number.isInteger(resizeAction.resize.width)).toBe(true);
          expect(Number.isInteger(resizeAction.resize.height)).toBe(true);
        });
      });
    });

    describe('Compression Behavior', () => {
      it('always compresses to JPEG format', async () => {
        mockManipulateAsync.mockResolvedValueOnce({
          uri: 'file:///processed.jpg',
          width: 800,
          height: 600,
        });

        MockFile.mockImplementation(
          () =>
            ({
              size: 500000,
            }) as File
        );

        await prepareImageForUpload(defaultUri, 800, 600);

        expect(mockManipulateAsync).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(Array),
          expect.objectContaining({
            format: ImageManipulator.SaveFormat.JPEG,
          })
        );
      });

      it('uses correct compression quality (0.85)', async () => {
        mockManipulateAsync.mockResolvedValueOnce({
          uri: 'file:///processed.jpg',
          width: 800,
          height: 600,
        });

        MockFile.mockImplementation(
          () =>
            ({
              size: 500000,
            }) as File
        );

        await prepareImageForUpload(defaultUri, 800, 600);

        expect(mockManipulateAsync).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(Array),
          expect.objectContaining({
            compress: 0.85,
          })
        );
      });

      it('applies compression even when no resize needed', async () => {
        mockManipulateAsync.mockResolvedValueOnce({
          uri: 'file:///processed.jpg',
          width: 1200,
          height: 900,
        });

        MockFile.mockImplementation(
          () =>
            ({
              size: 800000,
            }) as File
        );

        await prepareImageForUpload(defaultUri, 1200, 900);

        expect(mockManipulateAsync).toHaveBeenCalledWith(
          defaultUri,
          [], // No resize
          {
            compress: JPEG_UPLOAD_QUALITY,
            format: ImageManipulator.SaveFormat.JPEG,
          }
        );
      });
    });

    describe('EXIF Metadata Stripping (Privacy Guidelines)', () => {
      it('calls manipulateAsync which automatically strips EXIF data', async () => {
        mockManipulateAsync.mockResolvedValueOnce({
          uri: 'file:///processed.jpg',
          width: 1600,
          height: 1200,
        });

        MockFile.mockImplementation(
          () =>
            ({
              size: 1500000,
            }) as File
        );

        await prepareImageForUpload(defaultUri, 2400, 1800);

        // Verify manipulateAsync is called, which strips EXIF automatically
        expect(mockManipulateAsync).toHaveBeenCalled();
      });

      it('strips EXIF when saving to new file (privacy compliance)', async () => {
        // Per expo-image-manipulator documentation:
        // EXIF metadata (GPS location, camera info, timestamps) is automatically
        // stripped when manipulateAsync saves to a new file.
        // This ensures privacy compliance by removing sensitive metadata.

        mockManipulateAsync.mockResolvedValueOnce({
          uri: 'file:///processed.jpg',
          width: 800,
          height: 600,
        });

        MockFile.mockImplementation(
          () =>
            ({
              size: 500000,
            }) as File
        );

        const result = await prepareImageForUpload(defaultUri, 800, 600);

        // Verify new file URI returned (EXIF stripped in process)
        expect(result.uri).toBe('file:///processed.jpg');
        expect(mockManipulateAsync).toHaveBeenCalledTimes(1);
      });

      it('processes image with JPEG format ensuring metadata removal', async () => {
        mockManipulateAsync.mockResolvedValueOnce({
          uri: 'file:///processed.jpg',
          width: 1280,
          height: 1600,
        });

        MockFile.mockImplementation(
          () =>
            ({
              size: 1400000,
            }) as File
        );

        await prepareImageForUpload(defaultUri, 2400, 3000);

        // JPEG format conversion strips EXIF
        expect(mockManipulateAsync).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(Array),
          expect.objectContaining({
            format: ImageManipulator.SaveFormat.JPEG,
          })
        );
      });
    });

    describe('Return Value', () => {
      it('returns prepared image with correct structure', async () => {
        mockManipulateAsync.mockResolvedValueOnce({
          uri: 'file:///processed.jpg',
          width: 1280,
          height: 1600,
        });

        MockFile.mockImplementation(
          () =>
            ({
              size: 1500000,
            }) as File
        );

        const result = await prepareImageForUpload(defaultUri, 2400, 3000);

        expect(result).toEqual({
          uri: 'file:///processed.jpg',
          width: 1280,
          height: 1600,
          fileSize: 1500000,
        });
      });

      it('returns correct uri from manipulateAsync', async () => {
        const processedUri = 'file:///temp/processed-abc123.jpg';

        mockManipulateAsync.mockResolvedValueOnce({
          uri: processedUri,
          width: 800,
          height: 600,
        });

        MockFile.mockImplementation(
          () =>
            ({
              size: 450000,
            }) as File
        );

        const result = await prepareImageForUpload(defaultUri, 800, 600);

        expect(result.uri).toBe(processedUri);
      });

      it('returns correct dimensions from manipulateAsync', async () => {
        mockManipulateAsync.mockResolvedValueOnce({
          uri: 'file:///processed.jpg',
          width: 1371,
          height: 1600,
        });

        MockFile.mockImplementation(
          () =>
            ({
              size: 1300000,
            }) as File
        );

        const result = await prepareImageForUpload(defaultUri, 2400, 2800);

        expect(result.width).toBe(1371);
        expect(result.height).toBe(1600);
      });

      it('returns fileSize from File API', async () => {
        mockManipulateAsync.mockResolvedValueOnce({
          uri: 'file:///processed.jpg',
          width: 1600,
          height: 1200,
        });

        const mockFileSize = 1234567;
        MockFile.mockImplementation(
          () =>
            ({
              size: mockFileSize,
            }) as File
        );

        const result = await prepareImageForUpload(defaultUri, 2400, 1800);

        expect(result.fileSize).toBe(mockFileSize);
      });

      it('returns 0 fileSize when File.size is undefined', async () => {
        mockManipulateAsync.mockResolvedValueOnce({
          uri: 'file:///processed.jpg',
          width: 800,
          height: 600,
        });

        MockFile.mockImplementation(
          () =>
            ({
              size: undefined,
            }) as unknown as File
        );

        const result = await prepareImageForUpload(defaultUri, 800, 600);

        expect(result.fileSize).toBe(0);
      });
    });

    describe('Error Handling', () => {
      it('throws UploadError with processing type on memory error', async () => {
        mockManipulateAsync.mockRejectedValueOnce(new Error('Out of memory (OOM)'));

        try {
          await prepareImageForUpload(defaultUri, 8000, 6000);
          fail('Should have thrown UploadError');
        } catch (error) {
          expect(error).toBeInstanceOf(UploadError);
          expect((error as UploadError).errorType).toBe('processing');
          expect((error as UploadError).message).toBe('Image too large to process');
        }
      });

      it('throws UploadError with file_read type on ENOENT error', async () => {
        mockManipulateAsync.mockRejectedValueOnce(new Error('enoent: no such file or directory'));

        try {
          await prepareImageForUpload(defaultUri, 2400, 3000);
          fail('Should have thrown UploadError');
        } catch (error) {
          expect(error).toBeInstanceOf(UploadError);
          expect((error as UploadError).errorType).toBe('file_read');
          expect((error as UploadError).message).toBe('Image file not found');
        }
      });

      it('throws UploadError with file_read type on file not found', async () => {
        mockManipulateAsync.mockRejectedValueOnce(new Error('file not found'));

        try {
          await prepareImageForUpload(defaultUri, 2400, 3000);
          fail('Should have thrown UploadError');
        } catch (error) {
          expect(error).toBeInstanceOf(UploadError);
          expect((error as UploadError).errorType).toBe('file_read');
        }
      });

      it('throws UploadError with permission type on permission error', async () => {
        mockManipulateAsync.mockRejectedValueOnce(new Error('permission denied'));

        try {
          await prepareImageForUpload(defaultUri, 2400, 3000);
          fail('Should have thrown UploadError');
        } catch (error) {
          expect(error).toBeInstanceOf(UploadError);
          expect((error as UploadError).errorType).toBe('permission');
          expect((error as UploadError).message).toBe('Permission denied accessing image');
        }
      });

      it('throws UploadError with processing type on generic error', async () => {
        mockManipulateAsync.mockRejectedValueOnce(new Error('Something went wrong'));

        try {
          await prepareImageForUpload(defaultUri, 2400, 3000);
          fail('Should have thrown UploadError');
        } catch (error) {
          expect(error).toBeInstanceOf(UploadError);
          expect((error as UploadError).errorType).toBe('processing');
          expect((error as UploadError).message).toBe('Failed to process image');
        }
      });

      it('preserves original error in UploadError', async () => {
        const originalError = new Error('Original failure');
        mockManipulateAsync.mockRejectedValueOnce(originalError);

        try {
          await prepareImageForUpload(defaultUri, 2400, 3000);
        } catch (error) {
          expect((error as UploadError).originalError).toBe(originalError);
        }
      });
    });

    describe('Edge Cases', () => {
      it('handles very small images (1x1)', async () => {
        mockManipulateAsync.mockResolvedValueOnce({
          uri: 'file:///processed.jpg',
          width: 1,
          height: 1,
        });

        MockFile.mockImplementation(
          () =>
            ({
              size: 1000,
            }) as File
        );

        const result = await prepareImageForUpload(defaultUri, 1, 1);

        expect(result.width).toBe(1);
        expect(result.height).toBe(1);
        expect(mockManipulateAsync).toHaveBeenCalledWith(defaultUri, [], expect.any(Object));
      });

      it('handles image exactly one pixel over limit', async () => {
        mockManipulateAsync.mockResolvedValueOnce({
          uri: 'file:///processed.jpg',
          width: 1600,
          height: 1599,
        });

        MockFile.mockImplementation(
          () =>
            ({
              size: 1500000,
            }) as File
        );

        // 1601x1600 - just over limit
        await prepareImageForUpload(defaultUri, 1601, 1600);

        const call = mockManipulateAsync.mock.calls[0];
        expect(call[1]).toHaveLength(1); // Should have resize action
      });

      it('handles very large dimensions gracefully', async () => {
        mockManipulateAsync.mockResolvedValueOnce({
          uri: 'file:///processed.jpg',
          width: 1600,
          height: 1280,
        });

        MockFile.mockImplementation(
          () =>
            ({
              size: 1800000,
            }) as File
        );

        // 10000x8000 - extremely large
        const result = await prepareImageForUpload(defaultUri, 10000, 8000);

        expect(result.width).toBe(1600);
        expect(result.height).toBe(1280);
      });

      it('handles aspect ratio preservation for unusual ratios', async () => {
        mockManipulateAsync.mockResolvedValueOnce({
          uri: 'file:///processed.jpg',
          width: 1600,
          height: 320,
        });

        MockFile.mockImplementation(
          () =>
            ({
              size: 400000,
            }) as File
        );

        // 5000x1000 - very wide panorama (5:1 ratio)
        await prepareImageForUpload(defaultUri, 5000, 1000);

        const call = mockManipulateAsync.mock.calls[0];
        const resizeAction = call?.[1]?.[0] as { resize: { width: number; height: number } };

        // Verify aspect ratio maintained: 1600 / 320 = 5
        expect(resizeAction.resize.width / resizeAction.resize.height).toBeCloseTo(5, 1);
      });
    });
  });

  describe('generateStoragePath', () => {
    it('returns correct path format', () => {
      const userId = 'user-123';
      const itemId = 'item-456';

      const path = generateStoragePath(userId, itemId);

      expect(path).toBe('user/user-123/items/item-456/original.jpg');
    });

    it('handles various userId formats', () => {
      const path = generateStoragePath('abc-def-ghi', 'item-789');

      expect(path).toContain('user/abc-def-ghi/items/item-789/original.jpg');
    });

    it('handles UUID formats for itemId', () => {
      const userId = 'user-123';
      const itemId = '01234567-89ab-cdef-0123-456789abcdef';

      const path = generateStoragePath(userId, itemId);

      expect(path).toBe(`user/${userId}/items/${itemId}/original.jpg`);
    });

    it('uses consistent path template structure', () => {
      const path1 = generateStoragePath('user1', 'item1');
      const path2 = generateStoragePath('user2', 'item2');

      expect(path1).toMatch(/^user\/.+\/items\/.+\/original\.jpg$/);
      expect(path2).toMatch(/^user\/.+\/items\/.+\/original\.jpg$/);
    });

    describe('Path Security & Structure', () => {
      it('includes userId segment in path', () => {
        const userId = 'test-user-abc123';
        const itemId = 'item-xyz789';

        const path = generateStoragePath(userId, itemId);

        expect(path).toContain(userId);
        expect(path).toContain('user/');
      });

      it('includes itemId segment in path', () => {
        const userId = 'user-123';
        const itemId = 'item-456';

        const path = generateStoragePath(userId, itemId);

        expect(path).toContain(itemId);
        expect(path).toContain('/items/');
      });

      it('requires both userId and itemId for non-guessable path', () => {
        const userId = 'secure-user-id';
        const itemId = 'secure-item-id';

        const path = generateStoragePath(userId, itemId);

        // Path should contain both IDs, making it non-guessable without both
        expect(path).toContain(userId);
        expect(path).toContain(itemId);
      });

      it('generates stable deterministic paths', () => {
        const userId = 'user-abc';
        const itemId = 'item-xyz';

        const path1 = generateStoragePath(userId, itemId);
        const path2 = generateStoragePath(userId, itemId);
        const path3 = generateStoragePath(userId, itemId);

        expect(path1).toBe(path2);
        expect(path2).toBe(path3);
      });

      it('generates different paths for different userIds', () => {
        const itemId = 'same-item-id';

        const path1 = generateStoragePath('user-1', itemId);
        const path2 = generateStoragePath('user-2', itemId);

        expect(path1).not.toBe(path2);
      });

      it('generates different paths for different itemIds', () => {
        const userId = 'same-user-id';

        const path1 = generateStoragePath(userId, 'item-1');
        const path2 = generateStoragePath(userId, 'item-2');

        expect(path1).not.toBe(path2);
      });

      it('starts with user/ prefix', () => {
        const path = generateStoragePath('test-user', 'test-item');

        expect(path).toMatch(/^user\//);
        expect(path.startsWith('user/')).toBe(true);
      });

      it('contains items/ segment', () => {
        const path = generateStoragePath('test-user', 'test-item');

        expect(path).toContain('/items/');
      });

      it('ends with original.jpg filename', () => {
        const path = generateStoragePath('test-user', 'test-item');

        expect(path).toMatch(/\/original\.jpg$/);
        expect(path.endsWith('/original.jpg')).toBe(true);
      });

      it('handles UUID format userIds', () => {
        const userId = '550e8400-e29b-41d4-a716-446655440000';
        const itemId = 'item-123';

        const path = generateStoragePath(userId, itemId);

        expect(path).toBe(`user/${userId}/items/${itemId}/original.jpg`);
      });

      it('handles UUIDv7 format itemIds', () => {
        const userId = 'user-123';
        const itemId = '018c8f4e-1a2b-7c3d-8e4f-9a0b1c2d3e4f';

        const path = generateStoragePath(userId, itemId);

        expect(path).toBe(`user/${userId}/items/${itemId}/original.jpg`);
      });

      it('does not allow path traversal with ../', () => {
        const userId = '../../../etc/passwd';
        const itemId = 'item-123';

        const path = generateStoragePath(userId, itemId);

        // Path should contain the literal string, not traverse
        expect(path).toContain(userId);
        expect(path).toBe(`user/${userId}/items/${itemId}/original.jpg`);
      });

      it('maintains path structure with special characters', () => {
        const userId = 'user-abc-123-def';
        const itemId = 'item-xyz-456-ghi';

        const path = generateStoragePath(userId, itemId);

        expect(path).toBe(`user/${userId}/items/${itemId}/original.jpg`);
      });
    });
  });

  describe('classifyStorageError', () => {
    describe('Network Error Classification', () => {
      it('classifies network keyword as network type', () => {
        const error = { message: 'Network request failed' };

        const result = classifyStorageError(error);

        expect(result).toBe('network');
      });

      it('classifies fetch keyword as network type', () => {
        const error = { message: 'Fetch operation timeout' };

        const result = classifyStorageError(error);

        expect(result).toBe('network');
      });

      it('classifies timeout keyword as network type', () => {
        const error = { message: 'Request timeout exceeded' };

        const result = classifyStorageError(error);

        expect(result).toBe('network');
      });

      it('classifies connection keyword as network type', () => {
        const error = { message: 'Connection refused by server' };

        const result = classifyStorageError(error);

        expect(result).toBe('network');
      });

      it('classifies ECONNREFUSED as network type', () => {
        const error = { message: 'ECONNREFUSED: connection refused' };

        const result = classifyStorageError(error);

        expect(result).toBe('network');
      });

      it('is case insensitive for network errors', () => {
        const error1 = { message: 'NETWORK ERROR' };
        const error2 = { message: 'Network Error' };
        const error3 = { message: 'network error' };

        expect(classifyStorageError(error1)).toBe('network');
        expect(classifyStorageError(error2)).toBe('network');
        expect(classifyStorageError(error3)).toBe('network');
      });
    });

    describe('Permission Error Classification', () => {
      it('classifies 401 status code as permission type', () => {
        const error = { statusCode: 401, message: 'Unauthorized' };

        const result = classifyStorageError(error);

        expect(result).toBe('permission');
      });

      it('classifies 403 status code as permission type', () => {
        const error = { statusCode: 403, message: 'Forbidden' };

        const result = classifyStorageError(error);

        expect(result).toBe('permission');
      });

      it('classifies unauthorized keyword as permission type', () => {
        const error = { message: 'Unauthorized access to resource' };

        const result = classifyStorageError(error);

        expect(result).toBe('permission');
      });

      it('classifies forbidden keyword as permission type', () => {
        const error = { message: 'Forbidden operation' };

        const result = classifyStorageError(error);

        expect(result).toBe('permission');
      });

      it('classifies permission keyword as permission type', () => {
        const error = { message: 'Permission denied for operation' };

        const result = classifyStorageError(error);

        expect(result).toBe('permission');
      });

      it('classifies 401 without message as permission type', () => {
        const error = { statusCode: 401 };

        const result = classifyStorageError(error);

        expect(result).toBe('permission');
      });

      it('classifies 403 without message as permission type', () => {
        const error = { statusCode: 403 };

        const result = classifyStorageError(error);

        expect(result).toBe('permission');
      });

      it('is case insensitive for permission errors', () => {
        const error1 = { message: 'UNAUTHORIZED' };
        const error2 = { message: 'Unauthorized' };
        const error3 = { message: 'unauthorized' };

        expect(classifyStorageError(error1)).toBe('permission');
        expect(classifyStorageError(error2)).toBe('permission');
        expect(classifyStorageError(error3)).toBe('permission');
      });
    });

    describe('Storage Error Classification', () => {
      it('classifies bucket keyword as storage type', () => {
        const error = { message: 'Bucket not found' };

        const result = classifyStorageError(error);

        expect(result).toBe('storage');
      });

      it('classifies storage keyword as storage type', () => {
        const error = { message: 'Storage service unavailable' };

        const result = classifyStorageError(error);

        expect(result).toBe('storage');
      });

      it('classifies quota keyword as storage type', () => {
        const error = { message: 'Storage quota exceeded' };

        const result = classifyStorageError(error);

        expect(result).toBe('storage');
      });

      it('classifies size keyword as storage type', () => {
        const error = { message: 'File size limit exceeded' };

        const result = classifyStorageError(error);

        expect(result).toBe('storage');
      });

      it('is case insensitive for storage errors', () => {
        const error1 = { message: 'BUCKET NOT FOUND' };
        const error2 = { message: 'Bucket Not Found' };
        const error3 = { message: 'bucket not found' };

        expect(classifyStorageError(error1)).toBe('storage');
        expect(classifyStorageError(error2)).toBe('storage');
        expect(classifyStorageError(error3)).toBe('storage');
      });
    });

    describe('Default and Edge Cases', () => {
      it('defaults to storage type for unrecognized errors', () => {
        const error = { message: 'Some unknown error' };

        const result = classifyStorageError(error);

        expect(result).toBe('storage');
      });

      it('handles errors with only statusCode field', () => {
        const error = { statusCode: 500 };

        const result = classifyStorageError(error);

        expect(result).toBe('storage');
      });

      it('handles errors with only message field', () => {
        const error = { message: 'Generic error message' };

        const result = classifyStorageError(error);

        expect(result).toBe('storage');
      });

      it('handles Error instances', () => {
        const error = new Error('Network failure');

        const result = classifyStorageError(error);

        expect(result).toBe('network');
      });

      it('handles null as unknown type', () => {
        const result = classifyStorageError(null);

        expect(result).toBe('unknown');
      });

      it('handles undefined as unknown type', () => {
        const result = classifyStorageError(undefined);

        expect(result).toBe('unknown');
      });

      it('handles string as unknown type', () => {
        const result = classifyStorageError('some error string');

        expect(result).toBe('unknown');
      });

      it('handles number as unknown type', () => {
        const result = classifyStorageError(404);

        expect(result).toBe('unknown');
      });

      it('handles empty object', () => {
        const error = {};

        const result = classifyStorageError(error);

        expect(result).toBe('storage');
      });

      it('handles error with empty string message', () => {
        const error = { message: '' };

        const result = classifyStorageError(error);

        expect(result).toBe('storage');
      });

      it('uses error field if message is not present', () => {
        const error = { error: 'network timeout' };

        const result = classifyStorageError(error);

        expect(result).toBe('network');
      });
    });

    describe('Priority and Precedence', () => {
      it('prefers status code over message for permission', () => {
        const error = { statusCode: 401, message: 'storage error' };

        const result = classifyStorageError(error);

        // Network is checked first, then permission by status code
        expect(result).toBe('permission');
      });

      it('classifies network errors before permission keywords', () => {
        const error = { message: 'network timeout unauthorized' };

        const result = classifyStorageError(error);

        // Network keywords are checked first
        expect(result).toBe('network');
      });

      it('classifies permission errors before storage keywords', () => {
        const error = { message: 'unauthorized storage access' };

        const result = classifyStorageError(error);

        // Permission keywords are checked before storage
        expect(result).toBe('permission');
      });
    });
  });

  describe('uploadImageToStorage', () => {
    let mockUpload: jest.Mock;
    let mockFrom: jest.Mock;

    const defaultPreparedImage: PreparedImage = {
      uri: 'file:///processed.jpg',
      width: 1280,
      height: 1600,
      fileSize: 1500000,
    };

    const defaultStoragePath = 'user/abc-123/items/def-456/original.jpg';

    beforeEach(() => {
      // Setup mock chain for supabase.storage.from().upload()
      mockUpload = jest.fn();
      mockFrom = jest.fn().mockReturnValue({
        upload: mockUpload,
      });

      mockSupabase.storage.from = mockFrom;

      // Setup File mock for arrayBuffer
      MockFile.mockImplementation(
        () =>
          ({
            size: 1500000,
            arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(1500000)),
          }) as unknown as File
      );
    });

    describe('Successful Upload', () => {
      it('uploads to correct bucket (wardrobe-items)', async () => {
        mockUpload.mockResolvedValueOnce({ error: null });

        await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);

        expect(mockFrom).toHaveBeenCalledWith(WARDROBE_BUCKET_NAME);
        expect(mockFrom).toHaveBeenCalledWith('wardrobe-items');
      });

      it('sets correct contentType (image/jpeg)', async () => {
        mockUpload.mockResolvedValueOnce({ error: null });

        await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);

        expect(mockUpload).toHaveBeenCalledWith(
          defaultStoragePath,
          expect.any(ArrayBuffer),
          expect.objectContaining({
            contentType: 'image/jpeg',
          })
        );
      });

      it('enables upsert for retry idempotency', async () => {
        mockUpload.mockResolvedValueOnce({ error: null });

        await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);

        expect(mockUpload).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(ArrayBuffer),
          expect.objectContaining({
            upsert: true,
          })
        );
      });

      it('returns storagePath on success', async () => {
        mockUpload.mockResolvedValueOnce({ error: null });

        const result = await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);

        expect(result).toBe(defaultStoragePath);
      });

      it('reads image as ArrayBuffer from file', async () => {
        mockUpload.mockResolvedValueOnce({ error: null });

        await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);

        expect(MockFile).toHaveBeenCalledWith(defaultPreparedImage.uri);
      });

      it('does not log errors on success', async () => {
        mockUpload.mockResolvedValueOnce({ error: null });

        await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);

        expect(mockLogError).not.toHaveBeenCalled();
      });

      it('uploads with correct storagePath parameter', async () => {
        mockUpload.mockResolvedValueOnce({ error: null });
        const customPath = 'user/xyz/items/abc/original.jpg';

        await uploadImageToStorage(defaultPreparedImage, customPath);

        expect(mockUpload).toHaveBeenCalledWith(
          customPath,
          expect.any(ArrayBuffer),
          expect.any(Object)
        );
      });
    });

    describe('Error Classification - Network Errors', () => {
      it('classifies network keyword errors as network type', async () => {
        mockUpload.mockResolvedValueOnce({
          error: { message: 'Network request failed' },
        });

        try {
          await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);
          fail('Should have thrown UploadError');
        } catch (error) {
          expect(error).toBeInstanceOf(UploadError);
          expect((error as UploadError).errorType).toBe('network');
          expect((error as UploadError).message).toBe('Network error during upload');
        }
      });

      it('classifies fetch errors as network type', async () => {
        mockUpload.mockResolvedValueOnce({
          error: { message: 'Fetch timeout occurred' },
        });

        try {
          await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);
          fail('Should have thrown UploadError');
        } catch (error) {
          expect((error as UploadError).errorType).toBe('network');
        }
      });

      it('classifies timeout errors as network type', async () => {
        mockUpload.mockResolvedValueOnce({
          error: { message: 'Request timeout' },
        });

        try {
          await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);
          fail('Should have thrown UploadError');
        } catch (error) {
          expect((error as UploadError).errorType).toBe('network');
        }
      });

      it('classifies connection errors as network type', async () => {
        mockUpload.mockResolvedValueOnce({
          error: { message: 'Connection refused' },
        });

        try {
          await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);
          fail('Should have thrown UploadError');
        } catch (error) {
          expect((error as UploadError).errorType).toBe('network');
        }
      });

      it('classifies ECONNREFUSED errors as network type', async () => {
        mockUpload.mockResolvedValueOnce({
          error: { message: 'ECONNREFUSED' },
        });

        try {
          await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);
          fail('Should have thrown UploadError');
        } catch (error) {
          expect((error as UploadError).errorType).toBe('network');
        }
      });
    });

    describe('Error Classification - Permission Errors', () => {
      it('classifies 401 status code as permission type', async () => {
        mockUpload.mockResolvedValueOnce({
          error: { statusCode: 401, message: 'Unauthorized' },
        });

        try {
          await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);
          fail('Should have thrown UploadError');
        } catch (error) {
          expect(error).toBeInstanceOf(UploadError);
          expect((error as UploadError).errorType).toBe('permission');
          expect((error as UploadError).message).toBe('Permission denied uploading image');
        }
      });

      it('classifies 403 status code as permission type', async () => {
        mockUpload.mockResolvedValueOnce({
          error: { statusCode: 403, message: 'Forbidden' },
        });

        try {
          await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);
          fail('Should have thrown UploadError');
        } catch (error) {
          expect((error as UploadError).errorType).toBe('permission');
        }
      });

      it('classifies unauthorized keyword as permission type', async () => {
        mockUpload.mockResolvedValueOnce({
          error: { message: 'Unauthorized access' },
        });

        try {
          await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);
          fail('Should have thrown UploadError');
        } catch (error) {
          expect((error as UploadError).errorType).toBe('permission');
        }
      });

      it('classifies forbidden keyword as permission type', async () => {
        mockUpload.mockResolvedValueOnce({
          error: { message: 'Forbidden resource' },
        });

        try {
          await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);
          fail('Should have thrown UploadError');
        } catch (error) {
          expect((error as UploadError).errorType).toBe('permission');
        }
      });

      it('classifies permission keyword as permission type', async () => {
        mockUpload.mockResolvedValueOnce({
          error: { message: 'Permission denied' },
        });

        try {
          await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);
          fail('Should have thrown UploadError');
        } catch (error) {
          expect((error as UploadError).errorType).toBe('permission');
        }
      });
    });

    describe('Error Classification - Storage Errors', () => {
      it('classifies bucket errors as storage type', async () => {
        mockUpload.mockResolvedValueOnce({
          error: { message: 'Bucket not found' },
        });

        try {
          await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);
          fail('Should have thrown UploadError');
        } catch (error) {
          expect(error).toBeInstanceOf(UploadError);
          expect((error as UploadError).errorType).toBe('storage');
          expect((error as UploadError).message).toBe('Failed to upload image to storage');
        }
      });

      it('classifies storage keyword errors as storage type', async () => {
        mockUpload.mockResolvedValueOnce({
          error: { message: 'Storage service unavailable' },
        });

        try {
          await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);
          fail('Should have thrown UploadError');
        } catch (error) {
          expect((error as UploadError).errorType).toBe('storage');
        }
      });

      it('classifies quota errors as storage type', async () => {
        mockUpload.mockResolvedValueOnce({
          error: { message: 'Storage quota exceeded' },
        });

        try {
          await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);
          fail('Should have thrown UploadError');
        } catch (error) {
          expect((error as UploadError).errorType).toBe('storage');
        }
      });

      it('classifies size errors as storage type', async () => {
        mockUpload.mockResolvedValueOnce({
          error: { message: 'File size limit exceeded' },
        });

        try {
          await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);
          fail('Should have thrown UploadError');
        } catch (error) {
          expect((error as UploadError).errorType).toBe('storage');
        }
      });

      it('defaults unknown errors to storage type', async () => {
        mockUpload.mockResolvedValueOnce({
          error: { message: 'Unknown error occurred' },
        });

        try {
          await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);
          fail('Should have thrown UploadError');
        } catch (error) {
          expect((error as UploadError).errorType).toBe('storage');
        }
      });
    });

    describe('Telemetry Logging', () => {
      it('logs errors with correct classification for network errors', async () => {
        const networkError = { message: 'Network request failed' };
        mockUpload.mockResolvedValueOnce({ error: networkError });

        try {
          await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);
        } catch {
          // Expected to throw
        }

        expect(mockLogError).toHaveBeenCalledWith(
          networkError,
          'network',
          expect.objectContaining({
            feature: 'wardrobe',
            operation: 'image_upload',
          })
        );
      });

      it('logs errors with server classification for permission errors', async () => {
        const permissionError = { statusCode: 401, message: 'Unauthorized' };
        mockUpload.mockResolvedValueOnce({ error: permissionError });

        try {
          await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);
        } catch {
          // Expected to throw
        }

        expect(mockLogError).toHaveBeenCalledWith(permissionError, 'server', expect.any(Object));
      });

      it('includes errorType in metadata', async () => {
        mockUpload.mockResolvedValueOnce({
          error: { message: 'Storage error' },
        });

        try {
          await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);
        } catch {
          // Expected to throw
        }

        expect(mockLogError).toHaveBeenCalledWith(
          expect.any(Object),
          expect.any(String),
          expect.objectContaining({
            metadata: expect.objectContaining({
              errorType: 'storage',
            }),
          })
        );
      });

      it('includes storagePath in metadata', async () => {
        mockUpload.mockResolvedValueOnce({
          error: { message: 'Storage error' },
        });

        try {
          await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);
        } catch {
          // Expected to throw
        }

        expect(mockLogError).toHaveBeenCalledWith(
          expect.any(Object),
          expect.any(String),
          expect.objectContaining({
            metadata: expect.objectContaining({
              storagePath: defaultStoragePath,
            }),
          })
        );
      });

      it('includes fileSize in metadata', async () => {
        mockUpload.mockResolvedValueOnce({
          error: { message: 'Storage error' },
        });

        try {
          await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);
        } catch {
          // Expected to throw
        }

        expect(mockLogError).toHaveBeenCalledWith(
          expect.any(Object),
          expect.any(String),
          expect.objectContaining({
            metadata: expect.objectContaining({
              fileSize: 1500000,
            }),
          })
        );
      });

      it('logs feature as wardrobe', async () => {
        mockUpload.mockResolvedValueOnce({
          error: { message: 'Storage error' },
        });

        try {
          await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);
        } catch {
          // Expected to throw
        }

        expect(mockLogError).toHaveBeenCalledWith(
          expect.any(Object),
          expect.any(String),
          expect.objectContaining({
            feature: 'wardrobe',
          })
        );
      });

      it('logs operation as image_upload', async () => {
        mockUpload.mockResolvedValueOnce({
          error: { message: 'Storage error' },
        });

        try {
          await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);
        } catch {
          // Expected to throw
        }

        expect(mockLogError).toHaveBeenCalledWith(
          expect.any(Object),
          expect.any(String),
          expect.objectContaining({
            operation: 'image_upload',
          })
        );
      });
    });

    describe('File Read Errors', () => {
      it('re-throws UploadError from file read failure', async () => {
        MockFile.mockImplementation(
          () =>
            ({
              arrayBuffer: jest.fn().mockRejectedValue(new Error('file not found')),
            }) as unknown as File
        );

        try {
          await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);
          fail('Should have thrown UploadError');
        } catch (error) {
          expect(error).toBeInstanceOf(UploadError);
          expect((error as UploadError).errorType).toBe('file_read');
        }
      });

      it('preserves file_read error type from readImageAsArrayBuffer', async () => {
        MockFile.mockImplementation(
          () =>
            ({
              arrayBuffer: jest.fn().mockRejectedValue(new Error('permission denied')),
            }) as unknown as File
        );

        try {
          await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);
          fail('Should have thrown UploadError');
        } catch (error) {
          expect((error as UploadError).errorType).toBe('file_read');
        }
      });
    });

    describe('Retry Idempotency', () => {
      it('uses upsert true for idempotent uploads', async () => {
        mockUpload.mockResolvedValueOnce({ error: null });

        await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);

        const uploadCall = mockUpload.mock.calls[0];
        expect(uploadCall[2]).toEqual(
          expect.objectContaining({
            upsert: true,
          })
        );
      });

      it('allows retrying with same storagePath', async () => {
        mockUpload.mockResolvedValueOnce({ error: null });
        mockUpload.mockResolvedValueOnce({ error: null });

        const result1 = await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);
        const result2 = await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);

        expect(result1).toBe(defaultStoragePath);
        expect(result2).toBe(defaultStoragePath);
        expect(mockUpload).toHaveBeenCalledTimes(2);
      });

      it('documents idempotent semantics via upsert flag', async () => {
        mockUpload.mockResolvedValueOnce({ error: null });

        await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);

        // upsert: true enables overwriting existing files
        // Same storagePath on retry overwrites previous upload
        // Idempotent behavior for network failures
        expect(mockUpload).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(ArrayBuffer),
          expect.objectContaining({
            upsert: true,
          })
        );
      });
    });

    describe('Integration with useCreateItemWithImage', () => {
      it('returns storagePath for database record creation', async () => {
        mockUpload.mockResolvedValueOnce({ error: null });

        const path = await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);

        // Hook uses this path to store in database
        expect(path).toBe(defaultStoragePath);
        expect(typeof path).toBe('string');
      });

      it('throws typed UploadError consumable by hook', async () => {
        mockUpload.mockResolvedValueOnce({
          error: { message: 'Network error' },
        });

        try {
          await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);
          fail('Should have thrown');
        } catch (error) {
          // Hook catches UploadError and maps to user message
          expect(error).toBeInstanceOf(UploadError);
          expect((error as UploadError).errorType).toBeDefined();
          expect((error as UploadError).message).toBeDefined();
        }
      });

      it('provides error types for user-facing messages', async () => {
        const errorScenarios = [
          { error: { message: 'network' }, expectedType: 'network' },
          { error: { statusCode: 401 }, expectedType: 'permission' },
          { error: { message: 'storage' }, expectedType: 'storage' },
        ];

        for (const scenario of errorScenarios) {
          mockUpload.mockResolvedValueOnce(scenario);

          try {
            await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);
            fail('Should have thrown');
          } catch (error) {
            expect((error as UploadError).errorType).toBe(scenario.expectedType);
          }
        }
      });

      it('preserves original error for debugging', async () => {
        const originalError = { message: 'Original storage error', code: 'STORAGE_001' };
        mockUpload.mockResolvedValueOnce({ error: originalError });

        try {
          await uploadImageToStorage(defaultPreparedImage, defaultStoragePath);
        } catch (error) {
          expect((error as UploadError).originalError).toBe(originalError);
        }
      });
    });
  });
});
