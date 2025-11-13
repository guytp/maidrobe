import React from 'react';
import { Stack } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '../src/core/theme';
import { queryClient } from '../src/core/query/client';
import { useAuthStateListener } from '../src/features/auth/hooks/useAuthStateListener';

export default function RootLayout(): React.JSX.Element {
  // Global auth state listener - syncs Supabase auth with local store
  useAuthStateListener();

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <Stack screenOptions={{ headerShown: false }} />
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
  );
}
