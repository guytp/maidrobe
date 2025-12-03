/**
 * Password validation result interface
 */
export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Email validation result interface
 */
export interface EmailValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Password policy requirements:
 * - Minimum 8 characters
 * - At least 1 uppercase letter (A-Z)
 * - At least 1 lowercase letter (a-z)
 * - At least 1 number (0-9)
 * - At least 1 special character/symbol
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_UPPERCASE_REGEX = /[A-Z]/;
export const PASSWORD_LOWERCASE_REGEX = /[a-z]/;
export const PASSWORD_NUMBER_REGEX = /[0-9]/;
export const PASSWORD_SYMBOL_REGEX = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/;

/**
 * Simple email validation regex for client-side UX feedback.
 *
 * Pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
 * - Matches: local-part @ domain . tld
 * - Disallows: whitespace anywhere in the address
 * - Requires: at least one @ symbol and one dot in domain
 *
 * INTENTIONAL SIMPLICITY:
 * This regex is deliberately simple and permissive to avoid false negatives
 * that would create UX friction. The validation architecture uses defense-in-depth:
 *
 * 1. Client regex (this file): Quick UX feedback to catch obvious typos
 * 2. Zod schema (useSignUp.ts): z.string().email() provides more robust validation
 * 3. Supabase Auth (server): Authoritative email validation and deliverability checks
 *
 * EDGE CASES INTENTIONALLY ALLOWED:
 * This regex allows some technically invalid formats that will be caught downstream:
 * - Multiple @ symbols (e.g., "user@@domain.com")
 * - Consecutive dots (e.g., "user@domain..com")
 * - Invalid TLD formats (e.g., "user@domain.c")
 * - Special characters in uncommon positions
 *
 * These edge cases are rare in practice and rejecting them client-side risks
 * false positives for valid international email addresses or legitimate special
 * character usage (RFC 5322 allows many characters we don't explicitly validate).
 *
 * EMAIL NORMALIZATION:
 * Before validation, emails are normalized (trimmed and lowercased) in the UI layer.
 * This handles common user input issues like accidental leading/trailing spaces
 * and inconsistent casing.
 *
 * WHY NOT STRICTER VALIDATION?
 * - Email RFC specs (5321, 5322) are complex with many valid edge cases
 * - Overly strict client validation can reject legitimate addresses
 * - Server-side validation by Supabase Auth is the security boundary
 * - Better UX to allow submission and show server error than block valid input
 * - International email addresses have complex rules (IDN, Unicode)
 *
 * SECURITY NOTE:
 * Client-side validation is for UX only, never for security. All security-critical
 * validation occurs server-side in Supabase Auth, which also performs deliverability
 * checks and prevents abuse.
 */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates a password against the password policy requirements.
 *
 * @param password - The password string to validate
 * @returns Object containing validation result and any error messages
 *
 * @example
 * ```typescript
 * const result = validatePassword('Weak123');
 * if (!result.isValid) {
 *   console.log(result.errors); // ['Password must be at least 8 characters']
 * }
 * ```
 */
