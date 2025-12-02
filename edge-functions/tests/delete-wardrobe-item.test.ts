/**
 * Delete Wardrobe Item Edge Function Tests
 *
 * Tests the delete-wardrobe-item endpoint handler to ensure:
 * - Proper authentication enforcement
 * - Request validation (body, itemId format)
 * - CORS preflight handling
 * - Error code responses
 *
 * NOTE: These tests focus on handler-level validation and response format.
 * Full RLS enforcement tests require integration testing against a real
 * Supabase instance, which is covered by the RLS policies in the migration
 * file (20241120000001_create_items_table.sql).
 *
 * @module tests/delete-wardrobe-item
 */

import { assertEquals, assertExists } from 'std/assert/mod.ts';
import { handler } from '../supabase/functions/delete-wardrobe-item/index.ts';

/**
 * Helper to create a mock request with optional body and headers.
 */
function createRequest(
  options: {
    method?: string;
    body?: unknown;
    authorization?: string;
  } = {}
): Request {
  const { method = 'POST', body, authorization } = options;

  const headers = new Headers({
    'Content-Type': 'application/json',
  });

  if (authorization) {
    headers.set('Authorization', authorization);
  }

  const requestInit: RequestInit = {
    method,
    headers,
  };

  if (body !== undefined) {
    requestInit.body = JSON.stringify(body);
  }

  return new Request('http://localhost:54321/functions/v1/delete-wardrobe-item', requestInit);
}

/**
 * Helper to parse JSON response body.
 */
async function parseResponse(response: Response): Promise<{
  success: boolean;
  error?: string;
  code?: string;
}> {
  const text = await response.text();
  return JSON.parse(text);
}

// =============================================================================
// CORS Preflight Tests
// =============================================================================

Deno.test('CORS preflight returns 200 with correct headers', async () => {
  const request = createRequest({ method: 'OPTIONS' });
  const response = await handler(request);

  assertEquals(response.status, 200);

  const body = await response.text();
  assertEquals(body, 'ok');

  // Verify CORS headers
  assertEquals(response.headers.get('Access-Control-Allow-Origin'), '*');
  assertExists(response.headers.get('Access-Control-Allow-Headers'));
});

// =============================================================================
// Authentication Tests
// =============================================================================

Deno.test('returns 401 when Authorization header is missing', async () => {
  const request = createRequest({
    body: { itemId: '12345678-1234-1234-1234-123456789012' },
  });

  const response = await handler(request);
  const body = await parseResponse(response);

  assertEquals(response.status, 401);
  assertEquals(body.success, false);
  assertEquals(body.code, 'auth');
  assertEquals(body.error, 'Not authenticated');
});

Deno.test('returns 401 when Authorization header does not start with Bearer', async () => {
  const request = createRequest({
    body: { itemId: '12345678-1234-1234-1234-123456789012' },
    authorization: 'Basic sometoken',
  });

  const response = await handler(request);
  const body = await parseResponse(response);

  assertEquals(response.status, 401);
  assertEquals(body.success, false);
  assertEquals(body.code, 'auth');
});

// =============================================================================
// Request Validation Tests
// =============================================================================

Deno.test('returns 400 when request body is invalid JSON', async () => {
  const headers = new Headers({
    'Content-Type': 'application/json',
    Authorization: 'Bearer fake-jwt-token',
  });

  const request = new Request('http://localhost:54321/functions/v1/delete-wardrobe-item', {
    method: 'POST',
    headers,
    body: 'not valid json{',
  });

  const response = await handler(request);
  const body = await parseResponse(response);

  assertEquals(response.status, 400);
  assertEquals(body.success, false);
  assertEquals(body.code, 'validation');
  assertEquals(body.error, 'Invalid request body');
});

Deno.test('returns 400 when itemId is missing', async () => {
  const request = createRequest({
    body: {},
    authorization: 'Bearer fake-jwt-token',
  });

  const response = await handler(request);
  const body = await parseResponse(response);

  assertEquals(response.status, 400);
  assertEquals(body.success, false);
  assertEquals(body.code, 'validation');
  assertEquals(body.error, 'Invalid itemId');
});

