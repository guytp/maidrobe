/**
 * Healthcheck Edge Function Tests
 *
 * Tests the healthcheck endpoint handler to ensure it returns the expected response.
 */

import { assertEquals } from 'std/assert/mod.ts';
import { handler } from '../supabase/functions/healthcheck/index.ts';

Deno.test('healthcheck handler returns 200 OK status', async () => {
  const request = new Request('http://localhost:54321/functions/v1/healthcheck');
  const response = handler(request);

  assertEquals(response.status, 200);
});

Deno.test('healthcheck handler returns correct body', async () => {
  const request = new Request('http://localhost:54321/functions/v1/healthcheck');
  const response = handler(request);

  const body = await response.text();
  assertEquals(body, 'OK');
});

Deno.test('healthcheck handler returns correct content type', async () => {
  const request = new Request('http://localhost:54321/functions/v1/healthcheck');
  const response = handler(request);

  assertEquals(response.headers.get('Content-Type'), 'text/plain');
});

Deno.test('healthcheck handler returns complete response', async () => {
  const request = new Request('http://localhost:54321/functions/v1/healthcheck');
  const response = handler(request);

  assertEquals(response.status, 200);
  assertEquals(response.ok, true);

  const body = await response.text();
  assertEquals(body, 'OK');

  assertEquals(response.headers.get('Content-Type'), 'text/plain');
});
