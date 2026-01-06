/**
 * Encryption and Decryption Utilities for OAuth Tokens
 *
 * Uses AES-256-GCM for authenticated encryption of sensitive OAuth tokens.
 * This provides both confidentiality (encryption) and integrity (authentication tag).
 *
 * SECURITY REQUIREMENTS:
 * - CALENDAR_ENCRYPTION_KEY must be exactly 32 bytes (256 bits)
 * - Key must be stored in environment variables, never in code
 * - IV is randomly generated (12 bytes for GCM) for each encryption
 * - Auth tag is stored with ciphertext to verify integrity
 * - Never log decrypted token values
 * - Handle decryption errors gracefully (return null)
 *
 * USAGE:
 * ```typescript
 * // Encrypt a token before storing in database
 * const encrypted = encryptToken(token, ENCRYPTION_KEY);
 *
 * // Decrypt a token for use in API calls
 * const token = decryptToken(encrypted, ENCRYPTION_KEY);
 * if (!token) {
 *   // Handle error (token may be corrupted or key wrong)
 * }
 * ```
 *
 * KEY MANAGEMENT:
 * - Use: `openssl rand -hex 32` to generate a 32-byte key
 * - Store in environment: CALENDAR_ENCRYPTION_KEY
 * - Rotate keys carefully (need dual-key support for rotation)
 * - Never commit keys to repository
 *
 * @module _shared/crypt
 */

/**
 * Encrypts an OAuth token using AES-256-GCM
 *
 * @param plaintext - The token to encrypt (as string)
 * @param key - 32-byte encryption key (from env var)
 * @returns Base64-encoded ciphertext (includes auth tag)
 *
 * @throws Error if encryption fails or key is invalid
 *
 * @example
 * ```typescript
 * const encrypted = encryptToken('ya29.a0Af...', '0123456789abcdef0123456789abcdef');
 * // Store 'encrypted' in database
 * ```
 */
export function encryptToken(plaintext: string, key: string): string {
  // Validate key length (must be 32 bytes for AES-256)
  if (key.length !== 32) {
    throw new Error('Invalid encryption key: must be exactly 32 bytes (256 bits)');
  }

  // Generate random IV (12 bytes for GCM)
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  // Convert key to bytes
  const keyBytes = new TextEncoder().encode(key);

  // Convert plaintext to bytes
  const plaintextBytes = new TextEncoder().encode(plaintext);

  // Perform encryption
  try {
    const ciphertext = crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']),
      plaintextBytes
    );

    // Combine IV and ciphertext
    const combined = new Uint8Array(iv.length + (await ciphertext).byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(await ciphertext), iv.length);

    // Return base64-encoded string
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    throw new Error(`Token encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypts an encrypted OAuth token using AES-256-GCM
 *
 * @param ciphertext - Base64-encoded ciphertext from encryptToken()
 * @param key - 32-byte encryption key (must match encryption key)
 * @returns Decrypted token string or null if decryption fails
 *
 * @example
 * ```typescript
 * const token = decryptToken('base64_encoded_string', '0123456789abcdef0123456789abcdef');
 * if (!token) {
 *   // Token may be corrupted, or key may be wrong
 *   console.error('Failed to decrypt token');
 * }
 * ```
 */
export function decryptToken(ciphertext: string, key: string): string | null {
  try {
    // Validate key length
    if (key.length !== 32) {
      console.error('[Crypt] Invalid key length: must be 32 bytes');
      return null;
    }

    // Decode base64
    const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));

    // Extract IV (first 12 bytes)
    const iv = combined.slice(0, 12);

    // Extract ciphertext (remaining bytes)
    const ciphertextBytes = combined.slice(12);

    // Convert key to bytes
    const keyBytes = new TextEncoder().encode(key);

    // Decrypt
    const plaintext = crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']),
      ciphertextBytes
    );

    // Return decrypted string
    return new TextDecoder().decode(await plaintext);
  } catch (error) {
    // Log error without exposing ciphertext
    console.error('[Crypt] Decryption failed:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

/**
 * Type for encrypted token data structure
 */
export interface EncryptedToken {
  /** Base64-encoded ciphertext (includes IV and auth tag) */
  ciphertext: string;

  /** Algorithm used (always AES-256-GCM) */
  algorithm: 'AES-256-GCM';

  /** Key ID (for future key rotation support) */
  keyId?: string;
}

/**
 * Encrypts a token and returns structured encrypted data
 *
 * @param plaintext - Token to encrypt
 * @param key - 32-byte encryption key
 * @param keyId - Optional key identifier for rotation
 * @returns Encrypted token with metadata
 */
export function encryptTokenData(
  plaintext: string,
  key: string,
  keyId?: string
): EncryptedToken {
  return {
    ciphertext: encryptToken(plaintext, key),
    algorithm: 'AES-256-GCM',
    keyId,
  };
}

/**
 * Decrypts token data and returns the plaintext token
 *
 * @param encrypted - Encrypted token data
 * @param key - 32-byte encryption key
 * @returns Decrypted token or null if failed
 */
export function decryptTokenData(encrypted: EncryptedToken, key: string): string | null {
  return decryptToken(encrypted.ciphertext, key);
}

/**
 * Securely compares two strings in constant time
 * Prevents timing attacks when comparing tokens or secrets
 *
 * @param a - First string
 * @param b - Second string
 * @returns true if strings are equal, false otherwise
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Validates that a string is a valid base64-encoded ciphertext
 * Does not validate encryption or attempt decryption
 *
 * @param ciphertext - String to validate
 * @returns true if string appears to be valid base64
 */
export function isValidCiphertext(ciphertext: string): boolean {
  try {
    // Attempt to decode from base64
    atob(ciphertext);
    return true;
  } catch {
    return false;
  }
}
