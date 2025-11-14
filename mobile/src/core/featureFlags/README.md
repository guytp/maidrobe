# Feature Flags

Maidrobe's feature flag system provides remote configuration and version compatibility enforcement for mobile app features. This document describes the available feature flags, configuration, and usage patterns.

## Overview

The feature flag system enables:
- **Remote Feature Control**: Enable/disable features via environment variables
- **Version Compatibility**: Enforce minimum client versions for breaking changes
- **Gradual Rollouts**: Deploy features incrementally to different environments
- **Fail-Safe Behavior**: Features default to enabled to prevent user lockout
- **Offline Support**: Environment-based configuration survives network issues

### Architecture

Current implementation uses environment variables read at build time. The system is designed to migrate to Unleash or similar feature flag services while maintaining the same interface.

```
Client App -> checkFeatureFlag() -> Environment Variables -> Flag Decision
                                 -> Version Comparison -> Compatibility Check
```

## Available Feature Flags

### auth.login

**Purpose**: Controls availability of the login authentication flow.

**Default State**:
- Development: `true` (enabled)
- Staging: `true` (enabled)
- Production: `true` (enabled)

**Affected Flows**:
- `/auth/login` screen
- Session authentication
- Credential validation

**Configuration**:
```bash
EXPO_PUBLIC_FEATURE_AUTH_LOGIN_ENABLED=true
EXPO_PUBLIC_FEATURE_AUTH_LOGIN_MIN_VERSION=0.0.0
```

**When Disabled**: Login screen shows "Feature temporarily unavailable" message.

---

### auth.signup

**Purpose**: Controls availability of the signup/registration flow.

**Default State**:
- Development: `true` (enabled)
- Staging: `true` (enabled)
- Production: `true` (enabled)

**Affected Flows**:
- `/auth/signup` screen
- Account creation
- Email verification flow

**Configuration**:
```bash
EXPO_PUBLIC_FEATURE_AUTH_SIGNUP_ENABLED=true
EXPO_PUBLIC_FEATURE_AUTH_SIGNUP_MIN_VERSION=0.0.0
```

**When Disabled**: Signup screen shows "Registration temporarily unavailable" message.

---

### auth.logout

**Purpose**: Controls availability of the logout functionality.

**Default State**:
- Development: `true` (enabled)
- Staging: `true` (enabled)
- Production: `true` (enabled)

**Affected Flows**:
- Logout button/action
- Session termination
- Local state cleanup

**Configuration**:
```bash
EXPO_PUBLIC_FEATURE_AUTH_LOGOUT_ENABLED=true
EXPO_PUBLIC_FEATURE_AUTH_LOGOUT_MIN_VERSION=0.0.0
```

**When Disabled**: Logout functionality is hidden or disabled.

---

### auth.recaptcha

**Purpose**: Enables Google reCAPTCHA v3 verification for authentication flows to prevent bot abuse and automated attacks. When enabled, sensitive auth operations include an invisible CAPTCHA challenge that verifies users are human based on behavioral analysis.

**Default State**:
- Development: `false` (disabled - easier testing without CAPTCHA)
- Staging: `false` (disabled until WebView integration complete)
- Production: `false` (disabled - pending full implementation)

**Affected Flows**:
- **Forgot Password Flow**: Adds optional reCAPTCHA verification before sending reset email
  - Location: `ForgotPasswordScreen` (password reset request)
  - Behavior: Executes CAPTCHA before calling password reset API
  - Fail-open: If verification fails or is unavailable, request still proceeds

- **Reset Password Flow**: Adds optional reCAPTCHA verification before password change
  - Location: `ResetPasswordScreen` (password change confirmation)
  - Behavior: Executes CAPTCHA before submitting new password
  - Fail-open: If verification fails or is unavailable, reset still proceeds

**How It Works**:
1. Client generates reCAPTCHA token (currently mock, WebView integration pending)
2. Token sent to Supabase Edge Function `verify-recaptcha`
3. Edge Function validates token with Google's API
4. Google returns score (0.0 = bot, 1.0 = human)
5. Score compared against threshold (default: 0.5)
6. Result returned to client (success/failure)

