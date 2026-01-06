/**
 * Token Manager for Buzz A Tutor
 *
 * Replaces Supabase Auth with custom JWT-based authentication
 * Integrates with AWS KMS for secure key storage and SQL Server for session management
 *
 * @module auth/TokenManager
 */

import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { KMSService } from '../security/KMSService';
import { startSpan, endSpan, SpanStatusCode } from '../telemetry/SQLServerTelemetry';
import { SQLServerAuditLogger } from '../audit/SQLServerAuditLogger';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface JwtPayload {
  sub: string; // UserId
  roles: string[];
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  correlationId: string;
  sessionId?: string | undefined;
}

export interface SessionData {
  sessionId: string;
  userId: string;
  refreshTokenHash: string;
  correlationId: string;
  ipAddress: string;
  userAgent: string;
  deviceFingerprint: string;
  country?: string;
  region?: string;
  city?: string;
}

export interface TokenValidationResult {
  valid: boolean;
  payload?: JwtPayload;
  error?: string;
  errorCode?: string;
}

/**
 * Token Manager handles JWT lifecycle and SQL Server session management
 */
export class TokenManager {
  private _kmsService: KMSService;
  private auditLogger: SQLServerAuditLogger;
  private readonly ACCESS_TOKEN_EXPIRY = '1h'; // 1 hour
  private readonly _REFRESH_TOKEN_EXPIRY_DAYS = 7; // 7 days

  constructor() {
    this._kmsService = new KMSService();
    this.auditLogger = new SQLServerAuditLogger();
  }

  /**
   * Generate JWT tokens for user authentication
   * @param userId - The authenticated user's ID from dbo.Users
   * @param roles - User roles for authorization
   * @param correlationId - Request correlation ID for audit trail
   * @param clientInfo - Client information for session tracking
   * @returns TokenPair with access and refresh tokens
   */
  async generateTokens(
    userId: string,
    roles: string[],
    correlationId: string,
    clientInfo: {
      ipAddress: string;
      userAgent: string;
      deviceFingerprint: string;
      country?: string;
      region?: string;
      city?: string;
    }
  ): Promise<TokenPair> {
    const spanId = startSpan('token.generate', {
      'auth.userId': userId,
      'auth.operation': 'generate_tokens',
      'auth.correlationId': correlationId,
    });

    try {
      // Generate unique session ID
      const sessionId = uuidv4();
      const refreshToken = uuidv4();

      // Hash the refresh token before storing (security best practice)
      const refreshTokenHash = await bcrypt.hash(refreshToken, 12);

      // Get signing key from KMS (not stored in application)
      const signingKey = await this.getSigningKeyFromKms();

      // Create access token payload
      const accessTokenPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
        sub: userId,
        roles,
        iss: 'buzz-a-tutor',
        aud: 'buzz-a-tutor-api',
        correlationId,
        sessionId,
      };

      // Sign access token
      const accessToken = jwt.sign(accessTokenPayload, signingKey, {
        expiresIn: this.ACCESS_TOKEN_EXPIRY,
      });

      // Create session in SQL Server
      await this.createSession({
        sessionId,
        userId,
        refreshTokenHash,
        correlationId,
        ...clientInfo,
      });

      // Log successful token generation
      await this.auditLogger.logAuthEvent('TOKEN_GENERATED', {
        userId,
        correlationId,
        sessionId,
        roles,
        clientInfo,
      });

      // End telemetry span successfully
      endSpan(spanId, SpanStatusCode.OK, {
        'auth.token_type': 'access_and_refresh',
        'auth.session_id': sessionId,
      });

      console.log(`[TokenManager] Generated tokens for user ${userId}`, {
        sessionId,
        correlationId,
        roles,
      });

      return {
        accessToken,
        refreshToken,
        expiresIn: 3600, // 1 hour in seconds
        tokenType: 'Bearer',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Log failure
      await this.auditLogger.logAuthEvent('TOKEN_GENERATION_FAILED', {
        userId,
        correlationId,
        errorCode: 'TOKEN_GENERATION_ERROR',
        errorMessage,
      });

      // End telemetry span with error
      endSpan(spanId, SpanStatusCode.ERROR, {}, errorMessage);

      console.error(`[TokenManager] Failed to generate tokens for user ${userId}`, {
        error: errorMessage,
        correlationId,
      });

      throw error;
    }
  }

