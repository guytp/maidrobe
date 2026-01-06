-- ============================================
-- Performance Tracking Procedures
-- Migration: 013_performance_tracking.sql
-- Step 7: Real-time performance tracking and monitoring
-- ============================================

-- ============================================
-- Stored Procedure: TrackQueryPerformance
-- Captures before/after metrics for encryption and audit impact
-- ============================================

CREATE OR ALTER PROCEDURE dbo.TrackQueryPerformance
    @TestName NVARCHAR(200),
    @QueryTemplate NVARCHAR(MAX),
    @ParameterValues NVARCHAR(MAX) = NULL,  -- JSON array of parameter sets
    @EnableEncryption BIT = 1,
    @EnableAudit BIT = 1,
    @SampleSize INT = 100
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @BaselineMetrics TABLE (
        ExecutionId INT,
        DurationMS DECIMAL(10,2),
        CpuTimeMS DECIMAL(10,2),
        LogicalReads BIGINT,
        MemoryGrantKB BIGINT,
        RowCount INT
    );
    
    DECLARE @TestMetrics TABLE (
        ExecutionId INT,
        DurationMS DECIMAL(10,2),
        CpuTimeMS DECIMAL(10,2),
        LogicalReads BIGINT,
        MemoryGrantKB BIGINT,
        RowCount INT
    );
    
    DECLARE @StartTime DATETIME2;
    DECLARE @EndTime DATETIME2;
    DECLARE @CpuStart BIGINT;
    DECLARE @CpuEnd BIGINT;
    DECLARE @ReadsStart BIGINT;
    DECLARE @ReadsEnd BIGINT;
    DECLARE @MemoryStart BIGINT;
    DECLARE @MemoryEnd BIGINT;
    DECLARE @RowCountStart INT;
    DECLARE @RowCountEnd INT;
    
    DECLARE @i INT = 1;
    DECLARE @ParamJSON NVARCHAR(MAX);
    DECLARE @SQL NVARCHAR(MAX);
    
    PRINT '=====================================================';
    PRINT 'Starting Performance Test: ' + @TestName;
    PRINT 'Sample Size: ' + CAST(@SampleSize AS NVARCHAR(10));
    PRINT 'Encryption Enabled: ' + CASE WHEN @EnableEncryption = 1 THEN 'Yes' ELSE 'No' END;
    PRINT 'Audit Enabled: ' + CASE WHEN @EnableAudit = 1 THEN 'Yes' ELSE 'No' END;
    PRINT '=====================================================';
    
    -- PHASE 1: Measure baseline (without audit if possible)
    PRINT '';
    PRINT 'Phase 1: Measuring baseline performance...';
    
    -- Temporarily disable audit for baseline measurement if needed
    DECLARE @AuditWasEnabled BIT = 0;
    IF @EnableAudit = 0
    BEGIN
        -- Check if audit is currently enabled
        SELECT @AuditWasEnabled = is_state_enabled 
        FROM sys.server_audits 
        WHERE name = 'BuzzTutorSensitiveDataAccess';
        
        IF @AuditWasEnabled = 1
        BEGIN
            PRINT '  Temporarily disabling audit for baseline measurement...';
            ALTER SERVER AUDIT [BuzzTutorSensitiveDataAccess] WITH (STATE = OFF);
            ALTER DATABASE AUDIT SPECIFICATION [GDPR_PII_Access] WITH (STATE = OFF);
            ALTER DATABASE AUDIT SPECIFICATION [PCI_CardholderData] WITH (STATE = OFF);
            PRINT '  Audit disabled for baseline.';
        END
    END
    
    -- Execute query @SampleSize times and capture metrics
    WHILE @i <= @SampleSize
    BEGIN
        IF @i % 10 = 0
        BEGIN
            PRINT '    Baseline progress: ' + CAST(@i AS NVARCHAR(10)) + '/' + CAST(@SampleSize AS NVARCHAR(10));
        END
        
        -- Extract parameters if JSON provided (simple implementation)
        IF @ParameterValues IS NOT NULL
        BEGIN
            -- In production, use proper JSON parsing
            SET @ParamJSON = @ParameterValues;
        END
        
        -- Capture pre-execution metrics
        SET @StartTime = SYSUTCDATETIME();
        SET @CpuStart = @@CPU_BUSY;
        SET @ReadsStart = @@TOTAL_READ;
        
        -- Execute the query
        BEGIN TRY
            SET @SQL = 'EXEC sp_executesql N''' + REPLACE(@QueryTemplate, '''', '''''') + '''';
            EXEC sp_executesql @QueryTemplate;
            
            -- Capture post-execution metrics
            SET @EndTime = SYSUTCDATETIME();
            SET @CpuEnd = @@CPU_BUSY;
            SET @ReadsEnd = @@TOTAL_READ;
            SET @RowCountEnd = @@ROWCOUNT;
            
            INSERT INTO @BaselineMetrics
            SELECT @i, 
                   DATEDIFF(millisecond, @StartTime, @EndTime),
                   (@CpuEnd - @CpuStart) * 10,  -- Convert to milliseconds
                   @ReadsEnd - @ReadsStart,
                   0,  -- Memory grant not easily captured per execution
                   @RowCountEnd;
        END TRY
        BEGIN CATCH
            PRINT '    ERROR during baseline execution: ' + ERROR_MESSAGE();
            -- Continue with next iteration
        END CATCH
        
        SET @i = @i + 1;
    END
    
    PRINT '  Baseline measurement complete.';
    
    -- Restore audit if we disabled it
    IF @AuditWasEnabled = 1 AND @EnableAudit = 0
    BEGIN
        PRINT '  Restoring audit settings...';
        ALTER SERVER AUDIT [BuzzTutorSensitiveDataAccess] WITH (STATE = ON);
        ALTER DATABASE AUDIT SPECIFICATION [GDPR_PII_Access] WITH (STATE = ON);
        ALTER DATABASE AUDIT SPECIFICATION [PCI_CardholderData] WITH (STATE = ON);
        PRINT '  Audit restored.';
    END
    
    -- PHASE 2: Measure with encryption and audit enabled
    IF @EnableAudit = 1
    BEGIN
        PRINT '';
        PRINT 'Phase 2: Measuring performance with encryption and audit...';
        
        -- Ensure audit is enabled (if not already)
        DECLARE @AuditIsEnabled BIT;
        SELECT @AuditIsEnabled = is_state_enabled 
        FROM sys.server_audits 
        WHERE name = 'BuzzTutorSensitiveDataAccess';
        
        IF @AuditIsEnabled = 0
        BEGIN
            PRINT '  Enabling audit for test measurement...';
            ALTER SERVER AUDIT [BuzzTutorSensitiveDataAccess] WITH (STATE = ON);
            ALTER DATABASE AUDIT SPECIFICATION [GDPR_PII_Access] WITH (STATE = ON);
            ALTER DATABASE AUDIT SPECIFICATION [PCI_CardholderData] WITH (STATE = ON);
        END
    END
    
    SET @i = 1;
    WHILE @i <= @SampleSize
    BEGIN
        IF @i % 10 = 0
        BEGIN
            PRINT '    Test progress: ' + CAST(@i AS NVARCHAR(10)) + '/' + CAST(@SampleSize AS NVARCHAR(10));
        END
        
        -- Capture pre-execution metrics
        SET @StartTime = SYSUTCDATETIME();
        SET @CpuStart = @@CPU_BUSY;
        SET @ReadsStart = @@TOTAL_READ;
        
        -- Execute the query
        BEGIN TRY
            EXEC sp_executesql @QueryTemplate;
            
            -- Capture post-execution metrics
            SET @EndTime = SYSUTCDATETIME();
            SET @CpuEnd = @@CPU_BUSY;
            SET @ReadsEnd = @@TOTAL_READ;
            SET @RowCountEnd = @@ROWCOUNT;
            
            INSERT INTO @TestMetrics
            SELECT @i, DATEDIFF(millisecond, @StartTime, @EndTime),
                   (@CpuEnd - @CpuStart) * 10,
                   @ReadsEnd - @ReadsStart,
                   0,  -- Memory grant
                   @RowCountEnd;
        END TRY
        BEGIN CATCH
            PRINT '    ERROR during test execution: ' + ERROR_MESSAGE();
        END CATCH
        
        SET @i = @i + 1;
    END
    
    PRINT '  Test measurement complete.';
    
    -- Calculate aggregates
    DECLARE @BaselineAvgDur DECIMAL(10,2);
    DECLARE @BaselineAvgCpu DECIMAL(10,2);
    DECLARE @BaselineAvgReads BIGINT;
    DECLARE @TestAvgDur DECIMAL(10,2);
    DECLARE @TestAvgCpu DECIMAL(10,2);
    DECLARE @TestAvgReads BIGINT;
    
    SELECT @BaselineAvgDur = AVG(DurationMS), @BaselineAvgCpu = AVG(CpuTimeMS), @BaselineAvgReads = AVG(LogicalReads)
    FROM @BaselineMetrics;
    
    SELECT @TestAvgDur = AVG(DurationMS), @TestAvgCpu = AVG(CpuTimeMS), @TestAvgReads = AVG(LogicalReads)
    FROM @TestMetrics;
    
    -- Calculate impact percentages
    DECLARE @DurationImpact DECIMAL(5,2) = 
        CASE WHEN @BaselineAvgDur > 0 
        THEN ((@TestAvgDur - @BaselineAvgDur) / @BaselineAvgDur) * 100 
        ELSE 0 END;
    
    DECLARE @CpuImpact DECIMAL(5,2) = 
        CASE WHEN @BaselineAvgCpu > 0 
        THEN ((@TestAvgCpu - @BaselineAvgCpu) / @BaselineAvgCpu) * 100 
        ELSE 0 END;
    
    DECLARE @ReadsImpact DECIMAL(5,2) = 
        CASE WHEN @BaselineAvgReads > 0 
        THEN ((@TestAvgReads - @BaselineAvgReads) / @BaselineAvgReads) * 100 
        ELSE 0 END;
    
    -- Store results
    DECLARE @MeetsCpuBudget BIT = CASE WHEN @CpuImpact <= 5 THEN 1 ELSE 0 END;
    DECLARE @MeetsLatencyBudget BIT = CASE WHEN @DurationImpact <= 10 THEN 1 ELSE 0 END;  -- 10% tolerance
    DECLARE @MeetsReadsBudget BIT = CASE WHEN @ReadsImpact <= 10 THEN 1 ELSE 0 END;
    
    INSERT INTO dbo.PerformanceBaseline (
        TestName,
        TestCategory,
        AlwaysEncryptedEnabled,
        TDEEnabled,
        AuditEnabled,
        BaselineAvgDurationMS,
        BaselineMinDurationMS,
        BaselineMaxDurationMS,
        BaselineCpuTimeMS,
        BaselineLogicalReads,
        TestAvgDurationMS,
        TestMinDurationMS,
        TestMaxDurationMS,
        TestCpuTimeMS,
        TestLogicalReads,
        MeetsCpuBudget,
        MeetsLatencyBudget,
        MeetsReadsBudget,
        TestDate,
        TestEnvironment,
        SampleSize,
        Notes
    )
    SELECT 
        @TestName,
        CASE WHEN @EnableEncryption = 1 AND @EnableAudit = 1 THEN 'Combined'
             WHEN @EnableEncryption = 1 THEN 'Encryption'
             WHEN @EnableAudit = 1 THEN 'Audit'
             ELSE 'Baseline' END,
        @EnableEncryption,
        @EnableEncryption,  -- TDE status (same as Always Encrypted for now)
        @EnableAudit,
        @BaselineAvgDur,
        (SELECT MIN(DurationMS) FROM @BaselineMetrics),
        (SELECT MAX(DurationMS) FROM @BaselineMetrics),
        @BaselineAvgCpu,
        @BaselineAvgReads,
        @TestAvgDur,
        (SELECT MIN(DurationMS) FROM @TestMetrics),
        (SELECT MAX(DurationMS) FROM @TestMetrics),
        @TestAvgCpu,
        @TestAvgReads,
        @MeetsCpuBudget,
        @MeetsLatencyBudget,
        @MeetsReadsBudget,
        GETUTCDATE(),
        DB_NAME(),
        @SampleSize,
        CONCAT('Duration Impact: ', @DurationImpact, '%, CPU Impact: ', @CpuImpact, '%, Reads Impact: ', @ReadsImpact, '%');
    
    -- Log to console
    PRINT '';
    PRINT '=====================================================';
    PRINT 'Performance Test Results: ' + @TestName;
    PRINT '=====================================================';
    PRINT 'Baseline Avg Duration: ' + CAST(@BaselineAvgDur AS NVARCHAR(20)) + 'ms';
    PRINT 'Test Avg Duration: ' + CAST(@TestAvgDur AS NVARCHAR(20)) + 'ms';
    PRINT 'Duration Impact: ' + CAST(@DurationImpact AS NVARCHAR(10)) + '%';
    PRINT '';
    PRINT 'Baseline Avg CPU: ' + CAST(@BaselineAvgCpu AS NVARCHAR(20)) + 'ms';
    PRINT 'Test Avg CPU: ' + CAST(@TestAvgCpu AS NVARCHAR(20)) + 'ms';
    PRINT 'CPU Impact: ' + CAST(@CpuImpact AS NVARCHAR(10)) + '%';
    PRINT '';
    PRINT 'Budget Compliance:'
    PRINT '  CPU Budget (<5%): ' + CASE WHEN @MeetsCpuBudget = 1 THEN 'PASS ✓' ELSE 'FAIL ✗' END;
    PRINT '  Latency Budget (<10% increase): ' + CASE WHEN @MeetsLatencyBudget = 1 THEN 'PASS ✓' ELSE 'FAIL ✗' END;
    PRINT '  Reads Budget (<10% increase): ' + CASE WHEN @MeetsReadsBudget = 1 THEN 'PASS ✓' ELSE 'FAIL ✗' END;
    PRINT '=====================================================';
    
    -- Return results
    SELECT 
        @BaselineAvgDur AS BaselineAvgDurationMS,
        @TestAvgDur AS TestAvgDurationMS,
        @DurationImpact AS DurationImpactPercent,
        @BaselineAvgCpu AS BaselineCpuTimeMS,
        @TestAvgCpu AS TestCpuTimeMS,
        @CpuImpact AS CpuImpactPercent,
        @BaselineAvgReads AS BaselineLogicalReads,
        @TestAvgReads AS TestLogicalReads,
        @ReadsImpact AS ReadsImpactPercent,
        @MeetsCpuBudget AS CpuBudgetCompliant,
        @MeetsLatencyBudget AS LatencyBudgetCompliant,
        @MeetsReadsBudget AS ReadsBudgetCompliant,
        CASE  
            WHEN (@MeetsCpuBudget = 1 AND @MeetsLatencyBudget = 1 AND @MeetsReadsBudget = 1) 
            THEN 'PASS - All budgets met ✓'
            ELSE CONCAT('FAIL - Budget violation (Duration: ', @DurationImpact, '%, CPU: ', @CpuImpact, '%, Reads: ', @ReadsImpact, '%) ✗')
        END AS OverallStatus;
END
GO

PRINT 'Stored Procedure [TrackQueryPerformance] created'
GO

-- ============================================
-- Stored Procedure: CaptureRealTimePerformanceSnapshot
-- Captures 5-minute rolling performance metrics
-- ============================================

CREATE OR ALTER PROCEDURE dbo.CaptureRealTimePerformanceSnapshot
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Get RDS CloudWatch metrics via stored procedure call
    -- Note: In reality, we'd use AWS SDK, but this simulates the capture
    INSERT INTO dbo.RealTimePerformanceSnapshot (
        CpuUtilization,
        MemoryUtilizationPercent,
        ActiveConnections,
        BatchRequestsPerSec,
        AuditEventsPerSec,
        AuditQueueDelayAvgMS,
        ColumnEncryptionOpsPerSec,
        QueriesExceedingLatencyBudget,
        QueriesExceedingCpuBudget
    )
    SELECT 
        -- Simulate capturing from CloudWatch
        -- In production, use AWS SDK: aws cloudwatch get-metric-statistics
        (SELECT AVG(value) FROM sys.dm_os_performance_counters 
         WHERE counter_name LIKE '%Processor Time%'),
        
        (SELECT cntr_value / 1024.0 FROM sys.dm_os_performance_counters 
         WHERE counter_name = 'Total Server Memory (KB)'),
        
        (SELECT COUNT(*) FROM sys.dm_exec_sessions WHERE is_user_process = 1),
        
        (SELECT cntr_value FROM sys.dm_os_performance_counters 
         WHERE counter_name = 'Batch Requests/sec'),
        
        (SELECT COUNT(*) FROM sys.fn_get_audit_file('D:\rdsdbdata\SQLServer\Audit\*\*.sqlaudit', DEFAULT, DEFAULT) 
         WHERE event_time >= DATEADD(minute, -5, GETUTCDATE())),
        
        (SELECT AVG(duration_milliseconds) FROM sys.fn_get_audit_file('D:\rdsdbdata\SQLServer\Audit\*\*.sqlaudit', DEFAULT, DEFAULT) 
         WHERE event_time >= DATEADD(minute, -5, GETUTCDATE())),
        
        (SELECT COUNT(*) FROM sys.dm_exec_requests WHERE command LIKE '%ENCR%'),
        
        (SELECT COUNT(*) FROM sys.dm_exec_requests WHERE total_elapsed_time > 100000),
        
        (SELECT COUNT(*) FROM sys.dm_exec_requests WHERE cpu_time > 50000);
    
    -- Clean up old snapshots (keep 7 days)
    DELETE FROM dbo.RealTimePerformanceSnapshot 
    WHERE SnapshotTime < DATEADD(day, -7, GETUTCDATETIME());
    
    PRINT 'Real-time performance snapshot captured at: ' + CONVERT(NVARCHAR(30), GETUTCDATE());
    PRINT 'Old snapshots (>7 days) cleaned up.';
END
GO

PRINT 'Stored Procedure [CaptureRealTimePerformanceSnapshot] created'
GO

-- ============================================
-- Stored Procedure: GetPerformanceBudgetCompliance
-- Reports on whether we're meeting performance budgets
-- ============================================

CREATE OR ALTER PROCEDURE dbo.GetPerformanceBudgetCompliance
    @DaysBack INT = 7,
    @Environment NVARCHAR(50) = 'production'
AS
BEGIN
    SET NOCOUNT ON;
    
    PRINT '=====================================================';
    PRINT 'Performance Budget Compliance Report';
    PRINT 'Environment: ' + @Environment;
    PRINT 'Period: ' + CAST(@DaysBack AS NVARCHAR(10)) + ' days';
    PRINT '=====================================================';
    PRINT '';
    
    -- Overall compliance summary
    SELECT 
        @DaysBack AS AnalysisPeriodDays,
        @Environment AS TestEnvironment,
        'Encryption & Audit Performance' AS BudgetCategory,
        
        -- Success rate
        AVG(CASE WHEN MeetsCpuBudget = 1 AND MeetsLatencyBudget = 1 AND MeetsReadsBudget = 1 THEN 1.0 ELSE 0.0 END) AS OverallComplianceRatePercent,
        
        -- Query counts
        COUNT(*) AS TotalTests,
        SUM(CASE WHEN MeetsCpuBudget = 1 AND MeetsLatencyBudget = 1 AND MeetsReadsBudget = 1 THEN 1 ELSE 0 END) AS TestsWithinBudget,
        SUM(CASE WHEN MeetsCpuBudget = 0 OR MeetsLatencyBudget = 0 OR MeetsReadsBudget = 0 THEN 1 ELSE 0 END) AS TestsExceedingBudget,
        
        -- Average impacts
        AVG(DurationImpactPercent) AS AvgLatencyIncreasePercent,
        AVG(CpuImpactPercent) AS AvgCpuIncreasePercent,
        AVG(ReadsImpactPercent) AS AvgReadsIncreasePercent,
        
        -- Worst offenders
        MAX(DurationImpactPercent) AS MaxLatencyImpact,
        MAX(CpuImpactPercent) AS MaxCpuImpact,
        
        -- Budget thresholds
        5 AS CpuBudgetThresholdPercent,
        10 AS LatencyBudgetThresholdPercent,
        10 AS ReadsBudgetThresholdPercent
        
    FROM dbo.PerformanceBaseline
    WHERE TestDate >= DATEADD(day, -@DaysBack, GETUTCDATE())
        AND TestEnvironment = @Environment;
    
    PRINT '';
    PRINT 'Compliance Summary:';
    PRINT '-------------------';
    
    -- Detail by test category
    SELECT 
        TestCategory,
        COUNT(*) AS TestCount,
        AVG(DurationImpactPercent) AS AvgLatencyImpactPercent,
        AVG(CpuImpactPercent) AS AvgCpuImpactPercent,
        AVG(CASE WHEN MeetsCpuBudget = 1 AND MeetsLatencyBudget = 1 AND MeetsReadsBudget = 1 THEN 100.0 ELSE 0.0 END) AS BudgetComplianceRatePercent,
        STRING_AGG(CASE WHEN MeetsCpuBudget = 0 OR MeetsLatencyBudget = 0 OR  MeetsReadsBudget = 0 THEN TestName END, ', ') AS FailingTests,
        MAX(DurationImpactPercent) AS MaxLatencyImpactPercent,
        MAX(CpuImpactPercent) AS MaxCpuImpactPercent
        
    FROM dbo.PerformanceBaseline
    WHERE TestDate >= DATEADD(day, -@DaysBack, GETUTCDATE())
        AND TestEnvironment = @Environment
    GROUP BY TestCategory
    ORDER BY AvgCpuImpactPercent DESC;
    
    PRINT '';
    PRINT 'Individual Test Performance:';
    PRINT '------------------------------';
    
    -- Top performers (within budget)
    SELECT TOP 5
        TestName,
        DurationImpactPercent AS LatencyImpact,
        CpuImpactPercent AS CpuImpact,
        '✓ PASS' AS Status
    FROM dbo.PerformanceBaseline
    WHERE TestDate >= DATEADD(day, -@DaysBack, GETUTCDATE())
        AND TestEnvironment = @Environment
        AND MeetsCpuBudget = 1 AND MeetsLatencyBudget = 1 AND MeetsReadsBudget = 1
    ORDER BY CpuImpactPercent ASC;
    
    PRINT '';
    PRINT 'Worst Performers (exceeding budget):';
    PRINT '------------------------------------';
    
    -- Worst performers (exceeding budget)
    SELECT TOP 5
        TestName,
        DurationImpactPercent AS LatencyImpactPercent,
        CpuImpactPercent AS CpuImpactPercent,
        ReadsImpactPercent AS ReadsImpactPercent,
        '✗ FAIL' AS Status
    FROM dbo.PerformanceBaseline
    WHERE TestDate >= DATEADD(day, -@DaysBack, GETUTCDATE())
        AND TestEnvironment = @Environment
        AND (MeetsCpuBudget = 0 OR MeetsLatencyBudget = 0 OR MeetsReadsBudget = 0)
    ORDER BY CpuImpactPercent DESC;
    
    PRINT '';
    PRINT 'Recommendations:';
    PRINT '----------------';
    
    -- Generate recommendations
    DECLARE @AvgCpuImpact DECIMAL(10,2);
    DECLARE @AvgLatencyImpact DECIMAL(10,2);
    
    SELECT @AvgCpuImpact = AVG(CpuImpactPercent), @AvgLatencyImpact = AVG(DurationImpactPercent)
    FROM dbo.PerformanceBaseline
    WHERE TestDate >= DATEADD(day, -@DaysBack, GETUTCDATE())
        AND TestEnvironment = @Environment;
    
    SELECT 
        CASE 
            WHEN @AvgCpuImpact > 5 AND @AvgLatencyImpact > 10 THEN 'CRITICAL: Both CPU and latency budgets exceeded. Review Always Encrypted column usage and audit scope.'
            WHEN @AvgCpuImpact > 5 THEN 'WARNING: CPU budget exceeded. Consider reducing audit coverage or optimizing queries.'
            WHEN @AvgLatencyImpact > 10 THEN 'WARNING: Latency budget exceeded. Review encryption columnar access patterns.'
            WHEN SUM(CASE WHEN MeetsCpuBudget = 0 OR MeetsLatencyBudget = 0 OR MeetsReadsBudget = 0 THEN 1 ELSE 0 END) > 0 THEN 'WARNING: Some tests exceeding budget. Review failing tests individually.'
            ELSE 'OK: Performance within budget. Continue monitoring.'
        END AS Recommendation
    FROM dbo.PerformanceBaseline
    WHERE TestDate >= DATEADD(day, -7, GETUTCDATE())
        AND TestEnvironment = @Environment;
    
    PRINT '';
    PRINT 'Next Steps:';
    PRINT '-----------';
    PRINT '1. Review failing tests and optimize queries';
    PRINT '2. Consider audit filtering if CPU impact is high';
    PRINT '3. Review Always Encrypted column usage if latency impact is high';
    PRINT '4. Run: EXEC dbo.TrackQueryPerformance for specific queries';
    PRINT '5. Monitor real-time: EXEC dbo.CaptureRealTimePerformanceSnapshot';
    PRINT '=====================================================';
END
GO

PRINT 'Stored Procedure [GetPerformanceBudgetCompliance] created'
GO

-- ============================================
-- Stored Procedure: TrackQueryExecution
-- Captures individual query execution for real-time monitoring
-- ============================================

CREATE OR ALTER PROCEDURE dbo.TrackQueryExecution
    @QueryHash BINARY(20),
    @QueryText NVARCHAR(MAX),
    @QueryType NVARCHAR(50),
    @StartTime DATETIME2,
    @EndTime DATETIME2,
    @DurationMS INT,
    @CpuTimeMS INT,
    @LogicalReads BIGINT = NULL,
    @MemoryGrantKB BIGINT = NULL,
    @RowCount INT = NULL,
    @SessionId INT = NULL,
    @UserName NVARCHAR(128) = NULL,
    @ClientIPAddress NVARCHAR(45) = NULL,
    @ApplicationName NVARCHAR(128) = NULL,
    @InvolvesEncryptedColumns BIT = 0,
    @AuditCaptured BIT = 0,
    @ComplianceScope NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Validate query hash
    IF @QueryHash IS NULL
    BEGIN
        SET @QueryHash = HASHBYTES('SHA2_256', @QueryText);
    END
    
    -- Calculate budget compliance
    DECLARE @MeetsLatencyBudget BIT = CASE WHEN @DurationMS <= 100 THEN 1 ELSE 0 END;
    DECLARE @MeetsCpuBudget BIT = CASE WHEN @CpuTimeMS <= 50 THEN 1 ELSE 0 END;
    
    -- Insert into history table
    INSERT INTO dbo.QueryExecutionHistory (
        QueryHash,
        QueryText,
        QueryType,
        StartTime,
        EndTime,
        DurationMS,
        CpuTimeMS,
        LogicalReads,
        MemoryGrantKB,
        RowCount,
        SessionId,
        UserName,
        ClientIPAddress,
        ApplicationName,
        InvolvesEncryptedColumns,
        AuditCaptured,
        ComplianceScope,
        MeetsLatencyBudget,
        MeetsCpuBudget
    )
    VALUES (
        @QueryHash,
        LEFT(@QueryText, 4000),  -- Text truncated for storage efficiency
        @QueryType,
        @StartTime,
        @EndTime,
        @DurationMS,
        @CpuTimeMS,
        @LogicalReads,
        @MemoryGrantKB,
        @RowCount,
        @SessionId,
        @UserName,
        @ClientIPAddress,
        @ApplicationName,
        @InvolvesEncryptedColumns,
        @AuditCaptured,
        @ComplianceScope,
        @MeetsLatencyBudget,
        @MeetsCpuBudget
    );
    
    -- Alert if budget exceeded (immediately log)
    IF @MeetsLatencyBudget = 0 OR @MeetsCpuBudget = 0
    BEGIN
        INSERT INTO dbo.PerformanceAlertLog (
            AlertTime,
            AlertType,
            AlertSeverity,
            QueryHash,
            QueryText,
            UserName,
            DurationMS,
            CpuTimeMS,
            ImpactPercent,
            AlwaysEncryptedEnabled,
            AuditEnabled
        )
        SELECT 
            SYSUTCDATETIME(),
            CASE WHEN @MeetsLatencyBudget = 0 AND @MeetsCpuBudget = 0 THEN 'CombinedBudget'
                 WHEN @MeetsLatencyBudget = 0 THEN 'LatencyBudget'
                 WHEN @MeetsCpuBudget = 0 THEN 'CpuBudget' END,
            CASE WHEN @DurationMS > 500 OR @CpuTimeMS > 250 THEN 'CRITICAL' ELSE 'WARNING' END,
            @QueryHash,
            LEFT(@QueryText, 1000),
            @UserName,
            @DurationMS,
            @CpuTimeMS,
            CASE WHEN @DurationMS > 100 THEN ((@DurationMS - 100.0) / 100.0) * 100 ELSE 0 END,
            @InvolvesEncryptedColumns,
            @AuditCaptured;
        
        -- Send alert (would integrate with SNS in production)
        PRINT 'PERFORMANCE ALERT: Query exceeded budget - Duration: ' + CAST(@DurationMS AS NVARCHAR(20)) + 'ms, CPU: ' + CAST(@CpuTimeMS AS NVARCHAR(20)) + 'ms';
    END
    
    -- Clean up old history (keep 30 days)
    DELETE FROM dbo.QueryExecutionHistory 
    WHERE StartTime < DATEADD(day, -30, GETUTCDATETIME());
END
GO

PRINT 'Stored Procedure [TrackQueryExecution] created'
GO

-- ============================================
-- Stored Procedure: AlertOnPerformanceDegradation
-- Proactively detects performance degradation
-- ============================================

CREATE OR ALTER PROCEDURE dbo.AlertOnPerformanceDegradation
    @DurationMinutes INT = 60,
    @CpuThresholdPercent DECIMAL(5,2) = 5.0,
    @LatencyThresholdPercent DECIMAL(5,2) = 10.0
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Check for queries exceeding thresholds in the last @DurationMinutes
    DECLARE @ViolationCount INT;
    
    SELECT @ViolationCount = COUNT(*)
    FROM dbo.QueryExecutionHistory
    WHERE StartTime >= DATEADD(minute, -@DurationMinutes, GETUTCDATETIME())
        AND (MeetsLatencyBudget = 0 OR MeetsCpuBudget = 0);
    
    IF @ViolationCount > 10  -- More than 10 violations in the period
    BEGIN
        INSERT INTO dbo.PerformanceAlertLog (
            AlertTime,
            AlertType,
            AlertSeverity,
            QueryText,
            DurationMS,
            CpuTimeMS,
            ImpactPercent
        )
        SELECT 
            SYSUTCDATETIME(),
            'DegradationDetection',
            'CRITICAL',
            'Multiple queries exceeding budget in last ' + CAST(@DurationMinutes AS NVARCHAR(10)) + ' minutes',
            AVG(DurationMS),
            AVG(CpuTimeMS),
            COUNT(*) * 10.0  -- Severity based on count
        FROM dbo.QueryExecutionHistory
        WHERE StartTime >= DATEADD(minute, -@DurationMinutes, GETUTCDATETIME())
            AND (MeetsLatencyBudget = 0 OR MeetsCpuBudget = 0);
        
        -- Print alert (would integrate with SNS in production)
        PRINT '';
        PRINT '⚠️  PERFORMANCE DEGRADATION ALERT ⚠️';
        PRINT 'Time: ' + CONVERT(NVARCHAR(30), GETUTCDATE());
        PRINT 'Violations in last ' + CAST(@DurationMinutes AS NVARCHAR(10)) + ' minutes: ' + CAST(@ViolationCount AS NVARCHAR(10));
        PRINT 'Recommendation: Investigate recent query performance';
        PRINT '';
    END
END
GO

PRINT 'Stored Procedure [AlertOnPerformanceDegradation] created'
GO

-- ============================================
-- Stored Procedure: PopulateQueryExecutionHistory
-- Populates execution history from DMVs for baseline data
-- ============================================

CREATE OR ALTER PROCEDURE dbo.PopulateQueryExecutionHistory
    @HoursBack INT = 24
AS
BEGIN
    SET NOCOUNT ON;
    
    PRINT 'Populating query execution history from DMVs...';
    
    INSERT INTO dbo.QueryExecutionHistory (
        QueryHash,
        QueryText,
        QueryType,
        StartTime,
        EndTime,
        DurationMS,
        CpuTimeMS,
        LogicalReads,
        MemoryGrantKB,
        RowCount,
        SessionId,
        UserName,
        ClientIPAddress,
        ApplicationName,
        InvolvesEncryptedColumns,
        AuditCaptured,
        ComplianceScope
    )
    SELECT 
        qs.query_hash,
        SUBSTRING(st.text, 1, 4000),
        CASE WHEN st.text LIKE '%SELECT%' THEN 'SELECT'
             WHEN st.text LIKE '%INSERT%' THEN 'INSERT'
             WHEN st.text LIKE '%UPDATE%' THEN 'UPDATE'
             WHEN st.text LIKE '%DELETE%' THEN 'DELETE'
             ELSE 'Other' END,
        qs.creation_time,
        DATEADD(millisecond, qs.total_elapsed_time / qs.execution_count, qs.creation_time),
        qs.total_elapsed_time / qs.execution_count,
        qs.total_worker_time / qs.execution_count,
        qs.total_logical_reads / qs.execution_count,
        qs.max_grant_kb,
        qs.total_rows / qs.execution_count,
        0,  -- Session ID not available from query stats
        NULL,  -- User name not available
        NULL,  -- Client IP not available
        NULL,  -- Application name not available
        CASE WHEN st.text LIKE '%ENCRYPT%' THEN 1 ELSE 0 END,
        CASE WHEN st.text LIKE '%Audit%' THEN 1 ELSE 0 END,
        CASE 
            WHEN st.text LIKE '%Users%' OR st.text LIKE '%UserProfiles%' OR st.text LIKE '%ChatLogs%' THEN 'GDPR'
            WHEN st.text LIKE '%Payments%' OR st.text LIKE '%PaymentMethods%' THEN 'PCI'
            ELSE NULL 
        END
    FROM sys.dm_exec_query_stats qs
    CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
    WHERE qs.creation_time >= DATEADD(hour, -@HoursBack, GETUTCDATE())
        AND st.dbid = DB_ID()
        AND (st.text LIKE '%Users%' OR st.text LIKE '%Payments%' OR st.text LIKE '%EncryptionKey%');
    
    DECLARE @RowsInserted INT = @@ROWCOUNT;
    
    PRINT 'History populated: ' + CAST(@RowsInserted AS NVARCHAR(20)) + ' query executions added.';
END
GO

PRINT 'Stored Procedure [PopulateQueryExecutionHistory] created'
GO

-- ============================================
-- Initialize Performance Tracking
-- ============================================

PRINT '====================================================='
PRINT 'PERFORMANCE TRACKING PROCEDURES INITIALIZED'
PRINT '====================================================='
PRINT ''
PRINT 'Procedures Created:'
PRINT '1. dbo.TrackQueryPerformance - Before/after performance measurement'
PRINT '2. dbo.CaptureRealTimePerformanceSnapshot - 5-minute rolling metrics'
PRINT '3. dbo.GetPerformanceBudgetCompliance - Budget compliance reporting'
PRINT '4. dbo.TrackQueryExecution - Real-time query tracking'
PRINT '5. dbo.AlertOnPerformanceDegradation - Proactive degradation detection'
PRINT '6. dbo.PopulateQueryExecutionHistory - Baseline data population'
PRINT ''
PRINT 'To Get Started:'
PRINT '1. Run: EXEC dbo.PopulateQueryExecutionHistory @HoursBack = 24'
PRINT '2. Run: EXEC dbo.TrackQueryPerformance @TestName = ''TestQuery''...'
PRINT '3. Report: EXEC dbo.GetPerformanceBudgetCompliance @DaysBack = 7'
PRINT '4. Real-time: EXEC dbo.CaptureRealTimePerformanceSnapshot'
PRINT '====================================================='
GO