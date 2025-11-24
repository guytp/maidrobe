# Crop & Adjust Navigation Contract

This document defines the navigation contract for the Crop & Adjust screen
in the wardrobe item capture flow.

## Route Information

- **Route Path:** `/crop`
- **Route File:** `app/crop/index.tsx`
- **Component:** `CropScreen` from `src/features/wardrobe/crop/components/CropScreen.tsx`

## Data Passing Method

The Crop & Adjust screen receives its data via **Zustand store** (not route params).
This approach was chosen because:
1. Image payloads contain complex data (URIs, dimensions) that don't serialize well to URL params
2. Zustand provides type-safe access with validation via type guards
3. The ephemeral nature of capture state aligns with in-memory storage

## Required Parameters (via CaptureImagePayload)

The crop screen expects a `CaptureImagePayload` object in the Zustand store:

```typescript
interface CaptureImagePayload {
  uri: string;           // Local file URI (file:/// scheme)
  width: number;         // Image width in pixels (must be > 0)
  height: number;        // Image height in pixels (must be > 0)
  origin: CaptureOrigin; // 'wardrobe' | 'onboarding' - determines back navigation
  source: CaptureSource; // 'camera' | 'gallery' - for telemetry and UX
  createdAt: string;     // ISO 8601 timestamp of capture/selection
}
```

## Optional Parameters

Currently, no optional parameters are supported. Future iterations may add:
- `debugMode: boolean` - Enable debug overlays and logging
- `skipValidation: boolean` - Bypass dimension validation (dev only)

## Feature Flag Control

The crop flow is controlled by the `capture.cropScreen` feature flag:
- When **enabled**: Camera/gallery navigates to `/crop`
- When **disabled**: Camera/gallery skips crop and goes directly to item creation

Check the flag synchronously:
```typescript
const cropScreenFlag = checkFeatureFlagSync('capture.cropScreen');
const cropEnabled = cropScreenFlag.enabled && !cropScreenFlag.requiresUpdate;
```

## Navigation Flow

### Entry Points

1. **From Camera (CaptureCameraScreen)**
   - After successful capture and validation
   - Stores payload: `setPayload(payload)`
   - Navigates: `router.push('/crop')`

2. **From Gallery (useGallerySelection hook)**
   - After successful selection and validation
   - Stores payload: `setPayload(payload)`
   - Navigates: `router.push('/crop')`

### Exit Points

1. **Confirm/Next** (successful crop)
   - Processes image (crop, resize, compress)
   - Updates payload with processed image
   - Navigates to item creation based on origin:
     - `onboarding` -> `/onboarding/first-item`
     - `wardrobe` -> `/onboarding/first-item` (TODO: wardrobe-specific route from #211)

2. **Back/Retake**
   - Clears payload: `clearPayload()`
   - Navigates based on origin:
     - `wardrobe` -> `/wardrobe`
     - `onboarding` -> `/onboarding/first-item`
     - fallback -> `/home`

3. **Android Back Button**
   - Behaves same as Back/Retake
   - Blocked during image processing

## Validation

The crop screen validates the payload on mount using `isCaptureImagePayload()`:
- Checks all required fields are present
- Validates dimensions are positive numbers
- Validates origin and source are valid enum values

If validation fails, an error screen is shown with a "Go Back" button.

## Telemetry Events

The crop screen emits these events through `trackCaptureEvent()`:
- `crop_screen_opened` - On successful mount with valid payload
- `crop_processing_started` - When Confirm is tapped
- `crop_processing_completed` - On successful processing
- `crop_processing_failed` - On processing error (with error code)
- `crop_cancelled` - On Back/Retake

## State Cleanup

- Payload is cleared on Back/Retake via `clearPayload()`
- Processed image replaces original in payload on Confirm
- Original temp file is deleted after successful processing
- Screen orientation lock is released on unmount

## Related Stories

- #199 - Wardrobe Item Capture (provides image to crop)
- #205 - Crop & Adjust UI (this screen)
- #211 - Item Creation (receives processed image)
- #229 - Background Cleanup (uses cropped image as input)
- #193 - Item Data Model (defines original_key schema)

## Architecture Decision Record

See `docs/adr/0002-crop-adjust-architecture.md` for architectural decisions
including library choices, memory management strategy, and processing pipeline.
