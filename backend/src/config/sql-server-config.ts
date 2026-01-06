/**
 * SQL Server Configuration for Buzz A Tutor
 * 
 * Centralized configuration for SQL Server connections, encryption, and security
 * @module config/sql-server-config
 */

export interface SQLServerConfig {
  // Connection settings
  server: string;
  database: string;
  port: number;
  username: string;
  password: string;
  
  // TLS/SSL configuration for encryption in transit
  encryption: {
    enabled: boolean;
    trustServerCertificate: boolean;
    hostNameInCertificate: string;
    tlsVersion: '1.2' | '1.3';
  };
  
  // Always Encrypted settings
  alwaysEncrypted: {
    enabled: boolean;
    columnEncryptionKeyCacheTtl: number;  // seconds
    keyStoreAuthentication: 'KeyVaultManagedIdentity' | 'KeyVaultClientSecret';
    keyStorePrincipalId?: string;  // For managed identity
    keyVaultUrl?: string;  // For client secret
  };
  
  // Connection pool settings
  pool: {
    min: number;
    max: number;
    acquireTimeoutMillis: number;
    createTimeoutMillis: number;
    idleTimeoutMillis: number;
  };
  
  // Audit and telemetry
  audit: {
    enabled: boolean;
    logLevel: 'ALL' | 'MODIFICATIONS' | 'SECURITY';
    cloudWatchLogGroup: string;
  };
}

/**
 * Environment-based configuration
 * Use different configs for dev/staging/production
 */
export function getSQLServerConfig(environment: string): SQLServerConfig {
  const baseConfig = {
    server: process.env.SQL_SERVER_HOST || 'buzz-tutor-sql-server.cluster-xyz.us-east-1.rds.amazonaws.com',
    database: process.env.SQL_SERVER_DATABASE || 'BuzzTutorProd',
    port: parseInt(process.env.SQL_SERVER_PORT || '1433'),
    username: process.env.SQL_SERVER_USERNAME || 'sqladmin',
    password: process.env.SQL_SERVER_PASSWORD!, // From AWS Secrets Manager
    
    encryption: {
      enabled: true,  // TLS 1.2+ enforcement
      trustServerCertificate: false,  // Enforce certificate validation
      hostNameInCertificate: process.env.SQL_SERVER_HOST || 'buzz-tutor-sql-server.cluster-xyz.us-east-1.rds.amazonaws.com',
      tlsVersion: '1.2' as const
    },
    
    alwaysEncrypted: {
      enabled: true,
      columnEncryptionKeyCacheTtl: 3600,  // 1 hour
      keyStoreAuthentication: 'KeyVaultManagedIdentity' as const,
      keyStorePrincipalId: process.env.MANAGED_IDENTITY_CLIENT_ID
    },
    
    pool: {
      min: 2,
      max: 20,
      acquireTimeoutMillis: 30000,
      createTimeoutMillis: 30000,
      idleTimeoutMillis: 30000
    },
    
    audit: {
      enabled: true,
      logLevel: 'ALL',
      cloudWatchLogGroup: process.env.CLOUDWATCH_AUDIT_LOG_GROUP || '/buzz-tutor/audit'
    }
  };

  switch (environment) {
    case 'development':
      return {
        ...baseConfig,
        server: 'localhost',
        database: 'BuzzTutorDev',
        encryption: {
          ...baseConfig.encryption,
          enabled: false,  // Dev environment may not require TLS
          trustServerCertificate: true
        },
        alwaysEncrypted: {
          ...baseConfig.alwaysEncrypted,
          enabled: false  // Encryption disabled in dev for easier debugging
        }
      };

    case 'staging':
      return {
        ...baseConfig,
        database: 'BuzzTutorStaging',
        audit: {
          ...baseConfig.audit,
          logLevel: 'SECURITY'  // Only log security events in staging
        }
      };

    case 'production':
    default:
      return baseConfig;
  }
}

/**
 * Get SQL Server connection string with encryption options
 * @param config - SQL Server config
 * @returns Connection string
 */
