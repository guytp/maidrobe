# Step 5 Analysis: Adapt Root Navigation Layer

## Overview

This document analyzes required changes to integrate the auth restore pipeline with the root navigation layer (app/_layout.tsx and app/index.tsx) to ensure proper hydration lifecycle, routing behavior, and user messaging.

## Current State Analysis

### 1. app/_layout.tsx (31 lines)

**Current implementation:**
- Provides global providers: ThemeProvider, QueryClientProvider
- Initializes global hooks: useAuthStateListener, useTokenRefreshManager
- Renders Expo Router Stack with no header

**Current auth initialization:**
- useAuthStateListener() handles initial session fetch via getSession()
- Sets isInitialized=true after getSession() completes
- Subscribes to onAuthStateChange for runtime auth updates
- Does NOT call restoreAuthStateOnLaunch()

**Issues:**
1. No call to restoreAuthStateOnLaunch() - restore pipeline not triggered
2. useAuthStateListener duplicates work:
   - getSession() fetch at startup (Lines 74-125)
   - This overlaps with what authRestore.ts should do
3. Uses isInitialized flag instead of isHydrating
4. No splash/loading screen coordination

### 2. app/index.tsx (86 lines)

**Current implementation:**
- Root entry point, handles initial routing decision
- Checks isInitialized flag (Lines 56, 60)
- Shows black loading screen while !isInitialized (Lines 61-73)
- Redirects based on manual user checks:
  - !user -> /auth/login (Lines 76-78)
  - !user.emailVerified -> /auth/verify (Lines 80-82)
  - else -> /home (Line 84)

**Issues:**
1. Uses isInitialized instead of isHydrating
2. Manual routing logic instead of deriveInitialRouteFromAuthState()
3. Duplicates routing logic that exists in authRouting.ts
4. No logout reason handling (SessionExpiredBanner exists but only on login route)
5. Loading screen is inline, not reusable

### 3. app/auth/login.tsx (33 lines)

**Current implementation:**
- Wraps LoginScreen with SessionExpiredBanner
- Banner reads logoutReason from store and displays it
- Banner can be dismissed by user

**Status:**
- Already correctly implements logout reason banner
- No changes needed

### 4. app/home/index.tsx (150 lines)

**Current implementation:**
- Uses useProtectedRoute() hook (Line 19)
- Shows spinner while !isAuthorized (Lines 80-94)
- useProtectedRoute now correctly uses store.deriveRoute() (Step 3)

**Back navigation:**
- No explicit back handler
- Default Expo Router behavior: back from /home goes to previous route
- Could go back to /auth/login if user navigated login -> home

**Issue:**
- Should exit app on back, not return to login

### 5. app/auth/verify.tsx (4 lines)

**Current implementation:**
- Simple export of VerificationPromptScreen component

**Back navigation:**
- No explicit back handler
- Default behavior could allow back to login

**Issue:**
- Should exit app on back, not return to login

### 6. useAuthStateListener Hook (237 lines)

**Current behavior:**
- Fetches initial session via getSession() on mount (Lines 74-125)
- Subscribes to onAuthStateChange (Lines 131-225)
- Handles SIGNED_IN, SIGNED_OUT, USER_UPDATED, TOKEN_REFRESHED events
- Navigates from /auth/verify to /home when email verified
- Sets isInitialized=true after initial fetch

**Overlap with authRestore:**
- getSession() call (Line 77) duplicates restore pipeline logic
- Sets isInitialized which conflicts with isHydrating lifecycle
- Performs initial auth state sync that authRestore should handle

**What to keep:**
- onAuthStateChange subscription (runtime updates)
- Email verification navigation (verify -> home)
- Token metadata updates

**What to remove/change:**
- Initial getSession() call (Lines 74-125)
- setInitialized() calls (Lines 86, 116, 123)
- This initialization should come from authRestore

## Requirements from User Story

