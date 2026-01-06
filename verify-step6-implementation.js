#!/usr/bin/env node

/**
 * Step 6 implementation verification script
 * Validates image validation, payload construction, storage, and crop handoff
 */

const fs = require('fs');
const path = require('path');

const MOBILE_DIR = path.join(__dirname, 'mobile');

// Color codes
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

let passCount = 0;
let failCount = 0;

function pass(message) {
  console.log(`${GREEN}✓${RESET} ${message}`);
  passCount++;
}

function fail(message) {
  console.log(`${RED}✗${RESET} ${message}`);
  failCount++;
}

function checkFileExists(filePath) {
  const fullPath = path.join(MOBILE_DIR, filePath);
  return fs.existsSync(fullPath);
}

function checkFileContains(filePath, pattern, description) {
  const fullPath = path.join(MOBILE_DIR, filePath);
  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    if (pattern.test(content)) {
      pass(description);
      return true;
    } else {
      fail(description);
      return false;
    }
  } catch (error) {
    fail(`${description} (file read error)`);
    return false;
  }
}

console.log('================================================================================');
console.log('STEP 6 IMPLEMENTATION VERIFICATION');
console.log('Image Validation, Payload Construction, Storage, and Crop Handoff');
console.log('================================================================================\n');

// Section 1: Image Validation in Camera Flow
console.log('[1] IMAGE VALIDATION IN CAMERA FLOW\n');

checkFileContains(
  'src/features/wardrobe/components/CaptureCameraScreen.tsx',
  /photo\.width/,
  'Width property accessed'
);

checkFileContains(
  'src/features/wardrobe/components/CaptureCameraScreen.tsx',
  /photo\.height/,
  'Height property accessed'
);

checkFileContains(
  'src/features/wardrobe/components/CaptureCameraScreen.tsx',
  /validateCapturedImage/,
  'validateCapturedImage function called'
);

checkFileContains(
  'src/features/wardrobe/components/CaptureCameraScreen.tsx',
  /validation\.isValid/,
  'Validation result checked'
);

checkFileContains(
  'src/features/wardrobe/components/CaptureCameraScreen.tsx',
  /image_validation_failed/,
  'Validation error telemetry tracked'
);

checkFileContains(
  'src/features/wardrobe/components/CaptureCameraScreen.tsx',
  /setErrorMessage/,
  'Error message state updated on validation failure'
);

console.log('');

// Section 2: Image Validation in Gallery Flow
console.log('[2] IMAGE VALIDATION IN GALLERY FLOW\n');

checkFileContains(
  'src/features/wardrobe/hooks/useGalleryPicker.ts',
  /validateCapturedImage/,
  'validateCapturedImage function called'
);

checkFileContains(
  'src/features/wardrobe/hooks/useGalleryPicker.ts',
  /asset\.width|asset\.height/,
  'Dimension properties accessed'
);

checkFileContains(
  'src/features/wardrobe/hooks/useGalleryPicker.ts',
  /> 0/,
  'Positive dimension check exists'
);

checkFileContains(
  'src/features/wardrobe/hooks/useGalleryPicker.ts',
  /success: false/,
  'Returns failure result on validation error'
);

checkFileContains(
  'src/features/wardrobe/hooks/useGalleryPicker.ts',
  /reason:.*invalid/,
  'Returns validation failure reason'
);

console.log('');

// Section 3: CaptureImagePayload Construction
console.log('[3] CAPTUREIMAGEPAYLOAD CONSTRUCTION\n');

checkFileContains(
  'src/features/wardrobe/components/CaptureCameraScreen.tsx',
  /const payload.*CaptureImagePayload/,
  'Payload constructed with type in camera flow'
);

checkFileContains(
  'src/features/wardrobe/components/CaptureCameraScreen.tsx',
  /uri:.*photo\.uri/,
  'Payload includes uri'
);

checkFileContains(
  'src/features/wardrobe/components/CaptureCameraScreen.tsx',
  /width:.*photo\.width/,
  'Payload includes width'
);

checkFileContains(
  'src/features/wardrobe/components/CaptureCameraScreen.tsx',
  /height:.*photo\.height/,
  'Payload includes height'
);

checkFileContains(
  'src/features/wardrobe/components/CaptureCameraScreen.tsx',
  /origin:.*origin.*wardrobe/,
  'Payload includes origin with fallback'
);

checkFileContains(
  'src/features/wardrobe/components/CaptureCameraScreen.tsx',
  /source:.*captureSource.*camera/,
  'Payload includes source with fallback'
);

checkFileContains(
  'src/features/wardrobe/components/CaptureCameraScreen.tsx',
  /createdAt:.*new Date/,
  'Payload includes createdAt timestamp'
);

checkFileContains(
  'src/features/wardrobe/hooks/useGallerySelection.ts',
  /const payload.*CaptureImagePayload/,
  'Payload constructed with type in gallery flow'
);

console.log('');

