import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useStore } from '../src/core/state/store';

/**
 * Root entry point for the application.
 *
 * INITIALIZATION COORDINATION:
 * This component coordinates with useAuthStateListener to prevent race conditions
 * during app startup. The auth listener asynchronously fetches the initial Supabase
 * session via getSession(), which may return an existing valid session. To avoid
 * incorrectly redirecting to /auth/signup before this async operation completes,
 * we wait for the isInitialized flag to become true.
 *
 * Initialization Flow:
 * 1. App mounts, useAuthStateListener starts in _layout.tsx
 * 2. This component renders with isInitialized=false, user=null
 * 3. Shows loading spinner while waiting for initialization
 * 4. useAuthStateListener calls getSession() asynchronously
 * 5. getSession() completes, sets user (if session exists) and isInitialized=true
 * 6. This component re-renders with initialized state
 * 7. Redirects to appropriate route based on actual auth state
 *
 * Without isInitialized check:
 * - Component would see user=null immediately
 * - Would redirect to /auth/signup prematurely
 * - User with valid session would be sent to signup screen incorrectly
 * - useProtectedRoute would redirect back, causing navigation flash
 *
 * With isInitialized check:
 * - Component waits for auth state to load
 * - Shows loading spinner during initialization
 * - Redirects only after knowing true auth state
 * - No navigation flash or incorrect redirects
 *
 * Redirect logic (after initialization):
 * - No user -> /auth/signup
 * - User but not verified -> /auth/verify
 * - User and verified -> /home
 *
 * Note: The protected route guard in /home (useProtectedRoute) also checks
 * isInitialized and provides additional authorization checks. This root-level
 * redirect is an optimization to avoid unnecessary route loading.
 *
 * @returns Loading spinner during initialization, or Redirect to appropriate route
 */
export default function Index(): React.JSX.Element {
  const user = useStore((state) => state.user);
  const isInitialized = useStore((state) => state.isInitialized);

  // Show loading state while auth is initializing
  // This prevents premature redirects before we know if a session exists
  if (!isInitialized) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#000000',
        }}
      >
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  // Auth initialization complete - redirect based on actual state
  if (!user) {
    return <Redirect href="/auth/login" />;
  }

  if (!user.emailVerified) {
    return <Redirect href="/auth/verify" />;
  }

  return <Redirect href="/home" />;
}
