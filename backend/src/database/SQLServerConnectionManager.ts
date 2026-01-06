/**
 * SQL Server Connection Manager with Always Encrypted
 *
 * Manages database connections with transparent encryption/decryption
 * using SQL Server Always Encrypted via the mssql driver
 *
 * @module database/SQLServerConnectionManager
 */

import * as mssql from 'mssql';
import { config } from 'dotenv';
import {
  getAlwaysEncryptedConfig,
  configureConnectionForAlwaysEncrypted,
} from '../config/always-encrypted-config';
import { startSpan, endSpan, SpanStatusCode } from '../telemetry/SQLServerTelemetry';

config();

/**
 * Database connection configuration
 */
export interface SQLServerConnectionConfig {
  server: string;
  database: string;
  username: string;
  password: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
  port?: number;
  environment?: string;
}

/**
 * Connection manager class
 */
export class SQLServerConnectionManager {
  private pool: mssql.ConnectionPool;
  private aeConfig: ReturnType<typeof getAlwaysEncryptedConfig>;
  private environment: string;

  constructor(private readonly config: SQLServerConnectionConfig) {
    this.environment = config.environment || process.env['NODE_ENV'] || 'development';
    this.aeConfig = getAlwaysEncryptedConfig(this.environment);

    // Create base pool config
    const poolConfig: mssql.config = {
      server: this.config.server,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      port: this.config.port || 1433,
      options: {
        encrypt: true,
        trustServerCertificate: false,
        enableArithAbort: true,
        connectionTimeout: 30000,
        requestTimeout: 30000,
        rowCollectionOnDone: false,
        rowCollectionOnRequestCompletion: false,
      },
      pool: {
        min: 2,
        max: 20,
        idleTimeoutMillis: 30000,
      },
    };

    // Configure for Always Encrypted
    const configuredConfig = configureConnectionForAlwaysEncrypted(
      poolConfig as any,
      this.aeConfig
    );

    this.pool = new mssql.ConnectionPool(configuredConfig as any);
  }

  /**
   * Initialize database connection pool
   */
  async initialize(): Promise<void> {
    const spanId = startSpan('db.connection.initialize', {
      'db.server': this.config.server,
      'db.database': this.config.database,
      'always.encrypted': this.aeConfig.enabled,
    });

    try {
      await this.pool.connect();

      console.log('[SQLServerConnectionManager] Connected successfully', {
        server: this.config.server,
        database: this.config.database,
        alwaysEncrypted: this.aeConfig.enabled,
      });

      endSpan(spanId, SpanStatusCode.OK, {
        'db.connection.status': 'connected',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error('[SQLServerConnectionManager] Connection failed', {
        server: this.config.server,
        database: this.config.database,
        error: errorMessage,
      });

      endSpan(spanId, SpanStatusCode.ERROR, {}, errorMessage);

      throw error;
    }
  }

  /**
   * Execute a query with encryption support
   */
  async query<T = any>(sql: string, params?: Record<string, any>): Promise<T[]> {
    const spanId = startSpan('db.query', {
      'db.operation': 'query',
      'db.statement': sql.substring(0, 100),
    });

    const startTime = Date.now();

    try {
      const request = this.pool.request();

      // Add parameters
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value === null) {
            request.input(key, (mssql as any).TYPES.NVarChar, null);
          } else if (typeof value === 'string') {
            // Use NVarChar for encrypted string columns
            request.input(key, (mssql as any).TYPES.NVarChar, value);
          } else if (typeof value === 'number') {
            request.input(key, (mssql as any).TYPES.Int, value);
          } else if (typeof value === 'boolean') {
            request.input(key, (mssql as any).TYPES.Bit, value);
          } else if (value instanceof Date) {
            request.input(key, (mssql as any).TYPES.DateTime2, value);
          } else {
            request.input(key, (mssql as any).TYPES.NVarChar, value);
          }
        });
      }

      // Execute query
      const result = await request.query<T>(sql);

      const latency = Date.now() - startTime;

      endSpan(spanId, SpanStatusCode.OK, {
        'db.query.rowCount': result.recordset.length,
        'db.query.latency': latency,
      });

      return result.recordset;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const latency = Date.now() - startTime;

