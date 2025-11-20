/**
 * Camera capture route.
 *
 * Protected route that renders the camera capture screen.
 * Requires authenticated user (enforced by route wrapper).
 *
 * Route: /capture/camera
 * Query params: origin (wardrobe | onboarding)
 *
 * @module app/capture/camera
 */

import React from 'react';
import { Redirect } from 'expo-router';
import { CaptureCameraScreen } from '../../../src/features/wardrobe/components';
import { useStore } from '../../../src/core/state/store';

/**
 * Camera capture route component.
 *
 * Renders the camera capture screen if user is authenticated,
 * otherwise redirects to auth.
 *
 * @returns Camera capture screen or redirect
 */
export default function CaptureCameraRoute() {
  const user = useStore((state) => state.user);

  if (!user) {
    return <Redirect href="/auth" />;
  }

  return <CaptureCameraScreen />;
}
