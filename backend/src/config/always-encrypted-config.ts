/**
 * Always Encrypted Configuration for Tedious Driver
 *
 * Configures SQL Server driver for transparent encryption/decryption
 * using AWS KMS via the 'mssql' driver wrapper for Tedious
 *
 * @module config/always-encrypted-config
 */

import * as tedious from 'tedious';

export interface AlwaysEncryptedConfig {
  /**
   * Enable Always Encrypted
   */
  enabled: boolean;

  /**
   * Column encryption key cache configuration
   */
  encryptionKeyCache: {
    /**
     * Enable column encryption key caching
     * Reduces round trips to AWS KMS
     */
    enabled: boolean;

    /**
     * TTL for cached encryption keys (milliseconds)
     */
    ttl: number;

    /**
     * Maximum number of keys to cache
     */
    maxSize: number;
  };

  /**
   * Performance configuration
   */
  performance: {
    /**
     * Enable transparent metadata caching
     * Reduces metadata round trips to SQL Server
     */
    metadataCachingEnabled: boolean;

    /**
     * Metadata lookup timeout (milliseconds)
     */
    metadataLookupTimeout: number;

    /**
     * Force column encryption
     * Rejects queries that would leak plaintext
     */
    forceColumnEncryption?: boolean;
  };

  /**
   * Debug mode (development only)
   */
  debugMode?: boolean;
}

/**
 * Gets Always Encrypted configuration for environment
 */
export function getAlwaysEncryptedConfig(environment: string): AlwaysEncryptedConfig {
  switch (environment) {
    case 'production':
      return {
        enabled: true,
        encryptionKeyCache: {
          enabled: true,
          ttl: 3600000, // 1 hour
          maxSize: 100, // Cache up to 100 keys
        },
        performance: {
          metadataCachingEnabled: true,
          metadataLookupTimeout: 5000,
          forceColumnEncryption: true, // Enforce encryption in production
        },
        debugMode: false,
      };

    case 'staging':
      return {
        enabled: true,
        encryptionKeyCache: {
          enabled: true,
          ttl: 3600000, // 1 hour
          maxSize: 50, // Smaller cache for staging
        },
        performance: {
          metadataCachingEnabled: true,
          metadataLookupTimeout: 5000,
          forceColumnEncryption: true,
        },
        debugMode: false,
      };

    case 'development':
      // In development, disable Always Encrypted for easier debugging
      console.warn('[AlwaysEncrypted] Disabled in development environment');
      return {
        enabled: false,
        encryptionKeyCache: {
          enabled: false,
          ttl: 60000,
          maxSize: 10,
        },
        performance: {
          metadataCachingEnabled: false,
          metadataLookupTimeout: 5000,
        },
        debugMode: false,
      };

    default:
      throw new Error(`Unknown environment: ${environment}`);
  }
}

/**
 * Configures Tedious connection options for Always Encrypted
 * Note: Always Encrypted is configured via the SQL Server driver layer,
 * not at the Tedious level directly. This function documents what's needed
 * at the connection string/configuration level.
 */
export function configureConnectionForAlwaysEncrypted(
  config: tedious.ConnectionConfig,
  aeConfig: AlwaysEncryptedConfig
): tedious.ConnectionConfig {
  if (!aeConfig.enabled) {
    console.log('[AlwaysEncrypted] Feature disabled for this environment');
    return config;
  }

  // Clone config to avoid mutation
  const newConfig: tedious.ConnectionConfig = {
    ...config,
    options: {
      ...config.options,
      // Enable Always Encrypted
      columnEncryptionSetting: true,

      // Enable encryption
      encrypt: true,
      trustServerCertificate: false,

      // Performance settings
      useColumnNames: false,
      camelCaseColumns: false,

      // Connection timeouts for encryption operations
      connectionTimeout: 30000,
      requestTimeout: 30000,

      // Row collection settings
      rowCollectionOnDone: false,
      rowCollectionOnRequestCompletion: false,
    },
  };

  console.log('[AlwaysEncrypted] Connection configured', {
    columnEncryptionSetting: true,
    metadataCaching: aeConfig.performance.metadataCachingEnabled,
    keyCacheSize: aeConfig.encryptionKeyCache.maxSize,
    forceEncryption: aeConfig.performance.forceColumnEncryption,
  });

  return newConfig;
}

/**
 * Performance monitoring configuration for encryption operations
 */
export interface EncryptionPerformanceConfig {
  /**
   * Enable performance metrics collection
   */
  enabled: boolean;

  /**
   * Warn if encryption overhead exceeds threshold
   */
  warnThresholdMs: number; // Default: 100ms (NFR requirement)

  /**
   * Log metrics to console
   */
  logMetrics: boolean;

  /**
   * Send metrics to telemetry
   */
  sendToTelemetry: boolean;
}

/**
 * Gets performance monitoring configuration
 */
export function getEncryptionPerformanceConfig(environment: string): EncryptionPerformanceConfig {
  return {
    enabled: true,
    warnThresholdMs: 100, // NFR: <100ms per query latency
    logMetrics: environment === 'development',
    sendToTelemetry: environment !== 'development',
  };
}

/**
 * Performance metrics for encryption operations
 */
export interface EncryptionPerformanceMetrics {
  /**
   * Time to get column encryption key from KMS/cache
   */
  keyLookupLatency: number;

  /**
   * Time to encrypt data
   */
  encryptionLatency: number;

  /**
   * Time to decrypt data
   */
  decryptionLatency: number;

  /**
   * Total operation latency
   */
  totalLatency: number;

  /**
   * Whether key was served from cache
   */
  cacheHit: boolean;

  /**
   * Number of columns encrypted/decrypted
   */
  columnCount: number;
}

/**
 * Decorator to monitor encryption performance
 */
export function withEncryptionMonitoring(
  _target: any,
  propertyKey: string,
  descriptor: PropertyDescriptor
) {
  const originalMethod = descriptor.value;

  descriptor.value = async function (...args: any[]) {
    const startTime = Date.now();
    let metrics: EncryptionPerformanceMetrics = {
      keyLookupLatency: 0,
      encryptionLatency: 0,
      decryptionLatency: 0,
      totalLatency: 0,
      cacheHit: false,
      columnCount: 0,
    };

    try {
      const result = await originalMethod.apply(this, args);

      const endTime = Date.now();
      metrics.totalLatency = endTime - startTime;

      return {
        result,
        metrics,
      };
    } catch (error) {
      const endTime = Date.now();
      metrics.totalLatency = endTime - startTime;

      console.error('[EncryptionMetrics] Operation failed:', {
        method: propertyKey,
        latency: `${metrics.totalLatency}ms`,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  };

  return descriptor;
}
