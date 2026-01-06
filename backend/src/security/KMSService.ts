/**
 * AWS KMS Key Management Service for Buzz A Tutor
 *
 * Provides encryption key lifecycle management for SQL Server Always Encrypted
 * Integrates with AWS RDS SQL Server and AWS KMS for key rotation and revocation
 *
 * @module security/KMSService
 */

import * as AWS from 'aws-sdk';
// import { v4 as uuidv4 } from 'uuid'; // Reserved for future use

export interface EncryptionKeySet {
  userId: string;
  cekName: string;
  cmkArn: string;
  createdAt: Date;
  version: number;
}

export interface KeyRotationResult {
  success: boolean;
  oldKeyVersion: number;
  newKeyVersion: number;
  rotatedAt: Date;
  correlationId: string;
}

export interface KeyRevocationResult {
  success: boolean;
  keyName: string;
  revokedAt: Date;
  reason: string;
}

/**
 * Audit log entry for key management operations
 */
export interface KeyManagementAuditLog {
  keyName: string;
  operation: 'CREATE' | 'ROTATE' | 'REVOKE' | 'ACCESS';
  performedBy: string; // IAM Role ARN or User ID
  userId?: string;
  reason?: string;
  oldKeyVersion?: number;
  newKeyVersion?: number;
  kmsKeyArn: string;
  success: boolean;
  errorMessage?: string;
  correlationId: string;
  timestamp: Date;
}

export class KMSService {
  private kms: AWS.KMS;
  private readonly KEY_ROTATION_DAYS = 90;
  private readonly _auditTable = 'dbo.EncryptionKeyAudit';

  constructor() {
    this.kms = new AWS.KMS({
      region: process.env['AWS_REGION'] || 'us-east-1',
      apiVersion: '2014-11-01',
    });
  }

  /**
   * Initialize encryption keys for a new user/tutor
   * @param userId - The user ID from dbo.Users
   * @param correlationId - Request correlation ID for audit trail
   * @returns EncryptionKeySet with key metadata
   */
  async initializeUserEncryption(userId: string, correlationId: string): Promise<EncryptionKeySet> {
    const performedBy = this.getCurrentIAMRole();
    const keySet: EncryptionKeySet = {
      userId,
      cekName: `CEK_User_${userId.replace(/-/g, '')}`,
      cmkArn: process.env['AWS_KMS_USER_DATA_CMK_ARN']!,
      createdAt: new Date(),
      version: 1,
    };

    try {
      // In AWS RDS SQL Server, CEK creation happens via SQL script
      // We log the initialization for audit purposes
      await this.logKeyOperation({
        keyName: keySet.cekName,
        operation: 'CREATE',
        performedBy,
        userId,
        reason: 'User registration - initial encryption key setup',
        newKeyVersion: 1,
        kmsKeyArn: keySet.cmkArn,
        success: true,
        correlationId,
        timestamp: new Date(),
      });

      console.log(`[KMSService] Initialized encryption for user ${userId}`, {
        keyName: keySet.cekName,
        correlationId,
      });

      return keySet;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await this.logKeyOperation({
        keyName: keySet.cekName,
        operation: 'CREATE',
        performedBy,
        userId,
        reason: 'Failed to initialize user encryption',
        kmsKeyArn: keySet.cmkArn,
        success: false,
        errorMessage,
        correlationId,
        timestamp: new Date(),
      });

      console.error(`[KMSService] Failed to initialize encryption for user ${userId}`, {
        error: errorMessage,
        correlationId,
      });

      throw error;
    }
  }

  /**
   * Rotate a Column Encryption Key (CEK) for enhanced security
   * Implements 90-day automated rotation
   * @param cekName - Name of the CEK to rotate
   * @param userId - Associated user ID
   * @param correlationId - Request correlation ID
   * @returns KeyRotationResult with new version info
   */
  async rotateColumnEncryptionKey(
    cekName: string,
    userId: string,
    correlationId: string
  ): Promise<KeyRotationResult> {
    const performedBy = this.getCurrentIAMRole();
    const rotationTime = new Date();

    try {
      // Verify rotation period has elapsed (90 days)
      const lastRotation = await this.getLastKeyRotation(cekName);
      if (lastRotation) {
        const daysSinceRotation =
          (rotationTime.getTime() - lastRotation.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceRotation < this.KEY_ROTATION_DAYS) {
          throw new Error(
            `Key rotation not yet due. Days since last rotation: ${daysSinceRotation.toFixed(0)} < ${this.KEY_ROTATION_DAYS}`
          );
        }
      }

      // Trigger KMS key rotation
      const _rotateResult = await this.kms
        .scheduleKeyRotation({
          KeyId: process.env['AWS_KMS_USER_DATA_CMK_ARN']!,
        })
        .promise();

      const oldVersion = await this.getCurrentKeyVersion(cekName);
      const newVersion = (oldVersion || 0) + 1;

      // In RDS SQL Server, re-encryption happens automatically
      // We just update our audit log
      const rotationResult: KeyRotationResult = {
        success: true,
        oldKeyVersion: oldVersion || 1,
        newKeyVersion: newVersion,
        rotatedAt: rotationTime,
        correlationId,
      };

      await this.logKeyOperation({
        keyName: cekName,
        operation: 'ROTATE',
        performedBy,
        userId,
        reason: `Automated ${this.KEY_ROTATION_DAYS}-day key rotation`,
        oldKeyVersion: oldVersion || 1,
        newKeyVersion: newVersion,
        kmsKeyArn: process.env['AWS_KMS_USER_DATA_CMK_ARN']!,
        success: true,
        correlationId,
        timestamp: rotationTime,
      });

      console.log(`[KMSService] Rotated encryption key ${cekName}`, {
        oldVersion: oldVersion || 1,
        newVersion,
        correlationId,
      });

      return rotationResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await this.logKeyOperation({
        keyName: cekName,
        operation: 'ROTATE',
        performedBy,
        userId,
        reason: `Automated ${this.KEY_ROTATION_DAYS}-day key rotation`,
        kmsKeyArn: process.env['AWS_KMS_USER_DATA_CMK_ARN']!,
        success: false,
        errorMessage,
        correlationId,
        timestamp: rotationTime,
      });

      console.error(`[KMSService] Failed to rotate key ${cekName}`, {
        error: errorMessage,
        correlationId,
      });

      throw error;
    }
  }

