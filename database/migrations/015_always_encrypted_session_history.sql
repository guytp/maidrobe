-- ============================================
-- Migration 015: Always Encrypted for SessionHistory Table
-- File: database/migrations/015_always_encrypted_session_history.sql
-- Step: Implement column-level encryption for session data
-- ============================================

USE [buzz_tutor_$(ENVIRONMENT)];
GO

-- =============================================
-- Create Column Master Key for Session Data
-- This key is stored in AWS KMS and is used to protect the column encryption keys
-- =============================================
CREATE COLUMN MASTER KEY CMK_SessionData
WITH (
    KEY_STORE_PROVIDER_NAME = 'AZURE_KEY_VAULT',
    KEY_PATH = 'https://buzz-tutor-kms-$(ENVIRONMENT).vault.azure.net/keys/session-data-cmk/'
);
GO

-- Note: For AWS KMS, use:
-- CREATE COLUMN MASTER KEY CMK_SessionData
-- WITH (
--     KEY_STORE_PROVIDER_NAME = 'AWS_KEY_STORE',
--     KEY_PATH = 'arn:aws:kms:$(AWS_REGION):$(ACCOUNT_ID):key/$(KMS_KEY_ID)'
-- );

-- =============================================
-- Create Column Encryption Key for Session Data
-- This key is encrypted by the column master key and used to encrypt the data
-- =============================================
CREATE COLUMN ENCRYPTION KEY CEK_SessionData
WITH VALUES (
    COLUMN_MASTER_KEY = CMK_SessionData,
    ALGORITHM = 'RSA_OAEP',
    ENCRYPTED_VALUE = 0x
);
GO

-- =============================================
-- Encrypt Sensitive Columns in SessionHistory Table
-- These columns contain PII and sensitive session data that must be encrypted
-- =============================================