### Requirement 1: Hydration Loading Screen

**Requirement:**
> "A neutral, non-interactive loading/splash screen is shown while isHydrating is true, preventing any flash of Login/Home/Verification"

**Implementation:**
- app/index.tsx must check isHydrating instead of isInitialized
- Show loading spinner while isHydrating === true
- Loading screen should be neutral (black background, white spinner)
- No interactive elements during hydration

**Current gap:**
- Uses isInitialized, not isHydrating
- Loading screen exists but checks wrong flag

### Requirement 2: Route Derivation

**Requirement:**
> "Once hydration finishes, the app calls the shared deriveInitialRouteFromAuthState helper to decide whether to show the Home stack, Email Verification prompt, or Login as the true initial route"

**Implementation:**
- app/index.tsx must use store.deriveRoute() instead of manual checks
- After isHydrating becomes false, call deriveRoute()
- Redirect to the route returned: 'login' | 'verify' | 'home'

**Current gap:**
- Manual routing logic: checks user and user.emailVerified directly
- Does not use deriveRoute() helper
- Violates single source of truth principle

### Requirement 3: Back Navigation

**Requirement:**
> "Navigation is wired so that back navigation from Home/Verification exits instead of returning to Login and back from Login (after a failed restore) does not revisit the loading screen"

**Implementation:**
- app/home/index.tsx: Add back handler to exit app
- app/auth/verify.tsx: Add back handler to exit app
- app/index.tsx: Use router.replace() to prevent back to loading screen
- Ensure navigation stack doesn't allow Login <- Home flow

**Current gap:**
- No back handlers in Home or Verify screens
- Default back navigation could create unwanted flows

### Requirement 4: User-Facing Messages

**Requirement:**
> "Minimal inline messaging or a shared toast/banner mechanism displays the required user-facing messages for session expiry and stale/failed restore, ensuring no sensitive data appears in logs or UI, and that login/signup/logout flows update or clear SecureStore and auth state in a way that keeps subsequent cold-start behaviour consistent with this routing logic"

**Implementation:**
- SessionExpiredBanner already exists and works correctly
- authRestore.ts already sets logoutReason via store.markUnauthenticated()
- Login route already displays SessionExpiredBanner
- Need to verify no sensitive data in logs (already verified in Step 4)
- Need to verify login/signup/logout clear SecureStore (already implemented)

**Current state:**
- SessionExpiredBanner: COMPLETE (app/auth/login.tsx:4)
- Logout reason setting: COMPLETE (authRestore.ts calls markUnauthenticated)
- SecureStore clearing: COMPLETE (useLogout.ts:149, useLogin.ts, etc.)

## Required Changes

### Change 1: Update app/_layout.tsx

**Action: Call restoreAuthStateOnLaunch() on mount**

**Current code (Lines 9-14):**
```typescript
export default function RootLayout(): React.JSX.Element {
  // Global auth state listener - syncs Supabase auth with local store
  useAuthStateListener();

  // Token refresh coordinator - handles proactive and reactive refresh
  useTokenRefreshManager();
```

**Required change:**
- Import restoreAuthStateOnLaunch from features/auth/utils/authRestore
- Call it in a useEffect on component mount
- Ensure it runs BEFORE any navigation decisions
- Keep useAuthStateListener for runtime auth updates
- Keep useTokenRefreshManager for token refresh coordination

**Pseudo-code:**
```typescript
import { restoreAuthStateOnLaunch } from '../src/features/auth/utils/authRestore';

export default function RootLayout(): React.JSX.Element {
  // Restore auth state on cold start
  useEffect(() => {
    restoreAuthStateOnLaunch();
  }, []);

  // Global auth state listener - syncs runtime auth changes
  useAuthStateListener();

  // Token refresh coordinator
  useTokenRefreshManager();

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <Stack screenOptions={{ headerShown: false }} />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
```