      console.error('[SQLServerConnectionManager] Query failed', {
        sql: sql.substring(0, 100),
        latency: `${latency}ms`,
        error: errorMessage,
      });

      endSpan(
        spanId,
        SpanStatusCode.ERROR,
        {
          'db.query.latency': latency,
        },
        errorMessage
      );

      throw error;
    }
  }

  /**
   * Execute a parameterized query optimized for encrypted data
   */
  async queryWithEncryption<T = any>(
    sql: string,
    params: Record<string, any>
  ): Promise<{ data: T[]; metadata: { encryptedColumns: string[] } }> {
    const spanId = startSpan('db.query.encrypted', {
      'db.operation': 'query_with_encryption',
      'db.statement': sql.substring(0, 100),
    });

    const startTime = Date.now();

    try {
      const request = this.pool.request();

      // Add parameters with explicit types for encrypted columns
      Object.entries(params).forEach(([key, value]) => {
        if (value === null) {
          request.input(key, (mssql as any).TYPES.NVarChar, null);
        } else if (typeof value === 'string') {
          // Use NVarChar for encrypted string columns
          request.input(key, (mssql as any).TYPES.NVarChar, value);
        } else if (typeof value === 'number') {
          request.input(key, (mssql as any).TYPES.Int, value);
        } else if (typeof value === 'boolean') {
          request.input(key, (mssql as any).TYPES.Bit, value);
        } else if (value instanceof Date) {
          request.input(key, (mssql as any).TYPES.DateTime2, value);
        } else {
          request.input(key, (mssql as any).TYPES.NVarChar, String(value));
        }
      });

      // Execute query
      const result = await request.query<T>(sql);

      const latency = Date.now() - startTime;

      // Detect if encryption was involved (looking for PII column patterns)
      const encryptedColumns = Object.keys(params).filter(
        (key) =>
          typeof params[key] === 'string' &&
          (key.toLowerCase().includes('email') ||
            key.toLowerCase().includes('name') ||
            key.toLowerCase().includes('address') ||
            key.toLowerCase().includes('token') ||
            key.toLowerCase().includes('phone'))
      );

      endSpan(spanId, SpanStatusCode.OK, {
        'db.query.rowCount': result.recordset.length,
        'db.query.latency': latency,
        'db.query.encryptedColumns': encryptedColumns.length,
      });

      return {
        data: result.recordset,
        metadata: {
          encryptedColumns,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const latency = Date.now() - startTime;

      console.error('[SQLServerConnectionManager] Encrypted query failed', {
        sql: sql.substring(0, 100),
        latency: `${latency}ms`,
        error: errorMessage,
      });

      endSpan(
        spanId,
        SpanStatusCode.ERROR,
        {
          'db.query.latency': latency,
        },
        errorMessage
      );

      throw error;
    }
  }

  /**
   * Execute a stored procedure
   */
  async executeProcedure<T = any>(
    procedureName: string,
    params?: Record<string, any>
  ): Promise<T[]> {
    const spanId = startSpan('db.procedure.execute', {
      'db.operation': 'execute_procedure',
      'db.procedure': procedureName,
    });

    try {
      const request = this.pool.request();

      // Add parameters
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          request.input(key, (mssql as any).TYPES.NVarChar, String(value));
        });
      }

      // Execute procedure
      const result = await request.execute<T>(procedureName);

      endSpan(spanId, SpanStatusCode.OK, {
        'db.procedure.rowCount': result.recordset.length,
      });

      return result.recordset;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error('[SQLServerConnectionManager] Stored procedure failed', {
        procedure: procedureName,
        error: errorMessage,
      });

      endSpan(spanId, SpanStatusCode.ERROR, {}, errorMessage);

      throw error;
    }
  }

  /**
   * Close connection pool
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      console.log('[SQLServerConnectionManager] Connection closed');
    }
  }
}

/**
 * Singleton connection manager instance
 */
let connectionManager: SQLServerConnectionManager | null = null;

/**
 * Gets or creates connection manager
 */
export function getConnectionManager(
  config: SQLServerConnectionConfig
): SQLServerConnectionManager {
  if (!connectionManager) {
    connectionManager = new SQLServerConnectionManager(config);
  }
  return connectionManager;
}

/**
 * Resets connection manager (for testing)
 */
export function resetConnectionManager(): void {
  connectionManager = null;
}