**Implementation Status**:
- Backend Verification: **IMPLEMENTED**
  - Edge Function: `edge-functions/supabase/functions/verify-recaptcha`
  - Google reCAPTCHA v3 integration complete
  - Score-based risk assessment working
  - Fail-open error handling implemented

- Client Integration: **PARTIAL**
  - Hook: `mobile/src/features/auth/hooks/useRecaptcha.ts`
  - Mock token generation for testing
  - Backend communication working
  - WebView integration **PENDING** (blocks production use)

**Dependencies**:

Backend (Supabase):
- Environment variable: `RECAPTCHA_SECRET_KEY` (from Google reCAPTCHA admin)
- Environment variable: `RECAPTCHA_SCORE_THRESHOLD` (default: 0.5)
- Edge Function: `verify-recaptcha` deployed and accessible

Client (Mobile):
- Environment variable: `EXPO_PUBLIC_FEATURE_AUTH_RECAPTCHA_ENABLED`
- Environment variable: `EXPO_PUBLIC_RECAPTCHA_SITE_KEY` (future - for WebView)
- Package: `react-native-webview` (future - for real token generation)

Google reCAPTCHA:
- Site registered at https://www.google.com/recaptcha/admin
- reCAPTCHA v3 enabled
- Domains configured (localhost, staging, production)

**Configuration**:
```bash
# Enable/disable the feature
EXPO_PUBLIC_FEATURE_AUTH_RECAPTCHA_ENABLED=false

# Minimum client version (future use for breaking changes)
EXPO_PUBLIC_FEATURE_AUTH_RECAPTCHA_MIN_VERSION=0.0.0

# reCAPTCHA site key for client (future - WebView integration)
EXPO_PUBLIC_RECAPTCHA_SITE_KEY=your_site_key_here
```

**When Disabled**:
- CAPTCHA verification is skipped entirely
- Auth flows proceed normally without bot detection
- No tokens generated or verified
- Telemetry logs "recaptcha-skipped" event

**When Enabled**:
- CAPTCHA verification executes before sensitive operations
- Currently uses mock tokens (testing only)
- Verification fails open (allows request on error)
- Telemetry logs verification attempts and results

**Security Considerations**:
- **Fail-Open Design**: Service unavailability never blocks legitimate users
- **Score-Based**: Threshold (0.5) balances security vs. user friction
- **Invisible**: reCAPTCHA v3 has no user interaction (no checkboxes)
- **Privacy**: No sensitive data sent to Google (only behavioral signals)
- **Rate Limiting**: CAPTCHA complements (not replaces) rate limiting

**Rollout Plan**:

**Phase 1: Backend Verification Ready** (COMPLETE)
- Edge Function deployed
- Google reCAPTCHA v3 integration tested
- Score threshold configured
- Fail-open behavior verified

**Phase 2: Client Mock Integration** (COMPLETE)
- useRecaptcha hook implemented
- Mock token generation for testing
- Feature flag integration complete
- Telemetry events logging

**Phase 3: WebView Integration** (PENDING - Required for Production)
- Add `react-native-webview` dependency
- Create RecaptchaWebView component
- Load reCAPTCHA v3 script in hidden WebView
- Implement postMessage bridge for token extraction
- Replace mock tokens with real tokens
- Test on iOS and Android devices

**Phase 4: Internal Testing** (PENDING)
- Enable flag in development builds
- Test with real reCAPTCHA tokens
- Verify score distribution
- Test edge cases (network failures, timeouts)
- Validate fail-open behavior

**Phase 5: Staging Deployment** (PENDING)
- Enable flag in staging environment
- Monitor verification success rate
- Identify false positives
- Tune score threshold if needed
- Load test verification endpoint

**Phase 6: Baseline Metrics** (PENDING)
- Measure current abuse rates without CAPTCHA
- Establish baseline for comparison
- Identify abuse patterns
- Determine target success rate