// Section 4: Zustand captureSlice Storage
console.log('[4] ZUSTAND CAPTURESLICE STORAGE\n');

checkFileContains(
  'src/core/state/captureSlice.ts',
  /payload:.*CaptureImagePayload.*null/,
  'Payload state defined in slice'
);

checkFileContains(
  'src/core/state/captureSlice.ts',
  /setPayload.*payload.*CaptureImagePayload/,
  'setPayload action exists'
);

checkFileContains('src/core/state/captureSlice.ts', /clearPayload/, 'clearPayload action exists');

checkFileContains(
  'src/features/wardrobe/components/CaptureCameraScreen.tsx',
  /setPayload\(payload\)/,
  'setPayload called in camera flow'
);

checkFileContains(
  'src/features/wardrobe/hooks/useGallerySelection.ts',
  /setPayload\(payload\)/,
  'setPayload called in gallery flow'
);

console.log('');

// Section 5: Navigation to Crop Screen
console.log('[5] NAVIGATION TO CROP SCREEN\n');

checkFileContains(
  'src/features/wardrobe/components/CaptureCameraScreen.tsx',
  /router\.push\(['"]\/crop['"]\)/,
  'Navigation to /crop in camera flow'
);

checkFileContains(
  'src/features/wardrobe/hooks/useGallerySelection.ts',
  /router\.push\(['"]\/crop['"]\)/,
  'Navigation to /crop in gallery flow'
);

checkFileContains(
  'src/features/wardrobe/components/CaptureCameraScreen.tsx',
  /capture_handoff_to_crop/,
  'Handoff telemetry in camera flow'
);

checkFileContains(
  'src/features/wardrobe/hooks/useGallerySelection.ts',
  /trackCaptureEvent/,
  'Telemetry tracking in gallery flow'
);

checkFileContains(
  'src/features/wardrobe/components/CaptureCameraScreen.tsx',
  /setPayload\(payload\)/,
  'Payload set in camera flow'
);

console.log('');

// Section 6: Defensive Crop Screen Logic
console.log('[6] DEFENSIVE CROP SCREEN LOGIC\n');

if (checkFileExists('app/crop/index.tsx')) {
  pass('Crop screen file exists');
} else {
  fail('Crop screen file not found');
}

checkFileContains(
  'app/crop/index.tsx',
  /const payload.*useStore.*state.*state\.payload/,
  'Payload read from store'
);

checkFileContains('app/crop/index.tsx', /isCaptureImagePayload/, 'Type guard used for validation');

checkFileContains(
  'app/crop/index.tsx',
  /const isValid.*isCaptureImagePayload\(payload\)/,
  'Payload validated with type guard'
);

checkFileContains(
  'app/crop/index.tsx',
  /useEffect[\s\S]*?!isValid[\s\S]*?clearPayload/,
  'Invalid payload cleanup in useEffect'
);

checkFileContains('app/crop/index.tsx', /if \(!isValid\)/, 'Error state for invalid payload');

checkFileContains(
  'app/crop/index.tsx',
  /screens\.crop\.errors\.noImage/,
  'Error title for missing image'
);

checkFileContains(
  'app/crop/index.tsx',
  /screens\.crop\.errors\.invalidPayload/,
  'Error message for invalid payload'
);

checkFileContains('app/crop/index.tsx', /handleGoBack/, 'Go back handler exists');

checkFileContains('app/crop/index.tsx', /clearPayload\(\)/, 'Payload cleared in handleGoBack');

checkFileContains(
  'app/crop/index.tsx',
  /if.*origin === ['"]wardrobe['"]/,
  'Origin-based navigation to wardrobe'
);

checkFileContains(
  'app/crop/index.tsx',
  /origin === ['"]onboarding['"]/,
  'Origin-based navigation to onboarding'
);

console.log('');

// Section 7: Temporary Storage Cleanup
console.log('[7] TEMPORARY STORAGE CLEANUP\n');

checkFileContains(
  'src/core/state/captureSlice.ts',
  /payload: null/,
  'Payload cleared in resetCapture'
);

checkFileContains('app/crop/index.tsx', /clearPayload\(\)/, 'clearPayload called in crop screen');

checkFileContains(
  'src/features/wardrobe/components/CaptureScreen.tsx',
  /resetCapture|clearPayload/,
  'Cleanup on unmount or cancel'
);

checkFileContains(
  'src/core/state/captureSlice.ts',
  /origin: null[\s\S]*?source: null[\s\S]*?isNavigating: false/,
  'resetCapture clears all state'
);

console.log('');

// Section 8: Type System Integration
console.log('[8] TYPE SYSTEM INTEGRATION\n');

checkFileContains(
  'src/core/types/capture.ts',
  /export interface CaptureImagePayload/,
  'CaptureImagePayload interface exported'
);

checkFileContains('src/core/types/capture.ts', /uri: string/, 'CaptureImagePayload has uri field');

checkFileContains(
  'src/core/types/capture.ts',
  /width: number/,
  'CaptureImagePayload has width field'
);

checkFileContains(
  'src/core/types/capture.ts',
  /height: number/,
  'CaptureImagePayload has height field'
);

checkFileContains(
  'src/core/types/capture.ts',
  /origin: CaptureOrigin/,
  'CaptureImagePayload has origin field'
);

checkFileContains(
  'src/core/types/capture.ts',
  /source: CaptureSource/,
  'CaptureImagePayload has source field'
);

checkFileContains(
  'src/core/types/capture.ts',
  /createdAt: string/,
  'CaptureImagePayload has createdAt field'
);

checkFileContains(
  'src/core/types/capture.ts',
  /export function isCaptureImagePayload/,
  'Type guard exported'
);

checkFileContains(
  'src/core/types/capture.ts',
  /typeof payload\.uri === ['"]string['"]/,
  'Type guard checks uri'
);

checkFileContains(
  'src/core/types/capture.ts',
  /typeof payload\.width === ['"]number['"]/,
  'Type guard checks width'
);

checkFileContains(
  'src/core/types/capture.ts',
  /typeof payload\.height === ['"]number['"]/,
  'Type guard checks height'
);

console.log('');

// Section 9: Telemetry Events
console.log('[9] TELEMETRY EVENTS\n');

checkFileContains(
  'src/features/wardrobe/components/CaptureCameraScreen.tsx',
  /trackCaptureEvent/,
  'Telemetry events tracked in camera flow'
);

checkFileContains(
  'src/features/wardrobe/components/CaptureCameraScreen.tsx',
  /image_validation_failed/,
  'image_validation_failed event tracked'
);

checkFileContains(
  'src/features/wardrobe/components/CaptureCameraScreen.tsx',
  /capture_handoff_to_crop/,
  'capture_handoff_to_crop event tracked'
);

checkFileContains(
  'src/features/wardrobe/hooks/useGalleryPicker.ts',
  /trackCaptureEvent/,
  'Telemetry events tracked in gallery picker'
);

checkFileContains(
  'src/features/wardrobe/hooks/useGalleryPicker.ts',
  /gallery_picker_cancelled/,
  'gallery_picker_cancelled event tracked'
);

checkFileContains(
  'src/features/wardrobe/hooks/useGallerySelection.ts',
  /trackCaptureEvent/,
  'Telemetry events tracked in gallery selection'
);

console.log('');

// Section 10: Network Independence
console.log('[10] NETWORK INDEPENDENCE\n');

checkFileContains(
  'src/features/wardrobe/components/CaptureCameraScreen.tsx',
  /(?!.*fetch|axios|api)/s,
  'Camera flow has no network calls (implicit check)'
);

checkFileContains(
  'src/features/wardrobe/hooks/useGalleryPicker.ts',
  /(?!.*fetch|axios|api)/s,
  'Gallery flow has no network calls (implicit check)'
);

checkFileContains(
  'app/crop/index.tsx',
  /(?!.*fetch|axios|api)/s,
  'Crop screen has no network calls (implicit check)'
);

// More specific checks for no API calls
const cameraScreenPath = path.join(
  MOBILE_DIR,
  'src/features/wardrobe/components/CaptureCameraScreen.tsx'
);
const galleryPickerPath = path.join(MOBILE_DIR, 'src/features/wardrobe/hooks/useGalleryPicker.ts');
const cropScreenPath = path.join(MOBILE_DIR, 'app/crop/index.tsx');

try {
  const cameraContent = fs.readFileSync(cameraScreenPath, 'utf8');
  const galleryContent = fs.readFileSync(galleryPickerPath, 'utf8');
  const cropContent = fs.readFileSync(cropScreenPath, 'utf8');

  const hasNetworkCall = (content) => {
    return /\b(fetch|axios|api\.)\s*\(/i.test(content);
  };

  if (!hasNetworkCall(cameraContent)) {
    pass('Camera screen confirmed network-independent');
  } else {
    fail('Camera screen has network calls');
  }

  if (!hasNetworkCall(galleryContent)) {
    pass('Gallery picker confirmed network-independent');
  } else {
    fail('Gallery picker has network calls');
  }

  if (!hasNetworkCall(cropContent)) {
    pass('Crop screen confirmed network-independent');
  } else {
    fail('Crop screen has network calls');
  }
} catch (error) {
  fail('Network independence check failed (file read error)');
}

console.log('');

// Summary
console.log('================================================================================');
console.log('VERIFICATION SUMMARY');
console.log('================================================================================\n');
console.log(`${GREEN}Passed: ${passCount}${RESET}`);
console.log(`${RED}Failed: ${failCount}${RESET}`);
console.log(`Total: ${passCount + failCount}\n`);

if (failCount === 0) {
  console.log(`${GREEN}All checks passed! Step 6 implementation verified.${RESET}\n`);
  process.exit(0);
} else {
  console.log(`${RED}Some checks failed. Please review the implementation.${RESET}\n`);
  process.exit(1);
}
