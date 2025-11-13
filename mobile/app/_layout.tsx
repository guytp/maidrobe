import React from 'react';
import { Stack } from 'expo-router';
import { ThemeProvider } from '../src/core/theme';

export default function RootLayout(): React.JSX.Element {
  return (
    <ThemeProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}