**Phase 7: Production Rollout** (PENDING)
- Enable for 10% of production traffic
- Monitor metrics: success rate, false positives, abuse prevention
- Gradually increase to 25%, 50%, 75%, 100%
- Roll back if issues detected
- Document lessons learned

**Metrics to Monitor**:
- Verification success rate (target: >95%)
- Average score distribution
- False positive rate (legitimate users blocked)
- Abuse prevention effectiveness
- Service availability
- Latency impact
- Geographic score variations

**Troubleshooting**:

*Low scores for legitimate users:*
- Lower `RECAPTCHA_SCORE_THRESHOLD` (e.g., 0.3)
- Check for accessibility issues (screen readers)
- Review geographic distribution

*High false positive rate:*
- Verify fail-open behavior working
- Check network connectivity
- Review Google reCAPTCHA dashboard

*Service unavailable errors:*
- Verify `RECAPTCHA_SECRET_KEY` configured
- Check Edge Function logs
- Validate Google API status

**Related Documentation**:
- Backend Implementation: `edge-functions/supabase/functions/verify-recaptcha/README.md`
- Client Hook: `mobile/src/features/auth/hooks/useRecaptcha.ts`
- Feature Flag Module: `mobile/src/core/featureFlags/index.ts`
- Google Docs: https://developers.google.com/recaptcha/docs/v3

---

## Configuration

Feature flags are configured via environment variables using a consistent naming convention.

### Naming Convention

For a feature flag named `category.feature`:

- **Enable/Disable**: `EXPO_PUBLIC_FEATURE_CATEGORY_FEATURE_ENABLED`
- **Minimum Version**: `EXPO_PUBLIC_FEATURE_CATEGORY_FEATURE_MIN_VERSION`

Examples:
- `auth.login` -> `EXPO_PUBLIC_FEATURE_AUTH_LOGIN_ENABLED`
- `auth.recaptcha` -> `EXPO_PUBLIC_FEATURE_AUTH_RECAPTCHA_ENABLED`

### Environment Variables

**Flag State** (boolean):
```bash
EXPO_PUBLIC_FEATURE_{FLAG_NAME}_ENABLED=true|false
```
- Accepts: `true`, `false`, `1`, `0`, `yes`, `no` (case-insensitive)
- Default: `true` (fail-safe - features enabled by default)

**Minimum Version** (semver):
```bash
EXPO_PUBLIC_FEATURE_{FLAG_NAME}_MIN_VERSION=1.2.3
```
- Format: `major.minor.patch` (e.g., `1.2.3`)
- Default: `0.0.0` (no restriction)
- Purpose: Force app updates for breaking API changes

**Update Message** (string):
```bash
EXPO_PUBLIC_FEATURE_UPDATE_MESSAGE=Please update your app to continue.
```
- Shown when client version is below minimum required
- Default: "Please update your app to continue."

### Configuration Files

Development:
```bash
# .env.development
EXPO_PUBLIC_FEATURE_AUTH_RECAPTCHA_ENABLED=false
EXPO_PUBLIC_FEATURE_AUTH_LOGIN_ENABLED=true
```

Staging:
```bash
# .env.staging
EXPO_PUBLIC_FEATURE_AUTH_RECAPTCHA_ENABLED=false
EXPO_PUBLIC_FEATURE_AUTH_LOGIN_ENABLED=true
```

Production:
```bash
# .env.production
EXPO_PUBLIC_FEATURE_AUTH_RECAPTCHA_ENABLED=false
EXPO_PUBLIC_FEATURE_AUTH_LOGIN_ENABLED=true
EXPO_PUBLIC_FEATURE_AUTH_LOGIN_MIN_VERSION=1.0.0
```

## Usage

### Checking Feature Flags

Feature flags are checked asynchronously using `checkFeatureFlag()`:

