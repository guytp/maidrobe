/**
 * Unit tests for image upload utilities.
 *
 * Tests the image preparation pipeline for wardrobe item uploads:
 * - prepareImageForUpload: resizing, compression, and EXIF stripping
 * - Resizing logic: proportional downscaling with no upscaling
 * - Compression: JPEG format at 0.85 quality
 * - Privacy: EXIF metadata (GPS, camera, timestamps) automatically stripped
 *
 * @module __tests__/wardrobe/utils/imageUpload
 */

import * as ImageManipulator from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import {
  prepareImageForUpload,
  MAX_UPLOAD_DIMENSION,
  JPEG_UPLOAD_QUALITY,
  WARDROBE_BUCKET_NAME,
  UploadError,
} from '../../../src/features/wardrobe/utils/imageUpload';

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

const mockManipulateAsync = ImageManipulator.manipulateAsync as jest.MockedFunction<
  typeof ImageManipulator.manipulateAsync
>;

const MockFile = File as jest.MockedClass<typeof File>;

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
          const resizeAction = call[1][0] as { resize: { width: number; height: number } };

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
            }) as File
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
        const resizeAction = call[1][0] as { resize: { width: number; height: number } };

        // Verify aspect ratio maintained: 1600 / 320 = 5
        expect(resizeAction.resize.width / resizeAction.resize.height).toBeCloseTo(5, 1);
      });
    });
  });
});
