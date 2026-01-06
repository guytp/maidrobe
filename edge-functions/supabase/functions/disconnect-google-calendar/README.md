# Disconnect Google Calendar Edge Function

Handles OAuth token revocation and disconnects a user's Google Calendar integration.

## Purpose

When a user chooses to disconnect their Google Calendar from the app, this Edge Function:
1. Revokes OAuth tokens with Google's revocation API
2. Clears tokens from the database (encrypted storage)
3. Marks the integration as disconnected (`is_connected = false`)
4. Prevents future calendar sync attempts

## Security Model

- **Authentication**: Requires user's JWT (passed via Authorization header)
- **Authorization**: RLS policies ensure users can only access their own integrations
- **Token Security**:
  - Tokens are decrypted in-memory only for revocation
  - Tokens are always cleared from database after revocation attempt
  - Encryption key stored in environment variables
  - Never log actual token values

## Request

```http
POST https://your-project.supabase.co/functions/v1/disconnect-google-calendar
Content-Type: application/json
Authorization: Bearer <user-jwt>
X-Correlation-ID: <uuid>

{
  "provider": "google"
}
```

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| provider | string | Yes | Calendar provider. Currently only `"google"` is supported. |

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
    "is_connected": false,
    "connected_email": "user@gmail.com",
    "token_expires_at": null,
    "scope": null,
    "connected_at": "2024-01-01T00:00:00Z",
    "disconnected_at": "2024-01-01T00:00:05Z",
    "last_sync_at": null,
    "last_error": null,
    "error_count": 0,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:05Z"
  }
}
```

### Errors

| Code | HTTP Status | Description |
|------|-------------|-------------|
| auth | 401 | Not authenticated or missing/invalid Authorization header |
| validation | 400 | Invalid request body (missing or invalid provider) |
| notFound | 200 | Integration doesn't exist (treated as success - idempotent) |
| network | 500 | Cannot reach Google OAuth revocation API |
| server | 500 | Database error or unexpected exception |
| oauth | 500 | OAuth token revocation failed (logged but doesn't fail operation) |

### Idempotency

Calling this endpoint multiple times is safe:
- If integration is already disconnected → returns success
- If integration doesn't exist → returns success
- If tokens already cleared → returns success (already revoked or never connected)

Google's revocation API is also idempotent - revoking already revoked tokens returns success.

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| SUPABASE_URL | Your Supabase project URL |
| SUPABASE_ANON_KEY | Supabase anonymous key |
| CALENDAR_ENCRYPTION_KEY | 32-byte encryption key for tokens. Generate with: `openssl rand -hex 32` |

### Optional (for logging)

| Variable | Description |
|----------|-------------|
| ENVIRONMENT | 'development', 'staging', or 'production' |

## Database Changes

Updates the `calendar_integrations` table:

```sql
UPDATE calendar_integrations
SET 
  is_connected = false,
  access_token = null,
  refresh_token = null,
  token_expires_at = null,
  scope = null,
  disconnected_at = NOW(),
  last_error = null,
  error_count = 0,
  updated_at = NOW()
WHERE user_id = auth.uid() 
  AND provider = 'google'
```

## Google OAuth Details

This function uses the Google OAuth 2.0 token revocation endpoint:
- Endpoint: `https://oauth2.googleapis.com/revoke`
- Method: POST
- Body: `token={token}` (either access_token or refresh_token)

Prefer to revoke the refresh token when available, as revoking a refresh token revokes all associated access tokens.

**Documentation**: https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke

## Usage Example

```typescript
import { supabase } from './supabase';

async function disconnectGoogleCalendar() {
  const { data, error } = await supabase.functions.invoke(
    'disconnect-google-calendar',
    {
      body: { provider: 'google' },
    }
  );

  if (error) {
    console.error('Failed to disconnect:', error.message);
    // Show error toast to user
    return;
  }

  console.log('Successfully disconnected');
  console.log('Integration:', data.integration);
  
  // Update UI state, show success toast
  // Refetch integration status if needed
}
```

## Security Considerations

1. **Token Storage**: OAuth tokens are encrypted at rest using `CALENDAR_ENCRYPTION_KEY`
2. **Token Handling**: Tokens are only decrypted in-memory for revocation, never logged
3. **Database Cleanup**: Tokens are always cleared from DB after revocation attempt
4. **RLS Policies**: Users can only access their own integrations
5. **Error Handling**: Revocation failures don't fail the operation - tokens are still cleared from DB

## Testing

```bash
# Deploy the function
supabase functions deploy disconnect-google-calendar

# Test with curl (requires valid user JWT)
curl -X POST https://your-project.supabase.co/functions/v1/disconnect-google-calendar \
  -H "Authorization: Bearer ${USER_JWT}" \
  -H "Content-Type: application/json" \
  -d '{ "provider": "google" }'
```

## Troubleshooting

**"CALENDAR_ENCRYPTION_KEY not set"**
→ Set the environment variable in your Edge Function settings

**"Invalid provider"**
→ Only "google" is currently supported. Check request body format.

**"Authentication failed"**
→ Ensure valid JWT is passed in Authorization header. User must be authenticated.

**Tokens not being revoked**
→ Check logs for Google API errors. Tokens will still be cleared from DB to prevent sync attempts.

## Related Functions

- `connect-google-calendar` - Handles OAuth connection flow
- `refresh-google-calendar-tokens` - Scheduled job for token refresh
