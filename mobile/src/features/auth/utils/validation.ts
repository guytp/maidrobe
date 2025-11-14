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
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_UPPERCASE_REGEX = /[A-Z]/;
export const PASSWORD_LOWERCASE_REGEX = /[a-z]/;
export const PASSWORD_NUMBER_REGEX = /[0-9]/;

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
