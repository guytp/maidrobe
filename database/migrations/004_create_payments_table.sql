-- ============================================
-- Table: Payments (PCI DSS Scope - Highest Sensitivity)
-- ============================================

CREATE TABLE dbo.Payments (
    PaymentId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    UserId UNIQUEIDENTIFIER NOT NULL FOREIGN KEY REFERENCES dbo.Users(UserId) ON DELETE CASCADE,
    OrderId NVARCHAR(100) NOT NULL,
    -- PCI DSS: Tokenized payment data (from Stripe/Braintree)
    PaymentToken NVARCHAR(255) COLLATE Latin1_General_BIN2 ENCRYPTED WITH (
        COLUMN_ENCRYPTION_KEY = CEK_PaymentData,
        ENCRYPTION_TYPE = Deterministic,
        ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
    ) NULL,
    -- Last 4 digits for display
    LastFourDigits NVARCHAR(4) NOT NULL,
    CardBrand NVARCHAR(50) NOT NULL,
    ExpiryMonth TINYINT NOT NULL,
    ExpiryYear SMALLINT NOT NULL,
    -- Payment metadata
    Amount DECIMAL(10,2) NOT NULL,
    Currency NVARCHAR(3) NOT NULL DEFAULT 'USD',
    Status NVARCHAR(50) NOT NULL,
    PaymentMethod NVARCHAR(50) NOT NULL,
    -- Encrypted billing address
    BillingAddress NVARCHAR(MAX) COLLATE Latin1_General_BIN2 ENCRYPTED WITH (
        COLUMN_ENCRYPTION_KEY = CEK_PaymentData,
        ENCRYPTION_TYPE = Randomized,
        ALGORITHM = 'AEAD_AES_256_CBC_HMAC_SHA_256'
    ) NULL,
    -- Timestamps
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    ProcessedAt DATETIME2 NULL,
    -- Indexes
    INDEX IX_Payments_UserId (UserId),
    INDEX IX_Payments_CreatedAt (CreatedAt DESC),
    INDEX IX_Payments_OrderId (OrderId),
    INDEX IX_Payments_Status (Status)
);
GO
