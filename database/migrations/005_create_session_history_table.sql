-- ============================================
-- Table: SessionHistory (Audit Trail - Medium Sensitivity)
-- ============================================

CREATE TABLE dbo.SessionHistory (
    SessionId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    UserId UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES dbo.Users(UserId) ON DELETE CASCADE,
    SessionTokenHash NVARCHAR(255) NOT NULL,
    IPAddress NVARCHAR(45) NULL,
    UserAgent NVARCHAR(1000) NULL,
    DeviceFingerprint NVARCHAR(255) NULL,
    StartedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    LastActivityAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    ExpiresAt DATETIME2 NOT NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    Country NVARCHAR(100) NULL,
    Region NVARCHAR(100) NULL,
    City NVARCHAR(100) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    -- Indexes
    INDEX IX_SessionHistory_UserId (UserId),
    INDEX IX_SessionHistory_SessionTokenHash (SessionTokenHash),
    INDEX IX_SessionHistory_LastActivityAt (LastActivityAt DESC),
    INDEX IX_SessionHistory_ExpiresAt (ExpiresAt)
);
GO
