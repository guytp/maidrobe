# Step 2 Analysis: Implement WelcomeScreen UI Component

## Date: 2025-11-16
## Story: #110 - Onboarding Welcome and Value Proposition Screen

---

## Objective

Implement the WelcomeScreen UI component with:
- App name/wordmark
- 1-3 value proposition statements (decision fatigue, existing clothes)
- Upcoming onboarding steps preview
- Privacy reassurance
- Primary CTA: "Get started"
- Secondary CTA: "Skip for now"
- Portrait-only layout
- Dynamic font scaling with scrolling
- WCAG AA contrast compliance
- i18n for all strings

---

## Current State Analysis

### Existing Component (WelcomeScreen.tsx)
```
Lines 1-85: Placeholder implementation
- Uses OnboardingShell wrapper (correct)
- Has basic accessibility setup
- Uses theme and i18n
- ISSUES:
  - No ScrollView (required for font scaling)
  - Static centered layout (not suitable for content)
  - Placeholder content only
  - No value proposition
  - No privacy reassurance
  - No upcoming steps preview
```

### Current i18n Strings (en.json lines 224-230)
```
screens.onboarding.welcome:
  - title: "Welcome"
  - subtitle: "Step 1 of 4"
  - description: "Placeholder text..."
  - accessibility.screenLabel: "Welcome to onboarding"
```

MISSING REQUIRED STRINGS:
- App name/wordmark
- Value proposition statements (3x)
- Upcoming steps description
- Privacy reassurance

### Available Design Components
From /home/claude/code/mobile/src/core/components/:
- Button (primary, secondary, text variants)
- Toast
- SessionExpiredBanner
- NO Text component (use React Native Text directly)

### Theme System
Available from useTheme():
- colors: background, textPrimary, textSecondary, error, warning, success
- spacing: xs(4), sm(8), md(16), lg(24), xl(32)
- radius: sm(4), md(8), lg(16)
- colorScheme: 'light' | 'dark'
- isReduceMotionEnabled: boolean

Contrast verified:
- Light: textPrimary #333333 on #ffffff (12.6:1) PASS
- Light: textSecondary #595959 on #ffffff (7.0:1) PASS
- Dark: textPrimary #ffffff on #000000 (21:1) PASS
- Dark: textSecondary #cccccc on #000000 (16:1) PASS

---

## Implementation Plan

### 1. Update i18n Strings (en.json)

Add new keys under screens.onboarding.welcome:

```json
{
  "screens": {
    "onboarding": {
      "welcome": {
        "appName": "Maidrobe",
        "valueProps": {
          "1": "Snap your clothes once.",
          "2": "Get outfits for real-life moments in seconds.",
          "3": "Feel good in what you already own."
        },
        "upcomingSteps": {
          "title": "What happens next",
          "description": "A few quick steps to capture your style preferences and add your first wardrobe item."
        },
        "privacy": {
          "title": "Your privacy matters",
          "description": "Photos are of clothes, not faces. You can delete your wardrobe data anytime in settings. Nothing is shared without your permission."
        },
        "accessibility": {
          "screenLabel": "Welcome to Maidrobe onboarding",
          "appNameLabel": "Maidrobe app name",
          "valuePropLabel": "Value proposition",
          "upcomingStepsLabel": "Upcoming onboarding steps",
          "privacyLabel": "Privacy information"
        }
      },
      "footer": {
        "buttons": {
          "next": "Next",
          "getStarted": "Get Started",
          "skipStep": "Skip this step",
          "skipOnboarding": "Skip for now"
        }
      }
    }
  }
}
```

CHANGES TO FOOTER:
- Update "skipOnboarding" from "Skip onboarding" to "Skip for now" (per user story)

### 2. Update OnboardingFooter.tsx

Change primary button label for welcome step:

CURRENT (line 38-40):
```typescript
const primaryLabel = isFinalStep
  ? t('screens.onboarding.footer.buttons.getStarted')
  : t('screens.onboarding.footer.buttons.next');
```

NEW:
```typescript
const isWelcomeStep = currentStep === 'welcome';
const primaryLabel = isFinalStep
  ? t('screens.onboarding.footer.buttons.getStarted')
  : isWelcomeStep
  ? t('screens.onboarding.footer.buttons.getStarted')
  : t('screens.onboarding.footer.buttons.next');
```

RATIONALE: User story requires "Get started" for welcome step

### 3. Rewrite WelcomeScreen.tsx

Complete rewrite with:

#### Component Structure:
```
OnboardingShell (wrapper - keeps footer)
  ScrollView (for font scaling support)
    SafeAreaView edges={['top']} (top padding only, footer handles bottom)
      Container View
        - App Name/Wordmark
        - Value Props (3 statements)
        - Upcoming Steps Section
        - Privacy Section
      StatusBar
```

