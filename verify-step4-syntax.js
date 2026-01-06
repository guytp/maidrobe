#!/usr/bin/env node

/**
 * Manual syntax and structure verification for Step 4 implementation
 * Checks all key files for proper structure without requiring node_modules
 */

const fs = require('fs');
const path = require('path');

const MOBILE_DIR = path.join(__dirname, 'mobile');

// Color codes for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
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

function checkFileExists(filePath, description) {
  const fullPath = path.join(MOBILE_DIR, filePath);
  if (fs.existsSync(fullPath)) {
    pass(`${description}: ${filePath}`);
    return true;
  } else {
    fail(`${description}: ${filePath} NOT FOUND`);
    return false;
  }
}

function checkFileContains(filePath, pattern, description) {
  const fullPath = path.join(MOBILE_DIR, filePath);
  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    if (pattern.test(content)) {
      pass(description);
      return true;
    } else {
      fail(`${description} - Pattern not found: ${pattern}`);
      return false;
    }
  } catch (error) {
    fail(`${description} - Error reading file: ${error.message}`);
    return false;
  }
}

console.log('================================================================================');
console.log('STEP 4 SYNTAX AND STRUCTURE VERIFICATION');
console.log('================================================================================\n');

// Section 1: File Existence
console.log('[1] CHECKING FILE EXISTENCE\n');
checkFileExists('src/features/wardrobe/components/WardrobeScreen.tsx', 'Wardrobe Screen');
checkFileExists(
  'src/features/onboarding/components/FirstItemScreen.tsx',
  'Onboarding First Item Screen'
);
checkFileExists('src/features/wardrobe/components/CaptureScreen.tsx', 'Capture Screen');
checkFileExists(
  'src/features/wardrobe/components/CaptureCameraScreen.tsx',
  'Capture Camera Screen'
);
checkFileExists('app/capture/index.tsx', 'Capture Route');
checkFileExists('app/capture/camera/index.tsx', 'Camera Route');
checkFileExists('src/core/state/captureSlice.ts', 'Capture Slice');
checkFileExists('src/core/types/capture.ts', 'Capture Types');
checkFileExists('src/features/wardrobe/constants.ts', 'Wardrobe Constants');
console.log('');

