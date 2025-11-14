# reCAPTCHA v3 Verification Edge Function

This Edge Function verifies Google reCAPTCHA v3 tokens to protect against bot abuse and automated attacks.

## Overview

When a client attempts a sensitive action (password reset, login, etc.), this function:
1. Receives the reCAPTCHA token from the client
2. Calls Google's reCAPTCHA verification API
3. Validates the token and checks the risk score
4. Returns success/failure result

## Security Features

- Token verification happens server-side only (secret key never exposed)
- Score-based risk assessment (0.0 = likely bot, 1.0 = likely human)
- Action verification to prevent token reuse
- Fails open on errors to prevent user lockout
- No sensitive data logged

## Environment Variables

Required environment variables:

```bash
# Google reCAPTCHA v3 secret key (from Google reCAPTCHA admin console)
RECAPTCHA_SECRET_KEY=your_secret_key_here

# Optional: Minimum score threshold (0.0-1.0, default 0.5)
# Lower = more permissive, higher = more restrictive
RECAPTCHA_SCORE_THRESHOLD=0.5
```

## Google reCAPTCHA Setup

1. Go to https://www.google.com/recaptcha/admin
2. Register a new site with reCAPTCHA v3
3. Add your domains (localhost for dev, production domain for prod)
4. Copy the Site Key (for client) and Secret Key (for this function)
5. Set RECAPTCHA_SECRET_KEY in Supabase dashboard

## Request Format

```json
{
  "token": "03AGdBq27X...",
  "action": "password_reset"
}
```

## Response Format

### Success - Verification Passed
```json
{
  "success": true,
  "score": 0.9,
  "action": "password_reset"
}
```

### Failure - Verification Failed
```json
{
  "success": false,
  "score": 0.3,
  "error": "Score below threshold"
}
```

### Error - Service Unavailable (Fail Open)
```json
{
  "success": true,
  "error": "Verification service unavailable"
}
```

## Score Interpretation

Google reCAPTCHA v3 returns a score between 0.0 and 1.0:

- 0.9 - 1.0: Very likely a human
- 0.7 - 0.9: Likely a human
- 0.5 - 0.7: Neutral (default threshold)
- 0.3 - 0.5: Suspicious
- 0.0 - 0.3: Very likely a bot

**Recommended threshold: 0.5** (balanced security)

Adjust based on your needs:
- Higher threshold (0.7+): More secure, may block some legitimate users
- Lower threshold (0.3): More permissive, may allow some bots

## Error Handling

The function implements **fail-open** behavior for resilience:

- **Missing secret key**: Returns success (allows request)
- **Google API unavailable**: Returns success (allows request)
- **Network error**: Returns success (allows request)
- **Invalid token**: Returns failure (blocks request)
- **Low score**: Returns failure (blocks request)

This ensures users are never locked out due to service issues while still providing protection when the system is functioning.

## Testing

### Local Testing

Start the function locally:

```bash
supabase functions serve verify-recaptcha
```

Send a test request:

```bash
curl -X POST http://localhost:54321/functions/v1/verify-recaptcha \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "token": "test_token_123",
    "action": "test_action"
  }'
```

### Testing with Mock Tokens

The client currently generates mock tokens for testing. When the backend receives a mock token (starting with `mock_`), Google's API will reject it, but the function will fail open and allow the request.

### Testing with Real Tokens

To test with real tokens:
1. Set up reCAPTCHA site key in client
2. Implement WebView-based token generation (see client README)
3. Set RECAPTCHA_SECRET_KEY environment variable
4. Verify tokens are being validated correctly

## Deployment

Deploy using Supabase CLI:

```bash
# Deploy function
supabase functions deploy verify-recaptcha

# Set environment variables
supabase secrets set RECAPTCHA_SECRET_KEY=your_secret_key
supabase secrets set RECAPTCHA_SCORE_THRESHOLD=0.5
```

## Client Integration

The mobile app calls this function via:

```typescript
const { data, error } = await supabase.functions.invoke('verify-recaptcha', {
  body: { token, action }
});

if (!data?.success) {
  // Handle verification failure
}
```

See `mobile/src/features/auth/hooks/useRecaptcha.ts` for the full implementation.

## Monitoring

Monitor verification attempts via:
- Supabase Edge Function logs
- Google reCAPTCHA admin console (analytics)
- Client-side telemetry events

Key metrics to track:
- Verification success/failure rate
- Average score distribution
- Error rate (service unavailable, etc.)
- Geographic distribution of scores

## Troubleshooting

### "Invalid token" errors
- Ensure RECAPTCHA_SECRET_KEY matches the site key used on client
- Verify client is generating tokens correctly
- Check that tokens aren't being reused

### Low scores for legitimate users
- Lower RECAPTCHA_SCORE_THRESHOLD
- Check for accessibility issues (screen readers, automation tools)
- Review geographic distribution (some regions score lower)

### "Service unavailable" errors
- Check Google reCAPTCHA API status
- Verify network connectivity from Edge Function
- Review rate limits on Google's API

## Additional Resources

- [Google reCAPTCHA v3 Documentation](https://developers.google.com/recaptcha/docs/v3)
- [Best Practices Guide](https://developers.google.com/recaptcha/docs/faq)
- [Score Interpretation](https://developers.google.com/recaptcha/docs/v3#interpreting_the_score)
