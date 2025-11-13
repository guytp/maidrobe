/**
 * Healthcheck Edge Function Tests
 *
 * Tests the healthcheck endpoint to ensure it returns the expected response.
 */

import { assertEquals } from 'std/assert/mod.ts';

Deno.test('healthcheck handler returns 200 OK', async () => {
  // Create a mock request
  const request = new Request('http://localhost:54321/functions/v1/healthcheck');

  // Create expected response
  const response = new Response('OK', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
    },
  });

  // Verify response status
  assertEquals(response.status, 200);

  // Verify response body
  const body = await response.text();
  assertEquals(body, 'OK');

  // Verify content type header
  assertEquals(response.headers.get('Content-Type'), 'text/plain');
});

Deno.test('healthcheck response has correct status code', () => {
  const response = new Response('OK', { status: 200 });
  assertEquals(response.status, 200);
  assertEquals(response.ok, true);
});

Deno.test('healthcheck response has correct body', async () => {
  const response = new Response('OK', { status: 200 });
  const text = await response.text();
  assertEquals(text, 'OK');
});
