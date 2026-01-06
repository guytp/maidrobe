/**
 * SQL Server Row Level Security Middleware
 * 
 * Replaces PostgreSQL RLS with application-level authorization
 * for Buzz A Tutor's SQL Server environment
 * 
 * @module auth/SQLServerRLSMiddleware
 */

import { Request, Response, NextFunction } from 'express';
import { TokenManager, JwtPayload } from './TokenManager';
import { v4 as uuidv4 } from 'uuid';

/**
 * Extended request interface with authentication context
 */
export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
  queryContext?: {
    whereClauses?: string[];
    parameters?: any[];
  };
}

/**
 * SQL Server RLS Middleware enforces database access controls at application layer
 */
export class SQLServerRLSMiddleware {
  private tokenManager: TokenManager;

  constructor() {
    this.tokenManager = new TokenManager();
  }

  /**
   * JWT authentication middleware
   * Validates JWT and attaches user context to request
   */
  authenticateJWT(): (req: AuthenticatedRequest, _res: Response, next: NextFunction) => void {
    return async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
      try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return _res.status(401).json({
            error: 'Authentication required',
            errorCode: 'MISSING_TOKEN'
          });
        }

        const token = authHeader.substring(7); // Remove "Bearer " prefix
        
        const validationResult = await this.tokenManager.verifyToken(token);
        
        if (!validationResult.valid) {
          return _res.status(401).json({
            error: validationResult.error || 'Invalid token',
            errorCode: validationResult.errorCode || 'INVALID_TOKEN'
          });
        }

        // Attach user to request for downstream middleware
        req.user = validationResult.payload;

        // Continue to next middleware
        next();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        console.error('[SQLServerRLSMiddleware] Authentication error', {
          error: errorMessage,
          path: req.path
        });