export function buildConnectionString(config: SQLServerConfig): string {
  const encryptionOption = config.encryption.enabled ? 'true' : 'false';
  const trustServerCertOption = config.encryption.trustServerCertificate ? 'true' : 'false';
  const hostNameOption = config.encryption.enabled ? config.encryption.hostNameInCertificate : '';
  
  // Build connection string
  const connectionString = [
    `Server=${config.server},${config.port}`,
    `Database=${config.database}`,
    `User Id=${config.username}`,
    `Password=${config.password}`,
    `Encrypt=${encryptionOption}`,
    `TrustServerCertificate=${trustServerCertOption}`,
    hostNameOption ? `HostNameInCertificate=${hostNameOption}` : '',
    `Connection Timeout=30`,
    `MultipleActiveResultSets=true`
  ].filter(Boolean).join(';');

  return connectionString;
}

/**
 * AWS KMS Configuration for SQL Server Always Encrypted
 */
export interface KMSConfig {
  // CMK ARNs for different data classifications
  userDataCMKArn: string;        // For Users, UserProfiles, ChatLogs
  paymentDataCMKArn: string;     // For Payments (PCI DSS isolation)
  sessionDataCMKArn: string;     // For SessionHistory
  auditDataCMKArn: string;       // For AuditLog
  
  // Key rotation settings
  autoKeyRotation: boolean;
  rotationIntervalDays: number;
  enableRotationNotification: boolean;
  
  // Emergency access
  emergencyKeyAccessRoleArn: string;
  emergencyAccessNotification: string[];  // Email/SNS topics
}

export function getKMSConfig(): KMSConfig {
  return {
    userDataCMKArn: process.env.AWS_KMS_USER_DATA_CMK_ARN!,
    paymentDataCMKArn: process.env.AWS_KMS_PAYMENT_DATA_CMK_ARN!,
    sessionDataCMKArn: process.env.AWS_KMS_SESSION_DATA_CMK_ARN!,
    auditDataCMKArn: process.env.AWS_KMS_AUDIT_DATA_CMK_ARN!,
    
    autoKeyRotation: true,
    rotationIntervalDays: 90,
    enableRotationNotification: true,
    
    emergencyKeyAccessRoleArn: process.env.EMERGENCY_KEY_ACCESS_ROLE_ARN!,
    emergencyAccessNotification: [
      process.env.SECURITY_TEAM_EMAIL!,
      process.env.COMPLIANCE_TEAM_EMAIL!,
      process.env.ALERT_SNS_TOPIC_ARN!
    ]
  };
}

/**
 * Speed limit configuration (ms) for query performance
 * Based on non-functional requirements
 */
export interface PerformanceConfig {
  maxQueryLatency: number;  // 100ms per user story
  maxCPUOverhead: number;   // 5% per user story
  slowQueryThreshold: number;
  measureEncryptionOverhead: boolean;
}

export function getPerformanceConfig(): PerformanceConfig {
  return {
    maxQueryLatency: 100,  // milliseconds
    maxCPUOverhead: 5,     // percentage
    slowQueryThreshold: 50,  // milliseconds (warning threshold)
    measureEncryptionOverhead: true
  };
}

/**
 * GDPR compliance configuration
 */
export interface GDPRConfig {
  dataRetentionDays: {
    standard: number;
    payment: number;
    audit: number;
    chat: number;
  };
  rightToErasureGracePeriodDays: number;
  dataExportFormat: 'JSON' | 'CSV' | 'PDF';
  privacyByDesign: boolean;
}

export function getGDPRConfig(): GDPRConfig {
  return {
    dataRetentionDays: {
      standard: 30,
      payment: 2555,  // 7 years for financial data
      audit: 2555,    // 7 years for audit trails
      chat: 90        // User-configurable, 90 days default
    },
    rightToErasureGracePeriodDays: 30,  // 30 days before permanent deletion
    dataExportFormat: 'JSON',
    privacyByDesign: true
  };
}
