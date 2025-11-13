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
 * Simple email validation regex (RFC-compliant basic check)
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
 * Validates an email address format.
 *
 * @param email - The email string to validate
 * @returns Object containing validation result and optional error message
 *
 * @example
 * ```typescript
 * const result = validateEmail('user@example.com');
 * if (!result.isValid) {
 *   console.log(result.error); // Error message if invalid
 * }
 * ```
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
