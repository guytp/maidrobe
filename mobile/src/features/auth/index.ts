/**
 * Auth feature barrel export.
 *
 * Exports all public APIs from the auth feature module.
 * This allows consumers to import from '@/features/auth' instead of
 * deep paths like '@/features/auth/store/sessionSlice'.
 */

export * from './store/sessionSlice';
export * from './api/useSignUp';
export * from './api/useResendVerification';
export * from './api/useLogin';
export * from './api/useLogout';
export * from './api/useRequestPasswordReset';
export * from './api/useResetPassword';
export * from './utils/validation';
export * from './utils/passwordResetSchemas';
export * from './utils/passwordReuse';
export * from './utils/resetAttemptRateLimit';
export * from './utils/authRouting';
export * from './hooks/useAuthStateListener';
export * from './hooks/useProtectedRoute';
export * from './hooks/useTokenRefreshManager';
export * from './hooks/useRecaptcha';
export * from './components/SignupScreen';
export * from './components/VerificationPromptScreen';
export * from './components/LoginScreen';
export * from './components/ForgotPasswordScreen';
export * from './components/ResetPasswordScreen';
