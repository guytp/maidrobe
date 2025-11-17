# Step 3: Prefs Data Access Layer - Implementation Analysis

## Overview

This document analyzes the changes required to implement data access for the Prefs feature using React Query and Supabase. The implementation will provide:

1. A query hook (useUserPrefs) to fetch the current user's preferences row
2. A mutation hook (useSavePrefs) to create or update preferences with PATCH semantics
3. Proper error handling, validation, and telemetry
4. Privacy compliance ensuring free-text never enters analytics

## Requirements Analysis

### (a) useUserPrefs Query Hook

**Purpose:** Fetch the current user's Prefs row from Supabase

**Requirements:**
- Fetch from 'prefs' table using Supabase client
- Filter by current user's ID (from session store)
- Validate response with Zod schema (PrefsRowSchema)
- Handle null case (user has no prefs yet)
- Expose loading/error states via React Query
- Respect cache key patterns with userId inclusion
- Follow stale-while-revalidate pattern (30s stale, 5min cache)
- Classify and log errors appropriately
- Return PrefsRow | null type

**Cache Key Pattern:**
Based on existing patterns and PREFS_IMPLEMENTATION_PLAN.md:
```
['prefs', userId]
```

This allows:
- User-specific caching
- Invalidation after mutations
- Multiple users without cache collisions

### (b) useSavePrefs Mutation Hook

**Purpose:** Create or update user preferences with PATCH-like semantics

**Requirements:**
- Support both INSERT (new row) and UPDATE (existing row) operations
- Accept PrefsUpdatePayload (partial update) from UI
- Determine operation type based on existing data
- Use upsert for simplicity (INSERT ON CONFLICT UPDATE)
- Only include changed fields in update payload
- Validate payload with Zod before sending
- Invalidate query cache on success
- Log success/error events with telemetry
- NEVER pass free-text values to analytics
- Handle retry logic for network errors
- Provide user-friendly error messages

**Privacy Requirement:**
When logging success, only include boolean flags:
- noRepeatSet: boolean
- colourTendencySelected: boolean
- exclusionsSelected: boolean
- notesPresent: boolean

Never log the actual free-text content from exclusions.freeText or comfortNotes.

## Existing Patterns Analysis

### Query Pattern (from useHealthcheck.ts)

**File:** mobile/src/features/home/api/useHealthcheck.ts

**Key Patterns:**
1. Uses @tanstack/react-query's useQuery hook
2. Cache key: simple array ['healthcheck']
3. Query function: async function that calls Supabase
4. Zod validation on response data
5. Error classification (user/network/server/schema)
6. Telemetry logging via logError()
7. Returns query object with data, isLoading, error states
8. No retry configuration (defaults to 3 retries)

**Query Structure:**
```typescript
export function useHealthcheck() {
  return useQuery({
    queryKey: ['healthcheck'],
    queryFn: async () => {
      // 1. Call Supabase
      const { data, error } = await supabase.from('health').select('*').single();

      // 2. Handle Supabase errors
      if (error) {
        const classification = classifyError(error);
        logError(error, classification, { feature: 'home', operation: 'healthcheck' });
        throw new Error(getUserFriendlyMessage(classification));
      }

      // 3. Validate response with Zod
      try {
        return HealthcheckSchema.parse(data);
      } catch (validationError) {
        logError(validationError, 'schema', { feature: 'home', operation: 'healthcheck' });
        throw new Error(getUserFriendlyMessage('schema'));
      }
    },
    staleTime: 30000, // 30 seconds
    gcTime: 300000,   // 5 minutes (formerly cacheTime)
  });
}
```

### Mutation Pattern (from useSignUp.ts and useLogin.ts)

**File:** mobile/src/features/auth/api/useSignUp.ts

**Key Patterns:**
1. Uses @tanstack/react-query's useMutation hook
2. Generic types: <ResponseType, Error, RequestType, ContextType>
3. onMutate: capture timestamp for latency tracking
4. mutationFn: validate request, call API, validate response
5. Comprehensive error handling with classification
6. Retry logic with exponential backoff (retry, retryDelay)
7. onSuccess: log success event with latency, update Zustand store
8. onError: log error with latency
9. Zod validation for both request and response
10. Never retry validation errors (permanent failures)
11. User-friendly error messages from error classification

