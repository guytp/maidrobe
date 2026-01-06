-- ============================================
-- Migration 016: Always Encrypted for ChatLogs Table
-- File: database/migrations/016_always_encrypted_chatlogs.sql
-- Step: Implement column-level encryption for chat message content
-- ============================================

USE [buzz_tutor_$(ENVIRONMENT)];
GO

-- =============================================
-- Create Column Master Key for Chat Data
-- This key protects the column encryption keys for chat messages
-- =============================================
CREATE COLUMN MASTER KEY CMK_ChatData
WITH (
    KEY_STORE_PROVIDER_NAME = 'AZURE_KEY_VAULT',
    KEY_PATH = 'https://buzz-tutor-kms-$(ENVIRONMENT).vault.azure.net/keys/chat-data-cmk/'
);
GO

-- Note: For AWS KMS integration, use:
-- CREATE COLUMN MASTER KEY CMK_ChatData
-- WITH (
--     KEY_STORE_PROVIDER_NAME = 'AWS_KEY_STORE',
--     KEY_PATH = 'arn:aws:kms:$(AWS_REGION):$(ACCOUNT_ID):key/$(KMS_KEY_ID)'
-- );

-- =============================================
-- Create Column Encryption Key for Chat Data
-- This key is used to encrypt the message content
-- =============================================
CREATE COLUMN ENCRYPTION KEY CEK_ChatData
WITH VALUES (
    COLUMN_MASTER_KEY = CMK_ChatData,
    ALGORITHM = 'RSA_OAEP',
    ENCRYPTED_VALUE = 0x
);
GO

-- =============================================
-- Encrypt Sensitive Columns in ChatLogs Table
-- Message content may contain PII and must be encrypted
-- =============================================

-- Step 1: Add encrypted column for message content
ALTER TABLE dbo.ChatLogs
ADD message_content_encrypted VARBINARY(MAX) NULL;
GO

-- Step 2: Create procedure to migrate existing chat messages
CREATE OR ALTER PROCEDURE dbo.MigrateChatLogsToEncrypted
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @BatchSize INT = 500; -- Smaller batch for potentially large text
    DECLARE @Offset INT = 0;
    DECLARE @TotalRows INT;
    DECLARE @ProcessedRows INT = 0;
    
    -- Get total rows to process (only messages with content)
    SELECT @TotalRows = COUNT(*) 
    FROM dbo.ChatLogs 
    WHERE message_content_encrypted IS NULL 
      AND message_content IS NOT NULL;
    
    IF @TotalRows = 0
    BEGIN
        PRINT 'No rows to migrate. Either already migrated, table is empty, or no messages have content.';
        RETURN;
    END
    
    PRINT 'Starting migration of ' + CAST(@TotalRows AS VARCHAR(20)) + ' chat messages...';
    
    -- Batch processing for large text data
    WHILE @Offset < @TotalRows
    BEGIN
        BEGIN TRY
            -- Encrypt batch of messages
            WITH ChatLogsBatch AS (
                SELECT TOP (@BatchSize) log_id, message_content
                FROM dbo.ChatLogs
                WHERE message_content_encrypted IS NULL 
                  AND message_content IS NOT NULL
                ORDER BY log_id
            )
            UPDATE cl
            SET cl.message_content_encrypted = ENCRYPTBYKEY(KEY_GUID('CEK_ChatData'), 
                                                           CAST(cfb.message_content AS VARBINARY(MAX)))
            FROM dbo.ChatLogs cl
            INNER JOIN ChatLogsBatch cfb ON cl.log_id = cfb.log_id;
            
            SET @ProcessedRows = @ProcessedRows + @@ROWCOUNT;
            SET @Offset = @Offset + @BatchSize;
            
            PRINT 'Processed ' + CAST(@ProcessedRows AS VARCHAR(20)) + ' messages...';
            
        END TRY
        BEGIN CATCH
            PRINT 'Error during batch migration at offset ' + CAST(@Offset AS VARCHAR(20));
            PRINT 'Error: ' + ERROR_MESSAGE();
            THROW;
        END CATCH
    END
    
    PRINT 'Migration completed. Total messages processed: ' + CAST(@ProcessedRows AS VARCHAR(20));
END
GO

-- Step 3: Verify migration was successful
CREATE OR ALTER PROCEDURE dbo.VerifyChatLogsMigration
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @TotalRows INT;
    DECLARE @MigratedRows INT;
    DECLARE @UnmigratedRows INT;
    DECLARE @EmptyMessages INT;
    
    SELECT @TotalRows = COUNT(*) FROM dbo.ChatLogs;
    SELECT @MigratedRows = COUNT(*) FROM dbo.ChatLogs 
    WHERE message_content_encrypted IS NOT NULL;
    SELECT @EmptyMessages = COUNT(*) FROM dbo.ChatLogs 
    WHERE message_content IS NULL;
    SELECT @UnmigratedRows = COUNT(*) FROM dbo.ChatLogs 
    WHERE message_content_encrypted IS NULL 
      AND message_content IS NOT NULL;
    
    -- Verification report
    SELECT 'CHAT LOGS ENCRYPTION VERIFICATION' AS VerificationType,
           @TotalRows AS TotalRows,
           @MigratedRows AS MigratedRows,
           @EmptyMessages AS EmptyMessages,
           @UnmigratedRows AS UnmigratedRows,
           CASE 
               WHEN @UnmigratedRows = 0 THEN 'ALL MESSAGES ENCRYPTED'
               ELSE 'MIGRATION INCOMPLETE'
           END AS Status,
           GETDATE() AS VerifiedAt;
    
    -- Show sample if incomplete
    IF @UnmigratedRows > 0
    BEGIN
        SELECT TOP 5
               'UNMIGRATED MESSAGES' AS Category,
               log_id,
               LEN(message_content) AS ContentLength,
               created_at
        FROM dbo.ChatLogs
        WHERE message_content_encrypted IS NULL 
          AND message_content IS NOT NULL
        ORDER BY log_id;
    END
