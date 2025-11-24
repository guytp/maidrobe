# ADR-0002: Crop & Adjust Feature Architecture

## Status

Accepted

## Context

The Maidrobe mobile app requires a Crop & Adjust screen for wardrobe item images to support the following requirements:

1. **Image Cropping**: Users need to crop captured or gallery-selected photos to focus on their wardrobe item
2. **Fixed Aspect Ratio**: All wardrobe item images must be 4:5 portrait ratio for consistent gallery display
3. **Client-Side Processing**: Image processing must happen on-device for privacy and offline capability
4. **Large Image Handling**: Modern phone cameras produce images up to 48MP+ that can cause OOM errors on low-end devices
5. **Performance**: Gesture-based pan/zoom must feel smooth (60fps target)
6. **Portrait Lock**: The crop screen must remain in portrait orientation for consistent framing
7. **Error Resilience**: Processing failures should be graceful with clear recovery options
8. **Feature Flag Control**: The crop feature should be toggleable without code deployment

The project already uses:

- **React Native** with Expo SDK 52+ (bare workflow compatible)
- **expo-image-manipulator** for other image operations
- **PanResponder** for gesture handling in other components
- **expo-screen-orientation** for orientation control
- **Zustand** for state management with feature flag support

## Decision

We will implement the Crop & Adjust feature using the following architecture:

### 1. Image Processing: expo-image-manipulator

**Implementation Details:**

- Processing location: `mobile/src/features/wardrobe/crop/utils/imageProcessing.ts`
- Operations: Pre-downscale (if needed), crop, resize, compress
- Target output: 1600px longest edge, JPEG at 85% quality
- Pre-downscale threshold: 4096px (images larger than 4K are downscaled first)

**Processing Pipeline:**

```
Input Image (up to 48MP+)
    │
    ▼ (if > 4096px)
Pre-Downscale to 4096px max edge
    │
    ▼
Crop to 4:5 frame bounds
    │
    ▼
Resize to 1600px longest edge
    │
    ▼
Compress to JPEG @ 85%
    │
    ▼
Output (~1280x1600px, ~200-400KB)
```

### 2. Gesture Handling: React Native PanResponder

**Implementation Details:**

- Gesture handling: Built-in `PanResponder` API
- Transform tracking: `Animated.Value` for smooth animations
- Scale constraints: Min scale (fill frame) to max scale (4.0x)
- Pan constraints: Bounds calculated to prevent empty space in frame

**Gesture Features:**

- Single-finger pan for positioning
- Two-finger pinch for zoom (with center-point zoom)
- No rotation (fixed 4:5 frame)
- Smooth spring-back when releasing gestures

### 3. Pre-Downscaling Strategy for Large Images

**Implementation Details:**

- Threshold: `MAX_INPUT_DIMENSION = 4096` pixels
- Method: Check max(width, height) before processing
- Action: Pre-downscale proportionally before crop if exceeded
- Crop adjustment: Scale crop rectangle coordinates to match downscaled image

This prevents out-of-memory errors on low-end Android devices when processing images from modern high-resolution cameras (12MP+, 48MP+, 108MP+).

### 4. Screen Orientation: expo-screen-orientation

**Implementation Details:**

- Lock timing: On component mount
- Lock type: `PORTRAIT_UP` only (no PORTRAIT_DOWN)
- Unlock timing: On component unmount
- Failure handling: Non-blocking (log error, continue)

### 5. Feature Flag Integration

**Implementation Details:**

- Flag name: `capture.cropScreen`
- Environment variable: `EXPO_PUBLIC_FEATURE_CAPTURE_CROPSCREEN_ENABLED`
- Minimum version: `EXPO_PUBLIC_FEATURE_CAPTURE_CROPSCREEN_MIN_VERSION`
- Routing behavior: Redirects to item creation if flag disabled

## Consequences

### Positive

1. **Zero Additional Dependencies**: Uses only existing Expo SDK modules
2. **Proven Stability**: expo-image-manipulator is battle-tested in production
3. **Memory Safety**: Pre-downscaling prevents OOM on 48MP+ images
4. **Offline Capable**: All processing happens on-device
5. **Privacy Preserving**: Images never leave device until explicit upload
6. **Consistent Output**: All cropped images have predictable size (~200-400KB)
7. **Native Performance**: PanResponder integrates with native gesture system
8. **Feature Control**: Can disable crop flow via environment variable without deployment

### Negative

