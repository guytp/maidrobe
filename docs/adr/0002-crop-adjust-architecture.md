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

## Dependency Impact

The Crop & Adjust feature relies on three Expo SDK modules. These were already present in the project's `package.json` before this feature (used by other parts of the app), so they do not represent new dependencies. However, this section documents their impact and justification for future reference.

### Dependencies Used

| Module                  | Version  | Purpose in Crop & Adjust                       |
| ----------------------- | -------- | ---------------------------------------------- |
| expo-file-system        | ^19.0.19 | Temporary file cleanup after processing        |
| expo-image-manipulator  | ^14.0.7  | Core image processing (crop, resize, compress) |
| expo-screen-orientation | ^9.0.7   | Portrait lock during cropping                  |

### Bundle Size Impact

**Qualitative Assessment: Low to Moderate**

These modules contribute to the app binary in two ways:

1. **Native Code (compiled into iOS/Android binaries)**
   - expo-file-system: ~200KB per platform (iOS/Android)
   - expo-image-manipulator: ~75KB per platform
   - expo-screen-orientation: ~65KB per platform
   - Total native overhead: ~340KB per platform

2. **JavaScript Bundle (loaded at runtime)**
   - Combined JS footprint: ~460KB uncompressed
   - After minification and tree-shaking: ~100-150KB estimated
   - Gzipped for OTA updates: ~30-50KB estimated

**Context:** A typical Expo app binary is 20-40MB. These three modules add less than 1% to the overall binary size. The JavaScript bundle impact is similarly minimal relative to a typical React Native app bundle (2-5MB).

### Justification

Each module is critical for the Crop & Adjust experience:

**expo-image-manipulator (Critical)**

- Provides the only Expo-compatible way to crop, resize, and compress images on-device
- Required for the 4:5 aspect ratio enforcement
- Required for the pre-downscaling strategy that prevents OOM crashes
- Required for JPEG compression to keep output files reasonable (~200-400KB)
- No viable alternative exists within the Expo ecosystem

**expo-file-system (Critical)**

- Required for cleanup of temporary image files after processing
- Prevents storage bloat from accumulating cropped images
- Used via `FileSystem.deleteAsync()` for non-blocking cleanup
- Already a transitive dependency of expo-image-manipulator

**expo-screen-orientation (Important but not Critical)**

- Locks screen to portrait during cropping for consistent UX
- Prevents disorienting layout changes if user rotates device mid-crop
- Graceful degradation: if orientation lock fails, the feature still works
- Smallest of the three modules (~65KB native code)

### Mitigation Strategies

If bundle size becomes problematic in the future, consider these strategies:

1. **Lazy Loading (JavaScript)**
   - The crop screen is not on the critical path (not needed at app launch)
   - Could use React.lazy() to defer loading crop-related JS until needed
   - Estimated savings: ~30-50KB from initial bundle

2. **Feature Flag Removal**
   - If crop feature is permanently disabled, the JS imports can be removed
   - Native modules would still be included (Expo limitation) but JS tree-shaking would help

3. **Move to EAS Build with Custom Dev Client**
   - Expo's prebuild system allows excluding unused native modules
   - If expo-screen-orientation is deemed unnecessary, it could be removed from native builds
   - Requires switching from Expo Go to custom dev client

4. **Server-Side Processing (Architecture Change)**
   - Would eliminate need for expo-image-manipulator on client
   - Trade-off: adds latency, server costs, and removes offline capability
   - Not recommended unless bundle size is truly critical

5. **Native Module Replacement**
   - Replace expo-image-manipulator with react-native-image-editor (smaller but deprecated)
   - Not recommended due to maintenance concerns

### Monitoring Recommendations

To track bundle size over time:

- Run `npx expo-doctor` periodically to check for bloat
- Use `npx react-native-bundle-visualizer` after builds
- Set up CI alerts if bundle exceeds threshold (e.g., 5MB JS bundle)
- Monitor OTA update sizes in EAS dashboard

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
