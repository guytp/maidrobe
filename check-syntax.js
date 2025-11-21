#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const files = [
  'mobile/src/features/wardrobe/components/CaptureScreen.tsx',
  'mobile/src/features/wardrobe/components/CaptureCameraScreen.tsx',
  'mobile/src/features/wardrobe/hooks/useCapturePermissions.ts',
  'mobile/src/features/wardrobe/hooks/useGalleryPicker.ts',
  'mobile/src/features/wardrobe/hooks/useGallerySelection.ts',
  'mobile/src/core/types/capture.ts',
  'mobile/src/core/state/captureSlice.ts',
  'mobile/app/capture/index.tsx',
  'mobile/app/crop/index.tsx'
];

let errors = [];
let warnings = [];

console.log('================================================================================');
console.log('CODE STANDARDS AND SYNTAX VERIFICATION');
console.log('================================================================================\n');

files.forEach(file => {
  try {
    const content = fs.readFileSync(file, 'utf8');
    const fileName = path.basename(file);

    console.log(`Checking ${fileName}...`);

    // Check for basic syntax issues
    const openBraces = (content.match(/\{/g) || []).length;
    const closeBraces = (content.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      errors.push(`${fileName}: Mismatched braces (${openBraces} open, ${closeBraces} close)`);
    }

    const openParens = (content.match(/\(/g) || []).length;
    const closeParens = (content.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      errors.push(`${fileName}: Mismatched parentheses (${openParens} open, ${closeParens} close)`);
    }

    const openBrackets = (content.match(/\[/g) || []).length;
    const closeBrackets = (content.match(/\]/g) || []).length;
    if (openBrackets !== closeBrackets) {
      errors.push(`${fileName}: Mismatched brackets (${openBrackets} open, ${closeBrackets} close)`);
    }

    // Check for imports without from
    const importLines = content.split('\n').filter(line => line.trim().startsWith('import '));
    importLines.forEach((line, idx) => {
      if (line.includes('import {') && !line.includes('from')) {
        errors.push(`${fileName}:${idx + 1}: Incomplete import statement`);
      }
    });

    // Check for console statements (should use telemetry)
    if (content.match(/console\.(log|error|warn|debug)/)) {
      warnings.push(`${fileName}: Contains console statements (should use telemetry)`);
    }

    // Check for any type usage
    if (content.match(/:\s*any[^a-zA-Z]/)) {
      warnings.push(`${fileName}: Contains 'any' type annotations`);
    }

    // Check for ts-ignore
    if (content.includes('@ts-ignore') || content.includes('@ts-nocheck')) {
      warnings.push(`${fileName}: Contains TypeScript ignore directives`);
    }

    // Check for proper exports
    if (file.endsWith('.tsx') && !content.includes('export default')) {
      warnings.push(`${fileName}: React component file without default export`);
    }

    console.log(`  ✓ ${fileName} passed basic checks`);

  } catch (e) {
    errors.push(`${file}: Cannot read file - ${e.message}`);
  }
});

console.log('\n================================================================================');
console.log('VERIFICATION RESULTS');
console.log('================================================================================\n');

if (errors.length > 0) {
  console.log('ERRORS FOUND:');
  errors.forEach(e => console.log('  ✗ ' + e));
  console.log('');
}

if (warnings.length > 0) {
  console.log('WARNINGS:');
  warnings.forEach(w => console.log('  ⚠ ' + w));
  console.log('');
}

if (errors.length === 0 && warnings.length === 0) {
  console.log('✓ All files passed syntax and standards checks');
  console.log('✓ No errors or warnings found');
  console.log('');
  process.exit(0);
} else if (errors.length === 0) {
  console.log('✓ All files passed syntax checks (warnings can be addressed later)');
  console.log('');
  process.exit(0);
} else {
  console.log('✗ Some files have errors that must be fixed');
  console.log('');
  process.exit(1);
}
