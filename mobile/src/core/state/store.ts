import { create } from 'zustand';
import { SessionSlice, createSessionSlice } from '../../features/auth/store/sessionSlice';
import {
  OnboardingSlice,
  createOnboardingSlice,
} from '../../features/onboarding/store/onboardingSlice';
import { ContextSlice, createContextSlice } from '../../features/recommendations/store';
import {
  PendingWearEventsSlice,
  createPendingWearEventsSlice,
} from '../../features/wearHistory/store';
import { CaptureSlice, createCaptureSlice } from './captureSlice';
import { WardrobeSlice, createWardrobeSlice } from './wardrobeSlice';

/**
 * Root application state interface.
 *
 * Combines all Zustand slices for local ephemeral UI state.
 * Server state is managed separately via React Query.
 *
 * Currently includes:
 * - SessionSlice: User authentication state (user, setUser, clearUser)
 * - OnboardingSlice: Onboarding progress state (currentStep, completedSteps, skippedSteps)
 * - ContextSlice: Outfit context parameters (occasion, temperatureBand) - persisted
 * - CaptureSlice: Capture flow state (origin, source, isNavigating, errorMessage, payload)
 * - WardrobeSlice: Wardrobe UI state (searchQuery, scrollOffset)
 * - PendingWearEventsSlice: Offline queue for wear events (pendingEvents) - persisted
 *
 * Future slices can be added using intersection types:
 * ```
 * type RootState = SessionSlice & OnboardingSlice & ContextSlice & CaptureSlice & WardrobeSlice & OtherSlice;
 * ```
 */
export type RootState = SessionSlice &
  OnboardingSlice &
  ContextSlice &
  CaptureSlice &
  WardrobeSlice &
  PendingWearEventsSlice;

/**
 * Typed Zustand store hook for accessing local application state.
 *
 * Combines multiple slices into a single store while maintaining type safety
 * and separation of concerns. Each slice is created with its own factory function
 * and spread into the root store.
 *
 * Usage:
 * ```
 * // Access state
 * const user = useStore((state) => state.user);
 *
 * // Access actions
 * const setUser = useStore((state) => state.setUser);
 * const clearUser = useStore((state) => state.clearUser);
 * ```
 *
 * Note: Only use for ephemeral UI state. Server state belongs in React Query.
 */
export const useStore = create<RootState>()((...args) => ({
  ...createSessionSlice(...args),
  ...createOnboardingSlice(...args),
  ...createContextSlice(...args),
  ...createCaptureSlice(...args),
  ...createWardrobeSlice(...args),
  ...createPendingWearEventsSlice(...args),
}));