**Mutation Structure:**
```typescript
interface MutationContext {
  startTime: number;
}

export function useMutation() {
  return useMutation<Response, Error, Request, MutationContext>({
    retry: (failureCount, error) => {
      // Don't retry validation errors
      if (error.message.includes('Invalid') || error.message.includes('check your input')) {
        return false;
      }
      return failureCount < 3;
    },
    retryDelay: (attemptIndex) => {
      const baseDelay = 1000;
      const exponentialDelay = baseDelay * Math.pow(2, attemptIndex);
      const jitter = Math.random() * 1000;
      return Math.min(exponentialDelay + jitter, 30000);
    },
    onMutate: () => {
      return { startTime: Date.now() };
    },
    mutationFn: async (request) => {
      // 1. Validate request
      const validated = RequestSchema.parse(request);

      // 2. Call Supabase
      const { data, error } = await supabase.auth.signUp(validated);

      // 3. Handle errors
      if (error) {
        const normalized = handleAuthError(error, { flow: 'signup' });
        logAuthErrorToSentry(normalized, error, { flow: 'signup' });
        throw new Error(getAuthErrorMessage(normalized, 'signup'));
      }

      // 4. Validate response
      return ResponseSchema.parse(data);
    },
    onSuccess: (data, variables, context) => {
      const latency = context?.startTime ? Date.now() - context.startTime : undefined;

      // Business logic
      useStore.getState().setUser(data.user);

      // Telemetry
      logSuccess('auth', 'signup', {
        latency,
        data: { userId: data.user.id }
      });
    },
    onError: (error, variables, context) => {
      const latency = context?.startTime ? Date.now() - context.startTime : undefined;
      console.log('[Telemetry]', { status: 'error', latency });
    },
  });
}
```

### Error Classification

From examining useHealthcheck and auth hooks, errors should be classified as:
- **user**: Validation errors, invalid input
- **network**: Connection errors, timeouts
- **server**: 5xx errors, backend failures
- **schema**: Response validation failures

Classification is done before logging and determines the user-friendly message.

### Telemetry Integration

From mobile/src/core/telemetry/index.ts:

**Available Functions:**
1. `logError(error, classification, context)` - Log errors to Sentry
2. `logSuccess(feature, operation, metadata)` - Log success to OTEL
3. `getUserFriendlyMessage(classification)` - Get user message from classification

**Error Context:**
```typescript
interface ErrorContext {
  feature?: string;
  operation?: string;
  metadata?: Record<string, unknown>;
}
```

**Success Metadata:**
```typescript
interface SuccessMetadata {
  latency?: number;
  data?: Record<string, unknown>;
}
```

## Implementation Plan

### File Structure

Create new directory and files:
```
mobile/src/features/onboarding/api/
  useUserPrefs.ts    - Query hook for fetching prefs
  useSavePrefs.ts    - Mutation hook for saving prefs
```

### useUserPrefs.ts Implementation

**Exports:**
```typescript
export function useUserPrefs(): UseQueryResult<PrefsRow | null, Error>
```

**Implementation Details:**

1. **Get current user ID:**
   ```typescript
   const userId = useStore((state) => state.user?.id);
   ```

2. **Cache key with userId:**
   ```typescript
   queryKey: ['prefs', userId ?? 'anonymous']
   ```

3. **Query function:**
   - Return null if no userId (not authenticated)
   - Query: `supabase.from('prefs').select('*').eq('user_id', userId).maybeSingle()`
   - Use maybeSingle() instead of single() to handle null case gracefully
   - Validate with PrefsRowSchema if data exists
   - Return null if no row found
   - Classify and log errors

4. **Query options:**
   - staleTime: 30000 (30 seconds)
   - gcTime: 300000 (5 minutes)
   - enabled: !!userId (only run when authenticated)

5. **Error handling:**
   - Classify error as network/server/schema
   - Log with logError()
   - Throw user-friendly message
   - Let React Query handle retry

### useSavePrefs.ts Implementation

