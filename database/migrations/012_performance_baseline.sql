-- ============================================
-- Performance Baseline Tables
-- Migration: 012_performance_baseline.sql
-- Step 7: Track performance before/after encryption and audit
-- ============================================

-- ============================================
-- Table: PerformanceBaseline
-- Stores query performance metrics before/after encryption and audit
-- ============================================

CREATE TABLE dbo.PerformanceBaseline (
    BaselineId BIGINT IDENTITY(1,1) PRIMARY KEY,
    
    -- Test configuration
    TestName NVARCHAR(200) NOT NULL,                -- 'QueryUsersByEmail', 'InsertPayment', etc.
    TestCategory NVARCHAR(100) NOT NULL,            -- 'Encryption', 'Audit', 'Combined'
    
    -- Feature flags
    AlwaysEncryptedEnabled BIT NOT NULL,
    TDEEnabled BIT NOT NULL,
    AuditEnabled BIT NOT NULL,
    
    -- Performance metrics (pre-features)
    BaselineAvgDurationMS DECIMAL(10,2) NULL,       -- Without encryption/audit
    BaselineMinDurationMS DECIMAL(10,2) NULL,
    BaselineMaxDurationMS DECIMAL(10,2) NULL,
    BaselineCpuTimeMS DECIMAL(10,2) NULL,
    BaselineLogicalReads BIGINT NULL,
    BaselineMemoryGrantKB BIGINT NULL,
    BaselineRowCount INT NULL,
    
    -- Performance metrics (with features)
    TestAvgDurationMS DECIMAL(10,2) NULL,           -- With encryption/audit
    TestMinDurationMS DECIMAL(10,2) NULL,
    TestMaxDurationMS DECIMAL(10,2) NULL,
    TestCpuTimeMS DECIMAL(10,2) NULL,
    TestLogicalReads BIGINT NULL,
    TestMemoryGrantKB BIGINT NULL,
    TestRowCount INT NULL,
    
    -- Impact calculations (computed columns)
    DurationImpactPercent AS CAST(CASE 
        WHEN BaselineAvgDurationMS > 0 
        THEN ((TestAvgDurationMS - BaselineAvgDurationMS) / BaselineAvgDurationMS) * 100 
        ELSE 0 
    END AS DECIMAL(5,2)),
    CpuImpactPercent AS CAST(CASE 
        WHEN BaselineCpuTimeMS > 0 
        THEN ((TestCpuTimeMS - BaselineCpuTimeMS) / BaselineCpuTimeMS) * 100 
        ELSE 0 
    END AS DECIMAL(5,2)),
    ReadsImpactPercent AS CAST(CASE 
        WHEN BaselineLogicalReads > 0 
        THEN ((TestLogicalReads - BaselineLogicalReads) / BaselineLogicalReads) * 100 
        ELSE 0 
    END AS DECIMAL(5,2)),
    
    -- Performance budget compliance
    MeetsCpuBudget BIT NOT NULL DEFAULT 0,          -- 1 = <5% increase
    MeetsLatencyBudget BIT NOT NULL DEFAULT 0,     -- 1 = <100ms per query
    MeetsReadsBudget BIT NOT NULL DEFAULT 0,       -- 1 = <10% increase in reads
    
    -- Metadata
    TestDate DATE NOT NULL,
    TestEnvironment NVARCHAR(50) NOT NULL,         -- staging, production
    SampleSize INT NOT NULL DEFAULT 100,           -- Number of executions
    Notes NVARCHAR(MAX) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    
    -- Indexes
    INDEX IX_PerformanceBaseline_TestName (TestName, TestDate DESC),
    INDEX IX_PerformanceBaseline_Date (TestDate DESC),
    INDEX IX_PerformanceBaseline_Compliance (MeetsCpuBudget, MeetsLatencyBudget, TestDate DESC),
    INDEX IX_PerformanceBaseline_Impact (TestDate DESC, DurationImpactPercent, CpuImpactPercent)
);
GO

-- Filtered indexes for quick compliance checks
CREATE INDEX IX_PerformanceBaseline_DurationImpact ON dbo.PerformanceBaseline(TestDate DESC)
WHERE DurationImpactPercent > 10;  -- Exceeds 10% latency increase (stricter than 5% CPU)

CREATE INDEX IX_PerformanceBaseline_CpuImpact ON dbo.PerformanceBaseline(TestDate DESC)
WHERE CpuImpactPercent > 5;  -- Exceeds 5% CPU budget

PRINT 'Table [PerformanceBaseline] created with computed columns and filtered indexes'
GO

-- ============================================
-- Table: RealTimePerformanceSnapshot
-- Captures 5-minute rolling performance snapshots
-- ============================================