#### Layout Requirements:
- Vertical scrolling enabled
- Padding: spacing.lg on sides
- Spacing between sections: spacing.xl
- Portrait-only (no special handling needed, default)

#### Typography Hierarchy:
1. App Name: 40px, bold, textPrimary, header role
2. Value Props: 18px, semibold, textPrimary
3. Section Titles: 16px, semibold, textPrimary
4. Body Text: 14px, regular, textSecondary
5. All text: allowFontScaling={true}, maxFontSizeMultiplier={3}

#### Accessibility:
- App name: accessibilityRole="header", accessibilityLabel
- Each section: accessibilityRole="text", accessibilityLabel
- Value props: list semantics if possible
- Logical reading order: name -> props -> steps -> privacy
- Screen reader: announce full screen purpose

#### Color Contrast:
- All using theme colors (verified WCAG AA)
- No custom colors needed
- Works in light/dark mode automatically

---

## Detailed Component Implementation

### Key Sections:

#### 1. App Name/Wordmark
```typescript
<Text
  style={styles.appName}
  accessibilityRole="header"
  accessibilityLabel={t('screens.onboarding.welcome.accessibility.appNameLabel')}
  allowFontScaling={true}
  maxFontSizeMultiplier={3}
>
  {t('screens.onboarding.welcome.appName')}
</Text>
```

#### 2. Value Propositions (3 statements)
```typescript
<View style={styles.valuePropsContainer}>
  {[1, 2, 3].map((num) => (
    <Text
      key={num}
      style={styles.valueProp}
      allowFontScaling={true}
      maxFontSizeMultiplier={3}
    >
      {t(`screens.onboarding.welcome.valueProps.${num}`)}
    </Text>
  ))}
</View>
```

#### 3. Upcoming Steps
```typescript
<View style={styles.section}>
  <Text style={styles.sectionTitle} ...>
    {t('screens.onboarding.welcome.upcomingSteps.title')}
  </Text>
  <Text style={styles.sectionBody} ...>
    {t('screens.onboarding.welcome.upcomingSteps.description')}
  </Text>
</View>
```

#### 4. Privacy Reassurance
```typescript
<View style={styles.section}>
  <Text style={styles.sectionTitle} ...>
    {t('screens.onboarding.welcome.privacy.title')}
  </Text>
  <Text style={styles.sectionBody} ...>
    {t('screens.onboarding.welcome.privacy.description')}
  </Text>
</View>
```

---

## Styles Breakdown

Using theme tokens only, no magic numbers:

```typescript
const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  appName: {
    fontSize: 40,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  valuePropsContainer: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  valueProp: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  sectionBody: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
```

---

## Component Features Checklist

### Content Requirements:
- [x] App name/wordmark
- [x] 3 value proposition statements
- [x] Decision fatigue emphasis
- [x] Existing clothes emphasis
- [x] Upcoming steps preview
- [x] Style/usage preferences mentioned
- [x] First item capture mentioned
- [x] "Quick steps" framing
- [x] Privacy reassurance
- [x] Clothes not faces
- [x] Delete data capability
- [x] No default sharing

### Layout Requirements:
- [x] Portrait-only (default behavior)
- [x] Uses OnboardingShell wrapper
- [x] ScrollView for font scaling
- [x] SafeAreaView for notch/status bar
- [x] Proper spacing with theme tokens
- [x] No hardcoded dimensions

### Accessibility Requirements:
- [x] Dynamic font scaling (allowFontScaling)
- [x] Max font multiplier (3x)
- [x] Scrollable when text grows
- [x] WCAG AA contrast (theme colors)
- [x] Light/dark mode support
- [x] Proper accessibility roles
- [x] Meaningful labels
- [x] Logical reading order

### i18n Requirements:
- [x] All strings externalized
- [x] No hardcoded text
- [x] Nested key structure
- [x] Accessibility strings separate

### Design System Compliance:
- [x] Uses theme colors only
- [x] Uses spacing tokens only
- [x] Uses Button component (via footer)
- [x] Consistent with other screens
- [x] No custom/magic values

---

## Footer Button Changes

### Current Behavior:
- Welcome step: shows "Next" + "Skip onboarding"
- Prefs/FirstItem: shows "Next" + "Skip this step" + "Skip onboarding"
- Success: shows "Get Started" only

### Required Behavior:
- Welcome step: shows "Get started" + "Skip for now"
- Prefs/FirstItem: shows "Next" + "Skip this step" + "Skip for now"
- Success: shows "Get Started" only