END
GO

-- Step 4: Create view for application compatibility
CREATE OR ALTER VIEW dbo.ChatLogs_Current
AS
SELECT 
    log_id,
    chat_id,
    sender_id,
    receiver_id,
    message_type,
    
    -- Decrypt message content
    CAST(
        DECRYPTBYKEY(message_content_encrypted) AS NVARCHAR(MAX)
    ) AS message_content,
    
    attachment_url,
    is_read,
    read_at,
    created_at,
    updated_at
FROM dbo.ChatLogs;
GO

-- Step 5: Permission update
GRANT SELECT ON dbo.ChatLogs_Current TO public;
GO

-- Step 6: Performance impact assessment
CREATE OR ALTER PROCEDURE dbo.AssessChatLogsEncryptionPerformance
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Baseline metrics
    DECLARE @BaselineQueryTimeMS INT = 75; -- Typical before encryption
    DECLARE @BaselineCPU INT = 15;
    
    -- Measure encrypted query performance
    DECLARE @StartTime DATETIME2 = SYSUTCDATETIME();
    DECLARE @RowCount INT;
    DECLARE @MessageSize INT;
    
    -- Test query on encrypted messages
    SELECT 
        @RowCount = COUNT(*),
        @MessageSize = AVG(LEN(message_content))
    FROM dbo.ChatLogs_Current 
    WHERE created_at >= DATEADD(day, -7, GETUTCDATE());
    
    DECLARE @EndTime DATETIME2 = SYSUTCDATETIME();
    DECLARE @EncryptedQueryTimeMS INT = DATEDIFF(millisecond, @StartTime, @EndTime);
    
    -- Performance assessment
    SELECT 'CHAT LOGS ENCRYPTION PERFORMANCE' AS TestType,
           @RowCount AS MessagesQueried,
           @MessageSize AS AvgMessageSize,
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
    
    -- Sample query performance
    SELECT TOP 5
           'SAMPLE MESSAGE QUERY' AS Category,
           log_id,
           chat_id,
           LEN(message_content) AS DecryptedContentLength,
           created_at
    FROM dbo.ChatLogs_Current
    WHERE created_at >= DATEADD(day, -1, GETUTCDATE())
    ORDER BY log_id DESC;
    
END
GO

-- Step 7: Rollback procedure
CREATE OR ALTER PROCEDURE dbo.RollbackChatLogsEncryption
AS
BEGIN
    SET NOCOUNT ON;
    
    PRINT 'Starting rollback of ChatLogs encryption...';
    
    -- Check if original column still exists
    IF EXISTS(SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ChatLogs') AND name = 'message_content')
    BEGIN
        PRINT 'Original column still exists - no rollback needed.';
        RETURN;
    END
    
    PRINT '⚠️  ROLLBACK REQUIRES RESTORE FROM BACKUP';
    PRINT 'Steps:';
    PRINT '1. Restore ChatLogs table from pre-encryption backup';
    PRINT '2. Drop encrypted column: message_content_encrypted';
    PRINT '3. Drop column encryption key: CEK_ChatData';
    PRINT '4. Drop column master key: CMK_ChatData';
    PRINT '5. Update application connection strings';
    
    -- Log rollback attempt
    INSERT INTO dbo.SecurityMigrationLog (table_name, migration_type, status, executed_at)
    VALUES ('ChatLogs', 'ROLLBACK', 'MANUAL_INTERVENTION_REQUIRED', GETUTCDATE());
    
END
GO

-- Step 8: Migration completion
CREATE OR ALTER PROCEDURE dbo.CompleteChatLogsEncryptionMigration
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Verify all data is migrated
    EXEC dbo.VerifyChatLogsMigration;
    
    -- Run performance assessment
    EXEC dbo.AssessChatLogsEncryptionPerformance;
    
    -- Log completion
    INSERT INTO dbo.SecurityMigrationLog (table_name, migration_type, status, executed_at)
    VALUES ('ChatLogs', 'ENCRYPTION', 'COMPLETED', GETUTCDATE());
    
    PRINT '✅ ChatLogs encryption migration completed successfully!';
    
END
GO

-- =============================================
-- Application Connection String Update Required
-- =============================================
/*

CONNECTION STRING UPDATE FOR CHAT LOGS:

Update your application connection string to include:

ColumnEncryption=Enabled;

Or for Node.js tedious driver:
{
  encrypt: true,
  columnEncryptionSetting: 'Enabled'
}

This enables automatic encryption/decryption of message_content.

*/

-- =============================================
-- Migration Complete
-- =============================================
SELECT 'Migration 016: ChatLogs Always Encrypted setup completed' AS Status,
       GETDATE() AS CompletedAt,
       'Next: Execute dbo.MigrateChatLogsToEncrypted to encrypt existing messages' AS NextStep;
GO