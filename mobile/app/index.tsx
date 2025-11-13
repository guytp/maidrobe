import React from 'react';
import { Redirect } from 'expo-router';

/**
 * Root entry point for the application.
 * Redirects to the home screen to establish default route.
 *
 * @returns Redirect component navigating to /home
 */
export default function Index(): React.JSX.Element {
  return <Redirect href="/home" />;
}