1. **No Native Crop Library**: expo-image-manipulator is JS-based (slower than native)
2. **Limited Gesture Features**: PanResponder lacks some advanced gestures (rotation)
3. **Single-Pass Processing**: Cannot preview compression before committing
4. **iOS Orientation Quirks**: expo-screen-orientation may not work on all iOS versions
5. **File System Dependency**: Temporary files require cleanup logic

### Neutral

1. **Fixed 4:5 Ratio**: No user choice of aspect ratio (intentional for consistency)
2. **JPEG Only**: No PNG output option (acceptable for photo content)
3. **Synchronous Flag Check**: Uses `checkFeatureFlagSync` for routing decisions

## Alternatives Considered

### 1. react-native-image-crop-picker

**Pros:**

- Native implementation (faster processing)
- Built-in cropping UI
- Handles permissions automatically
- Popular in React Native community

**Cons:**

- Additional native dependency (increases build complexity)
- Less control over UI appearance (harder to match app theme)
- Fixed cropping UI doesn't match Maidrobe design system
- Requires native code modifications for customization
- May conflict with Expo managed workflow

**Verdict:** Too opinionated, less customizable

### 2. react-native-gesture-handler

**Pros:**

- More performant than PanResponder for complex gestures
- Better support for simultaneous gestures
- Built-in gesture animations
- Already included in Expo SDK

**Cons:**

- More complex API for simple pan/zoom
- Requires GestureHandlerRootView wrapper
- Overkill for single-view gesture handling
- PanResponder is sufficient for this use case

**Verdict:** Not necessary for current requirements (but good option if gestures become more complex)

### 3. Server-Side Image Processing

**Pros:**

- Offloads computation from device
- Can use powerful GPU-accelerated libraries
- Consistent processing across all devices
- No memory concerns on device

**Cons:**

- Requires network connectivity
- Adds latency (upload, process, download)
- Server costs for image processing
- Privacy concerns (images leave device)
- More complex error handling

**Verdict:** Violates offline-first and privacy requirements

### 4. react-native-image-editor

**Pros:**

- Native implementation
- Part of React Native core (deprecated but available)
- Simple crop API

**Cons:**

- Deprecated, minimal maintenance
- No resize or compress support
- Would need additional library for full pipeline
- Not recommended for new projects

**Verdict:** Deprecated, incomplete functionality

### 5. No Pre-Downscaling (Just-In-Time Processing)

**Pros:**

- Simpler code path
- Maximum image quality preserved until final output
- Fewer processing steps

**Cons:**

- OOM crashes on low-end devices with 48MP+ images
- Unpredictable memory usage
- Poor user experience on crash

**Verdict:** Unacceptable crash risk on modern high-resolution cameras

## Implementation

The implementation can be found in:

- **CropScreen Component**: `mobile/src/features/wardrobe/crop/components/CropScreen.tsx`
- **Image Processing**: `mobile/src/features/wardrobe/crop/utils/imageProcessing.ts`
- **Error Handling**: `mobile/src/features/wardrobe/crop/utils/errors.ts`
- **Route Definition**: `mobile/app/crop/index.tsx`
- **Unit Tests**: `mobile/__tests__/wardrobe/crop/` (86+ tests)

Key implementation features:

- Memoized frame dimension calculations for performance
- useRef for gesture state to avoid re-renders
- BackHandler integration for Android hardware back button
- Comprehensive accessibility labels and hints
- Error boundaries with retry functionality
- Telemetry integration for processing events

## References

- **expo-image-manipulator Documentation**: https://docs.expo.dev/versions/latest/sdk/imagemanipulator/
- **PanResponder Documentation**: https://reactnative.dev/docs/panresponder
- **expo-screen-orientation Documentation**: https://docs.expo.dev/versions/latest/sdk/screen-orientation/
- **Feature Flags ADR**: See project feature flag documentation
- **Implementation PR**: Story #205 - Implement Crop and Adjust UI for Wardrobe Item Images

## Notes

This decision is specific to the Crop & Adjust feature. Other image processing in the application may use different approaches based on their specific requirements. If future requirements include:

- **Video cropping**: Consider react-native-ffmpeg or similar
- **AR try-on features**: May require native camera integration
- **Cloud-based AI enhancement**: Would need server-side processing

The pre-downscaling threshold (4096px) was chosen based on:

- Testing on low-end Android devices (2GB RAM)
- Typical camera resolutions (12MP = 4000x3000, 48MP = 8000x6000)
- Memory budget for JPEG decoding (~4 bytes per pixel)

## Date

2024-11-24

## Authors

- Development Team