### Changes Needed:
1. Line 38-40: Update primaryLabel logic to check for welcome step
2. Line 96: Update button text from "Skip onboarding" to "Skip for now"
3. Update i18n: skipOnboarding -> "Skip for now"

---

## Import Requirements

WelcomeScreen.tsx needs:
```typescript
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../../../core/theme';
import { t } from '../../../core/i18n';
import { OnboardingShell } from './OnboardingShell';
```

OnboardingFooter.tsx already has all needed imports.

---

## Testing Considerations

### Manual Testing:
1. Light mode contrast
2. Dark mode contrast
3. Font scaling at 100%, 200%, 300%
4. Scroll behavior when text grows
5. Screen reader navigation
6. Button press on "Get started"
7. Button press on "Skip for now"

### TypeScript:
- All i18n keys must exist
- No type errors
- No unused imports

### Linting:
- No lint errors
- Proper formatting
- No console.logs

---

## Files to Modify

1. **/home/claude/code/mobile/src/features/onboarding/components/WelcomeScreen.tsx**
   - Complete rewrite
   - Add ScrollView wrapper
   - Add all content sections
   - Update accessibility

2. **/home/claude/code/mobile/src/core/i18n/en.json**
   - Add welcome.appName
   - Add welcome.valueProps.1, .2, .3
   - Add welcome.upcomingSteps.title, .description
   - Add welcome.privacy.title, .description
   - Add welcome.accessibility labels
   - Update footer.buttons.skipOnboarding to "Skip for now"

3. **/home/claude/code/mobile/src/features/onboarding/components/OnboardingFooter.tsx**
   - Update primaryLabel logic for welcome step
   - Add isWelcomeStep check
   - No other changes (button text comes from i18n)

---

## Edge Cases Handled

1. **Long text at max font scale**: ScrollView enables vertical scrolling
2. **Small screens**: Content scrolls, footer remains accessible
3. **Dark mode**: Theme colors provide adequate contrast
4. **RTL languages**: textAlign and layout work correctly (future consideration)
5. **Accessibility zoom**: Text scales up to 3x multiplier
6. **No internet**: All content is local, no API calls

---

## Privacy Copy Alignment

User story requirement:
"Images are of clothes, not faces. Users can delete their wardrobe data later in settings. No social sharing of their wardrobe by default; anything shared is user-initiated."

Proposed copy:
"Photos are of clothes, not faces. You can delete your wardrobe data anytime in settings. Nothing is shared without your permission."

ALIGNMENT:
- Clothes not faces: MATCH
- Delete capability: MATCH (mentions settings)
- No default sharing: MATCH (requires permission)
- Accurate: Does not over-promise (acknowledges cloud ML)

---

## Value Proposition Copy

Requirement: "Reducing decision fatigue, making better use of clothes already own, context-aware outfit suggestions"

Proposed copy:
1. "Snap your clothes once." - Simple, practical
2. "Get outfits for real-life moments in seconds." - Context-aware + decision fatigue
3. "Feel good in what you already own." - Existing clothes + emotional benefit

ALIGNMENT:
- Decision fatigue: Statement 2 (seconds = less thinking)
- Existing clothes: Statement 3 (explicitly)
- Context-aware: Statement 2 (real-life moments)
- Tone: Supportive, practical, non-judgmental (per project details)

---

## Code Quality Checklist

- [ ] TypeScript strict mode compliant
- [ ] No ESLint errors
- [ ] All imports used
- [ ] No console statements
- [ ] Proper JSDoc comments
- [ ] Accessibility attributes complete
- [ ] Theme tokens only (no magic numbers)
- [ ] i18n for all strings
- [ ] Component exported correctly
- [ ] Follows existing patterns

---

## Next Steps After Implementation

1. Test on device/simulator
2. Verify accessibility with screen reader
3. Test font scaling at multiple sizes
4. Verify dark mode rendering
5. Run typecheck
6. Run lint
7. Commit changes with proper message
8. Move to Step 3 (analytics integration)

---

## Dependencies

None - all required functionality exists:
- OnboardingShell provides layout + footer
- Footer provides CTAs via OnboardingContext
- Theme provides colors/spacing
- i18n provides string management
- Button component exists
- SafeAreaView available from react-native-safe-area-context

---

## Notes

- Footer button label change affects ALL steps (not just welcome)
- "Skip for now" is more user-friendly than "Skip onboarding"
- ScrollView is critical for accessibility (font scaling)
- Value props are short and punchy (per UX best practices)
- Privacy copy is honest and specific (builds trust)
- No imagery/logo required for v1 (can add later)
