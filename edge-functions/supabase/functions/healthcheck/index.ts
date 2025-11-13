/**
 * Healthcheck Edge Function
 *
 * Simple health check endpoint that returns 200 OK.
 * Used to verify that Edge Functions are running correctly.
 */

/**
 * Health check endpoint handler for monitoring service availability.
 *
 * @param _req - HTTP request object (unused, required by Deno.serve)
 * @returns Response with status 200 and 'OK' text/plain content
 */
Deno.serve((_req: Request): Response => {
  return new Response('OK', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
    },
  });
});