**Exports:**
```typescript
export interface SavePrefsRequest {
  userId: string;
  data: PrefsFormData;
  existingData?: PrefsFormData | null;
}

export function useSavePrefs(): UseMutationResult<PrefsRow, Error, SavePrefsRequest, MutationContext>
```

**Implementation Details:**

1. **Get query client:**
   ```typescript
   const queryClient = useQueryClient();
   ```

2. **Mutation context:**
   ```typescript
   interface MutationContext {
     startTime: number;
     userId: string;
   }
   ```

3. **onMutate:**
   - Capture startTime for latency
   - Extract userId from request
   - Return { startTime, userId }

4. **mutationFn:**
   - Determine if insert or update based on existingData
   - If existingData exists: compute changed fields with getChangedFields()
   - Build payload using toPrefsRow() or toUpdatePayload()
   - Validate payload with PrefsRowSchema or PrefsUpdatePayloadSchema
   - Use Supabase upsert for simplicity:
     ```typescript
     const { data, error } = await supabase
       .from('prefs')
       .upsert({ ...payload, user_id: userId })
       .select()
       .single();
     ```
   - Handle errors with classification
   - Validate response with PrefsRowSchema
   - Return validated response

5. **Retry logic:**
   - Don't retry validation errors (permanent)
   - Retry network/server errors up to 3 times
   - Exponential backoff: 1s, 2s, 4s + jitter

6. **onSuccess:**
   - Calculate latency
   - Invalidate query cache: `queryClient.invalidateQueries({ queryKey: ['prefs', userId] })`
   - Log success with PRIVACY-SAFE metadata:
     ```typescript
     logSuccess('onboarding', 'savePrefs', {
       latency,
       data: {
         noRepeatSet: !!data.no_repeat_days,
         colourTendencySelected: data.colour_prefs.length > 0,
         exclusionsSelected: data.exclusions.length > 0,
         notesPresent: !!data.comfort_notes,
       }
     });
     ```
   - NEVER log actual text content

7. **onError:**
   - Calculate latency
   - Log error with context
   - Console log for development

### Error Classification Logic

For both hooks, classify errors as follows:

**Network Errors:**
- Connection refused
- Timeout
- DNS resolution failure
- Offline

**Server Errors:**
- 5xx status codes
- Supabase service errors
- RLS policy violations (403)

**Schema Errors:**
- Zod validation failures
- Unexpected response shape
- Missing required fields

**User Errors:**
- Invalid input (should be caught before API call)
- Not used in these hooks (validation happens earlier)

### Privacy Compliance

**CRITICAL REQUIREMENTS:**

1. **Never log free-text values:**
   - comfortNotes content
   - exclusions.freeText content
   - Any user-entered text

2. **Safe to log:**
   - Boolean flags (noRepeatSet, colourTendencySelected, etc.)
   - Enum values (colourTendency if not 'not_sure')
   - Array lengths (exclusions.length)
   - Predefined tags (exclusion checklist items)
   - userId (non-PII identifier)
   - Latency metrics
   - Error classifications

3. **Analytics payload structure:**
   ```typescript
   {
     noRepeatSet: boolean,
     colourTendencySelected: boolean,
     exclusionsSelected: boolean,
     notesPresent: boolean,
     // NEVER include:
     // - comfortNotes: string
     // - exclusions.freeText: string
     // - any actual user text
   }
   ```

## Testing Plan

### Unit Tests for useUserPrefs

**File:** `mobile/__tests__/onboarding/useUserPrefs.test.ts`

**Test Cases:**
1. Returns null when user not authenticated
2. Fetches prefs successfully for authenticated user
3. Returns null when user has no prefs row
4. Validates response with Zod schema
5. Handles network errors appropriately
6. Handles server errors appropriately
7. Handles schema validation errors
8. Uses correct cache key with userId
9. Respects enabled flag when no userId
10. Sets correct staleTime and gcTime

### Unit Tests for useSavePrefs

**File:** `mobile/__tests__/onboarding/useSavePrefs.test.ts`