export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (!password) {
    return {
      isValid: false,
      errors: ['Password is required'],
    };
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }

  if (!PASSWORD_UPPERCASE_REGEX.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!PASSWORD_LOWERCASE_REGEX.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!PASSWORD_NUMBER_REGEX.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!PASSWORD_SYMBOL_REGEX.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates an email address format for client-side UX feedback.
 *
 * This function provides quick validation feedback to users during form entry.
 * It intentionally uses a simple regex to avoid false negatives. The validation
 * architecture relies on multiple layers:
 *
 * Validation Layers:
 * 1. This function: Basic format check for immediate UX feedback
 * 2. Zod schema in useSignUp: More robust email validation before API call
 * 3. Supabase Auth: Authoritative server-side validation and security checks
 *
 * Usage Pattern:
 * - Call this on blur events to provide immediate feedback
 * - Email should be normalized (trim + lowercase) before calling this function
 * - Server errors from Supabase should override any client-side validation
 *
 * @param email - The email string to validate (should be pre-normalized)
 * @returns Object containing validation result and optional error message
 *
 * @example
 * ```typescript
 * const normalizedEmail = email.trim().toLowerCase();
 * const result = validateEmail(normalizedEmail);
 * if (!result.isValid) {
 *   setError(result.error); // Show error to user
 * }
 * ```
 *
 * @see EMAIL_REGEX for details on validation strategy and edge cases
 */
export function validateEmail(email: string): EmailValidationResult {
  if (!email) {
    return {
      isValid: false,
      error: 'Email is required',
    };
  }

  if (!EMAIL_REGEX.test(email)) {
    return {
      isValid: false,
      error: 'Please enter a valid email address',
    };
  }

  return {
    isValid: true,
  };
}

/**
 * Validates a password for login (non-empty check only).
 *
 * Unlike signup password validation which enforces complexity requirements,
 * login password validation only checks that a password was provided.
 * This is appropriate because:
 * - The password was already validated during signup
 * - The server will reject invalid credentials regardless
 * - We don't want to give hints about password requirements to attackers
 *
 * @param password - The password string to validate
 * @returns Object containing validation result and optional error message
 *
 * @example
 * ```typescript
 * const result = validateLoginPassword(password);
 * if (!result.isValid) {
 *   setError(result.error); // Show error to user
 * }
 * ```
 */
export function validateLoginPassword(password: string): EmailValidationResult {
  if (!password) {
    return {
      isValid: false,
      error: 'Password is required',
    };
  }

  return {
    isValid: true,
  };
}

/**
 * Password strength levels
 */
export type PasswordStrength = 'weak' | 'medium' | 'strong';

/**
 * Password strength score thresholds.
 * These constants define the score boundaries for each strength level.
 * Used by calculatePasswordStrength() and can be referenced in tests for stability.
 *
 * Score ranges:
 * - Weak: 0 to STRENGTH_THRESHOLD_MEDIUM - 1 (0-39)
 * - Medium: STRENGTH_THRESHOLD_MEDIUM to STRENGTH_THRESHOLD_STRONG - 1 (40-69)
 * - Strong: STRENGTH_THRESHOLD_STRONG and above (70-100)
 */
export const STRENGTH_THRESHOLD_MEDIUM = 40;
export const STRENGTH_THRESHOLD_STRONG = 70;

/**
 * Password strength analysis result
 */
export interface PasswordStrengthResult {
  strength: PasswordStrength;
  score: number;
  feedback: string[];
}

/**
 * Individual password policy rule checks for real-time UI feedback
 */
export interface PasswordPolicyRules {
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
}

/**
 * Password confirmation validation result
 */
export interface PasswordConfirmationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Common weak passwords to check against.
 * This is a minimal list for client-side validation.
 * Server-side should have a more comprehensive list.
 */
const COMMON_PASSWORDS = [
  'password',
  'password123',
  '12345678',
  'qwerty123',
  'abc123456',
  'welcome123',
  'admin123',
  'letmein123',
  'passw0rd',
  'p@ssword',
  'password1',
  '123456789',
  'qwertyuiop',
  '1q2w3e4r',
  'iloveyou',
  'welcome',
  'monkey123',
  'dragon123',
  'master123',
  'sunshine',
];

/**
 * Checks if a password contains sequential characters.
 *
 * @param password - The password to check
 * @returns True if sequential characters are found
 */
function hasSequentialCharacters(password: string): boolean {
  const lower = password.toLowerCase();
  for (let i = 0; i < lower.length - 2; i++) {
    const char1 = lower.charCodeAt(i);
    const char2 = lower.charCodeAt(i + 1);
    const char3 = lower.charCodeAt(i + 2);

    if (char2 === char1 + 1 && char3 === char2 + 1) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if a password contains repeated characters.
 *
 * @param password - The password to check
 * @returns True if repeated characters are found
 */
function hasRepeatedCharacters(password: string): boolean {
  for (let i = 0; i < password.length - 2; i++) {
    if (password[i] === password[i + 1] && password[i] === password[i + 2]) {
      return true;
    }
  }
  return false;
}

/**
 * Checks individual password policy rules for real-time UI feedback.
 *
 * This function allows UI components to display the status of each
 * password requirement individually (e.g., with checkmarks or colored text).
 *
 * @param password - The password to check
 * @returns Object with boolean flags for each policy rule
 *
 * @example
 * ```typescript
 * const rules = checkPasswordPolicyRules('MyPass1!');
 * // Display UI: "Minimum length: rules.hasMinLength ? check : x"
 * ```
 */
export function checkPasswordPolicyRules(password: string): PasswordPolicyRules {
  return {
    hasMinLength: password.length >= PASSWORD_MIN_LENGTH,
    hasUppercase: PASSWORD_UPPERCASE_REGEX.test(password),
    hasLowercase: PASSWORD_LOWERCASE_REGEX.test(password),
    hasNumber: PASSWORD_NUMBER_REGEX.test(password),
    hasSymbol: PASSWORD_SYMBOL_REGEX.test(password),
  };
}

/**
 * Calculates password strength with score and feedback.
 *
 * This function provides a comprehensive strength assessment for
 * real-time feedback during password creation. It considers:
 * - Length (longer is better)
 * - Character diversity (all 4 types present)
 * - Common password patterns
 * - Sequential and repeated characters
 *
 * Scoring thresholds (defined by exported constants):
 * - Weak: 0 to STRENGTH_THRESHOLD_MEDIUM - 1 (0-39)
 * - Medium: STRENGTH_THRESHOLD_MEDIUM to STRENGTH_THRESHOLD_STRONG - 1 (40-69)
 * - Strong: STRENGTH_THRESHOLD_STRONG and above (70-100)
 *
 * Test reference passwords (for stable test expectations):
 * - 'simple' (6 chars, lowercase only) → ~10 points → Weak
 * - 'Password1!' (10 chars, all types) → ~65 points → Medium
 * - 'VeryStrong123!Password' (22 chars, all types) → ~90 points → Strong
 *
 * @param password - The password to analyze
 * @returns Strength assessment with score and feedback
 *
 * @see STRENGTH_THRESHOLD_MEDIUM
 * @see STRENGTH_THRESHOLD_STRONG
 *
 * @example
 * ```typescript
 * const result = calculatePasswordStrength('MyP@ssw0rd123');
 * console.log(result.strength); // 'medium' or 'strong'
 * console.log(result.score); // 0-100
 * console.log(result.feedback); // ['Use a longer password', ...]
 * ```
 */
export function calculatePasswordStrength(password: string): PasswordStrengthResult {
  let score = 0;
  const feedback: string[] = [];

  if (!password) {
    return {
      strength: 'weak',
      score: 0,
      feedback: ['Password is required'],
    };
  }

  // Length scoring (max 40 points)
  // 8-11 chars: 10-20 points
  // 12-15 chars: 25-35 points
  // 16+ chars: 40 points
  if (password.length >= 16) {
    score += 40;
  } else if (password.length >= 12) {
    score += 25 + (password.length - 12) * 2.5;
  } else if (password.length >= 8) {
    score += 10 + (password.length - 8) * 2.5;
  } else {
    feedback.push('Use at least 8 characters');
  }

  // Character diversity (max 40 points, 10 per type)
  const rules = checkPasswordPolicyRules(password);
  if (rules.hasUppercase) {
    score += 10;
  } else {
    feedback.push('Add uppercase letters');
  }

  if (rules.hasLowercase) {
    score += 10;
  } else {
    feedback.push('Add lowercase letters');
  }

  if (rules.hasNumber) {
    score += 10;
  } else {
    feedback.push('Add numbers');
  }

  if (rules.hasSymbol) {
    score += 10;
  } else {
    feedback.push('Add special characters');
  }

  // Bonus for having all character types (10 points)
  if (rules.hasUppercase && rules.hasLowercase && rules.hasNumber && rules.hasSymbol) {
    score += 10;
  }

  // Check for common passwords (penalty: -30 points)
  const lowerPassword = password.toLowerCase();
  if (COMMON_PASSWORDS.includes(lowerPassword)) {
    score = Math.max(0, score - 30);
    feedback.push('Avoid common passwords');
  }

  // Check for sequential characters (penalty: -10 points)
  if (hasSequentialCharacters(password)) {
    score = Math.max(0, score - 10);
    feedback.push('Avoid sequential characters');
  }

  // Check for repeated characters (penalty: -10 points)
  if (hasRepeatedCharacters(password)) {
    score = Math.max(0, score - 10);
    feedback.push('Avoid repeated characters');
  }

  // Determine strength level based on exported threshold constants
  let strength: PasswordStrength;
  if (score >= STRENGTH_THRESHOLD_STRONG) {
    strength = 'strong';
  } else if (score >= STRENGTH_THRESHOLD_MEDIUM) {
    strength = 'medium';
  } else {
    strength = 'weak';
  }

  return {
    strength,
    score: Math.min(100, Math.max(0, score)),
    feedback,
  };
}

/**
 * Validates that password confirmation matches the password.
 *
 * @param password - The original password
 * @param confirmation - The confirmation password
 * @returns Validation result with error message if mismatch
 *
 * @example
 * ```typescript
 * const result = validatePasswordConfirmation('MyPass1!', 'MyPass1!');
 * if (!result.isValid) {
 *   console.log(result.error); // 'Passwords do not match'
 * }
 * ```
 */
export function validatePasswordConfirmation(
  password: string,
  confirmation: string
): PasswordConfirmationResult {
  if (!confirmation) {
    return {
      isValid: false,
      error: 'Please confirm your password',
    };
  }

  if (password !== confirmation) {
    return {
      isValid: false,
      error: 'Passwords do not match',
    };
  }

  return {
    isValid: true,
  };
}