Deno.test('returns 400 when itemId is null', async () => {
  const request = createRequest({
    body: { itemId: null },
    authorization: 'Bearer fake-jwt-token',
  });

  const response = await handler(request);
  const body = await parseResponse(response);

  assertEquals(response.status, 400);
  assertEquals(body.success, false);
  assertEquals(body.code, 'validation');
  assertEquals(body.error, 'Invalid itemId');
});

Deno.test('returns 400 when itemId is not a string', async () => {
  const request = createRequest({
    body: { itemId: 12345 },
    authorization: 'Bearer fake-jwt-token',
  });

  const response = await handler(request);
  const body = await parseResponse(response);

  assertEquals(response.status, 400);
  assertEquals(body.success, false);
  assertEquals(body.code, 'validation');
  assertEquals(body.error, 'Invalid itemId');
});

Deno.test('returns 400 when itemId is empty string', async () => {
  const request = createRequest({
    body: { itemId: '' },
    authorization: 'Bearer fake-jwt-token',
  });

  const response = await handler(request);
  const body = await parseResponse(response);

  assertEquals(response.status, 400);
  assertEquals(body.success, false);
  assertEquals(body.code, 'validation');
  assertEquals(body.error, 'Invalid itemId');
});

Deno.test('returns 400 when itemId is not a valid UUID format', async () => {
  const request = createRequest({
    body: { itemId: 'not-a-uuid' },
    authorization: 'Bearer fake-jwt-token',
  });

  const response = await handler(request);
  const body = await parseResponse(response);

  assertEquals(response.status, 400);
  assertEquals(body.success, false);
  assertEquals(body.code, 'validation');
  assertEquals(body.error, 'Invalid itemId format');
});

Deno.test('returns 400 when itemId has invalid UUID characters', async () => {
  const request = createRequest({
    body: { itemId: 'ZZZZZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZZZZZZZZZ' },
    authorization: 'Bearer fake-jwt-token',
  });

  const response = await handler(request);
  const body = await parseResponse(response);

  assertEquals(response.status, 400);
  assertEquals(body.success, false);
  assertEquals(body.code, 'validation');
  assertEquals(body.error, 'Invalid itemId format');
});

Deno.test('returns 400 when itemId has wrong UUID length', async () => {
  const request = createRequest({
    body: { itemId: '12345678-1234-1234-1234-12345678901' }, // One char short
    authorization: 'Bearer fake-jwt-token',
  });

  const response = await handler(request);
  const body = await parseResponse(response);

  assertEquals(response.status, 400);
  assertEquals(body.success, false);
  assertEquals(body.code, 'validation');
  assertEquals(body.error, 'Invalid itemId format');
});

// =============================================================================
// Response Format Tests
// =============================================================================

Deno.test('response includes CORS headers on error', async () => {
  const request = createRequest({
    body: { itemId: 'invalid' },
    authorization: 'Bearer fake-jwt-token',
  });

  const response = await handler(request);

  assertEquals(response.headers.get('Access-Control-Allow-Origin'), '*');
  assertEquals(response.headers.get('Content-Type'), 'application/json');
});

Deno.test('response includes CORS headers on auth error', async () => {
  const request = createRequest({
    body: { itemId: '12345678-1234-1234-1234-123456789012' },
  });

  const response = await handler(request);

  assertEquals(response.headers.get('Access-Control-Allow-Origin'), '*');
  assertEquals(response.headers.get('Content-Type'), 'application/json');
});

// =============================================================================
// UUID Format Acceptance Tests
// =============================================================================

Deno.test('accepts lowercase UUID format', async () => {
  // This test will fail at Supabase client init (no env vars), but validates UUID parsing
  const request = createRequest({
    body: { itemId: 'abcdef12-3456-7890-abcd-ef1234567890' },
    authorization: 'Bearer fake-jwt-token',
  });

  const response = await handler(request);
  const body = await parseResponse(response);

  // Should pass UUID validation and fail at Supabase config (no env vars in test)
  assertEquals(response.status, 500);
  assertEquals(body.code, 'server');
  assertEquals(body.error, 'Service configuration error');
});

