# Password Reuse Check Edge Function

This Edge Function enforces the security requirement: "Disallow reuse of last three passwords"

## Overview

When a user attempts to reset their password, this function:

1. Receives the user ID and new password
2. Queries the `password_history` table for the user's last 3 password hashes
3. Uses bcrypt to compare the new password against each historical hash
4. Returns `{ isReused: boolean }` to indicate if the password was previously used

## Security Features

- Password sent over HTTPS (encrypted in transit)
- Comparison happens server-side using bcrypt
- Client receives only a boolean result (no hashes exposed)
- Fails open on errors to prevent user lockout
- No plaintext passwords are logged

## Database Requirements

### Required Table

```sql
CREATE TABLE password_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_password_history_user_created
  ON password_history(user_id, created_at DESC);
```

### Populating Password History

The table should be populated via a database trigger when passwords are changed.
Example trigger (adjust based on your password storage mechanism):

```sql
CREATE OR REPLACE FUNCTION record_password_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Store the new password hash in history
  INSERT INTO password_history (user_id, password_hash)
  VALUES (NEW.id, NEW.encrypted_password);

  -- Keep only the last 3 passwords per user
  DELETE FROM password_history
  WHERE id IN (
    SELECT id
    FROM password_history
    WHERE user_id = NEW.id
    ORDER BY created_at DESC
    OFFSET 3
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to auth.users table
-- Note: This assumes Supabase auth schema - adjust for your setup
CREATE TRIGGER trigger_record_password_change
  AFTER UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW
  WHEN (OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password)
  EXECUTE FUNCTION record_password_change();
```

## Request Format

```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "newPassword": "MyNewP@ssw0rd123"
}
```

## Response Format

### Success - Password Not Reused

```json
{
  "isReused": false
}
```

### Success - Password Reused

```json
{
  "isReused": true
}
```

### Error (Fail-Open)

```json
{
  "isReused": false,
  "error": "Database error"
}
```

## Error Handling

The function implements **fail-open** behavior for resilience:

- **Missing table**: Returns `isReused: false` (allows password change)
- **Database error**: Returns `isReused: false` (allows password change)
- **Comparison error**: Continues checking remaining hashes
- **Invalid request**: Returns 400 error

This ensures users are never locked out due to infrastructure issues.

## Environment Variables

Required environment variables (automatically provided by Supabase):

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for database access

## Deployment

Deploy using Supabase CLI:

```bash
supabase functions deploy check-password-reuse
```

## Testing

Test locally using Supabase CLI:

```bash
supabase functions serve check-password-reuse
```

Then send a test request:

```bash
curl -X POST http://localhost:54321/functions/v1/check-password-reuse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "newPassword": "TestP@ssw0rd123"
  }'
```

## Client Integration

The mobile app calls this function via:

```typescript
const { data, error } = await supabase.functions.invoke('check-password-reuse', {
  body: { userId, newPassword },
});

if (data?.isReused) {
  // Show error: Cannot reuse last 3 passwords
}
```

See `mobile/src/features/auth/utils/passwordReuse.ts` for the full implementation.
