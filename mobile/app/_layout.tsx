import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../src/core/theme';
import { queryClient } from '../src/core/query/client';
import { useAuthStateListener } from '../src/features/auth/hooks/useAuthStateListener';
import { useTokenRefreshManager } from '../src/features/auth/hooks/useTokenRefreshManager';
import { restoreAuthStateOnLaunch } from '../src/features/auth/utils/authRestore';
import { validateColourPalette } from '../src/features/onboarding/utils/colourTranslation';
import { WearHistorySyncProvider } from '../src/features/wearHistory';

export default function RootLayout(): React.JSX.Element {
  // Restore auth state on cold start
  // This triggers the 7-step restore pipeline that loads session from SecureStore,
  // validates it, attempts refresh if needed, and handles offline trust window
  useEffect(() => {
    restoreAuthStateOnLaunch();

    // Validate colour palette translations in development
    if (__DEV__) {
      const { valid, errors } = validateColourPalette();
      if (!valid) {
        console.error('[Colour Palette Validation] Errors detected:', errors);
      }
    }
  }, []);

  // Global auth state listener - syncs Supabase auth with local store
  // Handles runtime auth changes (login, logout, email verification)
  useAuthStateListener();

  // Token refresh coordinator - handles proactive and reactive refresh
  useTokenRefreshManager();

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <WearHistorySyncProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </WearHistorySyncProvider>
          {/* Load React Query Devtools dynamically in development only.
              This ensures the devtools bundle is excluded from production builds. */}
          {__DEV__ &&
            (() => {
              // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
              const { ReactQueryDevtools } = require('@tanstack/react-query-devtools');
              return <ReactQueryDevtools />;
            })()}
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