**Test Cases:**
1. Creates new prefs row when none exists
2. Updates existing prefs row with changed fields only
3. Uses upsert operation correctly
4. Validates request payload with Zod
5. Validates response with Zod
6. Invalidates query cache on success
7. Logs success with privacy-safe metadata
8. Never logs free-text content
9. Handles network errors with retry
10. Handles server errors appropriately
11. Does not retry validation errors
12. Calculates and logs latency correctly
13. Uses exponential backoff for retries
14. Provides user-friendly error messages

### Integration Testing

**Manual Testing:**
1. Fetch prefs for user with existing data
2. Fetch prefs for new user (null case)
3. Create new prefs row via mutation
4. Update existing prefs with partial changes
5. Verify cache invalidation works
6. Test offline behavior (graceful error)
7. Test network error retry behavior
8. Verify telemetry logs (check console)
9. Verify no PII in telemetry
10. Test with invalid response shape

## Dependencies

### Existing Imports Needed:

```typescript
// React Query
import { useQuery, useMutation, useQueryClient, UseQueryResult, UseMutationResult } from '@tanstack/react-query';

// Zod
import { z } from 'zod';

// Supabase
import { supabase } from '../../../services/supabase';

// Store
import { useStore } from '../../../core/state/store';

// Telemetry
import { logError, logSuccess, getUserFriendlyMessage, ErrorClassification } from '../../../core/telemetry';

// Domain types and utilities
import { PrefsRow, PrefsFormData, PrefsUpdatePayload } from '../utils/prefsTypes';
import { PrefsRowSchema, PrefsUpdatePayloadSchema } from '../utils/prefsValidation';
import { toPrefsRow, toUpdatePayload, getChangedFields } from '../utils/prefsMapping';
```

## Acceptance Criteria

### useUserPrefs:
- [x] Fetches current user's prefs row from 'prefs' table
- [x] Returns null when user has no prefs
- [x] Returns null when user not authenticated
- [x] Validates response with PrefsRowSchema
- [x] Exposes isLoading, error, data states
- [x] Uses cache key ['prefs', userId]
- [x] Respects stale-while-revalidate timing (30s/5min)
- [x] Classifies and logs errors appropriately
- [x] Provides user-friendly error messages

### useSavePrefs:
- [x] Accepts SavePrefsRequest with userId, data, existingData
- [x] Supports both insert and update operations via upsert
- [x] Only includes changed fields in update payload
- [x] Validates request payload with Zod
- [x] Validates response with Zod
- [x] Invalidates ['prefs', userId] cache on success
- [x] Logs success with latency and privacy-safe metadata
- [x] NEVER logs free-text values (comfortNotes, exclusions.freeText)
- [x] Retries network/server errors with exponential backoff
- [x] Does not retry validation errors
- [x] Provides user-friendly error messages
- [x] Exposes isLoading, error, mutate states

## Notes

1. **Upsert vs Conditional Logic:**
   Using Supabase upsert simplifies the mutation hook. It handles both insert and update cases automatically based on primary key (user_id). However, we still compute changed fields client-side to ensure analytics only tracks actual changes.

2. **Cache Invalidation:**
   After successful mutation, invalidate the query cache for the specific user's prefs. This ensures the UI reflects the latest data immediately.

3. **Error Retry Strategy:**
   Network and server errors are transient and should be retried. Validation errors are permanent and should fail immediately. This matches the pattern from useSignUp.

4. **Privacy-First Logging:**
   Free-text content is never logged. Only boolean flags indicating presence/absence of data. This protects user privacy and complies with GDPR/privacy requirements.

5. **Graceful Degradation:**
   If prefs fetch fails, the UI should show default values and allow the user to continue. Saving prefs should be non-blocking - if it fails, show a toast but still navigate forward in onboarding.

6. **maybeSingle() vs single():**
   Use maybeSingle() for the query because it returns null when no row exists, rather than throwing an error. This is the expected behavior for optional user data.

7. **Query Enabled Flag:**
   Only enable the query when userId exists. This prevents unnecessary API calls when the user is not authenticated.

8. **Response Validation:**
   Always validate Supabase responses with Zod schemas. The database schema might drift over time, and RLS policies might return unexpected structures. Validation catches these issues early.
