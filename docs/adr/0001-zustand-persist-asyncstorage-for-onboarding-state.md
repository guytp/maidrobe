# ADR-0001: Zustand Persist with AsyncStorage for Onboarding State

## Status

Accepted

## Context

The Maidrobe mobile app requires persistent onboarding state management to support the following requirements:

1. **Session Resumption**: Users should be able to resume onboarding from where they left off after closing and reopening the app
2. **State Validation**: Persisted state must be validated on rehydration to prevent crashes from corrupted data
3. **Migration Support**: Schema changes should be handled gracefully with version-aware migration logic
4. **Reactivity**: UI components must reactively update when onboarding state changes
5. **Type Safety**: State management should leverage TypeScript for compile-time safety
6. **Small Bundle Size**: Minimize JavaScript bundle size for mobile app performance
7. **Developer Experience**: Minimize boilerplate and cognitive overhead

The onboarding state is relatively simple, consisting of:

- `currentStep`: The current active step or null
- `completedSteps`: Array of steps completed via primary action
- `skippedSteps`: Array of steps skipped via skip action

The state is local to the device and does not require server synchronization during onboarding (server sync of `hasOnboarded` flag is planned for a future story).

The project already uses:

- **Zustand** for local/ephemeral UI state management
- **React Query** for server state and caching
- **React Native** with Expo (mobile-only, no web target)

## Decision

We will use **Zustand persist middleware with AsyncStorage** for onboarding state management.

**Implementation Details:**

- Store location: `mobile/src/features/onboarding/store/onboardingSlice.ts`
- Storage key: `maidrobe-onboarding-state`
- Storage backend: `@react-native-async-storage/async-storage`
- Version: 1 (with migration function for future schema changes)
- Validation: Custom `validatePersistedState()` function ensures data integrity

**State Invariants Enforced:**

- No duplicates in `completedSteps` or `skippedSteps` arrays
- A step cannot appear in both arrays simultaneously
- `currentStep` must be a valid `OnboardingStep` or `null`

## Consequences

### Positive

1. **Minimal Boilerplate**: Zustand requires significantly less code than Redux or React Query for local state
2. **Built-in Persistence**: The persist middleware handles AsyncStorage integration automatically
3. **Type Safety**: Full TypeScript support with inferred types throughout the codebase
4. **Small Bundle Size**: Zustand is ~1KB gzipped vs Redux (~8KB) + Redux Persist (~5KB)
5. **Consistent Stack**: Reuses Zustand already in use for other local state (auth, theme)
6. **Automatic Reactivity**: Components using `useStore` hooks automatically re-render on state changes
7. **Migration Support**: Built-in migration function handles schema evolution across versions
8. **Validation Support**: Custom validation logic prevents crashes from corrupted persisted data
9. **Developer Experience**: Simple API with minimal learning curve for team members
10. **Testing**: Easy to test with straightforward mocking and no provider setup overhead

### Negative

1. **Smaller Ecosystem**: Less third-party tooling and extensions compared to Redux
2. **Manual Migration Logic**: Version migrations must be implemented manually (vs automatic with some alternatives)
3. **AsyncStorage Limitations**: 6MB storage limit on Android (acceptable for small onboarding state)
4. **Less Opinionated**: No enforced patterns like Redux's actions/reducers (requires discipline)
5. **Newer Library**: Less battle-tested in large-scale production apps than Redux

### Neutral

1. **AsyncStorage is Asynchronous**: Initial load shows loading state (acceptable UX)
2. **No DevTools**: Unlike Redux, no time-travel debugging (but Zustand has basic devtools)
3. **Feature-Specific**: State is scoped to onboarding feature (not global like Redux store)

## Alternatives Considered

### 1. React Query with queryClient.setQueryData

**Pros:**

- Already in use for server state management
- Built-in caching and stale-while-revalidate patterns
- Automatic background refetching and retry logic
- Excellent DevTools for debugging

**Cons:**

- Designed for server state, not local UI state
- Requires manual persistence logic (no built-in persist middleware)
- Query keys and cache invalidation add complexity for simple local state
- Would need custom hooks to wrap queryClient API for state updates
- Overkill for state that never comes from a server

**Verdict:** Not suitable - designed for different use case

### 2. Redux with Redux Persist

**Pros:**

- Most mature and battle-tested state management solution
- Large ecosystem of middleware and tools
- Excellent DevTools with time-travel debugging
- Well-documented patterns and best practices
- Redux Persist is mature and feature-rich

**Cons:**

- Significantly more boilerplate (actions, reducers, action creators, types)
- Larger bundle size (~13KB for Redux + Redux Persist vs ~1KB for Zustand)
- Redux not currently in the tech stack (would introduce new dependency)
- Steeper learning curve for team members
- Overkill for simple onboarding state

**Verdict:** Too heavy for the use case, adds unnecessary complexity

### 3. Plain AsyncStorage (No State Management)

**Pros:**

- Direct control over storage operations
- No additional dependencies
- Minimal bundle size impact
- Simple and explicit

**Cons:**

- Manual state management with useState/useContext
- No automatic reactivity across components
- Verbose code for reading/writing/subscribing to storage
- Manual serialization/deserialization
- No built-in validation or migration support
- Difficult to test
- Reinventing the wheel for state management

**Verdict:** Too low-level, lacks necessary abstractions

### 4. Expo SecureStore

**Pros:**

- Encrypted storage for sensitive data
- Built into Expo SDK
- Simple API similar to AsyncStorage

**Cons:**

- Storage size limit (~2KB on iOS, larger on Android)
- Slower than AsyncStorage due to encryption
- Overkill for non-sensitive onboarding preferences
- Still requires state management layer on top

**Verdict:** Unnecessary security overhead for non-sensitive data

### 5. MMKV (react-native-mmkv)

**Pros:**

- Very fast (synchronous API)
- Larger storage capacity than AsyncStorage
- Efficient binary storage format
- Good for high-frequency reads/writes

**Cons:**

- Additional native dependency (requires native builds)
- More complex setup than AsyncStorage
- Synchronous API can block UI thread if misused
- Overkill for infrequent onboarding state updates
- Still requires state management layer on top

**Verdict:** Performance benefits not needed for onboarding use case

## Implementation

The implementation can be found in:

- **State Store**: `mobile/src/features/onboarding/store/onboardingSlice.ts`
- **Unit Tests**: `mobile/__tests__/onboarding/onboardingSlice.test.ts` (55 tests)
- **Feature Documentation**: `mobile/src/features/onboarding/README.md`

Key implementation features:

- Version 1 schema with migration function for future changes
- `validatePersistedState()` function validates all persisted data
- State invariants enforced via helper functions (`addToArrayUnique`, `removeFromArray`)
- Comprehensive test coverage for validation, migration, and state mutations

## References

- **Zustand Documentation**: https://docs.pmnd.rs/zustand
- **Zustand Persist Middleware**: https://docs.pmnd.rs/zustand/integrations/persisting-store-data
- **AsyncStorage Documentation**: https://react-native-async-storage.github.io/async-storage/
- **Onboarding Feature README**: `mobile/src/features/onboarding/README.md`
- **Implementation PR**: Story #102 - Onboarding Flow Shell

## Notes

This decision is specific to onboarding state management. Other parts of the application use:

- **React Query**: For server state, caching, and API interactions
- **Zustand**: For other local UI state (auth session, theme, feature flags)

If future requirements include server-side synchronization of onboarding progress, we may need to migrate to React Query or implement a hybrid approach with Zustand for local state and React Query for server sync.

## Date

2024-11-16

## Authors

- Development Team