CREATE TABLE dbo.RealTimePerformanceSnapshot (
    SnapshotId BIGINT IDENTITY(1,1) PRIMARY KEY,
    SnapshotTime DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    
    -- RDS instance metrics
    CpuUtilization DECIMAL(5,2) NULL,
    MemoryUtilizationPercent DECIMAL(5,2) NULL,
    StorageIops INT NULL,
    NetworkThroughputMBps DECIMAL(10,2) NULL,
    
    -- SQL Server metrics
    ActiveConnections INT NULL,
    BlockedQueries INT NULL,
    BatchRequestsPerSec INT NULL,
    
    -- Audit metrics
    AuditEventsPerSec INT NULL,
    AuditQueueDelayAvgMS INT NULL,
    AuditFileSizeMB DECIMAL(10,2) NULL,
    
    -- Encryption metrics
    ColumnEncryptionOpsPerSec INT NULL,
    EncryptionKeyLookupsPerSec INT NULL,
    EncryptionCpuOverheadPercent DECIMAL(5,2) NULL,
    
    -- Performance budget compliance
    QueriesExceedingLatencyBudget INT NULL,
    QueriesExceedingCpuBudget INT NULL,
    LatencyBudgetViolationRate AS CAST(
        CASE WHEN BatchRequestsPerSec > 0 
        THEN (QueriesExceedingLatencyBudget * 100.0) / BatchRequestsPerSec 
        ELSE 0 
        END AS DECIMAL(5,2)
    ),
    CpuBudgetViolationRate AS CAST(
        CASE WHEN BatchRequestsPerSec > 0 
        THEN (QueriesExceedingCpuBudget * 100.0) / BatchRequestsPerSec 
        ELSE 0 
        END AS DECIMAL(5,2)
    ),
    
    -- Indexes
    INDEX IX_RealTimePerformanceSnapshot_Time (SnapshotTime DESC),
    INDEX IX_RealTimePerformanceSnapshot_BudgetViolations (SnapshotTime DESC, LatencyBudgetViolationRate, CpuBudgetViolationRate)
);
GO

-- Partition function for rolling retention (7 days)
-- Note: Only create if needed based on data volume
-- CREATE PARTITION FUNCTION PF_RealTimePerformanceSnapshot (DATETIME2)
-- AS RANGE RIGHT FOR VALUES (DATEADD(day, -3, GETUTCDATETIME()));
GO

PRINT 'Table [RealTimePerformanceSnapshot] created for 5-minute rolling snapshots'
GO

-- ============================================
-- Table: QueryExecutionHistory
-- Detailed execution history for trending analysis
-- ============================================

CREATE TABLE dbo.QueryExecutionHistory (
    ExecutionId BIGINT IDENTITY(1,1) PRIMARY KEY,
    
    -- Query identification
    QueryHash BINARY(20) NOT NULL,
    QueryText NVARCHAR(MAX) NOT NULL,
    QueryType NVARCHAR(50) NOT NULL,  -- SELECT, INSERT, UPDATE, DELETE
    
    -- Performance metrics
    StartTime DATETIME2 NOT NULL,
    EndTime DATETIME2 NOT NULL,
    DurationMS INT NOT NULL,
    CpuTimeMS INT NOT NULL,
    LogicalReads BIGINT NULL,
    LogicalWrites BIGINT NULL,
    MemoryGrantKB BIGINT NULL,
    RowCount INT NULL,
    
    -- Context
    SessionId INT NOT NULL,
    UserName NVARCHAR(128) NULL,
    ClientIPAddress NVARCHAR(45) NULL,
    ApplicationName NVARCHAR(128) NULL,
    
    -- Feature impact flags
    InvolvesEncryptedColumns BIT NOT NULL DEFAULT 0,
    AuditCaptured BIT NOT NULL DEFAULT 0,
    ComplianceScope NVARCHAR(50) NULL,  -- GDPR, PCI, or NULL
    
    -- Budget compliance
    MeetsLatencyBudget BIT NOT NULL DEFAULT 0,  -- DurationMS <= 100
    MeetsCpuBudget BIT NOT NULL DEFAULT 0,      -- CpuTimeMS <= 50
    
    -- Indexes
    INDEX IX_QueryExecutionHistory_Time (StartTime DESC),
    INDEX IX_QueryExecutionHistory_QueryHash (QueryHash, StartTime DESC),
    INDEX IX_QueryExecutionHistory_User (UserName, StartTime DESC),
    INDEX IX_QueryExecutionHistory_Compliance (ComplianceScope, StartTime DESC) 
        WHERE ComplianceScope IS NOT NULL,
    INDEX IX_QueryExecutionHistory_BudgetViolations (StartTime DESC) 
        WHERE MeetsLatencyBudget = 0 OR MeetsCpuBudget = 0
);
GO

PRINT 'Table [QueryExecutionHistory] created for detailed execution tracking'
GO