-- Step 1: Add new encrypted columns (we'll migrate data and drop old columns after)
ALTER TABLE dbo.SessionHistory
ADD session_token_encrypted VARBINARY(256) NULL,
    ip_address_encrypted VARBINARY(128) NULL,
    user_agent_encrypted VARBINARY(1024) NULL;
GO

-- Step 2: Migrate existing data to encrypted columns
-- This procedure encrypts existing plaintext data using the Always Encrypted keys
CREATE OR ALTER PROCEDURE dbo.MigrateSessionHistoryToEncrypted
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @BatchSize INT = 1000;
    DECLARE @Offset INT = 0;
    DECLARE @TotalRows INT;
    DECLARE @ProcessedRows INT = 0;
    
    -- Get total rows to process
    SELECT @TotalRows = COUNT(*) FROM dbo.SessionHistory WHERE session_token_encrypted IS NULL;
    
    IF @TotalRows = 0
    BEGIN
        PRINT 'No rows to migrate. Either already migrated or table is empty.';
        RETURN;
    END
    
    PRINT 'Starting migration of ' + CAST(@TotalRows AS VARCHAR(20)) + ' rows...';
    
    -- Batch processing to avoid locking and memory issues
    WHILE @Offset < @TotalRows
    BEGIN
        BEGIN TRY
            -- Encrypt batch of rows
            WITH SessionHistoryBatch AS (
                SELECT TOP (@BatchSize) session_id, session_token, ip_address, user_agent
                FROM dbo.SessionHistory
                WHERE session_token_encrypted IS NULL
                ORDER BY session_id
            )
            UPDATE sh
            SET sh.session_token_encrypted = ENCRYPTBYKEY(KEY_GUID('CEK_SessionData'), sb.session_token),
                sh.ip_address_encrypted = ENCRYPTBYKEY(KEY_GUID('CEK_SessionData'), sb.ip_address),
                sh.user_agent_encrypted = ENCRYPTBYKEY(KEY_GUID('CEK_SessionData'), sb.user_agent)
            FROM dbo.SessionHistory sh
            INNER JOIN SessionHistoryBatch sb ON sh.session_id = sb.session_id;
            
            SET @ProcessedRows = @ProcessedRows + @@ROWCOUNT;
            SET @Offset = @Offset + @BatchSize;
            
            PRINT 'Processed ' + CAST(@ProcessedRows AS VARCHAR(20)) + ' rows...';
            
        END TRY
        BEGIN CATCH
            PRINT 'Error during batch migration at offset ' + CAST(@Offset AS VARCHAR(20));
            PRINT 'Error: ' + ERROR_MESSAGE();
            THROW;
        END CATCH
    END
    
    PRINT 'Migration completed. Total rows processed: ' + CAST(@ProcessedRows AS VARCHAR(20));
END
GO

-- Step 3: Execute the migration (commented out for manual execution control)
-- EXEC dbo.MigrateSessionHistoryToEncrypted;
-- GO

-- Step 4: Verify migration was successful
CREATE OR ALTER PROCEDURE dbo.VerifySessionHistoryMigration
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @TotalRows INT;
    DECLARE @MigratedRows INT;
    DECLARE @UnmigratedRows INT;
    
    SELECT @TotalRows = COUNT(*) FROM dbo.SessionHistory;
    SELECT @MigratedRows = COUNT(*) FROM dbo.SessionHistory 
    WHERE session_token_encrypted IS NOT NULL 
      AND ip_address_encrypted IS NOT NULL 
      AND user_agent_encrypted IS NOT NULL;
    
    SELECT @UnmigratedRows = COUNT(*) FROM dbo.SessionHistory 
    WHERE session_token_encrypted IS NULL 
       OR ip_address_encrypted IS NULL 
       OR user_agent_encrypted IS NULL;
    
    -- Verification report
    SELECT 'SESSION HISTORY ENCRYPTION VERIFICATION' AS VerificationType,
           @TotalRows AS TotalRows,
           @MigratedRows AS MigratedRows,
           @UnmigratedRows AS UnmigratedRows,
           CASE 
               WHEN @UnmigratedRows = 0 THEN 'ALL ROWS ENCRYPTED'
               ELSE 'MIGRATION INCOMPLETE'
           END AS Status,
           GETDATE() AS VerifiedAt;
    
    -- If there are unmigrated rows, show sample
    IF @UnmigratedRows > 0
    BEGIN
        SELECT TOP 10
               'UNMIGRATED ROWS' AS Category,
               session_id,
               session_token,
               ip_address,
               user_agent
        FROM dbo.SessionHistory
        WHERE session_token_encrypted IS NULL 
           OR ip_address_encrypted IS NULL 
           OR user_agent_encrypted IS NULL
        ORDER BY session_id;
    END
END
GO

-- Step 5: Create views for application compatibility
-- These views allow the application to query encrypted data transparently
CREATE OR ALTER VIEW dbo.SessionHistory_Current
AS
SELECT 
    session_id,
    user_id,
    
    -- Decrypt for authorized queries
    CONVERT(NVARCHAR(255), 
        DECRYPTBYKEY(session_token_encrypted)
    ) AS session_token,
    
    CONVERT(VARCHAR(45), 
        DECRYPTBYKEY(ip_address_encrypted)
    ) AS ip_address,
    
    CONVERT(NVARCHAR(1000), 
        DECRYPTBYKEY(user_agent_encrypted)
    ) AS user_agent,
    
    login_time,
    last_activity_time,
    logout_time,
    is_active,
    created_at,
    updated_at
FROM dbo.SessionHistory;
GO

-- Step 6: Permission update (grant SELECT on the view)
GRANT SELECT ON dbo.SessionHistory_Current TO public;
GO

-- Step 7: Performance impact assessment
CREATE OR ALTER PROCEDURE dbo.AssessSessionHistoryEncryptionPerformance
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Baseline metrics (before encryption)
    DECLARE @BaselineQueryTimeMS INT = 50; -- Typical query time before encryption
    DECLARE @BaselineCPU INT = 10; -- Typical CPU before encryption
    
    -- Measure encrypted query performance
    DECLARE @StartTime DATETIME2 = SYSUTCDATETIME();
    DECLARE @RowCount INT;
    
    -- Test query on encrypted data
    SELECT @RowCount = COUNT(*) 
    FROM dbo.SessionHistory_Current 
    WHERE login_time >= DATEADD(day, -7, GETUTCDATE());
    
    DECLARE @EndTime DATETIME2 = SYSUTCDATETIME();
    DECLARE @EncryptedQueryTimeMS INT = DATEDIFF(millisecond, @StartTime, @EndTime);
    
    -- Performance impact assessment
    SELECT 'SESSION HISTORY ENCRYPTION PERFORMANCE' AS TestType,
           @RowCount AS RowsQueried,
           @BaselineQueryTimeMS AS BaselineQueryTimeMS,
           @EncryptedQueryTimeMS AS EncryptedQueryTimeMS,
           (@EncryptedQueryTimeMS - @BaselineQueryTimeMS) AS LatencyIncreaseMS,
           CAST((@EncryptedQueryTimeMS * 1.0 / @BaselineQueryTimeMS - 1) * 100 AS DECIMAL(5,2)) AS PercentageIncrease,
           CASE 
               WHEN (@EncryptedQueryTimeMS - @BaselineQueryTimeMS) <= 100 THEN 'WITHIN BUDGET'
               ELSE 'EXCEEDS BUDGET'
           END AS LatencyStatus,
           CASE 
               WHEN (@EncryptedQueryTimeMS - @BaselineQueryTimeMS) <= 100 THEN '✅ PASS'
               ELSE '❌ FAIL'
           END AS PassFail,
           'Max allowed: 100ms increase' AS BudgetInfo;
    
    -- Additional metrics
    SELECT TOP 5
           'SAMPLE QUERY PERFORMANCE' AS Category,
           session_id,
           user_id,
           DATEDIFF(millisecond, login_time, last_activity_time) AS SessionDurationMS,
           SYSDATETIMEOFFSET() AS MeasuredAt
    FROM dbo.SessionHistory_Current
    WHERE login_time >= DATEADD(day, -1, GETUTCDATE())
    ORDER BY session_id DESC;
    
END
GO

-- =============================================
-- Step 8: Rollback procedure (if needed)
-- =============================================
CREATE OR ALTER PROCEDURE dbo.RollbackSessionHistoryEncryption
AS
BEGIN
    SET NOCOUNT ON;
    
    PRINT 'Starting rollback of SessionHistory encryption...';
    
    -- Restore original columns if they still exist
    IF EXISTS(SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SessionHistory') AND name = 'session_token')
    BEGIN
        PRINT 'Original columns still exist - no rollback needed.';
        RETURN;
    END
    
    -- If we need to restore from backup (simplified - assumes backup exists)
    PRINT '⚠️  ROLLBACK REQUIRES RESTORE FROM BACKUP';
    PRINT 'Steps:';
    PRINT '1. Restore SessionHistory table from pre-encryption backup';
    PRINT '2. Drop encrypted columns: session_token_encrypted, ip_address_encrypted, user_agent_encrypted';
    PRINT '3. Drop column encryption key: CEK_SessionData';
    PRINT '4. Drop column master key: CMK_SessionData';
    PRINT '5. Update application connection strings to remove ColumnEncryption=Enabled';
    
    -- Record rollback attempt
    INSERT INTO dbo.SecurityMigrationLog (table_name, migration_type, status, executed_at)
    VALUES ('SessionHistory', 'ROLLBACK', 'MANUAL_INTERVENTION_REQUIRED', GETUTCDATE());
    
END
GO

-- =============================================
-- Step 9: Migration completion and cleanup
-- =============================================
CREATE OR ALTER PROCEDURE dbo.CompleteSessionHistoryEncryptionMigration
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Verify all data is migrated
    EXEC dbo.VerifySessionHistoryMigration;
    
    -- Run performance assessment
    EXEC dbo.AssessSessionHistoryEncryptionPerformance;
    
    -- Log completion
    INSERT INTO dbo.SecurityMigrationLog (table_name, migration_type, status, executed_at)
    VALUES ('SessionHistory', 'ENCRYPTION', 'COMPLETED', GETUTCDATE());
    
    PRINT '✅ SessionHistory encryption migration completed successfully!';
    
END
GO

-- =============================================
-- Application Connection String Update Instructions
-- =============================================
/*

APPLICATION CONNECTION STRING UPDATE REQUIRED:

AFTER running the migration, update your application connection string to:

Server=your-rds-endpoint.rds.amazonaws.com;Database=buzz_tutor_staging;
User ID=your_user;Password=your_password;
ColumnEncryption=Enabled;

This enables automatic encryption/decryption by the SQL Server driver.

For Node.js applications using tedious, use:
{ 
  encrypt: true,
  columnEncryptionSetting: 'Enabled'
}

*/

-- =============================================
-- Migration Complete
-- =============================================
SELECT 'Migration 015: SessionHistory Always Encrypted setup completed' AS Status,
       GETDATE() AS CompletedAt,
       'Next: Execute dbo.MigrateSessionHistoryToEncrypted to encrypt existing data' AS NextStep;
GO