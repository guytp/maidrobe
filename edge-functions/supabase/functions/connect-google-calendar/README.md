# Connect Google Calendar Edge Function

Handles OAuth token exchange for connecting a user's Google Calendar.

## Purpose

When a user chooses to connect their Google Calendar, this Edge Function:
1. Accepts the OAuth authorization code from Google
2. Exchanges it for access and refresh tokens with Google OAuth API
3. Encrypts the tokens using AES-256-GCM
4. Stores the encrypted tokens in the database
5. Marks the integration as connected

## Security Model

- **Authentication**: Requires user's JWT (passed via Authorization header)
- **Authorization**: RLS policies ensure users can only access their own integrations
- **Token Security**:
  - Tokens are decrypted in-memory only for storage
  - Tokens are encrypted at rest using CALENDAR_ENCRYPTION_KEY
  - Encryption key stored in environment variables
  - Never log actual token values
- **OAuth Flow**:
  - Uses Google OAuth 2.0 authorization code flow
  - Validates token response from Google
  - Stores only encrypted tokens in database

## Request

```http
POST https://your-project.supabase.co/functions/v1/connect-google-calendar
Authorization: Bearer <user-jwt>
X-Correlation-ID: <uuid>
Content-Type: application/json

{
  "code": "authorization_code_from_google",
  "redirectUri": "com.yourapp.app://oauth/callback"
}
```

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| code | string | Yes | Authorization code from Google OAuth flow |
| redirectUri | string | Yes | Must match the URI configured in Google Cloud Console |

### Headers

| Header | Required | Description |
|--------|----------|-------------|
| Authorization | Yes | Bearer token with user's JWT |
| X-Correlation-ID | No | UUID for request tracing. Auto-generated if not provided. |

## Response

### Success (200)

```json
{
  "success": true,
  "correlationId": "uuid-string",
  "integration": {
    "id": "uuid",
    "user_id": "uuid",
    "provider": "google",
    "is_connected": true,
    "connected_email": "user@gmail.com",
    "token_expires_at": "2024-01-01T00:00:00Z",
    "scope": "https://www.googleapis.com/auth/calendar.readonly",
    "connected_at": "2024-01-01T00:00:00Z",
    "disconnected_at": null,
    "last_sync_at": null,
    "last_error": null,
    "error_count": 0,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

### Errors

| Code | HTTP Status | Description |
|------|-------------|-------------|
| auth | 401 | Not authenticated or missing/invalid Authorization header |
| validation | 400 | Invalid request body (missing code or redirectUri) |
| oauth | 400 | Failed to exchange authorization code with Google |
| server | 500 | Database error or unexpected exception |
| encryption | 500 | Token encryption failed |

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| SUPABASE_URL | Your Supabase project URL |
| SUPABASE_ANON_KEY | Supabase anonymous key |
| CALENDAR_ENCRYPTION_KEY | 32-byte encryption key for tokens. Generate with: `openssl rand -hex 32` |
| GOOGLE_CLIENT_ID | Google OAuth 2.0 Client ID |
| GOOGLE_CLIENT_SECRET | Google OAuth 2.0 Client Secret |

### Optional (for logging)

| Variable | Description |
|----------|-------------|
| ENVIRONMENT | 'development', 'staging', or 'production' |

## Database Changes

Updates the `calendar_integrations` table:

```sql
INSERT INTO calendar_integrations (
  user_id,
  provider,
  is_connected,
  connected_email,
  access_token,
  refresh_token,
  token_expires_at,
  scope,
  connected_at,
  updated_at
) VALUES (
  auth.uid(),
  'google',
  true,
  'user@gmail.com',
  'encrypted_access_token',
  'encrypted_refresh_token',
  '2024-01-01T00:00:00Z',
  'https://www.googleapis.com/auth/calendar.readonly',
  NOW(),
  NOW()
) ON CONFLICT (user_id, provider) DO UPDATE SET
  is_connected = true,
  access_token = EXCLUDED.access_token,
  refresh_token = EXCLUDED.refresh_token,
  token_expires_at = EXCLUDED.token_expires_at,
  scope = EXCLUDED.scope,
  connected_at = EXCLUDED.connected_at,
  updated_at = NOW();
```

## Google OAuth Details

This function uses the Google OAuth 2.0 token endpoint:
- Endpoint: `https://oauth2.googleapis.com/token`
- Method: `POST`
- Body: URL-encoded parameters

