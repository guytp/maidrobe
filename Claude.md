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

#### ⏳ Step 3: Styling Preferences UI - Presets (PENDING)
**Goal**: Create Settings UI with preset controls (Off, 3, 7, 14, 30 days)

**Requirements**:
- New "Styling Preferences" section in Settings
- "No-repeat window" card with explanatory copy
- 5 preset buttons (0, 3, 7, 14, 30 days)
- Immediate persistence with optimistic updates
- Analytics event: `no_repeat_prefs_changed`

**Design System**:
- Colors: Charcoal #1F1F23, Off-White #F7F7F8, Eucalyptus #3FAF9F, Cobalt #3B6EFF
- Touch targets: 44px minimum
- Accessibility: WCAG AA, screen reader support

---

#### ⏳ Step 4: Advanced Controls (PENDING)
**Goal**: Add expandable Advanced section with custom input and mode selector

**Requirements**:
- Collapsible Advanced section
- Numeric input/slider (0-90 days) with validation
- Mode selector: "Key items (recommended)" vs "Exact outfit only"
- Inline error messages for invalid values
- Same persistence/analytics as presets

---

#### ⏳ Step 5: Persistence & Error Handling (PENDING)
**Goal**: Wire up React Query, rollback logic, and analytics

**Requirements**:
- Optimistic UI updates
- Rollback on failure with error message
- Retry capability
- Single analytics event per change
- Default handling for users without explicit prefs

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

### AC2: Styling Preferences UI ⏳
- [ ] Settings shows Styling Preferences section
- [ ] No-repeat window card with 5 presets
- [ ] Preset selection persists values

### AC3: Advanced Controls ⏳
- [ ] Advanced section with custom input (0-90)
- [ ] Mode selector (item vs outfit)
- [ ] Validation for invalid values

### AC4: Error Handling ⏳
- [ ] Failed saves revert UI state
- [ ] Error message with retry option

### AC5: Analytics ⏳
- [ ] `no_repeat_prefs_changed` event emitted
- [ ] Includes previous vs new values

---

## Notes
- Node.js version warning: Project requires Node 20.19.4+, current environment has 18.20.4 (non-blocking for development)
- Database migration already complete from previous work
- No-repeat filtering logic already exists in recommendations engine
- Design system tokens defined in `/mobile/src/core/theme/`

**Last Updated**: 2026-01-09 (Steps 1-2 complete)