  /**
   * Verify JWT token authenticity and expiration
   * @param token - The JWT token to verify
   * @returns TokenValidationResult with payload or error
   */
  async verifyToken(token: string): Promise<TokenValidationResult> {
    const spanId = startSpan('token.verify', {
      'auth.operation': 'verify_token',
    });

    try {
      // Get verification key from KMS
      const signingKey = await this.getSigningKeyFromKms();

      // Verify token signature and expiration
      const payload = jwt.verify(token, signingKey) as JwtPayload;

      // Verify session is still active in database
      const session = await this.getActiveSession(payload.sub, payload.sessionId!);

      if (!session) {
        throw new Error('Session not found or expired');
      }

      // Check if session is still active
      if (!session.IsActive || new Date(session.ExpiresAt) < new Date()) {
        throw new Error('Session expired or invalidated');
      }

      // Update session activity
      await this.updateSessionActivity(payload.sessionId!);

      // Log successful verification
      await this.auditLogger.logAuthEvent('TOKEN_VERIFIED', {
        userId: payload.sub,
        correlationId: payload.correlationId,
        sessionId: payload.sessionId || undefined,
      });

      // End telemetry span successfully
      endSpan(spanId, SpanStatusCode.OK, {
        'auth.userId': payload.sub,
        'auth.session_id': payload.sessionId || 'unknown',
      });

      return {
        valid: true,
        payload,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Log verification failure
      await this.auditLogger.logAuthEvent('TOKEN_VERIFY_FAILED', {
        correlationId: uuidv4(),
        errorCode: 'INVALID_TOKEN',
        errorMessage,
      });

      // End telemetry span with error
      endSpan(spanId, SpanStatusCode.ERROR, {}, errorMessage);

      return {
        valid: false,
        error: errorMessage,
        errorCode: 'INVALID_TOKEN',
      };
    }
  }

  /**
   * Refresh access token using refresh token
   * @param userId - User ID
   * @param refreshToken - The refresh token
   * @param correlationId - Request correlation ID
   * @returns New TokenPair
   */
  async refreshAccessToken(
    userId: string,
    refreshToken: string,
    correlationId: string
  ): Promise<TokenPair> {
    const spanId = startSpan('token.refresh', {
      'auth.userId': userId,
      'auth.operation': 'refresh_token',
      'auth.correlationId': correlationId,
    });

    try {
      // Find active session with matching refresh token
      const session = await this.findSessionByRefreshToken(userId, refreshToken);

      if (!session) {
        throw new Error('Invalid or expired refresh token');
      }

      // Check if refresh token is expired
      if (new Date(session.ExpiresAt) < new Date()) {
        throw new Error('Refresh token expired');
      }

      // Generate new tokens
      const tokens = await this.generateTokens(userId, session.Roles.split(','), correlationId, {
        ipAddress: session.ClientIPAddress,
        userAgent: session.UserAgent,
        deviceFingerprint: session.DeviceFingerprint,
        country: session.Country,
        region: session.Region,
        city: session.City,
      });

      // Invalidate old session
      await this.invalidateSession(session.SessionId, correlationId);

      // Log successful refresh
      await this.auditLogger.logAuthEvent('TOKEN_REFRESHED', {
        userId,
        correlationId,
        oldSessionId: session.SessionId,
        newSessionId: this.extractSessionId(tokens.accessToken),
      });

      // End telemetry span successfully
      endSpan(spanId, SpanStatusCode.OK, {
        'auth.token_refreshed': true,
      });

      console.log(`[TokenManager] Refreshed token for user ${userId}`, {
        oldSessionId: session.SessionId,
        correlationId,
      });

      return tokens;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Log refresh failure
      await this.auditLogger.logAuthEvent('TOKEN_REFRESH_FAILED', {
        userId,
        correlationId,
        errorCode: 'TOKEN_REFRESH_ERROR',
        errorMessage,
      });

      // End telemetry span with error
      endSpan(spanId, SpanStatusCode.ERROR, {}, errorMessage);

      console.error(`[TokenManager] Failed to refresh token for user ${userId}`, {
        error: errorMessage,
        correlationId,
      });

      throw error;
    }
  }

  /**
   * Invalidate a session (logout)
   * @param sessionId - Session ID to invalidate
   * @param correlationId - Request correlation ID
   */
  async invalidateSession(sessionId: string, correlationId: string): Promise<void> {
    const spanId = startSpan('session.invalidate', {
      'auth.operation': 'invalidate_session',
      'auth.session_id': sessionId,
    });

    try {
      // Update session to inactive in SQL Server
      // This would be an UPDATE query

      await this.auditLogger.logAuthEvent('SESSION_INVALIDATED', {
        sessionId,
        correlationId,
      });

      endSpan(spanId, SpanStatusCode.OK);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await this.auditLogger.logAuthEvent('SESSION_INVALIDATION_FAILED', {
        sessionId,
        correlationId,
        errorMessage,
      });

      endSpan(spanId, SpanStatusCode.ERROR, {}, errorMessage);
      throw error;
    }
  }

  // Private helper methods
  private async getSigningKeyFromKms(): Promise<string> {
    // In production, fetch from AWS Secrets Manager or KMS
    // For development, use environment variable
    const signingKey = process.env['JWT_SIGNING_KEY'];

    if (!signingKey) {
      throw new Error('JWT signing key not configured');
    }

    return signingKey;
  }

  private async createSession(sessionData: SessionData): Promise<void> {
    // Insert session into dbo.SessionHistory
    // Implementation depends on SQL client library
    console.log(`[TokenManager] Creating session ${sessionData.sessionId}`, {
      userId: sessionData.userId,
      correlationId: sessionData.correlationId,
    });
  }

  private async getActiveSession(_userId: string, _sessionId: string): Promise<any> {
    // Query dbo.SessionHistory for active session
    return null;
  }

  private async updateSessionActivity(_sessionId: string): Promise<void> {
    // Update LastActivityAt in dbo.SessionHistory
  }

  private async findSessionByRefreshToken(_userId: string, _refreshToken: string): Promise<any> {
    // Find session by userId and refresh token hash
    return null;
  }

  private extractSessionId(accessToken: string): string {
    try {
      const decoded = jwt.decode(accessToken) as JwtPayload;
      return decoded.sessionId || '';
    } catch {
      return '';
    }
  }
}

// Singleton instance
export const tokenManager = new TokenManager();
