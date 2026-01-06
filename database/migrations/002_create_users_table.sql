-- ============================================
-- Table: Users (Authentication data - Medium Sensitivity)
-- ============================================

CREATE TABLE dbo.Users (
    UserId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    -- Email encrypted for GDPR compliance
    Email NVARCHAR(255) COLLATE Latin1_General_BIN2 ENCRYPTED WITH (
        COLUMN_ENCRYPTION_KEY = CEK_UserData,
        ENCRYPTION_TYPE = Deterministic,
        ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
    ) NOT NULL,
    -- Password hash is already hashed (bcrypt), no need for encryption
    PasswordHash NVARCHAR(255) NOT NULL,
    -- Account status and metadata
    IsActive BIT NOT NULL DEFAULT 1,
    EmailVerified BIT NOT NULL DEFAULT 0,
    -- GDPR compliance - consent tracking
    ConsentToMarketing BIT NOT NULL DEFAULT 0,
    PrivacyPolicyAcceptedAt DATETIME2 NULL,
    GDPRDataExportRequestedAt DATETIME2 NULL,
    GDPRRightToBeForgottenRequestedAt DATETIME2 NULL,
    -- Timestamps
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    LastLoginAt DATETIME2 NULL,
    -- Indexes on non-encrypted columns
    INDEX IX_Users_CreatedAt (CreatedAt DESC),
    INDEX IX_Users_Active (UserId) WHERE IsActive = 1
);
GO

-- Add comments for documentation
EXEC sys.sp_addextendedproperty  
    @name = N'Description',   
    @value = N'Core user authentication table with encrypted email for GDPR compliance',   
    @level0type = N'SCHEMA',   
    @level0name = 'dbo',   
    @level1type = N'TABLE',   
    @level1name = N'Users';
GO
