-- ============================================
-- Table: ChatLogs (GDPR Sensitive - Right to Erasure)
-- ============================================

CREATE TABLE dbo.ChatLogs (
    ChatId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    UserId UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES dbo.Users(UserId) ON DELETE CASCADE,
    SessionId UNIQUEIDENTIFIER NULL FOREIGN KEY REFERENCES dbo.SessionHistory(SessionId),
    TutorId UNIQUEIDENTIFIER NULL,
    ChatRoom NVARCHAR(255) NOT NULL,
    MessageContent NVARCHAR(MAX) COLLATE Latin1_General_BIN2 ENCRYPTED WITH (
        COLUMN_ENCRYPTION_KEY = CEK_UserData,
        ENCRYPTION_TYPE = Randomized,
        ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
    ) NULL,
    MessageType NVARCHAR(50) NOT NULL,
    IsTutorMessage BIT NOT NULL,
    AttachmentUrl NVARCHAR(500) NULL,
    AttachmentType NVARCHAR(50) NULL,
    SentAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    ReadAt DATETIME2 NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    RetentionPolicy NVARCHAR(50) NOT NULL DEFAULT 'standard',
    ScheduledForDeletionAt DATETIME2 NULL,
    -- Indexes
    INDEX IX_ChatLogs_UserId (UserId),
    INDEX IX_ChatLogs_SessionId (SessionId),
    INDEX IX_ChatLogs_SentAt (SentAt DESC),
    INDEX IX_ChatLogs_ChatRoom (ChatRoom),
    INDEX IX_ChatLogs_RetentionPolicy (RetentionPolicy),
    INDEX IX_ChatLogs_ScheduledForDeletionAt (ScheduledForDeletionAt) WHERE ScheduledForDeletionAt IS NOT NULL
);
GO
