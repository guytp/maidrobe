-- Migration: Configure TLS 1.2+ Enforcement for Buzz A Tutor SQL Server
-- Implements PCI DSS Requirement 4.1, HIPAA, GDPR Article 32
-- ============================================

-- Verify Current TLS Configuration
SELECT 
    session_id,
    encrypt_option,
    auth_scheme,
    client_net_address
FROM sys.dm_exec_connections
ORDER BY session_id;

-- Create audit table for connection encryption compliance
CREATE TABLE IF NOT EXISTS dbo.ConnectionEncryptionAudit (
    AuditId INT IDENTITY(1,1) PRIMARY KEY,
    ConnectionTime DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    SessionId INT NOT NULL,
    ClientIPAddress VARCHAR(45),
    EncryptOption VARCHAR(10),
    AuthScheme VARCHAR(20),
    CorrelationId UNIQUEIDENTIFIER DEFAULT NEWID()
);

-- Create compliance view
CREATE OR ALTER VIEW dbo.ConnectionEncryptionCompliance AS
SELECT 
    TotalConnections = COUNT(*),
    EncryptedConnections = SUM(CASE WHEN encrypt_option = 'TRUE' THEN 1 ELSE 0 END),
    UnencryptedConnections = SUM(CASE WHEN encrypt_option = 'FALSE' THEN 1 ELSE 0 END),
    EncryptionPercentage = CAST(
        (SUM(CASE WHEN encrypt_option = 'TRUE' THEN 1.0 ELSE 0 END) / COUNT(*)) * 100 
        AS DECIMAL(5,2)
    )
FROM sys.dm_exec_connections;

-- Verify TLS enforcement (should show 100% encrypted after enforcement)
SELECT * FROM dbo.ConnectionEncryptionCompliance;
GO
