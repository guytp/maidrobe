/**
 * Unit tests for image processing utilities.
 *
 * Tests the crop & adjust image processing pipeline:
 * - computeCropRectangle: transforms screen coordinates to image coordinates
 * - cropAndProcessImage: crops, resizes, and compresses images
 *
 * @module __tests__/wardrobe/crop/imageProcessing
 */

import * as ImageManipulator from 'expo-image-manipulator';
import {
  computeCropRectangle,
  cropAndProcessImage,
  TARGET_MAX_DIMENSION,
  MAX_INPUT_DIMENSION,
  JPEG_QUALITY,
  CROP_ASPECT_RATIO,
  type CropRect,
  type FrameDimensions,
} from '../../../src/features/wardrobe/crop/utils/imageProcessing';
import { CropError } from '../../../src/features/wardrobe/crop/utils/errors';

// Mock expo-image-manipulator
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: {
    JPEG: 'jpeg',
    PNG: 'png',
  },
}));

const mockManipulateAsync = ImageManipulator.manipulateAsync as jest.MockedFunction<
  typeof ImageManipulator.manipulateAsync
>;

describe('imageProcessing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constants', () => {
    it('has expected TARGET_MAX_DIMENSION', () => {
      expect(TARGET_MAX_DIMENSION).toBe(1600);
    });

    it('has expected MAX_INPUT_DIMENSION', () => {
      expect(MAX_INPUT_DIMENSION).toBe(4096);
    });

    it('has expected JPEG_QUALITY', () => {
      expect(JPEG_QUALITY).toBe(0.85);
    });

    it('has expected CROP_ASPECT_RATIO (4:5)', () => {
      expect(CROP_ASPECT_RATIO).toBeCloseTo(0.8);
    });
  });

  describe('computeCropRectangle', () => {
    const defaultFrame: FrameDimensions = {
      left: 50,
      top: 100,
      width: 320,
      height: 400,
    };

    describe('basic crop at scale 1.0 with no translation', () => {
      it('returns frame coordinates when image fills screen exactly', () => {
        const result = computeCropRectangle(
          1920,
          1080,
          1.0, // scale
          0, // translateX
          0, // translateY
          defaultFrame
        );

        expect(result.x).toBe(50);
        expect(result.y).toBe(100);
        expect(result.width).toBe(320);
        expect(result.height).toBe(400);
      });

      it('handles frame at origin', () => {
        const frame: FrameDimensions = {
          left: 0,
          top: 0,
          width: 400,
          height: 500,
        };

        const result = computeCropRectangle(1920, 1080, 1.0, 0, 0, frame);

        expect(result.x).toBe(0);
        expect(result.y).toBe(0);
        expect(result.width).toBe(400);
        expect(result.height).toBe(500);
      });
    });

    describe('scaled images (zoomed in)', () => {
      it('computes smaller crop rectangle when image is zoomed in', () => {
        // At scale 2.0, the frame covers half the screen pixels in image space
        const result = computeCropRectangle(
          1920,
          1080,
          2.0, // scale
          0, // translateX
          0, // translateY
          defaultFrame
        );

        // Frame (50, 100, 320, 400) at scale 2.0 maps to (25, 50, 160, 200)
        expect(result.x).toBe(25);
        expect(result.y).toBe(50);
        expect(result.width).toBe(160);
        expect(result.height).toBe(200);
      });

      it('handles fractional scale values', () => {
        const result = computeCropRectangle(
          1920,
          1080,
          1.5, // scale
          0,
          0,
          defaultFrame
        );

        // Frame (50, 100, 320, 400) at scale 1.5 maps to (33, 67, 213, 267)
        expect(result.x).toBe(Math.round(50 / 1.5));
        expect(result.y).toBe(Math.round(100 / 1.5));
        expect(result.width).toBe(Math.round(320 / 1.5));
        expect(result.height).toBe(Math.round(400 / 1.5));
      });
    });

    describe('translated images (panned)', () => {
      it('adjusts crop for positive translation (image moved right/down)', () => {
        // Translation moves the image, so crop moves opposite direction in image space
        const result = computeCropRectangle(
          1920,
          1080,
          1.0,
          100, // image moved 100px right
          50, // image moved 50px down
          defaultFrame
        );

        // Frame (50, 100) with translate (100, 50) maps to (-50, 50) in image space
        // Clamped to (0, 50) since can't crop negative coordinates
        expect(result.x).toBe(0);
        expect(result.y).toBe(50);
      });

      it('adjusts crop for negative translation (image moved left/up)', () => {
        const result = computeCropRectangle(
          1920,
          1080,
          1.0,
          -100, // image moved 100px left
          -50, // image moved 50px up
          defaultFrame
        );

        // Frame (50, 100) with translate (-100, -50) maps to (150, 150)
        expect(result.x).toBe(150);
        expect(result.y).toBe(150);
        expect(result.width).toBe(320);
        expect(result.height).toBe(400);
      });
    });

    describe('combined scale and translation', () => {
      it('computes correct crop with both scale and translation', () => {
        const result = computeCropRectangle(
          1920,
          1080,
          2.0, // zoomed in 2x
          200, // translated right
          100, // translated down
          defaultFrame
        );

        // inverse transform: (screenCoord - translate) / scale
        // x: (50 - 200) / 2 = -75, clamped to 0
        // y: (100 - 100) / 2 = 0
        // width: 320 / 2 = 160
        // height: 400 / 2 = 200
        expect(result.x).toBe(0);
        expect(result.y).toBe(0);
        expect(result.width).toBe(160);
        expect(result.height).toBe(200);
      });
    });

    describe('boundary clamping', () => {
      it('clamps crop to image bounds when frame exceeds right edge', () => {
        const frame: FrameDimensions = {
          left: 1800,
          top: 0,
          width: 200,
          height: 400,
        };

        const result = computeCropRectangle(1920, 1080, 1.0, 0, 0, frame);

        // Frame extends to 2000px but image is only 1920px wide
        // clampedX = min(1800, 1920 - 200) = min(1800, 1720) = 1720
        expect(result.x).toBe(1720);
        expect(result.width).toBe(200);
      });

      it('clamps crop to image bounds when frame exceeds bottom edge', () => {
        const frame: FrameDimensions = {
          left: 0,
          top: 900,
          width: 400,
          height: 400,
        };

        const result = computeCropRectangle(1920, 1080, 1.0, 0, 0, frame);

        // Frame extends to 1300px but image is only 1080px tall
        // clampedY = min(900, 1080 - 400) = min(900, 680) = 680
        expect(result.y).toBe(680);
        expect(result.height).toBe(400);
      });

      it('clamps width when crop extends beyond image', () => {
        const frame: FrameDimensions = {
          left: 1800,
          top: 0,
          width: 500,
          height: 400,
        };

        const result = computeCropRectangle(1920, 1080, 1.0, 0, 0, frame);

        // clampedX = min(1800, 1920 - 500) = min(1800, 1420) = 1420
        // clampedWidth = min(500, 1920 - 1420) = min(500, 500) = 500
        expect(result.x).toBe(1420);
        expect(result.width).toBe(500);
      });

      it('handles negative coordinates from translation', () => {
        const result = computeCropRectangle(
          1920,
          1080,
          1.0,
          -1000, // large negative translate
          -500,
          defaultFrame
        );

        // Frame (50, 100) - translate (-1000, -500) = (1050, 600)
        expect(result.x).toBe(1050);
        expect(result.y).toBe(600);
      });
    });

    describe('rounding', () => {
      it('rounds all coordinates to integers', () => {
        const result = computeCropRectangle(
          1920,
          1080,
          3.0, // scale that produces fractional results
          10,
          10,
          {
            left: 100,
            top: 100,
            width: 300,
            height: 400,
          }
        );

        expect(Number.isInteger(result.x)).toBe(true);
        expect(Number.isInteger(result.y)).toBe(true);
        expect(Number.isInteger(result.width)).toBe(true);
        expect(Number.isInteger(result.height)).toBe(true);
      });
    });
  });

  describe('cropAndProcessImage', () => {
    const defaultCropRect: CropRect = {
      x: 100,
      y: 100,
      width: 800,
      height: 1000,
    };

    const defaultUri = 'file:///path/to/image.jpg';

    describe('successful processing', () => {
      it('returns processed image result with correct structure', async () => {
        mockManipulateAsync.mockResolvedValueOnce({
          uri: 'file:///processed/image.jpg',
          width: 1280,
          height: 1600,
        });

        const result = await cropAndProcessImage(
          defaultUri,
          defaultCropRect,
          'camera',
          1920,
          1080
        );

        expect(result).toEqual({
          uri: 'file:///processed/image.jpg',
          width: 1280,
          height: 1600,
          source: 'camera',
        });
      });

      it('preserves source from input (camera)', async () => {
        mockManipulateAsync.mockResolvedValueOnce({
          uri: 'file:///processed.jpg',
          width: 800,
          height: 1000,
        });

        const result = await cropAndProcessImage(
          defaultUri,
          defaultCropRect,
          'camera',
          1920,
          1080
        );

        expect(result.source).toBe('camera');
      });

      it('preserves source from input (gallery)', async () => {
        mockManipulateAsync.mockResolvedValueOnce({
          uri: 'file:///processed.jpg',
          width: 800,
          height: 1000,
        });

        const result = await cropAndProcessImage(
          defaultUri,
          defaultCropRect,
          'gallery',
          1920,
          1080
        );

        expect(result.source).toBe('gallery');
      });

      it('calls manipulateAsync with crop and resize actions', async () => {
        mockManipulateAsync.mockResolvedValueOnce({
          uri: 'file:///processed.jpg',
          width: 1280,
          height: 1600,
        });

        await cropAndProcessImage(defaultUri, defaultCropRect, 'camera', 1920, 1080);

        expect(mockManipulateAsync).toHaveBeenCalledWith(
          defaultUri,
          expect.arrayContaining([
            expect.objectContaining({
              crop: {
                originX: 100,
                originY: 100,
                width: 800,
                height: 1000,
              },
            }),
            expect.objectContaining({
              resize: expect.any(Object),
            }),
          ]),
          {
            compress: JPEG_QUALITY,
            format: ImageManipulator.SaveFormat.JPEG,
          }
        );
      });
    });

    describe('resize calculations', () => {
      it('resizes to TARGET_MAX_DIMENSION when crop is larger', async () => {
        const largeCrop: CropRect = {
          x: 0,
          y: 0,
          width: 2000,
          height: 2500,
        };

        mockManipulateAsync.mockResolvedValueOnce({
          uri: 'file:///processed.jpg',
          width: 1280,
          height: 1600,
        });

        await cropAndProcessImage(defaultUri, largeCrop, 'camera', 3000, 3000);

        // Longest edge is 2500, scale factor = 1600/2500 = 0.64
        // resizeWidth = 2000 * 0.64 = 1280
        // resizeHeight = 2500 * 0.64 = 1600
        expect(mockManipulateAsync).toHaveBeenCalledWith(
          defaultUri,
          expect.arrayContaining([
            expect.objectContaining({
              resize: {
                width: 1280,
                height: 1600,
              },
            }),
          ]),
          expect.any(Object)
        );
      });

      it('keeps original size when crop is smaller than TARGET_MAX_DIMENSION', async () => {
        const smallCrop: CropRect = {
          x: 0,
          y: 0,
          width: 400,
          height: 500,
        };

        mockManipulateAsync.mockResolvedValueOnce({
          uri: 'file:///processed.jpg',
          width: 400,
          height: 500,
        });

        await cropAndProcessImage(defaultUri, smallCrop, 'camera', 1920, 1080);

        // Longest edge is 500, which is < 1600, so keep original size
        expect(mockManipulateAsync).toHaveBeenCalledWith(
          defaultUri,
          expect.arrayContaining([
            expect.objectContaining({
              resize: {
                width: 400,
                height: 500,
              },
            }),
          ]),
          expect.any(Object)
        );
      });
    });

    describe('pre-downscaling for large images', () => {
      it('pre-downscales images larger than MAX_INPUT_DIMENSION', async () => {
        // First call is for pre-downscale, second is for crop+resize
        mockManipulateAsync
          .mockResolvedValueOnce({
            uri: 'file:///downscaled.jpg',
            width: 4096,
            height: 3072,
          })
          .mockResolvedValueOnce({
            uri: 'file:///processed.jpg',
            width: 1280,
            height: 1600,
          });

        const cropRect: CropRect = {
          x: 1000,
          y: 1000,
          width: 2000,
          height: 2500,
        };

        await cropAndProcessImage(
          defaultUri,
          cropRect,
          'camera',
          6000, // larger than MAX_INPUT_DIMENSION
          4500
        );

        // Should be called twice: once for downscale, once for crop
        expect(mockManipulateAsync).toHaveBeenCalledTimes(2);

        // First call should be downscale
        const firstCall = mockManipulateAsync.mock.calls[0];
        expect(firstCall[0]).toBe(defaultUri);
        expect(firstCall[1]).toEqual([
          {
            resize: {
              width: Math.round(6000 * (4096 / 6000)),
              height: Math.round(4500 * (4096 / 6000)),
            },
          },
        ]);
      });

      it('skips pre-downscaling for images within MAX_INPUT_DIMENSION', async () => {
        mockManipulateAsync.mockResolvedValueOnce({
          uri: 'file:///processed.jpg',
          width: 1280,
          height: 1600,
        });

        await cropAndProcessImage(defaultUri, defaultCropRect, 'camera', 3000, 2000);

        // Should only be called once (no pre-downscale needed)
        expect(mockManipulateAsync).toHaveBeenCalledTimes(1);
      });
    });

    describe('error handling', () => {
      it('throws CropError on processing failure', async () => {
        mockManipulateAsync.mockRejectedValueOnce(new Error('Processing failed'));

        await expect(
          cropAndProcessImage(defaultUri, defaultCropRect, 'camera', 1920, 1080)
        ).rejects.toThrow(CropError);
      });

      it('preserves error classification for memory errors', async () => {
        mockManipulateAsync.mockRejectedValueOnce(new Error('Out of memory'));

        try {
          await cropAndProcessImage(defaultUri, defaultCropRect, 'camera', 1920, 1080);
          fail('Expected error to be thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(CropError);
          expect((error as CropError).code).toBe('memory');
        }
      });

      it('preserves error classification for file system errors', async () => {
        mockManipulateAsync.mockRejectedValueOnce(new Error('ENOENT: no such file'));

        try {
          await cropAndProcessImage(defaultUri, defaultCropRect, 'camera', 1920, 1080);
          fail('Expected error to be thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(CropError);
          expect((error as CropError).code).toBe('file_system');
        }
      });

      it('preserves original error as cause', async () => {
        const originalError = new Error('Original failure');
        mockManipulateAsync.mockRejectedValueOnce(originalError);

        try {
          await cropAndProcessImage(defaultUri, defaultCropRect, 'camera', 1920, 1080);
          fail('Expected error to be thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(CropError);
          expect((error as CropError).cause).toBe(originalError);
        }
      });
    });
  });
});