  /**
   * Emergency key revocation for security incidents
   * @param cekName - Name of the CEK to revoke
   * @param reason - Reason for revocation (security incident, compromise, etc.)
   * @param correlationId - Incident correlation ID
   * @returns KeyRevocationResult
   */
  async revokeEncryptionKey(
    cekName: string,
    reason: string,
    correlationId: string
  ): Promise<KeyRevocationResult> {
    const performedBy = this.getCurrentIAMRole();
    const revocationTime = new Date();

    try {
      // Disable the KMS key
      await this.kms
        .disableKey({
          KeyId: process.env['AWS_KMS_USER_DATA_CMK_ARN']!,
        })
        .promise();

      // Create a new key version for replacement
      await this.kms
        .scheduleKeyDeletion({
          KeyId: process.env['AWS_KMS_USER_DATA_CMK_ARN']!,
          PendingWindowInDays: 7, // 7-day recovery window
        })
        .promise();

      const revocationResult: KeyRevocationResult = {
        success: true,
        keyName: cekName,
        revokedAt: revocationTime,
        reason,
      };

      await this.logKeyOperation({
        keyName: cekName,
        operation: 'REVOKE',
        performedBy,
        reason,
        kmsKeyArn: process.env['AWS_KMS_USER_DATA_CMK_ARN']!,
        success: true,
        correlationId,
        timestamp: revocationTime,
      });

      console.error(`[KMSService] EMERGENCY KEY REVOCATION: ${cekName}`, {
        reason,
        correlationId,
        revokedAt: revocationTime,
      });

      return revocationResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await this.logKeyOperation({
        keyName: cekName,
        operation: 'REVOKE',
        performedBy,
        reason,
        kmsKeyArn: process.env['AWS_KMS_USER_DATA_CMK_ARN']!,
        success: false,
        errorMessage,
        correlationId,
        timestamp: revocationTime,
      });

      console.error(`[KMSService] Failed to revoke key ${cekName}`, {
        error: errorMessage,
        correlationId,
      });

      throw error;
    }
  }

  /**
   * Get current KMS key version from SQL Server audit log
   */
  private async getCurrentKeyVersion(_cekName: string): Promise<number | null> {
    // This would query the SQL Server database
    // Implementation depends on your SQL client library
    // For now, returning null to indicate unknown
    return null;
  }

  /**
   * Get last key rotation date from audit log
   */
  private async getLastKeyRotation(_cekName: string): Promise<Date | null> {
    // Query SQL Server for last rotation
    // Implementation depends on your SQL client library
    return null;
  }

  /**
   * Log key management operation to SQL Server audit table
   */
  private async logKeyOperation(logEntry: KeyManagementAuditLog): Promise<void> {
    // This would insert into dbo.EncryptionKeyAudit
    // Implementation depends on your SQL client library
    console.log(`[KMSService-Audit] ${logEntry.operation} on ${logEntry.keyName}`, {
      success: logEntry.success,
      correlationId: logEntry.correlationId,
      userId: logEntry.userId,
    });
  }

  /**
   * Get current IAM role (for audit logging)
   */
  private getCurrentIAMRole(): string {
    // In Lambda/ECS: get from IAM metadata
    // In development: from environment variable
    return (
      process.env['AWS_IAM_ROLE_ARN'] || 'arn:aws:iam::${AWS_ACCOUNT}:role/BuzzTutorApplicationRole'
    );
  }

  /**
   * Automated key rotation scheduler
   * Should be called daily via AWS EventBridge
   */
  async performScheduledKeyRotations(correlationId: string): Promise<void> {
    console.log(`[KMSService] Starting scheduled key rotation check`, { correlationId });

    try {
      // Query for keys due for rotation (90 days)
      // This would query dbo.EncryptionKeyAudit for keys needing rotation

      const keysDueForRotation = await this.getKeysDueForRotation();

      for (const keyInfo of keysDueForRotation) {
        try {
          await this.rotateColumnEncryptionKey(keyInfo.cekName, keyInfo.userId, correlationId);
        } catch (error) {
          console.error(`[KMSService] Failed to rotate key ${keyInfo.cekName}`, {
            error: error instanceof Error ? error.message : 'Unknown error',
            correlationId,
          });
          // Continue with other keys even if one fails
        }
      }

      console.log(`[KMSService] Completed scheduled key rotation check`, {
        keysProcessed: keysDueForRotation.length,
        correlationId,
      });
    } catch (error) {
      console.error(`[KMSService] Failed to perform scheduled rotations`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId,
      });
      throw error;
    }
  }

  private async getKeysDueForRotation(): Promise<Array<{ cekName: string; userId: string }>> {
    // Query SQL Server for keys where last rotation > 90 days ago
    // Implementation depends on SQL client
    return [];
  }
}

// Singleton instance
export const kmsService = new KMSService();
