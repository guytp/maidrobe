import { z } from 'zod';

/**
 * Zod schema for forgot password request validation.
 *
 * Validates the email input when a user requests a password reset link.
 * Uses Zod's built-in email validation which is more robust than
 * the simple client-side regex.
 */
export const ForgotPasswordRequestSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

/**
 * Zod schema for reset password request validation.
 *
 * Validates the password reset form submission including:
 * - Reset token from the deep link
 * - New password meeting minimum requirements
 * - Password confirmation
 * - Matching passwords
 * - Optional userId for password reuse checking
 *
 * Note: The password policy (uppercase, lowercase, number, symbol)
 * is enforced separately by the validatePassword() function from
 * validation.ts. This schema only checks minimum length to avoid
 * duplicate validation logic.
 *
 * The userId field is optional because:
 * - It may not be available during the initial password reset flow
 * - Password reuse checking only runs when userId is provided
 * - Calling components are responsible for providing userId from their context
 */
export const ResetPasswordRequestSchema = z
  .object({
    token: z.string().min(1, 'Reset token is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    userId: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

/**
 * TypeScript type inferred from ForgotPasswordRequestSchema
 */
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;

/**
 * TypeScript type inferred from ResetPasswordRequestSchema
 */
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;
