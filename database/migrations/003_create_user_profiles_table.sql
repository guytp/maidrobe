-- ============================================
-- Table: UserProfiles (Extended PII - High Sensitivity)
-- ============================================

CREATE TABLE dbo.UserProfiles (
    ProfileId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    UserId UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES dbo.Users(UserId) ON DELETE CASCADE,
    -- PII Fields - Always Encrypted for GDPR
    FullName NVARCHAR(500) COLLATE Latin1_General_BIN2 ENCRYPTED WITH (
        COLUMN_ENCRYPTION_KEY = CEK_UserData,
        ENCRYPTION_TYPE = Deterministic,
        ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
    ) NULL,
    PhoneNumber NVARCHAR(50) COLLATE Latin1_General_BIN2 ENCRYPTED WITH (
        COLUMN_ENCRYPTION_KEY = CEK_UserData,
        ENCRYPTION_TYPE = Deterministic,
        ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
    ) NULL,
    Address NVARCHAR(MAX) COLLATE Latin1_General_BIN2 ENCRYPTED WITH (
        COLUMN_ENCRYPTION_KEY = CEK_UserData,
        ENCRYPTION_TYPE = Randomized,
        ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
    ) NULL,
    DateOfBirth DATE ENCRYPTED WITH (
        COLUMN_ENCRYPTION_KEY = CEK_UserData,
        ENCRYPTION_TYPE = Deterministic,
        ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
    ) NULL,
    -- Non-sensitive fields
    ProfilePictureUrl NVARCHAR(500) NULL,
    TimeZone NVARCHAR(100) NOT NULL DEFAULT 'UTC',
    -- Timestamps
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    -- Indexes
    INDEX IX_UserProfiles_UserId (UserId),
    INDEX IX_UserProfiles_CreatedAt (CreatedAt DESC)
);
GO

-- Add comments
EXEC sys.sp_addextendedproperty  
    @name = N'Description',   
    @value = N'Extended user profile with encrypted PII fields for GDPR compliance',   
    @level0type = N'SCHEMA',   
    @level0name = 'dbo',   
    @level1type = N'TABLE',   
    @level1name = N'UserProfiles';
GO
