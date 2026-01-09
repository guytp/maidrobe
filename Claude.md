# Maidrobe - Claude Development Context

## Project Overview
Maidrobe is a React Native mobile app for digital wardrobe management with AI-powered outfit recommendations. Users photograph clothing items, and the app provides context-aware outfit suggestions while tracking wear history to avoid repetition.

**Tech Stack**: React Native (Expo), TypeScript, Supabase (PostgreSQL + Edge Functions), React Query, Zustand

## Current Work: Story 446 - No-Repeat Preferences UX

### Goal
Introduce user-controlled "no-repeat" preferences in Settings to let users configure:
- **Window length**: How many days to avoid repeating items/outfits (0-90 days, default 7)
- **Enforcement mode**: Item-level (avoid key pieces) or outfit-level (avoid exact combinations)

### Implementation Steps

#### ✅ Step 1: Database Schema (COMPLETE)
**Status**: Schema already exists in migration `20241205000001_create_prefs_table.sql`

**Schema Details**:
- Table: `public.prefs` (1:1 with `auth.users`)
- Columns added:
  - `no_repeat_days INTEGER NOT NULL DEFAULT 7` (CHECK 0-180)
  - `no_repeat_mode TEXT NOT NULL DEFAULT 'item'` (CHECK 'item'|'outfit')
- Existing fields preserved: `colour_prefs`, `exclusions`, `comfort_notes`
- RLS policies: 4 policies enforcing user isolation
- Backfill logic: Creates defaults for existing users
- Triggers: Auto-update `updated_at`

**Files**:
- `/edge-functions/supabase/migrations/20241205000001_create_prefs_table.sql` (164 lines)
- `STEP_1_VERIFICATION.md` (verification document)

**Commit**: `6c35e45` - docs(step-1): verify prefs table schema for no-repeat preferences

---

#### ✅ Step 2: Backend Data Access Layer (COMPLETE)
**Status**: All backend logic already fully implemented

**Verified Complete**:
- [x] Edge functions include `no_repeat_days` and `no_repeat_mode` in queries
- [x] TypeScript types defined in get-outfit-recommendations/index.ts
- [x] Value normalization and clamping (0-90 for UI, 0-180 for DB)
- [x] Default handling when null (0/'item' in edge, 7/'item' in mobile)
- [x] No-repeat rules engine consumes both fields correctly
- [x] Mobile app types (PrefsRow, PrefsFormData) include fields
- [x] Mobile app Zod schemas validate UI (0-90) and DB (0-180) ranges
- [x] Mobile app API hooks (useUserPrefs, useSavePrefs) support fields
- [x] Mapping layer handles snake_case/camelCase conversion
- [x] Backward compatibility maintained

**Files**:
- Edge: `get-outfit-recommendations/index.ts`, `_shared/noRepeatRules.ts`
- Mobile: `prefsTypes.ts`, `prefsValidation.ts`, `prefsMapping.ts`, API hooks
- `STEP_2_VERIFICATION.md` (comprehensive verification)

**Commit**: `b8f55ce` - docs(step-2): verify backend data-access layer supports no-repeat prefs

---

#### ✅ Step 3: Styling Preferences UI (COMPLETE)
**Status**: Complete implementation found including Step 4 advanced controls

**Verified Complete**:
- [x] New ProfileScreen with navigation to Styling Preferences
- [x] Protected route at `/profile/styling-preferences`
- [x] StylingPreferencesScreen with all 5 preset buttons (Off, 3, 7, 14, 30 days)
- [x] Optimistic updates with React Query cache management
- [x] Success feedback ("Saved" message, auto-dismiss after 2s)
- [x] Analytics event `no_repeat_prefs_changed` with previous/new values
- [x] Advanced section with custom numeric input (0-90 validation)
- [x] Mode selector (item vs outfit) with explanatory text
- [x] Error handling with rollback and retry capability
- [x] Inline validation messages
- [x] WCAG AA accessibility compliance
- [x] Full i18n support for all strings
- [x] Theme-aware styling (light/dark mode)

**Files**:
- `/mobile/src/features/profile/components/StylingPreferencesScreen.tsx` (1007 lines)
- `/mobile/src/features/profile/components/ProfileScreen.tsx`
- `/mobile/app/profile/styling-preferences/index.tsx` (route)
- `/mobile/src/core/components/Toast.tsx` (success feedback)
- `STEP_3_VERIFICATION.md` (comprehensive verification)

**Commit**: `27fea52` - docs(step-3): verify Styling Preferences UI implementation

---

#### ✅ Step 4: Advanced Controls (COMPLETE)
**Status**: Already implemented as part of StylingPreferencesScreen

**Verified Complete**:
- [x] Collapsible Advanced section (collapsed by default, toggle button)
- [x] Custom numeric input (0-90 days) with maxLength=2
- [x] Client-side validation blocking invalid values
- [x] Inline error messages with auto-dismiss
- [x] Mode selector (item vs outfit) with radio buttons
- [x] Preset state synchronization (bidirectional)
- [x] Auto-expand for custom values on load
- [x] Same persistence function as presets (optimistic updates)
- [x] Single analytics event with before/after values