```typescript
import { checkFeatureFlag } from '@/core/featureFlags';

async function handleSensitiveOperation() {
  const flag = await checkFeatureFlag('auth.recaptcha');

  if (flag.requiresUpdate) {
    // Client version too old
    throw new Error(flag.message || 'Please update your app.');
  }

  if (!flag.enabled) {
    // Feature disabled
    throw new Error('This feature is temporarily unavailable.');
  }

  // Feature enabled and version compatible
  await performOperation();
}
```

### Synchronous Flag Check

For simple enabled/disabled checks (no version validation):

```typescript
import { checkFeatureFlag } from '@/core/featureFlags';

const useMyFeature = () => {
  const [isEnabled, setIsEnabled] = useState(false);

  useEffect(() => {
    checkFeatureFlag('auth.recaptcha').then(flag => {
      setIsEnabled(flag.enabled && !flag.requiresUpdate);
    });
  }, []);

  return isEnabled;
};
```

### Conditional Rendering

```typescript
import { checkFeatureFlag } from '@/core/featureFlags';

export function MyComponent() {
  const [canUseFeature, setCanUseFeature] = useState(false);

  useEffect(() => {
    checkFeatureFlag('auth.recaptcha').then(flag => {
      setCanUseFeature(flag.enabled && !flag.requiresUpdate);
    });
  }, []);

  if (!canUseFeature) {
    return <FeatureDisabledMessage />;
  }

  return <FeatureContent />;
}
```

### In API Hooks

```typescript
import { checkFeatureFlag } from '@/core/featureFlags';

export function useMyApiCall() {
  return useMutation(async (data) => {
    const flag = await checkFeatureFlag('auth.recaptcha');

    if (!flag.enabled || flag.requiresUpdate) {
      throw new Error('Feature unavailable');
    }

    return apiClient.post('/endpoint', data);
  });
}
```

## Adding New Feature Flags

To add a new feature flag:

### 1. Update Type Definition

Edit `mobile/src/core/featureFlags/index.ts`:

```typescript
export type FeatureFlagName =
  | 'auth.login'
  | 'auth.signup'
  | 'auth.logout'
  | 'auth.recaptcha'
  | 'your.newFlag';  // Add here
```

### 2. Configure Environment Variables

Add to `.env.development`, `.env.staging`, `.env.production`:

```bash
EXPO_PUBLIC_FEATURE_YOUR_NEWFLAG_ENABLED=true
EXPO_PUBLIC_FEATURE_YOUR_NEWFLAG_MIN_VERSION=0.0.0
```

### 3. Document the Flag

Add a section to this README following the template:

```markdown
### your.newFlag

**Purpose**: Brief description of what this flag controls.

**Default State**:
- Development: true/false
- Staging: true/false
- Production: true/false

**Affected Flows**: List affected screens, APIs, or features.

**Configuration**: Environment variables.

**When Disabled**: What happens when flag is off.
```

### 4. Use in Code

```typescript
const flag = await checkFeatureFlag('your.newFlag');
if (flag.enabled && !flag.requiresUpdate) {
  // Use feature
}
```

## Version Compatibility

The feature flag system enforces minimum client versions to prevent incompatible clients from accessing features with breaking changes.

### How It Works

1. Client version defined in `mobile/src/core/featureFlags/index.ts`:
```typescript
const CLIENT_VERSION: ClientVersion = {
  major: 0,
  minor: 1,
  patch: 0,
};
```

2. Minimum version specified in environment variable:
```bash
EXPO_PUBLIC_FEATURE_AUTH_LOGIN_MIN_VERSION=1.2.0
```

3. Version comparison:
   - If CLIENT_VERSION < MIN_VERSION: `requiresUpdate = true`
   - If CLIENT_VERSION >= MIN_VERSION: `requiresUpdate = false`

### Semver Comparison

Versions are compared hierarchically:
- Major version mismatch: incompatible
- Minor version mismatch: incompatible (when major matches)
- Patch version mismatch: incompatible (when major and minor match)

Example:
- Client: `0.1.0`
- Required: `1.0.0`
- Result: `requiresUpdate = true`

### Update Messages

When `requiresUpdate = true`, show the configured message:

```typescript
const flag = await checkFeatureFlag('auth.login');
if (flag.requiresUpdate) {
  Alert.alert('Update Required', flag.message);
  // Redirect to app store
}
```

## Migration to Unleash

The current environment-variable-based system will migrate to Unleash for advanced features:

**Planned Features**:
- User targeting (% rollouts, user IDs, segments)
- A/B testing and experiments
- Real-time flag updates without app rebuild
- Gradual rollouts with automatic rollback
- Analytics and metrics dashboard

**Migration Path**:
1. Set up Unleash server or use hosted service
2. Configure environment variables:
   - `EXPO_PUBLIC_UNLEASH_URL`
   - `EXPO_PUBLIC_UNLEASH_CLIENT_KEY`
   - `EXPO_PUBLIC_UNLEASH_APP_NAME`
3. Add `unleash-proxy-client` dependency
4. Initialize Unleash SDK in `app/_layout.tsx`
5. Update `checkFeatureFlag()` to call Unleash SDK
6. Maintain same interface for backward compatibility
7. Migrate flags one by one to Unleash dashboard
8. Test with gradual rollouts
9. Monitor flag evaluation metrics

**Interface Compatibility**:

The `FeatureFlagResult` interface will remain the same:
```typescript
interface FeatureFlagResult {
  enabled: boolean;
  requiresUpdate: boolean;
  message?: string;
}
```

Unleash will populate these fields from:
- `enabled`: Unleash SDK `isEnabled()` result
- `requiresUpdate`: Version comparison using flag metadata
- `message`: Custom message from flag variant

## Testing

### Unit Tests

Mock feature flags in tests:

```typescript
import { checkFeatureFlag } from '@/core/featureFlags';

jest.mock('@/core/featureFlags', () => ({
  checkFeatureFlag: jest.fn(),
}));

it('should handle disabled feature', async () => {
  (checkFeatureFlag as jest.Mock).mockResolvedValue({
    enabled: false,
    requiresUpdate: false,
  });

  // Test feature disabled behavior
});
```

### Integration Tests

Set environment variables:

```bash
EXPO_PUBLIC_FEATURE_AUTH_RECAPTCHA_ENABLED=true
npm test
```

### Manual Testing

Toggle flags in `.env.development`:

```bash
# Disable CAPTCHA for testing
EXPO_PUBLIC_FEATURE_AUTH_RECAPTCHA_ENABLED=false
npm run mobile:start
```

## Monitoring

### Telemetry Events

Feature flag checks should emit telemetry:

```typescript
const flag = await checkFeatureFlag('auth.recaptcha');
logEvent('feature-flag-checked', {
  flag: 'auth.recaptcha',
  enabled: flag.enabled,
  requiresUpdate: flag.requiresUpdate,
});
```

### Key Metrics

Monitor:
- Flag check frequency per flag
- Enabled/disabled ratio
- Version compatibility issues
- Error rates

### Debugging

Enable debug logging:

```typescript
// Feature flag checks log to console automatically
console.log('[FeatureFlags] Checking auth.recaptcha');
console.log('[FeatureFlags] Result:', { enabled: true, requiresUpdate: false });
```

## Best Practices

1. **Default to Enabled**: Use fail-safe defaults (`enabled: true`) to prevent lockout
2. **Version Carefully**: Only use version requirements for breaking changes
3. **Document Thoroughly**: Update this README when adding flags
4. **Test Disabled State**: Always test feature behavior when flag is off
5. **Monitor Metrics**: Track flag usage and impact
6. **Gradual Rollouts**: Use staged deployments (dev -> staging -> prod)
7. **Clear Naming**: Use descriptive flag names (category.feature format)
8. **Fail Open**: Handle flag check errors gracefully

## Support

For questions or issues:
- Feature flag implementation: `mobile/src/core/featureFlags/`
- Backend verification: `edge-functions/supabase/functions/verify-recaptcha/`
- Documentation updates: This file (`mobile/src/core/featureFlags/README.md`)