-- ============================================
-- Table: PerformanceAlertLog
-- Log of performance alerts triggered
-- ============================================

CREATE TABLE dbo.PerformanceAlertLog (
    AlertId BIGINT IDENTITY(1,1) PRIMARY KEY,
    
    -- Alert details
    AlertTime DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    AlertType NVARCHAR(100) NOT NULL,  -- 'CpuBudget', 'LatencyBudget', 'CombinedBudget'
    AlertSeverity NVARCHAR(20) NOT NULL,  -- WARNING, CRITICAL
    
    -- Query context
    QueryHash BINARY(20) NULL,
    QueryText NVARCHAR(1000) NULL,
    UserName NVARCHAR(128) NULL,
    
    -- Performance metrics at time of alert
    DurationMS INT NULL,
    CpuTimeMS INT NULL,
    ImpactPercent DECIMAL(5,2) NULL,
    
    -- Feature context
    AlwaysEncryptedEnabled BIT NULL,
    AuditEnabled BIT NULL,
    
    -- Alert state
    Acknowledged BIT NOT NULL DEFAULT 0,
    InvestigationNotes NVARCHAR(MAX) NULL,
    
    -- Indexes
    INDEX IX_PerformanceAlertLog_Time (AlertTime DESC),
    INDEX IX_PerformanceAlertLog_Query (QueryHash, AlertTime DESC),
    INDEX IX_PerformanceAlertLog_Unacknowledged (Acknowledged, AlertTime DESC) 
        WHERE Acknowledged = 0
);
GO

PRINT 'Table [PerformanceAlertLog] created for alert tracking'
GO

-- ============================================
-- Table: PerformanceBaselineHistory
-- Historical view of performance trends
-- ============================================

CREATE TABLE dbo.PerformanceBaselineHistory (
    HistoryId BIGINT IDENTITY(1,1) PRIMARY KEY,
    
    TestName NVARCHAR(200) NOT NULL,
    TestDate DATE NOT NULL,
    
    -- Rolling averages
    Rolling7DayAvgDurationMS DECIMAL(10,2) NULL,
    Rolling7DayAvgCpuMS DECIMAL(10,2) NULL,
    Rolling30DayAvgDurationMS DECIMAL(10,2) NULL,
    Rolling30DayAvgCpuMS DECIMAL(10,2) NULL,
    
    -- Standard deviation (variability)
    DurationStdDev DECIMAL(10,2) NULL,
    CpuStdDev DECIMAL(10,2) NULL,
    
    -- Trend direction
    DurationTrend NVARCHAR(20) NULL,  -- 'Improving', 'Stable', 'Degrading'
    CpuTrend NVARCHAR(20) NULL,
    
    -- Outlier detection
    OutlierCount INT NULL,
    
    -- Indexes
    INDEX IX_PerformanceBaselineHistory_TestDate (TestName, TestDate DESC),
    INDEX IX_PerformanceBaselineHistory_Trend (TestDate DESC, DurationTrend, CpuTrend)
);
GO

PRINT 'Table [PerformanceBaselineHistory] created for historical trending'
GO

-- ============================================
-- Initial Data Population
-- ============================================

-- Insert initial baseline (will be updated by performance tests)
INSERT INTO dbo.PerformanceBaseline (
    TestName,
    TestCategory,
    AlwaysEncryptedEnabled,
    TDEEnabled,
    AuditEnabled,
    TestDate,
    TestEnvironment,
    SampleSize,
    Notes
)
VALUES 
    ('QueryUsersByEmail', 'Initialization', 0, 0, 0, GETUTCDATE(), 'production', 100, 'Initial placeholder for baseline tracking'),
    ('QueryPaymentsById', 'Initialization', 0, 0, 0, GETUTCDATE(), 'production', 100, 'Initial placeholder for baseline tracking'),
    ('InsertUser', 'Initialization', 0, 0, 0, GETUTCDATE(), 'production', 100, 'Initial placeholder for baseline tracking');
GO

PRINT ''
PRINT '========================================'
PRINT 'PERFORMANCE BASELINE SCHEMA CREATED'
PRINT '========================================'
PRINT ''
PRINT 'Tables Created:'
PRINT '- dbo.PerformanceBaseline (core storage)'
PRINT '- dbo.RealTimePerformanceSnapshot (5-min rolling)'
PRINT '- dbo.QueryExecutionHistory (detailed tracking)'
PRINT '- dbo.PerformanceAlertLog (alert tracking)'
PRINT '- dbo.PerformanceBaselineHistory (historical trends)'
PRINT ''
PRINT 'Next Steps:'
PRINT '1. Run: EXEC dbo.TrackQueryPerformance to establish baselines'
PRINT '2. Configure CloudWatch metrics for real-time monitoring'
PRINT '3. Set up application-level APM integration'
PRINT '4. Run automated performance test script'
GO
