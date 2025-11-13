/**
 * Healthcheck Edge Function
 *
 * Simple health check endpoint that returns 200 OK.
 * Used to verify that Edge Functions are running correctly.
 */

Deno.serve((_req: Request): Response => {
  return new Response('OK', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
    },
  });
});
