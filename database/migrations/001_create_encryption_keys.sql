-- ============================================
-- Buzz A Tutor Security Schema for SQL Server
-- Step 1: Create Encryption Keys for Always Encrypted
-- ============================================

-- Create Database Master Key (required for certificate creation)
-- Protected by AWS KMS in RDS - not a traditional password
CREATE MASTER KEY ENCRYPTION BY PASSWORD = '${SQL_SERVER_MASTER_KEY_PASSWORD}';
GO

-- Create Column Master Key (CMK) referencing AWS KMS
-- The CMK is created in AWS KMS and referenced here by its ARN
CREATE COLUMN MASTER KEY CMK_UserData
WITH (
    KEY_STORE_PROVIDER_NAME = 'AWS_KMS',
    KEY_PATH = '${AWS_KMS_CMK_ARN}'
);
GO

CREATE COLUMN MASTER KEY CMK_PaymentData
WITH (
    KEY_STORE_PROVIDER_NAME = 'AWS_KMS',
    KEY_PATH = '${AWS_KMS_PAYMENT_CMK_ARN}'
);
GO

-- Create Column Encryption Keys (CEK)
CREATE COLUMN ENCRYPTION KEY CEK_UserData
WITH VALUES (
    COLUMN_MASTER_KEY = CMK_UserData,
    ALGORITHM = 'RSA_OAEP',
    ENCRYPTED_VALUE = 0x
);
GO

CREATE COLUMN ENCRYPTION KEY CEK_PaymentData
WITH VALUES (
    COLUMN_MASTER_KEY = CMK_PaymentData,
    ALGORITHM = 'RSA_OAEP',
    ENCRYPTED_VALUE = 0x
);
GO