**Rationale:**
- restoreAuthStateOnLaunch() handles:
  - Setting isHydrating=true at start
  - Loading stored session from SecureStore
  - Validating session
  - Attempting refresh if needed
  - Setting isHydrating=false when complete
  - Setting logout reason if restore fails
- useAuthStateListener() handles:
  - Runtime auth changes (login, logout, email verification)
  - onAuthStateChange subscription
  - Should NOT duplicate initial session fetch

### Change 2: Refactor useAuthStateListener

**Action: Remove initial getSession() call, rely on authRestore**

**Current problematic code (Lines 74-125):**
```typescript
// Fetch initial session on mount
const initializeAuth = async () => {
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      // ...error handling
      setInitialized(true);
      return;
    }

    if (data.session?.user) {
      // ...set user and token metadata
    }

    // Mark auth initialization as complete
    setInitialized(true);
  } catch (error) {
    // ...error handling
    setInitialized(true);
  }
};

// Initialize auth state
initializeAuth();
```

**Required change:**
- Remove entire initializeAuth function
- Remove setInitialized calls (isInitialized flag deprecated)
- Keep only onAuthStateChange subscription
- Subscription handles runtime updates only

**Rationale:**
- authRestore.ts now handles initial session load
- Eliminates duplicate getSession() call
- Removes race condition between authRestore and useAuthStateListener
- useAuthStateListener becomes pure runtime subscription handler

**Alternative approach:**
- Keep useAuthStateListener unchanged
- Have restoreAuthStateOnLaunch skip getSession if session already loaded
- Use a flag to coordinate

**Recommended: Remove from useAuthStateListener**
- Cleaner separation of concerns
- authRestore = cold start hydration
- useAuthStateListener = runtime updates

### Change 3: Update app/index.tsx

**Action: Use isHydrating and deriveRoute() instead of manual logic**

**Current code (Lines 54-84):**
```typescript
export default function Index(): React.JSX.Element {
  const user = useStore((state) => state.user);
  const isInitialized = useStore((state) => state.isInitialized);

  // Show loading state while auth is initializing
  if (!isInitialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000000' }}>
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
```

**Required change:**
- Replace isInitialized with isHydrating
- Replace manual user checks with deriveRoute()
- Keep loading screen during hydration
- Use router.replace() instead of <Redirect> to prevent back navigation

**Pseudo-code:**
```typescript
export default function Index(): React.JSX.Element {
  const isHydrating = useStore((state) => state.isHydrating);
  const deriveRoute = useStore((state) => state.deriveRoute);
  const router = useRouter();

  // Show loading screen while auth is hydrating
  if (isHydrating) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000000' }}>
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  // Hydration complete - derive target route
  const targetRoute = deriveRoute();

  // Use useEffect to navigate (can't call router.replace during render)
  useEffect(() => {
    if (!isHydrating) {
      const route = deriveRoute();
      if (route === 'login') {
        router.replace('/auth/login');
      } else if (route === 'verify') {
        router.replace('/auth/verify');
      } else {
        router.replace('/home');
      }
    }
  }, [isHydrating, deriveRoute, router]);

  // Show loading spinner while navigation in progress
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000000' }}>
      <ActivityIndicator size="large" color="#ffffff" />
    </View>
  );
}
```

**Alternative using Redirect (if supported):**
```typescript
export default function Index(): React.JSX.Element {
  const isHydrating = useStore((state) => state.isHydrating);
  const deriveRoute = useStore((state) => state.deriveRoute);

  if (isHydrating) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000000' }}>
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  const targetRoute = deriveRoute();

  if (targetRoute === 'login') {
    return <Redirect href="/auth/login" />;
  }

  if (targetRoute === 'verify') {
    return <Redirect href="/auth/verify" />;
  }

  return <Redirect href="/home" />;
}
```

**Note:** Need to verify if Expo Router's <Redirect> uses replace or push semantics. If it uses push, must use router.replace() in useEffect instead.