        return _res.status(500).json({
          error: 'Authentication service error',
          errorCode: 'AUTH_SERVICE_ERROR'
        });
      }
    };
  }

  /**
   * Enforces user ownership on queries
   * Equivalent to PostgreSQL: USING (auth.uid() = user_id)
   * @param tableAlias - SQL table alias for WHERE clause construction
   */
  requireOwnership(tableAlias: string = 't'): (req: AuthenticatedRequest, _res: Response, next: NextFunction) => void {
    return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
      const userId = req.user?.sub;
      
      if (!userId) {
        return _res.status(401).json({
          error: 'User not authenticated',
          errorCode: 'UNAUTHENTICATED'
        });
      }

      // Initialize query context if not exists
      if (!req.queryContext) {
        req.queryContext = { whereClauses: [], parameters: [] };
      }

      // Append WHERE clause to enforce ownership
      req.queryContext.whereClauses = req.queryContext.whereClauses || [];
      req.queryContext.whereClauses.push(
        `${tableAlias}.UserId = @userId`
      );

      // Add parameter value
      if (!req.queryContext.parameters) {
        req.queryContext.parameters = [];
      }
      req.queryContext.parameters.push({
        name: 'userId',
        value: userId,
        type: 'UNIQUEIDENTIFIER'
      });

      console.log('[SQLServerRLSMiddleware] Applied ownership filter', {
        userId,
        tableAlias,
        whereClause: `${tableAlias}.UserId = @userId`
      });

      next();
    };
  }

  /**
   * Enforces that INSERTs can only create records for the authenticated user
   * Equivalent to PostgreSQL: WITH CHECK (auth.uid() = user_id)
   */
  validateInsertOwnership(): (req: AuthenticatedRequest, _res: Response, next: NextFunction) => void {
    return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
      const userId = req.user?.sub;
      const body = req.body;

      if (!userId) {
        return _res.status(401).json({
          error: 'User not authenticated',
          errorCode: 'UNAUTHENTICATED'
        });
      }

      // Check if body contains UserId/userId field
      const userIdField = body.UserId || body.user_id;
      
      if (userIdField && userIdField !== userId) {
        return _res.status(403).json({
          error: 'Forbidden: Cannot create records for other users',
          errorCode: 'FORBIDDEN_CROSS_USER'
        });
      }

      // Ensure UserId is set to authenticated user
      req.body.UserId = userId;

      console.log('[SQLServerRLSMiddleware] Validated insert ownership', {
        userId,
        table: req.path
      });

      next();
    };
  }

  /**
   * Service role bypass for administrative operations
   * Equivalent to PostgreSQL service_role (bypasses RLS)
   */
  requireServiceRole(): (req: AuthenticatedRequest, _res: Response, next: NextFunction) => void {
    return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
      const user = req.user;
      
      if (!user) {
        return _res.status(401).json({
          error: 'Authentication required',
          errorCode: 'UNAUTHENTICATED'
        });
      }

      const isServiceRole = user.roles.includes('service_role');
      
      if (!isServiceRole) {
        return _res.status(403).json({
          error: 'Forbidden: Administrative access required',
          errorCode: 'FORBIDDEN_ADMIN_REQUIRED'
        });
      }

      console.log('[SQLServerRLSMiddleware] Service role access granted', {
        userId: user.sub,
        roles: user.roles
      });

      next();
    };
  }

  /**
   * Optional ownership filter (soft enforcement)
   * Allows queries without user filter but logs access
   * @param tableAlias - SQL table alias
   */
  optionalOwnership(tableAlias: string = 't'): (req: AuthenticatedRequest, _res: Response, next: NextFunction) => void {
    return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
      const userId = req.user?.sub;
      
      if (userId) {
        // Add ownership filter
        if (!req.queryContext) {
          req.queryContext = { whereClauses: [], parameters: [] };
        }

        req.queryContext.whereClauses = req.queryContext.whereClauses || [];
        req.queryContext.whereClauses.push(
          `${tableAlias}.UserId = '${userId}'`
        );

        console.log('[SQLServerRLSMiddleware] Applied optional ownership filter', {
          userId,
          tableAlias
        });
      }

      next();
    };
  }

  /**
   * Multi-tenant isolation for tutor accounts
   * Ensures tutors can only access their students' data (not other tutors')
   */
  requireTutorOwnership(tableAlias: string = 't'): (req: AuthenticatedRequest, _res: Response, next: NextFunction) => void {
    return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
      const userId = req.user?.sub;
      const roles = req.user?.roles || [];

      if (!userId) {
        return _res.status(401).json({
          error: 'User not authenticated',
          errorCode: 'UNAUTHENTICATED'
        });
      }

      // If user is a tutor, restrict to their students
      if (roles.includes('tutor')) {
        if (!req.queryContext) {
          req.queryContext = { whereClauses: [], parameters: [] };
        }

        req.queryContext.whereClauses = req.queryContext.whereClauses || [];
        req.queryContext.whereClauses.push(
          `${tableAlias}.UserId IN (SELECT StudentId FROM dbo.StudentTutorAssignments WHERE TutorId = @tutorId)`
        );

        if (!req.queryContext.parameters) {
          req.queryContext.parameters = [];
        }
        req.queryContext.parameters.push({
          name: 'tutorId',
          value: userId,
          type: 'UNIQUEIDENTIFIER'
        });

        console.log('[SQLServerRLSMiddleware] Applied tutor ownership filter', {
          tutorId: userId,
          tableAlias
        });
      }

      next();
    };
  }

  /**
   * Log query access for audit purposes
   * Useful for SELECT operations that bypass RLS
   */
  logQueryAccess(tableName: string): (req: AuthenticatedRequest, _res: Response, next: NextFunction) => void {
    return async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
      const userId = req.user?.sub;
      const correlationId = req.user?.correlationId || uuidv4();

      // Log to audit table
      const auditData = {
        eventType: 'DATA_ACCESS',
        userId,
        tableName,
        operationDetails: JSON.stringify({
          method: req.method,
          path: req.path,
          query: req.query,
          appliedFilters: req.queryContext?.whereClauses
        }),
        correlationId
      };

      console.log('[SQLServerRLSMiddleware] Query access logged', auditData);

      next();
    };
  }
}

// Singleton instance
export const sqlServerRLSMiddleware = new SQLServerRLSMiddleware();
