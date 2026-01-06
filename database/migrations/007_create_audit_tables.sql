-- ============================================
-- Table: AuditLog (Compliance - All Sensitive Operations)
-- ============================================

CREATE TABLE dbo.AuditLog (
    AuditId BIGINT IDENTITY(1,1) PRIMARY KEY,
    EventType NVARCHAR(100) NOT NULL,
    UserId UNIQUEIDENTIFIER NULL,
    TableName NVARCHAR(100) NULL,
    RecordId NVARCHAR(100) NULL,
    OperationDetails NVARCHAR(MAX) NULL,
    ClientIPAddress NVARCHAR(45) NULL,
    UserAgent NVARCHAR(1000) NULL,
    CorrelationId NVARCHAR(100) NULL,
    LegalBasis NVARCHAR(50) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    -- Indexes
    INDEX IX_AuditLog_UserId (UserId, CreatedAt DESC),
    INDEX IX_AuditLog_EventType (EventType, CreatedAt DESC),
    INDEX IX_AuditLog_CreatedAt (CreatedAt DESC),
    INDEX IX_AuditLog_CorrelationId (CorrelationId)
);
GO

-- ============================================
-- Table: EncryptionKeyAudit (Key Management Audit)
-- ============================================

CREATE TABLE dbo.EncryptionKeyAudit (
    KeyAuditId BIGINT IDENTITY(1,1) PRIMARY KEY,
    KeyName NVARCHAR(255) NOT NULL,
    Operation NVARCHAR(50) NOT NULL,
    PerformedBy NVARCHAR(100) NOT NULL,
    UserId UNIQUEIDENTIFIER NULL,
    Reason NVARCHAR(500) NULL,
    OldKeyVersion BIGINT NULL,
    NewKeyVersion BIGINT NULL,
    KMSKeyARN NVARCHAR(500) NULL,
    Success BIT NOT NULL,
    ErrorMessage NVARCHAR(MAX) NULL,
    CorrelationId NVARCHAR(100) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    -- Indexes
    INDEX IX_EncryptionKeyAudit_KeyName (KeyName, CreatedAt DESC),
    INDEX IX_EncryptionKeyAudit_PerformedBy (PerformedBy, CreatedAt DESC),
    INDEX IX_EncryptionKeyAudit_CreatedAt (CreatedAt DESC)
);
GO
