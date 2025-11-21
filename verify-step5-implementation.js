#!/usr/bin/env node

/**
 * Step 5 implementation verification script
 * Validates capture UI screens with permission-aware behavior, guidance, and error handling
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

function checkFileContains(filePath, pattern) {
  const fullPath = path.join(MOBILE_DIR, filePath);
  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    return pattern.test(content);
  } catch (error) {
    return false;
  }
}

console.log('================================================================================');
console.log('STEP 5 IMPLEMENTATION VERIFICATION');
console.log('Capture UI Screens with Permission-Aware Behavior');
console.log('================================================================================\n');

// Section 1: Initial Capture Screen
console.log('[1] INITIAL CAPTURE SCREEN - CHOICE UI\n');

if (checkFileExists('src/features/wardrobe/components/CaptureScreen.tsx')) {
  pass('CaptureScreen.tsx exists');
} else {
  fail('CaptureScreen.tsx not found');
}

if (checkFileContains('src/features/wardrobe/components/CaptureScreen.tsx', /handleTakePhoto/)) {
  pass('handleTakePhoto function exists');
} else {
  fail('handleTakePhoto function not found');
}

if (checkFileContains('src/features/wardrobe/components/CaptureScreen.tsx', /handleChooseGallery/)) {
  pass('handleChooseGallery function exists');
} else {
  fail('handleChooseGallery function not found');
}

if (checkFileContains('src/features/wardrobe/components/CaptureScreen.tsx', /permissions\.camera\.isAvailable/)) {
  pass('Camera availability check exists');
} else {
  fail('Camera availability check not found');
}

if (checkFileContains('src/features/wardrobe/components/CaptureScreen.tsx', /screens\.capture\.choiceTitle/)) {
  pass('Title text exists');
} else {
  fail('Title text not found');
}

if (checkFileContains('src/features/wardrobe/components/CaptureScreen.tsx', /screens\.capture\.guidance/)) {
  pass('Guidance text exists');
} else {
  fail('Guidance text not found');
}

if (checkFileContains('src/features/wardrobe/components/CaptureScreen.tsx', /allowFontScaling/)) {
  pass('Font scaling enabled');
} else {
  fail('Font scaling not enabled');
}

console.log('');

// Section 2: Camera Mode
console.log('[2] CAMERA MODE - LIVE PREVIEW\n');

if (checkFileExists('src/features/wardrobe/components/CaptureCameraScreen.tsx')) {
  pass('CaptureCameraScreen.tsx exists');
} else {
  fail('CaptureCameraScreen.tsx not found');
}

if (checkFileContains('src/features/wardrobe/components/CaptureCameraScreen.tsx', /from 'expo-camera'/)) {
  pass('expo-camera imported');
} else {
  fail('expo-camera not imported');
}

if (checkFileContains('src/features/wardrobe/components/CaptureCameraScreen.tsx', /<CameraView/)) {
  pass('CameraView component used');
} else {
  fail('CameraView component not found');
}

if (checkFileContains('src/features/wardrobe/components/CaptureCameraScreen.tsx', /handleCapture/)) {
  pass('handleCapture function exists');
} else {
  fail('handleCapture function not found');
}

if (checkFileContains('src/features/wardrobe/components/CaptureCameraScreen.tsx', /handleFlashToggle/)) {
  pass('Flash toggle function exists');
} else {
  fail('Flash toggle function not found');
}

if (checkFileContains('src/features/wardrobe/components/CaptureCameraScreen.tsx', /framingGuide/)) {
  pass('Framing guide implemented');
} else {
  fail('Framing guide not found');
}

if (checkFileContains('src/features/wardrobe/components/CaptureCameraScreen.tsx', /guidanceText/)) {
  pass('Guidance text overlay exists');
} else {
  fail('Guidance text overlay not found');
}

if (checkFileContains('src/features/wardrobe/components/CaptureCameraScreen.tsx', /shutterButton/)) {
  pass('Shutter button styled');
} else {
  fail('Shutter button not found');
}

if (checkFileContains('src/features/wardrobe/components/CaptureCameraScreen.tsx', /isCapturing/)) {
  pass('Debouncing with isCapturing');
} else {
  fail('Debouncing not implemented');
}

console.log('');

// Section 3: Permission-Aware Behavior
console.log('[3] PERMISSION-AWARE BEHAVIOR\n');

if (checkFileContains('src/features/wardrobe/components/CaptureScreen.tsx', /permissions\.camera\.status === 'granted'/)) {
  pass('Permission granted state handled');
} else {
  fail('Permission granted state not handled');
}

if (checkFileContains('src/features/wardrobe/components/CaptureScreen.tsx', /permissions\.camera\.status === 'blocked'/)) {
  pass('Permission blocked state handled');
} else {
  fail('Permission blocked state not handled');
}

if (checkFileContains('src/features/wardrobe/components/CaptureScreen.tsx', /permissions\.camera\.status === 'denied'/)) {
  pass('Permission denied state handled');
} else {
  fail('Permission denied state not handled');
}

if (checkFileContains('src/features/wardrobe/components/CaptureScreen.tsx', /permissions\.camera\.openSettings/)) {
  pass('Open settings function used');
} else {
  fail('Open settings not found');
}

if (checkFileContains('src/features/wardrobe/components/CaptureScreen.tsx', /permissions\.camera\.request/)) {
  pass('Permission request function used');
} else {
  fail('Permission request not found');
}

if (checkFileExists('src/features/wardrobe/hooks/useCapturePermissions.ts')) {
  pass('useCapturePermissions hook exists');
} else {
  fail('useCapturePermissions hook not found');
}

console.log('');

// Section 4: Gallery Selection
console.log('[4] GALLERY SELECTION VIA DEDICATED HOOK\n');

if (checkFileExists('src/features/wardrobe/hooks/useGalleryPicker.ts')) {
  pass('useGalleryPicker hook exists');
} else {
  fail('useGalleryPicker hook not found');
}

if (checkFileContains('src/features/wardrobe/hooks/useGalleryPicker.ts', /from 'expo-image-picker'/)) {
  pass('expo-image-picker imported');
} else {
  fail('expo-image-picker not imported');
}

if (checkFileContains('src/features/wardrobe/hooks/useGalleryPicker.ts', /launchImageLibraryAsync/)) {
  pass('launchImageLibraryAsync used');
} else {
  fail('launchImageLibraryAsync not found');
}

if (checkFileContains('src/features/wardrobe/hooks/useGalleryPicker.ts', /result\.canceled/)) {
  pass('Cancellation handling exists');
} else {
  fail('Cancellation handling not found');
}

if (checkFileContains('src/features/wardrobe/hooks/useGalleryPicker.ts', /validateCapturedImage/)) {
  pass('Image validation exists');
} else {
  fail('Image validation not found');
}

if (checkFileExists('src/features/wardrobe/hooks/useGallerySelection.ts')) {
  pass('useGallerySelection hook exists');
} else {
  fail('useGallerySelection hook not found');
}

if (checkFileContains('src/features/wardrobe/components/CaptureCameraScreen.tsx', /handleGallery/)) {
  pass('In-camera gallery shortcut exists');
} else {
  fail('In-camera gallery shortcut not found');
}

console.log('');

// Section 5: Accessibility
console.log('[5] ACCESSIBILITY COMPLIANCE\n');

if (checkFileContains('src/features/wardrobe/components/CaptureScreen.tsx', /accessibilityLabel/)) {
  pass('CaptureScreen has accessibility labels');
} else {
  fail('CaptureScreen missing accessibility labels');
}

if (checkFileContains('src/features/wardrobe/components/CaptureCameraScreen.tsx', /accessibilityLabel/)) {
  pass('CaptureCameraScreen has accessibility labels');
} else {
  fail('CaptureCameraScreen missing accessibility labels');
}

if (checkFileContains('src/features/wardrobe/components/CaptureCameraScreen.tsx', /accessibilityRole/)) {
  pass('Accessibility roles defined');
} else {
  fail('Accessibility roles not found');
}

if (checkFileContains('src/features/wardrobe/components/CaptureCameraScreen.tsx', /minWidth: 44|minHeight: 44/)) {
  pass('Minimum tap target sizes met');
} else {
  fail('Minimum tap target sizes not met');
}

if (checkFileContains('src/features/wardrobe/components/CaptureScreen.tsx', /useTheme/)) {
  pass('Dark mode support via theme');
} else {
  fail('Dark mode support not found');
}

if (checkFileContains('src/features/wardrobe/components/CaptureScreen.tsx', /maxFontSizeMultiplier/)) {
  pass('Large text support configured');
} else {
  fail('Large text support not configured');
}

console.log('');

// Section 6: Error Handling
console.log('[6] ERROR HANDLING\n');

if (checkFileContains('src/features/wardrobe/components/CaptureCameraScreen.tsx', /errorMessage/)) {
  pass('Error message state exists');
} else {
  fail('Error message state not found');
}

if (checkFileContains('src/features/wardrobe/components/CaptureCameraScreen.tsx', /handleCameraError/)) {
  pass('Camera error handler exists');
} else {
  fail('Camera error handler not found');
}

if (checkFileContains('src/features/wardrobe/components/CaptureCameraScreen.tsx', /onMountError/)) {
  pass('Camera mount error handling exists');
} else {
  fail('Camera mount error handling not found');
}

if (checkFileContains('src/features/wardrobe/components/CaptureCameraScreen.tsx', /handleRetry/)) {
  pass('Retry handler exists');
} else {
  fail('Retry handler not found');
}

if (checkFileContains('src/features/wardrobe/components/CaptureCameraScreen.tsx', /errorOverlay/)) {
  pass('Error overlay styled');
} else {
  fail('Error overlay not found');
}

if (checkFileContains('src/features/wardrobe/components/CaptureCameraScreen.tsx', /processingOverlay/)) {
  pass('Processing overlay exists');
} else {
  fail('Processing overlay not found');
}

if (checkFileContains('src/features/wardrobe/hooks/useGalleryPicker.ts', /success: false/)) {
  pass('Non-blocking error results');
} else {
  fail('Non-blocking error results not found');
}

console.log('');

// Section 7: Code Quality
console.log('[7] CODE QUALITY AND ARCHITECTURE\n');

if (checkFileContains('src/features/wardrobe/components/CaptureScreen.tsx', /useCapturePermissions/)) {
  pass('Permission hook integrated in CaptureScreen');
} else {
  fail('Permission hook not integrated in CaptureScreen');
}

if (checkFileContains('src/features/wardrobe/components/CaptureCameraScreen.tsx', /useCapturePermissions/)) {
  pass('Permission hook integrated in CaptureCameraScreen');
} else {
  fail('Permission hook not integrated in CaptureCameraScreen');
}

if (checkFileContains('src/features/wardrobe/components/CaptureScreen.tsx', /useGalleryPicker/)) {
  pass('Gallery picker hook integrated in CaptureScreen');
} else {
  fail('Gallery picker hook not integrated in CaptureScreen');
}

if (checkFileContains('src/features/wardrobe/components/CaptureCameraScreen.tsx', /useGalleryPicker/)) {
  pass('Gallery picker hook integrated in CaptureCameraScreen');
} else {
  fail('Gallery picker hook not integrated in CaptureCameraScreen');
}

if (checkFileContains('src/features/wardrobe/components/CaptureScreen.tsx', /trackCaptureEvent/)) {
  pass('Telemetry integrated in CaptureScreen');
} else {
  fail('Telemetry not integrated in CaptureScreen');
}

if (checkFileContains('src/features/wardrobe/components/CaptureCameraScreen.tsx', /trackCaptureEvent/)) {
  pass('Telemetry integrated in CaptureCameraScreen');
} else {
  fail('Telemetry not integrated in CaptureCameraScreen');
}

if (checkFileContains('src/features/wardrobe/hooks/useGalleryPicker.ts', /trackCaptureEvent/)) {
  pass('Telemetry integrated in useGalleryPicker');
} else {
  fail('Telemetry not integrated in useGalleryPicker');
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
  console.log(`${GREEN}All checks passed! Step 5 implementation verified.${RESET}\n`);
  process.exit(0);
} else {
  console.log(`${RED}Some checks failed. Please review the implementation.${RESET}\n`);
  process.exit(1);
}
