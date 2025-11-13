import React from 'react';
import { Stack } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider } from '../src/core/theme';
import { queryClient } from '../src/core/query/client';

export default function RootLayout(): React.JSX.Element {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <Stack screenOptions={{ headerShown: false }} />
        {__DEV__ && <ReactQueryDevtools />}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