// Section 2: Wardrobe Entry Point
console.log('[2] WARDROBE ENTRY POINT NAVIGATION\n');
checkFileContains(
  'src/features/wardrobe/components/WardrobeScreen.tsx',
  /const handleAddItem = \(\) => \{/,
  'handleAddItem function exists'
);
checkFileContains(
  'src/features/wardrobe/components/WardrobeScreen.tsx',
  /if \(isNavigating\) \{[\s\S]*?return;[\s\S]*?\}/,
  'Navigation guard checks isNavigating'
);
checkFileContains(
  'src/features/wardrobe/components/WardrobeScreen.tsx',
  /setIsNavigating\(true\)/,
  'Sets isNavigating flag'
);
checkFileContains(
  'src/features/wardrobe/components/WardrobeScreen.tsx',
  /router\.push\('\/capture\?origin=wardrobe'\)/,
  'Navigates to /capture?origin=wardrobe'
);
checkFileContains(
  'src/features/wardrobe/components/WardrobeScreen.tsx',
  /trackCaptureEvent\('capture_flow_opened'/,
  'Tracks telemetry event'
);
checkFileContains(
  'src/features/wardrobe/components/WardrobeScreen.tsx',
  /setTimeout[\s\S]*?setIsNavigating\(false\)[\s\S]*?NAVIGATION_DEBOUNCE_MS/,
  'Resets flag after timeout'
);
console.log('');

// Section 3: Onboarding Entry Point
console.log('[3] ONBOARDING ENTRY POINT NAVIGATION\n');
checkFileContains(
  'src/features/onboarding/components/FirstItemScreen.tsx',
  /const handleStartCamera = useCallback\(async \(\) => \{/,
  'handleStartCamera function exists'
);
checkFileContains(
  'src/features/onboarding/components/FirstItemScreen.tsx',
  /if \(isNavigating\) \{[\s\S]*?return;[\s\S]*?\}/,
  'Navigation guard checks isNavigating'
);
checkFileContains(
  'src/features/onboarding/components/FirstItemScreen.tsx',
  /setIsNavigating\(true\)/,
  'Sets isNavigating flag'
);
checkFileContains(
  'src/features/onboarding/components/FirstItemScreen.tsx',
  /router\.push\('\/capture\?origin=onboarding'\)/,
  'Navigates to /capture?origin=onboarding'
);
checkFileContains(
  'src/features/onboarding/components/FirstItemScreen.tsx',
  /trackFirstItemStartedCapture\(\)/,
  'Tracks telemetry event'
);
checkFileContains(
  'src/features/onboarding/components/FirstItemScreen.tsx',
  /setCustomPrimaryHandler\(handleStartCamera\)/,
  'Registers custom primary handler'
);
checkFileContains(
  'src/features/onboarding/components/FirstItemScreen.tsx',
  /catch.*\{[\s\S]*?setIsNavigating\(false\)/,
  'Error recovery resets flag'
);
console.log('');

// Section 4: Capture Route Shell
console.log('[4] CAPTURE ROUTE SHELL\n');
checkFileContains(
  'src/features/wardrobe/components/CaptureScreen.tsx',
  /const origin: CaptureOrigin \| null = isCaptureOrigin\(params\.origin\)/,
  'Validates origin with type guard'
);
checkFileContains(
  'src/features/wardrobe/components/CaptureScreen.tsx',
  /setOrigin\(origin\)/,
  'Initializes slice with setOrigin'
);
checkFileContains(
  'src/features/wardrobe/components/CaptureScreen.tsx',
  /resetCapture\(\)/,
  'Cleanup calls resetCapture'
);
checkFileContains(
  'src/features/wardrobe/components/CaptureScreen.tsx',
  /Alert\.alert[\s\S]*?invalid/i,
  'Handles invalid origin with alert'
);
console.log('');

// Section 5: Back/Cancel Behavior
console.log('[5] BACK/CANCEL BEHAVIOR\n');
checkFileContains(
  'src/features/wardrobe/components/CaptureScreen.tsx',
  /const handleCancel = \(\) => \{/,
  'CaptureScreen has handleCancel'
);
checkFileContains(
  'src/features/wardrobe/components/CaptureScreen.tsx',
  /if \(origin === 'wardrobe'\) \{[\s\S]*?router\.push\('\/wardrobe'\)/,
  'Wardrobe origin returns to /wardrobe'
);
checkFileContains(
  'src/features/wardrobe/components/CaptureScreen.tsx',
  /if \(origin === 'onboarding'\) \{[\s\S]*?router\.push\('\/onboarding\/first-item'\)/,
  'Onboarding origin returns to /onboarding/first-item'
);
checkFileContains(
  'src/features/wardrobe/components/CaptureCameraScreen.tsx',
  /const handleCancel = \(\) => \{/,
  'CaptureCameraScreen has handleCancel'
);
console.log('');

// Section 6: Type Definitions
console.log('[6] TYPE DEFINITIONS\n');
checkFileContains(
  'src/core/types/capture.ts',
  /export type CaptureOrigin = 'wardrobe' \| 'onboarding'/,
  'CaptureOrigin type defined'
);
checkFileContains(
  'src/core/types/capture.ts',
  /export function isCaptureOrigin\(value: unknown\): value is CaptureOrigin/,
  'isCaptureOrigin type guard defined'
);
console.log('');

// Section 7: State Management
console.log('[7] STATE MANAGEMENT\n');
checkFileContains(
  'src/core/state/captureSlice.ts',
  /origin: CaptureOrigin \| null/,
  'captureSlice has origin field'
);
checkFileContains(
  'src/core/state/captureSlice.ts',
  /isNavigating: boolean/,
  'captureSlice has isNavigating field'
);
checkFileContains(
  'src/core/state/captureSlice.ts',
  /setOrigin: \(origin: CaptureOrigin\) => void/,
  'captureSlice has setOrigin action'
);
checkFileContains(
  'src/core/state/captureSlice.ts',
  /setIsNavigating: \(isNavigating: boolean\) => void/,
  'captureSlice has setIsNavigating action'
);
checkFileContains(
  'src/core/state/captureSlice.ts',
  /resetCapture: \(\) => void/,
  'captureSlice has resetCapture action'
);
console.log('');

// Section 8: Constants
console.log('[8] CONSTANTS\n');
checkFileContains(
  'src/features/wardrobe/constants.ts',
  /export const NAVIGATION_DEBOUNCE_MS = 500/,
  'NAVIGATION_DEBOUNCE_MS defined'
);
console.log('');

// Section 9: Route Files
console.log('[9] ROUTE STRUCTURE\n');
checkFileContains(
  'app/capture/index.tsx',
  /export default function CaptureRoute/,
  'Capture route exports default function'
);
checkFileContains(
  'app/capture/index.tsx',
  /return <CaptureScreen \/>/,
  'Capture route renders CaptureScreen'
);
checkFileContains(
  'app/capture/camera/index.tsx',
  /export default function CaptureCameraRoute/,
  'Camera route exports default function'
);
checkFileContains(
  'app/capture/camera/index.tsx',
  /return <CaptureCameraScreen \/>/,
  'Camera route renders CaptureCameraScreen'
);
console.log('');

// Summary
console.log('================================================================================');
console.log('VERIFICATION SUMMARY');
console.log('================================================================================\n');
console.log(`${GREEN}Passed: ${passCount}${RESET}`);
console.log(`${RED}Failed: ${failCount}${RESET}`);
console.log(`Total: ${passCount + failCount}\n`);

if (failCount === 0) {
  console.log(`${GREEN}All checks passed! Step 4 implementation verified.${RESET}\n`);
  process.exit(0);
} else {
  console.log(`${RED}Some checks failed. Please review the implementation.${RESET}\n`);
  process.exit(1);
}