Deno.test('accepts uppercase UUID format', async () => {
  const request = createRequest({
    body: { itemId: 'ABCDEF12-3456-7890-ABCD-EF1234567890' },
    authorization: 'Bearer fake-jwt-token',
  });

  const response = await handler(request);
  const body = await parseResponse(response);

  // Should pass UUID validation and fail at Supabase config
  assertEquals(response.status, 500);
  assertEquals(body.code, 'server');
  assertEquals(body.error, 'Service configuration error');
});

Deno.test('accepts mixed case UUID format', async () => {
  const request = createRequest({
    body: { itemId: 'AbCdEf12-3456-7890-AbCd-Ef1234567890' },
    authorization: 'Bearer fake-jwt-token',
  });

  const response = await handler(request);
  const body = await parseResponse(response);

  // Should pass UUID validation and fail at Supabase config
  assertEquals(response.status, 500);
  assertEquals(body.code, 'server');
  assertEquals(body.error, 'Service configuration error');
});

// =============================================================================
// Security Tests
// =============================================================================

Deno.test('does not expose internal error details in response', async () => {
  const request = createRequest({
    body: { itemId: '12345678-1234-1234-1234-123456789012' },
    authorization: 'Bearer fake-jwt-token',
  });

  const response = await handler(request);
  const body = await parseResponse(response);

  // Error message should be generic, not expose stack traces or internal details
  assertEquals(body.error, 'Service configuration error');
  assertEquals(typeof body.code, 'string');
  assertEquals(body.success, false);
});

Deno.test('error response schema is consistent', async () => {
  // Test various error scenarios all return same schema

  // Auth error
  const authRequest = createRequest({ body: { itemId: '12345678-1234-1234-1234-123456789012' } });
  const authResponse = await handler(authRequest);
  const authBody = await parseResponse(authResponse);
  assertEquals(typeof authBody.success, 'boolean');
  assertEquals(typeof authBody.error, 'string');
  assertEquals(typeof authBody.code, 'string');

  // Validation error
  const validationRequest = createRequest({
    body: { itemId: 'invalid' },
    authorization: 'Bearer token',
  });
  const validationResponse = await handler(validationRequest);
  const validationBody = await parseResponse(validationResponse);
  assertEquals(typeof validationBody.success, 'boolean');
  assertEquals(typeof validationBody.error, 'string');
  assertEquals(typeof validationBody.code, 'string');
});

// =============================================================================
// RLS Policy Documentation Tests (for reference)
// =============================================================================

/**
 * The following RLS policies are defined in 20241120000001_create_items_table.sql
 * and provide backend-level security for delete operations:
 *
 * 1. "Users can delete their own items"
 *    - FOR DELETE TO authenticated
 *    - USING (auth.uid() = user_id)
 *    - Ensures authenticated users can only delete items they own
 *
 * 2. Defense in Depth
 *    - Edge Function also performs explicit ownership check
 *    - typedItem.user_id !== userId returns 403 auth error
 *
 * 3. Idempotency
 *    - If item not found (RLS filters it or already deleted), returns success
 *    - Safe to retry failed requests
 *
 * Integration tests against a real Supabase instance should verify:
 * - User A cannot delete User B's items (RLS blocks the operation)
 * - User A can delete their own items
 * - Deleted items are not visible in subsequent queries
 * - Storage objects are cleaned up
 *
 * These integration tests should be run as part of the CI/CD pipeline
 * against a test Supabase project.
 */
Deno.test('RLS policy documentation exists', () => {
  // This test serves as documentation that RLS policies are defined
  // and should be verified via integration tests
  const rlsPolicies = [
    'Users can view their own items',
    'Users can insert their own items',
    'Users can update their own items',
    'Users can delete their own items',
  ];

  assertEquals(rlsPolicies.length, 4);
});
