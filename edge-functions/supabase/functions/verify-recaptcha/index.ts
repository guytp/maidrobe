/**
 * reCAPTCHA v3 Verification Edge Function
 *
 * Verifies reCAPTCHA v3 tokens by calling Google's verification API.
 * Used to validate that client-side CAPTCHA challenges were completed successfully
 * and to check the risk score for bot detection.
 *
 * SECURITY:
 * - Token verification happens server-side only
 * - Secret key never exposed to client
 * - Score threshold configurable (default 0.5)
 * - Fails open on errors to prevent user lockout
 *
 * GOOGLE RECAPTCHA API:
 * - Endpoint: https://www.google.com/recaptcha/api/siteverify
 * - Method: POST
 * - Parameters: secret, response (token), remoteip (optional)
 * - Response: { success: boolean, score: number, action: string, challenge_ts, hostname }
 *
 * ENVIRONMENT VARIABLES:
 * - RECAPTCHA_SECRET_KEY: Google reCAPTCHA v3 secret key
 * - RECAPTCHA_SCORE_THRESHOLD: Minimum score (0.0-1.0, default 0.5)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

/**
 * Minimum score threshold for accepting reCAPTCHA verification
 * 0.0 = likely bot, 1.0 = likely human
 * Recommended: 0.5 for balanced security
 */
const DEFAULT_SCORE_THRESHOLD = 0.5;

/**
 * Request body schema
 */
interface VerifyRecaptchaRequest {
  token: string;
  action?: string;
}

/**
 * Response body schema
 */
interface VerifyRecaptchaResponse {
  success: boolean;
  score?: number;
  action?: string;
  error?: string;
}

/**
 * Google reCAPTCHA API response
 */
interface GoogleRecaptchaResponse {
  success: boolean;
  score?: number;
  action?: string;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
}

/**
 * CORS headers for preflight requests
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Main handler for reCAPTCHA verification
 */
serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse request body
    const requestBody = await req.json();
    const { token, action } = requestBody as VerifyRecaptchaRequest;

    // Validate request
    if (!token || typeof token !== 'string') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid token',
        } as VerifyRecaptchaResponse),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get reCAPTCHA secret key from environment
    const secretKey = Deno.env.get('RECAPTCHA_SECRET_KEY');

    if (!secretKey) {
      console.error('[ReCAPTCHA] RECAPTCHA_SECRET_KEY not configured');
      // Fail open - allow request to proceed
      return new Response(
        JSON.stringify({
          success: true,
          error: 'reCAPTCHA not configured',
        } as VerifyRecaptchaResponse),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get score threshold from environment or use default
    const scoreThresholdEnv = Deno.env.get('RECAPTCHA_SCORE_THRESHOLD');
    const scoreThreshold = scoreThresholdEnv
      ? parseFloat(scoreThresholdEnv)
      : DEFAULT_SCORE_THRESHOLD;

    // Call Google reCAPTCHA verification API
    const verifyUrl = 'https://www.google.com/recaptcha/api/siteverify';
    const verifyParams = new URLSearchParams({
      secret: secretKey,
      response: token,
    });

    const verifyResponse = await fetch(verifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: verifyParams.toString(),
    });

    if (!verifyResponse.ok) {
      console.error('[ReCAPTCHA] Google API returned error:', verifyResponse.status);
      // Fail open - allow request to proceed
      return new Response(
        JSON.stringify({
          success: true,
          error: 'Verification service unavailable',
        } as VerifyRecaptchaResponse),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const googleResult = (await verifyResponse.json()) as GoogleRecaptchaResponse;

    // Check if Google verification succeeded
    if (!googleResult.success) {
      console.warn(
        '[ReCAPTCHA] Verification failed:',
        googleResult['error-codes'] || 'Unknown error'
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Verification failed',
        } as VerifyRecaptchaResponse),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check score threshold (if score is provided)
    if (googleResult.score !== undefined && googleResult.score < scoreThreshold) {
      console.warn('[ReCAPTCHA] Score below threshold:', googleResult.score);
      return new Response(
        JSON.stringify({
          success: false,
          score: googleResult.score,
          error: 'Score below threshold',
        } as VerifyRecaptchaResponse),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Verify action matches if provided
    if (action && googleResult.action !== action) {
      console.warn(
        '[ReCAPTCHA] Action mismatch:',
        `expected=${action}, got=${googleResult.action}`
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Action mismatch',
        } as VerifyRecaptchaResponse),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Verification successful
    console.log('[ReCAPTCHA] Verification succeeded, score:', googleResult.score);
    return new Response(
      JSON.stringify({
        success: true,
        score: googleResult.score,
        action: googleResult.action,
      } as VerifyRecaptchaResponse),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    // Unexpected error - fail open
    console.error('[ReCAPTCHA] Unexpected error:', error);
    return new Response(
      JSON.stringify({
        success: true,
        error: 'Unexpected error',
      } as VerifyRecaptchaResponse),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