**Token Exchange Parameters:**
- `code`: Authorization code
- `client_id`: From GOOGLE_CLIENT_ID
- `client_secret`: From GOOGLE_CLIENT_SECRET
- `redirect_uri`: Must match Google Cloud Console config
- `grant_type`: `authorization_code`

**Token Response:**
```json
{
  "access_token": "ya29.a0...",
  "refresh_token": "1//0g...",
  "expires_in": 3599,
  "scope": "https://www.googleapis.com/auth/calendar.readonly",
  "token_type": "Bearer"
}
```

**Documentation**: https://developers.google.com/identity/protocols/oauth2/web-server#exchange-authorization-code

## Usage Example

```typescript
import { supabase } from './supabase';

async function connectGoogleCalendar(code: string, redirectUri: string) {
  const { data, error } = await supabase.functions.invoke(
    'connect-google-calendar',
    {
      body: {
        code,
        redirectUri,
      },
    }
  );

  if (error) {
    console.error('Connection failed:', error.message);
    // Show error toast to user
    return;
  }

  console.log('Successfully connected:', data.integration);
  // Update UI to show connected status
  // Show success toast to user
}
```

## Integration with Mobile App

### Expo AuthSession Setup

```typescript
import * as AuthSession from 'expo-auth-session';

// In your CalendarIntegrationScreen component
const [request, response, promptAsync] = AuthSession.useAuthRequest(
  {
    clientId: GOOGLE_CLIENT_ID,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    redirectUri: 'com.yourapp.app://oauth/callback',
  },
  { authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth' }
);

// When user taps "Connect Google Calendar"
const handleConnect = async () => {
  const result = await promptAsync();
  
  if (result.type === 'success') {
    // Extract authorization code
    const { code } = result.params;
    
    // Call Edge Function
    await connectGoogleCalendar(code, 'com.yourapp.app://oauth/callback');
  }
};
```

### Environment Setup

1. **Google Cloud Console**:
   - Go to https://console.cloud.google.com/apis/credentials
   - Create OAuth 2.0 Client ID
   - Application type: iOS/Android
   - Add redirect URI: `com.yourapp.app://oauth/callback`
   - Note the Client ID and Client Secret

2. **Supabase Project**:
   - Add environment variables to Edge Functions settings
   - Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
   - Generate and set CALENDAR_ENCRYPTION_KEY (32 bytes)

3. **Mobile App**:
   - Add `expo-auth-session` dependency
   - Configure deep linking for redirect URI
   - Use the connect function after OAuth completes

## Security Considerations

1. **Token Encryption**: Always encrypt tokens before storing in database
2. **Environment Variables**: Never commit secrets to repository
3. **Key Management**: Use strong 32-byte keys, rotate carefully
4. **OAuth Scopes**: Request minimal scopes needed (calendar.readonly)
5. **Redirect URIs**: Use app-specific URIs, validate in production
6. **Error Handling**: Don't expose Google error details to clients
7. **Audit Logging**: Log all token operations (without exposing values)

## Testing

```bash
# Deploy the function
supabase functions deploy connect-google-calendar

# Test with a real authorization code (from OAuth flow)
curl -X POST https://your-project.supabase.co/functions/v1/connect-google-calendar \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "4/0AfJoh...",
    "redirectUri": "com.yourapp.app://oauth/callback"
  }'
```

## Troubleshooting

**"CALENDAR_ENCRYPTION_KEY not set"**
→ Set the environment variable in your Edge Function settings

**"Invalid authorization code"**
→ Check that the code is from a completed OAuth flow
→ Verify the redirect URI matches your Google Cloud Console config

**"Google OAuth token exchange failed"**
→ Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
→ Verify the redirect URI is registered in Google Cloud Console
→ Ensure the authorization code hasn't expired (they're single-use)

**"Token encryption failed"**
→ Verify CALENDAR_ENCRYPTION_KEY is exactly 32 bytes
→ Check that key contains only valid hex characters

**"Failed to store calendar integration"**
→ Check database connection and RLS policies
→ Verify user_id matches the authenticated user

## Related Functions

- `disconnect-google-calendar` - Handles OAuth token revocation
- `refresh-google-calendar-tokens` - Scheduled job for token refresh