**Files**:
- Same StylingPreferencesScreen.tsx component (lines 858-999 for advanced section)
- `STEP_4_ANALYSIS.md` (comprehensive requirements analysis)
- `STEP_4_IMPLEMENTATION.md` (verification document)

**Commits**:
- `da83627` - docs(step-4): analyze advanced controls requirements
- `bb41463` - docs(step-4): verify advanced controls implementation complete

**Note**: Steps 3 and 4 were implemented together in a single comprehensive screen component

---

#### ✅ Step 5: Persistence & Error Handling (COMPLETE)
**Status**: Already fully implemented in StylingPreferencesScreen

**Verified Complete**:
- [x] React Query integration (useUserPrefs, useSavePrefs hooks)
- [x] Optimistic UI updates with cache manipulation
- [x] Complete rollback on failure (cache + UI state)
- [x] Non-blocking inline error display
- [x] Retry capability via pendingRetryData and handleRetry
- [x] Single analytics event per successful change (no_repeat_prefs_changed)
- [x] Ref-based previous value tracking (previousFormDataRef)
- [x] Default handling: 7 days, 'item' mode applied on first fetch
- [x] Transparent persistence via upsert on first save
- [x] No disruption to other profile flows

**Files**:
- Same StylingPreferencesScreen.tsx component (lines 167-256 for persistence)
- `useUserPrefs.ts`, `useSavePrefs.ts` (React Query hooks)
- `prefsMapping.ts` (default application logic)
- `STEP_5_ANALYSIS.md` (962 lines, comprehensive analysis)
- `STEP_5_IMPLEMENTATION.md` (implementation verification)

**Commit**: `8172351` - docs(step-5): analyze persistence, rollback, and analytics requirements

---

#### ⏳ Step 6: Final Verification (PENDING)
**Goal**: Validate all acceptance criteria met

---

## Code Standards Checklist
- ✅ TypeScript strict mode with no errors
- ✅ ESLint passing (no warnings)
- ✅ Feature-first organization (features/profile for Settings)
- ✅ React Query for server state
- ✅ Zod schemas for validation
- ✅ RLS policies for security
- ✅ Idempotent migrations
- ✅ Accessibility (44px targets, WCAG AA)
- ✅ Analytics events for funnel tracking
- ✅ Structured logging with correlation IDs

## Key Files & Locations

### Database
- Migrations: `/edge-functions/supabase/migrations/`
- Prefs table: `20241205000001_create_prefs_table.sql`

### Backend (Edge Functions)
- Functions: `/edge-functions/supabase/functions/`
- Shared utilities: `/edge-functions/supabase/functions/_shared/`
- No-repeat rules: `_shared/noRepeatRules.ts`

### Mobile App
- Features: `/mobile/src/features/`
- Profile/Settings: `/mobile/src/features/profile/`
- State management: `/mobile/src/core/state/`
- Theme/design: `/mobile/src/core/theme/`

### Testing
- Mobile tests: `/mobile/__tests__/`
- Edge tests: `/edge-functions/tests/`

## Development Commands
```bash
# Install dependencies
npm install

# Type checking
npm run typecheck                    # All workspaces
cd mobile && npx tsc --noEmit        # Mobile only

# Linting
npm run lint                         # All workspaces

# Testing
npm run test                         # All workspaces
npm run mobile:test                  # Mobile only

# Development
npm run mobile:start                 # Start Expo dev server
npm run edge:dev                     # Start local Supabase
```

## Branch Info
- **Current branch**: `feature/446-no-repeat-preferences-backend-model-and-styling-preferences-ux`
- **Base branch**: `main`
- **Status**: Clean working tree

## Acceptance Criteria (Story 446)

### AC1: Prefs Schema ✅
- [x] `no_repeat_days` and `no_repeat_mode` columns exist
- [x] Default values (7, 'item') configured
- [x] Backfill for existing users

### AC2: Styling Preferences UI ✅
- [x] Settings shows Styling Preferences section
- [x] No-repeat window card with 5 presets
- [x] Preset selection persists values

### AC3: Advanced Controls ✅
- [x] Advanced section with custom input (0-90)
- [x] Mode selector (item vs outfit)
- [x] Validation for invalid values

### AC4: Error Handling ✅
- [x] Failed saves revert UI state
- [x] Error message with retry option

### AC5: Analytics ✅
- [x] `no_repeat_prefs_changed` event emitted
- [x] Includes previous vs new values

---

## Notes
- Node.js version warning: Project requires Node 20.19.4+, current environment has 18.20.4 (non-blocking for development)
- Database migration already complete from previous work
- No-repeat filtering logic already exists in recommendations engine
- Design system tokens defined in `/mobile/src/core/theme/`

**Last Updated**: 2026-01-09 (Steps 1-5 complete)