**Documentation updates:**
- Update JSDoc to reflect isHydrating instead of isInitialized
- Explain deriveRoute() usage
- Document router.replace() prevents back navigation

### Change 4: Add back handlers to Home and Verify screens

**Action: Exit app on back from Home/Verify instead of navigating back**

**For app/home/index.tsx:**

**Current code:** No back handler

**Required change:**
- Import BackHandler from react-native
- Add useEffect to register back handler
- On back press, exit app (BackHandler.exitApp())
- Return true to indicate back press handled

**Pseudo-code:**
```typescript
import { BackHandler } from 'react-native';

export default function HomeScreen(): React.JSX.Element {
  const isAuthorized = useProtectedRoute();
  // ...existing code

  // Exit app on back press instead of navigating back
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      BackHandler.exitApp();
      return true; // Prevent default back navigation
    });

    return () => backHandler.remove();
  }, []);

  // ...rest of component
}
```

**For app/auth/verify.tsx:**

**Current code (4 lines):**
```typescript
import { VerificationPromptScreen } from '../../src/features/auth/components/VerificationPromptScreen';

export default VerificationPromptScreen;
```

**Required change:**
- Create wrapper component (can't add useEffect to direct export)
- Add back handler to exit app

**Pseudo-code:**
```typescript
import React, { useEffect } from 'react';
import { BackHandler } from 'react-native';
import { VerificationPromptScreen } from '../../src/features/auth/components/VerificationPromptScreen';

export default function VerifyRoute() {
  // Exit app on back press from verification screen
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      BackHandler.exitApp();
      return true;
    });

    return () => backHandler.remove();
  }, []);

  return <VerificationPromptScreen />;
}
```

**Rationale:**
- User at Home is fully authenticated - no previous screen to return to
- User at Verify is in middle of signup - back should exit, not return to login
- Prevents confusing navigation flows (Home -> Login, Verify -> Login)
- Common mobile app pattern: back from home screen exits app

**Platform note:**
- BackHandler.exitApp() only works on Android
- On iOS, users exit via home button/gesture (no back button)
- This implementation is safe on iOS (listener never triggered)

### Change 5: Verify SecureStore management

**Action: Audit login/signup/logout flows to ensure SecureStore consistency**

**Already verified in previous steps:**

**Logout (useLogout.ts:149):**
```typescript
// Clear stored session bundle from SecureStore
await clearStoredSession();
```

**Login success (useLogin.ts - need to verify):**
- Should call saveSessionFromSupabase() after successful login
- Already implemented (Line 10 import, need to check usage)

**Signup success (useSignUp.ts - need to verify):**
- Should call saveSessionFromSupabase() after successful signup
- Already implemented (need to check usage)

**Token refresh (useTokenRefreshManager - need to verify):**
- Should update SecureStore after successful refresh
- Need to check implementation

**Expected finding:**
- All flows already handle SecureStore correctly
- saveSessionFromSupabase() called on login/signup success
- clearStoredSession() called on logout
- Session updates on token refresh

**If gaps found:**
- Add saveSessionFromSupabase() calls where missing
- Ensure consistent session persistence

## Edge Cases and Considerations

### 1. Race Conditions

**Scenario:** restoreAuthStateOnLaunch() and useAuthStateListener() both try to fetch session

**Resolution:**
- Remove getSession() from useAuthStateListener
- authRestore owns initial session load
- useAuthStateListener handles only runtime updates

### 2. Multiple Mounts

**Scenario:** _layout.tsx unmounts and remounts (dev mode, navigation)

**Resolution:**
- restoreAuthStateOnLaunch() has idempotency guard (authRestore.ts:71-80)
- isRestoreInProgress flag prevents concurrent runs
- restorePromise cached and returned if restore in progress

### 3. Network Timeout During Hydration

**Scenario:** Refresh times out during restore, isHydrating stays true forever

**Resolution:**
- authRestore.ts has 8-second timeout (REFRESH_TIMEOUT_MS)
- endHydration() called in finally block (authRestore.ts:190)
- isHydrating always set to false, even on error

### 4. User Lands on Deep Link During Hydration

**Scenario:** App opens to /home/profile via deep link while isHydrating=true

**Resolution:**
- app/index.tsx only shows loading screen
- After hydration, deriveRoute() determines correct route
- If unauthenticated, redirects to login (deep link lost)
- If authenticated, protected routes work normally

**Improvement opportunity:**
- Store deep link URL during hydration
- Redirect to deep link after successful hydration
- Out of scope for Step 5

### 5. User Dismisses SessionExpiredBanner Then Refreshes

**Scenario:** User dismisses banner, doesn't log in, kills app, reopens

**Resolution:**
- logoutReason cleared when user dismisses banner
- Banner won't show on next cold start
- Acceptable: user already saw the message once

**Alternative:**
- Persist logoutReason to AsyncStorage
- Show banner again on next launch if not logged in
- Out of scope for Step 5

### 6. Token Refresh Succeeds After Offline Timeout

**Scenario:** needsRefresh=true, user goes online, refresh succeeds, but they're at login screen

**Resolution:**
- useTokenRefreshManager monitors needsRefresh flag
- Attempts refresh when connectivity restored
- On success, sets user and updates store
- useAuthStateListener sees SIGNED_IN event
- User might need to navigate manually

**Improvement opportunity:**
- Auto-navigate to home when deferred refresh succeeds
- Add to useAuthStateListener or useTokenRefreshManager
- Out of scope for Step 5

## Dependencies

### New imports required:

**app/_layout.tsx:**
- restoreAuthStateOnLaunch from '../src/features/auth/utils/authRestore'
- useEffect from 'react'

**app/index.tsx:**
- useRouter from 'expo-router' (if using router.replace)
- useEffect from 'react' (if using router navigation)

**app/home/index.tsx:**
- BackHandler from 'react-native'
- useEffect from 'react' (already imported)

**app/auth/verify.tsx:**
- React, useEffect from 'react'
- BackHandler from 'react-native'

### Store selectors required:

**app/index.tsx:**
- isHydrating (replace isInitialized)
- deriveRoute (new)

**app/home/index.tsx:**
- No changes (useProtectedRoute already uses correct selectors)

**app/auth/verify.tsx:**
- No store access needed (just back handler)

## Testing Checklist

After implementation, verify:

1. **Cold start with valid session:**
   - Shows loading screen (isHydrating=true)
   - Loads session from SecureStore
   - Validates session
   - Navigates to /home (if verified) or /verify (if unverified)
   - No flash of login screen

2. **Cold start with expired session:**
   - Shows loading screen
   - Attempts refresh
   - If refresh fails: navigates to /auth/login with logout reason banner
   - Banner shows "Session expired. Please log in again."

3. **Cold start with no session:**
   - Shows loading screen
   - No session in SecureStore
   - Navigates to /auth/login
   - No logout reason banner (first visit)

4. **Cold start offline with fresh session:**
   - Shows loading screen
   - Loads session from SecureStore
   - Session < 7 days old: navigates to /home
   - Sets needsRefresh=true
   - No network call attempted

5. **Cold start offline with stale session:**
   - Shows loading screen
   - Session > 7 days old
   - Navigates to /auth/login with logout reason banner
   - Banner shows offline message

6. **Back navigation:**
   - From /home: exits app (Android) or no-op (iOS)
   - From /auth/verify: exits app (Android) or no-op (iOS)
   - From /auth/login: exits app (Android) or no-op (iOS) - default behavior

7. **Login flow:**
   - User logs in successfully
   - Session saved to SecureStore
   - Navigates to /home (if verified) or /verify (if unverified)
   - Next cold start: restores session correctly

8. **Logout flow:**
   - User logs out
   - SecureStore cleared
   - Navigates to /auth/login
   - No logout reason banner (user-initiated)
   - Next cold start: no session, shows login

9. **Runtime email verification:**
   - User at /auth/verify
   - Verifies email via link
   - useAuthStateListener detects USER_UPDATED
   - Navigates to /home
   - Session updated in SecureStore

10. **Multiple rapid restarts:**
    - Kill and reopen app 5 times quickly
    - Each restart triggers restore pipeline
    - No duplicate sessions or corrupted state
    - Idempotency guard works correctly

## Summary

### Files to modify:

1. **app/_layout.tsx** - Add restoreAuthStateOnLaunch() call
2. **app/index.tsx** - Use isHydrating and deriveRoute()
3. **app/home/index.tsx** - Add back handler to exit app
4. **app/auth/verify.tsx** - Add back handler to exit app
5. **useAuthStateListener.ts** - Remove initial getSession() call (optional)

### Files already complete:

1. **app/auth/login.tsx** - SessionExpiredBanner already present
2. **SessionExpiredBanner.tsx** - Works correctly
3. **authRestore.ts** - Restore pipeline complete
4. **sessionSlice.ts** - All flags and actions present
5. **useLogout.ts** - Clears SecureStore correctly

### Implementation approach:

**Option A: Minimal changes (recommended)**
- Keep useAuthStateListener unchanged
- Add restoreAuthStateOnLaunch() to _layout.tsx
- Update index.tsx to use isHydrating + deriveRoute()
- Add back handlers to home and verify
- Rely on coordination between authRestore and useAuthStateListener

**Option B: Clean separation**
- Refactor useAuthStateListener to remove initial getSession()
- Add restoreAuthStateOnLaunch() to _layout.tsx
- Update index.tsx to use isHydrating + deriveRoute()
- Add back handlers to home and verify
- Clear separation: authRestore = cold start, listener = runtime

**Recommendation: Option B**
- Cleaner architecture
- No duplicate getSession() calls
- Eliminates race conditions
- Better separation of concerns

### Lines of code estimate:

- app/_layout.tsx: +6 lines (import + useEffect)
- app/index.tsx: +10 lines (new logic, -old logic = net +10)
- app/home/index.tsx: +12 lines (import + useEffect)
- app/auth/verify.tsx: +8 lines (convert to wrapper component)
- useAuthStateListener.ts: -52 lines (remove initializeAuth)

**Total: ~-16 lines net (more functionality, less code)**

### Risk assessment:

**Low risk:**
- Back handlers: Additive change, no impact on existing flows
- SessionExpiredBanner: Already working, no changes needed
- SecureStore management: Already complete, just verification needed

**Medium risk:**
- app/index.tsx routing: Core navigation logic change
  - Mitigation: deriveRoute() already tested in Step 3
  - Mitigation: Comprehensive testing of all cold start scenarios

**Medium risk:**
- Coordination between authRestore and useAuthStateListener
  - Mitigation: Idempotency guards in authRestore
  - Mitigation: Option B removes overlap entirely

**Low risk overall** - Most infrastructure already complete, mainly wiring changes.

## Conclusion

Step 5 requires modifying 5 files to integrate the auth restore pipeline with the root navigation layer. The changes are straightforward:

1. Call restoreAuthStateOnLaunch() on app mount
2. Use isHydrating instead of isInitialized
3. Use deriveRoute() instead of manual routing logic
4. Add back handlers to prevent unwanted navigation
5. Optional: Clean up useAuthStateListener to remove overlap

All supporting infrastructure (restore pipeline, session persistence, routing helpers, logout banners) is already complete from Steps 1-4. This step connects the pieces into a cohesive launch-time experience.

Expected outcome: Users see a clean loading screen during cold start, land on the correct route based on auth state, see appropriate messages for session expiry, and can't accidentally navigate back into invalid app states.
