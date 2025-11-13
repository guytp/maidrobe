import React from 'react';
import { Redirect } from 'expo-router';
import { useStore } from '../src/core/state/store';

/**
 * Root entry point for the application.
 * Redirects to appropriate screen based on authentication state:
 * - No user -> /auth/signup
 * - User but not verified -> /auth/verify
 * - User and verified -> /home
 *
 * The protected route guard in /home will also handle authorization,
 * but this provides immediate redirect to avoid unnecessary loading.
 *
 * @returns Redirect component navigating to appropriate route
 */
export default function Index(): React.JSX.Element {
  const user = useStore((state) => state.user);

  // Redirect based on auth state
  if (!user) {
    return <Redirect href="/auth/signup" />;
  }

  if (!user.emailVerified) {
    return <Redirect href="/auth/verify" />;
  }

  return <Redirect href="/home" />;
}
