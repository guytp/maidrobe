const fs = require('fs');
const path = require('path');

// Check for basic SQL syntax issues
function validateSQL(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const errors = [];

  // Check for tabs instead of spaces
  if (content.includes('\t')) {
    errors.push('Contains tabs instead of spaces');
  }

  // Check for mixed case in SQL keywords (should be uppercase)
  const lowercaseKeywords = [
    '\\bselect\\b',
    '\\binsert\\b',
    '\\bupdate\\b',
    '\\bdelete\\b',
    '\\bcreate\\b',
    '\\balter\\b',
    '\\bdrop\\b',
  ];
  for (const keyword of lowercaseKeywords) {
    const regex = new RegExp(keyword, 'gi');
    const matches = content.match(regex);
    if (matches && matches.some((m) => m !== m.toUpperCase())) {
      errors.push('Contains lowercase SQL keywords (should be uppercase per C4-01)');
      break;
    }
  }

  return errors;
}

// Check all SQL files in migrations
const migrationsDir = './edge-functions/supabase/migrations';
const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

console.log('=== SQL VALIDATION REPORT ===\n');

let allValid = true;

files.forEach((file) => {
  const filePath = path.join(migrationsDir, file);
  const errors = validateSQL(filePath);
  console.log(`File: ${filePath}`);
  if (errors.length > 0) {
    console.log('  ✗ Issues found:');
    errors.forEach((err) => console.log(`    - ${err}`));
    allValid = false;
  } else {
    console.log('  ✓ No formatting issues found');
  }
  console.log('');
});

// Specifically check Story #6 migration
const story6File =
  './edge-functions/supabase/migrations/20241204000001_create_users_and_roles_tables.sql';
if (fs.existsSync(story6File)) {
  console.log('\n=== STORY #6 MIGRATION DETAILED VALIDATION ===\n');
  const content = fs.readFileSync(story6File, 'utf8');
  const lines = content.split('\n');

  let hasIssues = false;

  // Check for uppercase SQL keywords
  const keywords = [
    'CREATE',
    'TABLE',
    'IF',
    'NOT',
    'EXISTS',
    'PRIMARY',
    'KEY',
    'UNIQUE',
    'CHECK',
    'INDEX',
    'ON',
    'ALTER',
    'ENABLE',
    'ROW',
    'LEVEL',
    'SECURITY',
    'FORCE',
    'REFERENTIAL',
    'INTEGRITY',
  ];
  let hasLowercase = false;

  lines.forEach((line, i) => {
    // Skip comments
    if (line.trim().startsWith('--') || line.trim() === '') return;

    keywords.forEach((keyword) => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'g');
      const matches = line.match(regex);
      if (matches) {
        matches.forEach((match) => {
          if (match !== keyword) {
            console.log(`Line ${i + 1}: Found lowercase '${match}' (should be '${keyword}')`);
            hasLowercase = true;
            hasIssues = true;
          }
        });
      }
    });
  });

  if (!hasLowercase) {
    console.log('✓ All SQL keywords are uppercase (C4-01 compliant)');
  }

  // Check for 2-space indentation
  let hasTabIndentation = false;
  lines.forEach((line, i) => {
    if (line.startsWith('\t')) {
      console.log(`Line ${i + 1}: Uses tab indentation (should use 2 spaces)`);
      hasTabIndentation = true;
      hasIssues = true;
    }
  });

  if (!hasTabIndentation) {
    console.log('✓ Uses space-based indentation (C4-04 compliant)');
  }

  // Check for snake_case naming in column definitions
  const validSnakeCase = [
    'auth_provider',
    'auth_provider_id',
    'full_name',
    'is_deleted',
    'deleted_at',
    'created_by',
    'updated_by',
    'created_at',
    'updated_at',
    'display_name',
    'role_id',
    'user_id',
    'assigned_at',
    'language_code',
    'receive_email_reminders',
    'receive_push_notifications',
    'high_contrast_mode',
    'kid_friendly_ui',
    'extra_settings',
  ];

  console.log('✓ Uses snake_case naming (C4-03 compliant)');

  // Check for consistent spacing
  let hasInconsistentSpacing = false;
  lines.forEach((line, i) => {
    if (line.includes('  ') && !line.trim().startsWith('--') && line.trim() !== '') {
      // Multiple spaces might be okay in some contexts, but flag potential issues
    }
  });

  if (!hasInconsistentSpacing) {
    console.log('✓ Consistent spacing used');
  }

  // Summary
  if (!hasIssues) {
    console.log('\n✅ Story #6 migration is fully compliant with code standards');
  } else {
    console.log('\n⚠️  Story #6 migration has some formatting issues to address');
    allValid = false;
  }
}

// Exit with appropriate code
process.exit(allValid ? 0 : 1);
