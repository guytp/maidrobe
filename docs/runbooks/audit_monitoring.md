# Step 6: SQL Server Audit Runbook
## Monitoring and Alerting for GDPR/PCI DSS Compliance

**Document Version**: 1.0  
**Last Updated**: 2024-01-06  
**Classification**: Internal Use  
**Status**: Production Ready

---

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture Overview](#architecture-overview)
3. [Accessing Audit Logs](#accessing-audit-logs)
4. [Monitoring Dashboards](#monitoring-dashboards)
5. [Alerting](#alerting)
6. [Compliance Reporting](#compliance-reporting)
7. [Troubleshooting](#troubleshooting)
8. [Performance Optimization](#performance-optimization)
9. [SIEM Integration](#siem-integration)
10. [Emergency Procedures](#emergency-procedures)

---

## 🚀 Quick Start

### Access CloudWatch Audit Logs

```bash
# List all audit log groups
aws logs describe-log-groups --log-group-name-prefix /aws/rds/instance/buzz-tutor-sql-server

# Stream real-time audit logs from production
aws logs tail "/aws/rds/instance/buzz-tutor-sql-server-tls-production/audit" \
  --follow \
  --region us-east-1 \
  --format short

# Query last 1 hour of audit logs (bash)
START_TIME=$(($(date -u +%s) - 3600))000
aws logs filter-log-events \
  --log-group-name "/aws/rds/instance/buzz-tutor-sql-server-tls-production/audit" \
  --start-time $START_TIME \
  --query 'events[].[timestamp,message]' \
  --output table
```

### Access SQL Server Audit Trail

```sql
-- Connect to RDS (use your actual endpoint)
sqlcmd -S buzz-tutor-sql-server-tls-production.chhid7tsxaa1.us-east-1.rds.amazonaws.com \
  -d buzz_tutor \
  -U sqladmin \
  -P $SQL_PASSWORD \
  -Q "SELECT * FROM dbo.RecentSensitiveDataAccess ORDER BY event_time DESC"

-- GDPR compliance details (last 7 days)
EXEC dbo.GetGDPRComplianceReport @DaysBack = 7;

-- PCI DSS compliance check (last 30 days)
EXEC dbo.GetPCIDSSComplianceReport @DaysBack = 30;

-- Verify audit is working
EXEC dbo.VerifyAuditHealth;
```

### Access SIEM (Splunk)

**URL**: `https://your-splunk.splunkcloud.com`  
**Index**: `aws_buzz_tutor_audit`

```spl
# Recent audit events
index=aws_buzz_tutor_audit sourcetype=aws:rds:sqlserver:audit
| table _time, server_principal_name, object_name, action_id, client_ip, success
| sort -_time
| head 100

# Unauthorized access attempts
index=aws_buzz_tutor_audit success=0
| stats count by server_principal_name, response_code, object_name
| where count > 5
| sort -count

# GDPR PII access
index=aws_buzz_tutor_audit object_name IN ("Users", "UserProfiles", "ChatLogs")
| stats count by server_principal_name, object_name
| sort -count

# PCI cardholder data access
index=aws_buzz_tutor_audit object_name IN ("Payments", "PaymentMethods")
| table _time, user_id, event_type, data_source, origin_ip, compliance_status
```

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Buzz Tutor Application                           │
│  (Express.js, TypeScript, SQL Server Always Encrypted)              │
│  Students, Tutors, Admins interact with sensitive data             │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                    All SQL Operations
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│              RDS SQL Server 2019 Express                            │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Server Audit: BuzzTutorSensitiveDataAccess                │  │
│  │  ├─ GDPR_PII_Access (Users, UserProfiles, ChatLogs)       │  │
│  │  ├─ PCI_CardholderData (Payments, PaymentMethods)         │  │
│  │  └─ HighRiskOperations (Schema changes, audit access)     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  Audit → D:\rdsdbdata\SQLServer\Audit\*\*.sqlaudit (RDS managed)   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ RDS automated export
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│         CloudWatch Logs (Exported automatically)                   │
│  Log Group: /aws/rds/instance/buzz-tutor-sql-server-tls-{env}/audit│
│  Retention: 365 days (PCI DSS requirement)                         │
│  Encryption: KMS (GDPR requirement)                                │
│  Region: us-east-1                                                 │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ CloudWatch Logs Subscription Filter
                               │ Pattern: [event_time, server_principal_name, ...]
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│    Kinesis Data Firehose → Splunk (SIEM Integration)               │
│  ├─ Buffer: 5MB or 60 seconds (low latency)                       │
│  ├─ Retry: 300 seconds (reliable)                                 │
│  ├─ Compression: GZIP (cost efficient)                            │
│  ├─ Backup: Failed events → S3 (compliance guarantee)             │
│  └─ Latency: < 1 minute to Splunk                                 │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ Real-time streaming
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Splunk Enterprise Security (SIEM)                     │
│  • Real-time alerting & correlation                                │
│  • Dashboards: GDPR Compliance, PCI DSS Compliance                │
│  • Threat detection (unauthorized access, bulk export)            │
│  • Incident response & forensics                                  │
│  • SOAR integration (Security Orchestration)                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Components:**
- **Source**: RDS SQL Server native audit (not application-level)
- **Transport**: AWS managed export to CloudWatch Logs
- **Streaming**: Kinesis Firehose to Splunk HEC (HTTP Event Collector)
- **Storage**: CloudWatch (hot), S3 Glacier (cold archive)
- **Retention**: 365 days active (PCI DSS), 7 years archive (GDPR)
- **SIEM**: Splunk Enterprise Security with CIM field mapping

**Data Flow:**
1. SQL operation occurs on sensitive table (Users, UserProfiles, Payments, etc.)
2. SQL Server audit captures: who, what, when, where (native audit file)
3. RDS exports to CloudWatch Logs (< 5 minutes)
4. CloudWatch subscription streams to Kinesis Firehose (real-time)
5. Firehose buffers, compresses, and delivers to Splunk HEC (< 1 minute)
6. Failed deliveries backed up to S3 (guaranteed delivery)
7. Splunk indexes, enriches, and triggers alerts
8. Security team reviews in Splunk dashboard

---

## 🔍 Accessing Audit Logs

### SQL Server Native Audit (Primary Source)

**Location**: `D:\rdsdbdata\SQLServer\Audit\*\*.sqlaudit` (RDS managed, not directly accessible)

**Access Method**:
```sql
-- Query native audit files (real-time view)
SELECT 
    event_time,
    server_principal_name AS who_performed,
    client_ip AS source_ip,
    object_name AS table_accessed,
    statement AS sql_statement,
    action_id AS operation_type,
    affected_rows AS impact,
    success,
    response_code
FROM sys.fn_get_audit_file('D:\\rdsdbdata\\SQLServer\\Audit\\*\\*.sqlaudit', DEFAULT, DEFAULT)
WHERE event_time >= DATEADD(hour, -24, GETUTCDATE())
    AND object_name IN ('Users', 'UserProfiles', 'Payments', 'PaymentMethods', 'ChatLogs')
ORDER BY event_time DESC;
```

**Key Fields Captured** (GDPR/PCI DSS Alignment):

| Field | GDPR Article 30 | PCI DSS Req 10 | Description |
|-------|----------------|----------------|-------------|
| `event_time` | When | Date/Time | UTC timestamp with milliseconds |
| `server_principal_name` | Who | User ID | Database user who performed action |
| `client_ip` | Where | Origin | Source IP address |
| `object_name` | What | Affected Resource | Table/object accessed |
| `statement` | What | Event Details | Full SQL statement executed |
| `action_id` | How | Type of Event | SELECT/INSERT/UPDATE/DELETE |
| `affected_rows` | Impact | - | Number of rows affected |
| `application_name` | Where | - | Application source |
| `success` | Result | Success/Failure | 1 = success, 0 = failure |
| `response_code` | Error | Error Code | Error code if failed |
| `session_id` | How | Identity | Session identifier |

### CloudWatch Logs (Centralized)

**Log Groups:**
- Primary: `/aws/rds/instance/buzz-tutor-sql-server-tls-{env}/audit`
- SIEM: `/aws/rds/instance/buzz-tutor-sql-server-tls-{env}/audit-siem`
- Firehose Monitoring: `/aws/firehose/buzz-tutor-sql-audit-to-splunk-{env}`

**Query via AWS Console:**
1. Navigate to: **CloudWatch → Logs → Log groups**
2. Select: `/aws/rds/instance/buzz-tutor-sql-server-tls-production/audit`
3. Click: **View in Logs Insights**

**CloudWatch Logs Insights Queries**:

```sql
# Recent sensitive data access (last 1 hour)
fields @timestamp, @message
| filter object_name IN ['Users', 'UserProfiles', 'Payments', 'PaymentMethods', 'ChatLogs']
| filter success = 1
| sort @timestamp desc
| limit 100

# Failed access attempts
fields @timestamp, server_principal_name, object_name, response_code
| filter success = 0
| stats count() by server_principal_name
| sort count desc
| limit 20

# Bulk export detection (GDPR/PCI risk)
fields @timestamp, server_principal_name, object_name, affected_rows
| filter statement LIKE /SELECT \*/
| filter affected_rows > 1000
| sort affected_rows desc

# Source IP analysis
fields server_principal_name, client_ip, application_name
| filter object_name IN ['Users', 'UserProfiles', 'Payments', 'PaymentMethods']
| stats count() by client_ip
| sort count desc
| limit 50
```

**CLI Access**:
```bash
# List recent log events
aws logs tail "/aws/rds/instance/buzz-tutor-sql-server-tls-production/audit" \
  --since 1h \
  --region us-east-1

# Export logs to S3 for analysis
aws logs create-export-task \
  --log-group-name "/aws/rds/instance/buzz-tutor-sql-server-tls-production/audit" \
  --from $(($(date -u +%s) - 86400))000 \
  --to $(date -u +%s)000 \
  --destination "buzz-tutor-audit-exports" \
  --region us-east-1
```

### Compliance Views (SQL Helpers)

**Pre-built Views**:
- `dbo.RecentSensitiveDataAccess` - Last 24 hours (real-time monitoring)
- `dbo.AuditComplianceSummary` - Daily summary (reporting)
- `dbo.AuditGDPRComplianceDetail` - GDPR Article 30 details (who, what, when, where, why, how)
- `dbo.AuditPCIDSSCompliance` - PCI DSS Requirement 10 compliance
- `dbo.Audit_CostOptimized` - Last 30 days (fast queries)
- `dbo.AuditArchive` - Historical compressed data

**Usage Examples**:

```sql
-- GDPR: Generate data subject access report
SELECT 
    who_identity AS UserId,
    what_data_object AS DataCategory,
    when_timestamp AS AccessTime,
    where_ip_address AS SourceIP,
    why_legal_basis AS LegalBasis,
    how_operation_type AS Operation
FROM dbo.AuditGDPRComplianceDetail
WHERE when_timestamp >= DATEADD(day, -30, GETUTCDATE())
    AND who_identity = 'student_12345'
ORDER BY when_timestamp DESC;

-- PCI DSS: Failed access attempts to cardholder data
SELECT 
    user_id,
    COUNT(*) AS failed_attempts,
    MIN(timestamp) AS first_attempt,
    MAX(timestamp) AS last_attempt,
    STRING_AGG(DISTINCT origin_ip, ', ') AS source_ips
FROM dbo.AuditPCIDSSCompliance
WHERE timestamp >= DATEADD(day, -7, GETUTCDATE())
    AND success = 0
GROUP BY user_id
HAVING COUNT(*) > 3
ORDER BY failed_attempts DESC;

-- Cost-optimized: Recent activity summary
SELECT 
    EventDate,
    TableName,
    EventType,
    COUNT(*) AS occurrences
FROM dbo.Audit_CostOptimized
WHERE EventDate >= DATEADD(day, -7, GETUTCDATE())
GROUP BY EventDate, TableName, EventType
ORDER BY EventDate DESC, occurrences DESC;
```

---

## 📊 Monitoring Dashboards

### CloudWatch Dashboard

**URL**: `https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=buzz-tutor-audit-monitoring-{env}`

**Dashboard Widgets**:

1. **Audit Event Volume** (Time series - top left)
   - Metrics: UnauthorizedAccessAttempts, SensitiveTableAccess, DeliveryToSplunk.RecordsFailed
   - Period: 5 minutes
   - Statistic: Sum
   - Threshold: Alert if >100,000 events in 5 minutes
   - **Use Case**: Detect bulk data export, DDoS, or breach attempts

2. **Recent Sensitive Data Access** (Log table - top right)
   - Query: Last 20 sensitive table operations
   - Refresh: Auto (Live tail mode)
   - **Use Case**: Real-time operator monitoring

3. **Compliance Scope Breakdown** (Stacked area - bottom)
   - Metrics: GDPR_PII_Access, PCI_CardholderData, HighRiskOperations
   - Period: 1 hour
   - Statistic: Sum
   - **Use Case**: Understand which compliance scope generates most activity

**Access CLI**:
```bash
# Get dashboard URL
echo "https://$(aws configure get region).console.aws.amazon.com/cloudwatch/home?region=$(aws configure get region)#dashboards:name=buzz-tutor-audit-monitoring-production"

# Get dashboard body (JSON)
aws cloudwatch get-dashboard --dashboard-name buzz-tutor-audit-monitoring-production
```

### Splunk Dashboard

**Default Dashboards**: (Create in Splunk)

1. **Buzz Tutor Audit Overview**
```spl
# Event volume by time
timechart span=1h count by object_name
| fillnull value=0
| eval volume_level=case(count>10000, "Critical", count>1000, "High", count>100, "Medium", 1=1, "Low")
```

2. **GDPR Compliance Dashboard**
```spl
# PII access patterns
index=aws_buzz_tutor_audit object_name IN ("Users", "UserProfiles", "ChatLogs")
| stats count by server_principal_name, object_name, client_ip
| where count > 10
| sort -count
| eval risk=if(count > 1000, "High", if(count > 100, "Medium", "Low"))
```

3. **PCI DSS Compliance Dashboard**
```spl
# Cardholder data access monitoring
index=aws_buzz_tutor_audit object_name IN ("Payments", "PaymentMethods")
| stats count, values(origin_ip) by user_id
| where count > 5
| sort -count
| eval status=if(success=1, "Authorized", "Failed")
```

4. **Security Incident Response**
```spl
# Suspicious activities
index=aws_buzz_tutor_audit
| search (success=0 OR (statement LIKE "%SELECT *%" AND affected_rows > 1000) OR (hour > 22 OR hour < 6))
| table _time, server_principal_name, object_name, statement, client_ip, success, response_code
| sort -_time
```

**Creating Dashboard in Splunk**:
1. **Apps → Dashboards → Create New Dashboard**
2. Name: "Buzz Tutor Audit Overview"
3. Permissions: App-level (share with Security team)
4. Add panels with above queries
5. Set refresh: 5 minutes for real-time monitoring

---

## 🚨 Alerting

### CloudWatch Alarms (Real-Time)

**Configured Alarms**: (see sql_server_audit.tf)

| Alarm Name | Metric | Threshold | Severity | Action |
|------------|--------|-----------|----------|--------|
| `buzz-tutor-audit-log-generation-{env}` | IncomingLogEvents | > 100K / 5min | Critical | SNS → Email Security Team |
| `buzz-tutor-unauthorized-access-{env}` | Failed Operations | > 10 / 5min | High | SNS → Slack #security-alerts |
| `buzz-tutor-splunk-delivery-failure-{env}` | DeliveryToSplunk.RecordsFailed | > 5 / 5min | High | SNS → DevOps Team |
| `buzz-tutor-siem-unauthorized-spike-{env}` | UnauthorizedAccessAttempts | > 10 / 5min | High | SNS → Security Team |
| `buzz-tutor-siem-bulk-export-{env}` | BulkDataExport | > 1 / 10min | Critical | SNS → SOC + PagerDuty |
| `buzz-tutor-sensitive-table-spike-{env}` | SensitiveTableAccess | > 1000 / 5min | High | SNS → Security Team |

**Example Alarm Response** (Bulk Export Detected):

```bash
# 1. Acknowledge alert (set to ALARM state)
aws cloudwatch set-alarm-state \
  --alarm-name buzz-tutor-siem-bulk-export-production \
  --state-value ALARM \
  --state-reason "Investigating bulk export alert"

# 2. Query audit logs for context
sqlcmd -S $RDS_ENDPOINT -d buzz_tutor -Q \
"SELECT 
   server_principal_name,
   client_ip,
   object_name,
   COUNT(*) AS records_exported,
   MIN(event_time) AS started_at,
   statement
 FROM sys.fn_get_audit_file('D:\\rdsdbdata\\SQLServer\\Audit\\*\\*.sqlaudit', DEFAULT, DEFAULT)
 WHERE event_time >= DATEADD(minute, -30, GETUTCDATE())
   AND statement LIKE '%SELECT *%'
   AND affected_rows > 1000
 GROUP BY server_principal_name, client_ip, object_name, statement"

# 3. If unauthorized, revoke access immediately
sqlcmd -S $RDS_ENDPOINT -d buzz_tutor -Q \
"ALTER ROLE db_datareader DROP MEMBER [suspicious_user]"

# 4. Notify stakeholders
aws sns publish \
  --topic-arn arn:aws:sns:us-east-1:{account}:security-incidents \
  --message "CONFIRMED: Unauthorized bulk export detected. User access revoked. Incident #INC12345"

# 5. Create forensic snapshot
sqlcmd -S $RDS_ENDPOINT -d buzz_tutor -Q \
"SELECT * INTO AuditForensics_$(date +%Y%m%d_%H%M%S) 
 FROM sys.fn_get_audit_file('D:\\rdsdbdata\\SQLServer\\Audit\\*\\*.sqlaudit', DEFAULT, DEFAULT)
 WHERE event_time >= DATEADD(hour, -4, GETUTCDATE())"
```

### Splunk Alerting (Real-Time SIEM)

**Create Alert Rules** (Settings → Searches, Reports, and Alerts → New):

1. **Unusual Data Access Pattern**
```spl
# Save As: Alert
# Search: index=aws_buzz_tutor_audit object_name IN ("Users", "UserProfiles", "Payments", "PaymentMethods")
#         | stats count by server_principal_name, object_name 
#         | where count > 1000
# Trigger: Real-time (every 5 minutes)
# Severity: High
# Action: Email security-team@buzztutor.com, Slack #security-alerts
```

2. **After Hours Sensitive Access**
```spl
# Search: index=aws_buzz_tutor_audit object_name IN ("Users", "UserProfiles", "Payments")
#         | eval hour=strftime(_time, "%H")
#         | where hour > 22 OR hour < 6
#         | stats count by server_principal_name, object_name
#         | where count > 5
# Trigger: Real-time (15 minutes)
# Severity: Medium
```

3. **Bulk Data Exfiltration**
```spl
# Search: index=aws_buzz_tutor_audit statement LIKE "SELECT *%" 
#         | where affected_rows > 10000
#         | table _time, server_principal_name, object_name, affected_rows, client_ip
# Trigger: Real-time (1 minute)
# Severity: Critical
# Action: PagerDuty integration
```

4. **Failed Login Attempts**
```spl
# Search: index=aws_buzz_tutor_audit action_id IN ("LGIS", "LGIF") OR statement LIKE "%login%"
#         | where success = 0
#         | stats count by server_principal_name, client_ip
#         | where count > 3
# Trigger: Real-time (5 minutes)
# Severity: High
```

5. **Schema Changes (Privilege Escalation)**
```spl
# Search: index=aws_buzz_tutor_audit action_id IN ("CREATE", "ALTER", "DROP")
#         | table _time, server_principal_name, statement, client_ip
# Trigger: Real-time (immediate)
# Severity: High
# Action: Email secops-team@buzztutor.com
```

**Alert Configuration**:
- **Throttle**: 30 minutes (prevent alert fatigue)
- **Expiration**: 24 hours (auto-disable if not triggered)
- **Track**: Enabled (for incident tracking)
- **Severity**: Per above mapping

---

## 📄 Compliance Reporting

### Automated Compliance Reports

**GDPR Article 30** (Records of Processing Activities):

```bash
#!/bin/bash
# Run: Monthly, 1st at 9 AM UTC
# Location: /scripts/monthly_gdpr_report.sh

echo "Generating GDPR monthly compliance report..."

# Generate report
sqlcmd -S $RDS_ENDPOINT -d buzz_tutor -U $SQL_USER -P $SQL_PASSWORD \
  -Q "EXEC dbo.GetGDPRComplianceReport @DaysBack = 30" \
  -o "/reports/gdpr_monthly_$(date +%Y%m).csv" \
  -s"," -w 700 -W

# Encrypt report (GDPR requirement for sensitive data)
gpg --encrypt --recipient compliance@buzztutor.com \
  --output "/reports/gdpr_monthly_$(date +%Y%m).csv.gpg" \
  "/reports/gdpr_monthly_$(date +%Y%m).csv"

rm "/reports/gdpr_monthly_$(date +%Y%m).csv"

# Upload to secure S3 bucket
aws s3 cp "/reports/gdpr_monthly_$(date +%Y%m).csv.gpg" \
  s3://buzz-tutor-compliance-reports/gdpr/monthly/ \
  --sse aws:kms \
  --sse-kms-key-id alias/buzz-tutor-compliance

# Log compliance activity
sqlcmd -S $RDS_ENDPOINT -d buzz_tutor \
  -Q "INSERT INTO dbo.ComplianceAuditLog (ReportType, ReportDate, Status, StoredLocation) 
      VALUES ('GDPR_Monthly', GETUTCDATE(), 'Generated', 's3://buzz-tutor-compliance-reports/gdpr/monthly/')"

# Notify compliance team
aws sns publish \
  --topic-arn $COMPLIANCE_TOPIC \
  --subject "GDPR Monthly Report Generated: $(date +%Y-%m)" \
  --message "Report: s3://buzz-tutor-compliance-reports/gdpr/monthly/gdpr_monthly_$(date +%Y%m).csv.gpg"

echo "GDPR report generation complete"
```

**PCI DSS Requirement 10** (Logging Compliance):

```bash
#!/bin/bash
# Run: Daily at 2 AM UTC
# Location: /scripts/daily_pci_report.sh

echo "Generating PCI DSS daily compliance report..."

# Generate compliance report
sqlcmd -S $RDS_ENDPOINT -d buzz_tutor -U $sqladmin -P $SQL_PASSWORD \
  -Q "EXEC dbo.GetPCIDSSComplianceReport @DaysBack = 1" \
  -o "/reports/pci_daily_$(date +%Y%m%d).txt" \
  -W

# Check compliance score > 95%
COMPLIANCE_SCORE=$(grep -oP 'ComplianceScorePercent: \K[0-9.]+' "/reports/pci_daily_$(date +%Y%m%d).txt")

if (( $(echo "$COMPLIANCE_SCORE < 95" | bc -l) )); then
    echo "WARNING: PCI DSS compliance score below 95%: $COMPLIANCE_SCORE"
    
    # Alert security team
    aws sns publish \
      --topic-arn $SECURITY_TOPIC \
      --subject "URGENT: PCI DSS Compliance Score Low: $COMPLIANCE_SCORE%" \
      --message "Compliance report: /reports/pci_daily_$(date +%Y%m%d).txt"
fi

# Upload to S3
aws s3 cp "/reports/pci_daily_$(date +%Y%m%d).txt" \
  s3://buzz-tutor-compliance-reports/pci/daily/ \
  --sse aws:kms \
  --sse-kms-key-id alias/buzz-tutor-pci

echo "PCI DSS report complete. Score: $COMPLIANCE_SCORE%"
```

**Manual Report Generation**:

```sql
-- GDPR Data Subject Access Request (DSAR)
-- User requests: "What data do you have about me?"

CREATE PROCEDURE dbo.GenerateDSARReport
    @UserId NVARCHAR(100),
    @StartDate DATE = NULL,
    @EndDate DATE = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    IF @StartDate IS NULL SET @StartDate = DATEADD(year, -1, GETUTCDATE());
    IF @EndDate IS NULL SET @EndDate = GETUTCDATE();
    
    SELECT 
        'PERSONAL_DATA_ACCESS' AS DataCategory,
        who_identity AS UserId,
        what_data_object AS TableName,
        when_timestamp AS AccessDate,
        where_ip_address AS SourceIP,
        why_legal_basis AS LegalBasis,
        how_operation_type AS OperationType
    FROM dbo.AuditGDPRComplianceDetail
    WHERE who_identity = @UserId
        AND when_timestamp BETWEEN @StartDate AND @EndDate
    
    UNION ALL
    
    SELECT 
        'KEY_MANAGEMENT' AS DataCategory,
        PerformedBy AS UserId,
        KeyName AS TableName,
        CreatedAt AS AccessDate,
        'N/A' AS SourceIP,
        'Security - Key Management' AS LegalBasis,
        'ENCRYPT/DECRYPT' AS OperationType
    FROM dbo.EncryptionKeyAudit
    WHERE UserId = @UserId
        AND CreatedAt BETWEEN @StartDate AND @EndDate
    ORDER BY AccessDate DESC;
    
    -- Export recommendation: CSV with PGP encryption
END
GO
```

**Retention Verification**:

```bash
# Verify 365-day retention for PCI DSS
aws logs describe-log-groups \
    --log-group-name-prefix /aws/rds/instance/buzz-tutor-sql-server-tls-production/audit \
    --query 'logGroups[0].retentionInDays'
# Expected: 365

# Verify S3 backup integrity
aws s3 ls s3://buzz-tutor-audit-backup-production-{account}/failed-splunk/ \
    --recursive \
    --human-readable
# Should show recent .gz files if any failures occurred

# Verify archive completeness
sqlcmd -S $RDS_ENDPOINT -d buzz_tutor \
  -Q "SELECT COUNT(*) FROM dbo.AuditArchive WHERE RetentionEndDate > GETUTCDATE()"
# Should show count of valid archived records
```

---

## 🔧 Troubleshooting Guide

### Issue 1: No Audit Logs in CloudWatch

**Symptoms**:
- Empty log streams
- No data when querying `sys.fn_get_audit_file()`
- Alarms in INSUFFICIENT_DATA state

**Diagnosis**:
```bash
# Check RDS parameter group
aws rds describe-db-parameters \
    --db-parameter-group-name buzz-tutor-tls-enforcement-production \
    --query 'Parameters[?ParameterName==`rds.sql_server_audit_logs`]'
# Expected: {"ParameterName": "rds.sql_server_audit_logs", "ParameterValue": "1"}

# Check CloudWatch export configuration
aws rds describe-db-instances \
    --db-instance-identifier buzz-tutor-sql-server-tls-production \
    --query 'DBInstances[0].EnabledCloudwatchLogsExports'
# Expected: ["error", "general", "audit"]

# Check if audit is enabled in SQL Server
sqlcmd -S $RDS_ENDPOINT -d master \
  -Q "SELECT name, is_state_enabled FROM sys.server_audits WHERE name = 'BuzzTutorSensitiveDataAccess'"
# Expected: name=BuzzTutorSensitiveDataAccess, is_state_enabled=1
```

**Root Causes**:
1. RDS parameter group not updated (missing `rds.sql_server_audit_logs = 1`)
2. Database audit specification not enabled (`STATE = OFF`)
3. No activity on monitored tables yet
4. CloudWatch Logs export misconfigured

**Resolution**:

```terraform
# In sql_server_tls.tf, verify:
resource "aws_db_parameter_group" "buzz_tutor_tls_enforcement" {
  parameter {
    name  = "rds.sql_server_audit_logs"
    value = "1"  # Must be "1", not "true"
  }
}

# Reboot RDS (parameter changes require restart)
aws rds reboot-db-instance \
  --db-instance-identifier buzz-tutor-sql-server-tls-production

# Verify audit status
sqlcmd -S $RDS_ENDPOINT -d master \
  -Q "SELECT name, is_state_enabled FROM sys.server_audits"
# Should show: BuzzTutorSensitiveDataAccess | 1

# Wait 5 minutes and check CloudWatch
aws logs describe-log-streams \
  --log-group-name "/aws/rds/instance/buzz-tutor-sql-server-tls-production/audit" \
  --order-by LastEventTime
```

### Issue 2: Logs Not Reaching Splunk

**Symptoms**:
- Firehose delivery failures metric increasing
- No events in Splunk index
- CloudWatch Logs has data but Splunk doesn't

**Diagnosis**:
```bash
# Check Firehose delivery status
aws firehose describe-delivery-stream \
  --delivery-stream-name buzz-tutor-sql-audit-to-splunk-production

# Check CloudWatch for Firehose errors
aws logs filter-log-events \
  --log-group-name /aws/firehose/buzz-tutor-sql-audit-to-splunk-production \
  --filter-pattern "ERROR" \
  --region us-east-1

# Check S3 backup for failed deliveries
aws s3 ls s3://buzz-tutor-audit-backup-production-{account}/failed-splunk/ \
  --recursive \
  --human-readable

# Verify Splunk HEC is reachable
curl -k https://your-splunk.splunkcloud.com:8088/services/collector/health \
  -H "Authorization: Splunk YOUR_HEC_TOKEN"
# Expected: {"text": "HEC is healthy", "code": 17}
```

**Common Issues**:

1. **Invalid HEC Token**:
```bash
# Verify token in Secrets Manager
aws secretsmanager get-secret-value \
  --secret-id buzz-tutor/splunk-hec-production \
  --query 'SecretString' | jq -r '. | fromjson | .hec_token'

# Verify Splunk index exists
# Splunk UI: Settings → Data → Indexes → Check for "aws_buzz_tutor_audit"
```

2. **Network Connectivity**:
- Verify VPC endpoint for Splunk Cloud (if private VPC)
- Check security group outbound rules (port 443 to Splunk)
- Test: `telnet your-splunk-hec-endpoint.splunkcloud.com 8088`

3. **HEC Index Missing**:
- Splunk: **Settings → Data → Indexes → New Index**
- Name: `aws_buzz_tutor_audit`
- Max Size: 50 GB initially
- Retention: 90 days

**Resolution**:

```bash
# Update token in Secrets Manager
aws secretsmanager update-secret \
  --secret-id buzz-tutor/splunk-hec-production \
  --secret-string '{"splunk_host":"https://your-splunk.splunkcloud.com:8088","hec_token":"NEW_TOKEN","splunk_index":"aws_buzz_tutor_audit"}'

# Redeliver failed events from S3
# Download from S3
aws s3 sync s3://buzz-tutor-audit-backup-production-{account}/failed-splunk/ ./failed-events/

# Extract and manually POST to Splunk HEC
for file in ./failed-events/*.gz; do
  gzip -d $file
  json_file="${file%.gz}"
  curl -k https://your-splunk.splunkcloud.com:8088/services/collector \
    -H "Authorization: Splunk $NEW_TOKEN" \
    -H "X-Splunk-Request-Channel: $(uuidgen)" \
    -d @$json_file
done

# Check Firehose recovery after token update
aws firehose describe-delivery-stream \
  --name buzz-tutor-sql-audit-to-splunk-production \
  --query 'DeliveryStreamDescription.DeliveryStreamStatus'
# Should be: ACTIVE
```

### Issue 3: High CloudWatch Costs

**Symptoms**:
- Monthly bill > $500 expected
- Log ingestion charges excessive
- Unexpected volume spikes

**Diagnosis**:
```bash
# Estimate current daily volume
aws logs describe-log-groups \
    --log-group-name-prefix /aws/rds/instance/buzz-tutor-sql-server-tls-production \
    --query 'logGroups[0].storedBytes'

# Calculate monthly projection
daily_bytes=$(aws logs describe-log-groups --log-group-name-prefix ... | jq '.logGroups[0].storedBytes')
daily_gb=$(echo "$daily_bytes" | awk '{print $1/1024/1024/1024}')
monthly_cost=$(echo "$daily_gb * 30 * 1.50" | bc)  # $1.50/GB/month

echo "Daily volume: ${daily_gb} GB"
echo "Estimated monthly cost: \$$monthly_cost"

# Identify top log sources
aws logs filter-log-events \
    --log-group-name "/aws/rds/instance/buzz-tutor-sql-server-tls-production/audit" \
    --start-time $(($(date -u +%s) - 3600))000 \
    --query 'events[0:10]'
```

**Common Causes**:
1. Auditing ALL tables instead of just sensitive ones
2. High-volume SELECT * queries on large tables
3. No filter on CloudWatch subscription
4. Insufficient buffer on Firehose (too many small deliveries)

**Resolution**:

**Option 1: Filter audit targets** (recommended)
```sql
-- Instead of auditing ALL tables, focus on sensitive ones only
-- Already configured in our specs:
-- GDPR_PII_Access: Users, UserProfiles, ChatLogs
-- PCI_CardholderData: Payments, PaymentMethods

-- Verify no excessive auditing:
SELECT name, is_state_enabled FROM sys.database_audit_specifications;
```

**Option 2: Increase Firehose buffer** (reduce API calls)
```terraform
# In siem_integration.tf
resource "aws_kinesis_firehose_delivery_stream" "sql_audit_to_splunk" {
  splunk_configuration {
    buffer_size = 10    # Increase from 5MB to 10MB
    buffer_interval = 120  # Increase from 60s to 120s
  }
}
```

**Option 3: Enable daily summarization** (reduce raw log retention)
```bash
# In AWS Console: EventBridge → Rules → Create Rule
# Schedule: cron(0 1 * * ? *)  # Daily 1 AM UTC
# Target: RDS → Execute SQL
# SQL: EXEC dbo.SummarizeAuditLogs;

# Then reduce CloudWatch retention from 365 to 90 days for cost savings:
resource "aws_cloudwatch_log_group" "sql_server_audit" {
  retention_in_days = 90  # Still meets GDPR, saves ~75% cost
}
```

**Option 4: Implement sampling** (for non-critical environments)
```terraform
# Only for staging/dev - NEVER for production
parameter {
  name  = "rds.sql_server_audit_level"
  value = "FAILED_LOGIN_ONLY"  # Only audit failures
}
```

### Issue 4: Performance Degradation

**Symptoms**:
- Query timeouts on audit views
- High DTU/CPU usage on RDS
- Application slowness during peak hours
- Index fragmentation > 30%

**Diagnosis**:
```sql
-- Check index fragmentation (run weekly)
SELECT 
    t.name AS TableName,
    i.name AS IndexName,
    s.avg_fragmentation_in_percent,
    s.page_count,
    CASE 
        WHEN s.avg_fragmentation_in_percent > 30 THEN 'REBUILD NEEDED'
        WHEN s.avg_fragmentation_in_percent > 5 THEN 'REORGANIZE NEEDED'
        ELSE 'HEALTHY'
    END AS ActionNeeded
FROM sys.dm_db_index_physical_stats(DB_ID(), NULL, NULL, NULL, NULL) s
INNER JOIN sys.tables t ON s.object_id = t.object_id
INNER JOIN sys.indexes i ON s.object_id = i.object_id AND s.index_id = i.index_id
WHERE t.name IN ('AuditLog', 'AuditDailySummary', 'AuditArchive')
ORDER BY s.avg_fragmentation_in_percent DESC;

-- Check query performance (slowest queries)
SELECT TOP 10
    qs.execution_count,
    qs.total_worker_time/1000000.0 AS total_cpu_time_seconds,
    qs.total_elapsed_time/1000000.0 AS total_duration_seconds,
    st.text AS query_text
FROM sys.dm_exec_query_stats AS qs
CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) AS st
WHERE st.text LIKE '%AuditGDPRComplianceDetail%' 
   OR st.text LIKE '%RecentSensitiveDataAccess%'
ORDER BY qs.total_worker_time DESC;
```

**Resolution**:

1. **Rebuild fragmented indexes** (weekly maintenance window):
```sql
-- Run during off-peak hours (2 AM Sunday)
ALTER INDEX ALL ON dbo.AuditLog REBUILD WITH (ONLINE = ON);
ALTER INDEX ALL ON dbo.AuditDailySummary REBUILD WITH (ONLINE = ON);
ALTER INDEX ALL ON dbo.AuditArchive REBUILD WITH (ONLINE = ON);

-- Or reorganize if fragmentation 5-30%
ALTER INDEX ALL ON dbo.AuditLog REORGANIZE;
```

2. **Update statistics** (daily):
```bash
# In SQL Server Agent Job or EventBridge
sqlcmd -S $RDS_ENDPOINT -d buzz_tutor -Q "EXEC dbo.InitializeAuditOptimization"
```

3. **Use cost-optimized views** (app-level queries):
```sql
-- ❌ BAD: Full table scan
SELECT * FROM dbo.AuditLog 
WHERE CreatedAt >= DATEADD(day, -30, GETUTCDATE())
  AND TableName IN ('Users', 'UserProfiles');

-- ✅ GOOD: Pre-filtered, indexed view
SELECT * FROM dbo.Audit_CostOptimized 
WHERE EventDate >= DATEADD(day, -30, GETUTCDATE());

-- ✅ BEST: Daily summary (90% faster)
SELECT SummaryDate, GDPR_Scope_Operations, PCI_Scope_Operations
FROM dbo.AuditDailySummary
WHERE SummaryDate BETWEEN '2024-01-01' AND '2024-01-31';
```

4. **Enable Query Store** (track performance regression):
```sql
ALTER DATABASE buzz_tutor SET QUERY_STORE = ON;
ALTER DATABASE buzz_tutor SET QUERY_STORE (
    OPERATION_MODE = READ_WRITE,
    CLEANUP_POLICY = (STALE_QUERY_THRESHOLD_DAYS = 90),
    DATA_FLUSH_INTERVAL_SECONDS = 900,
    MAX_STORAGE_SIZE_MB = 500,
    INTERVAL_LENGTH_MINUTES = 60
);
```

5. **Partition large audit tables** (if > 100M records):
```sql
-- Note: Only implement if absolutely necessary
-- Adds complexity but improves query performance
CREATE PARTITION FUNCTION PF_AuditDate (DATE)
AS RANGE RIGHT FOR VALUES 
('2024-01-01', '2024-04-01', '2024-07-01', '2024-10-01');

CREATE PARTITION SCHEME PS_AuditDate
AS PARTITION PF_AuditDate ALL TO ([PRIMARY]);
```

6. **Monitor and alert on performance**:
```terraform
resource "aws_cloudwatch_metric_alarm" "rds_cpu_high" {
  alarm_name          = "buzz-tutor-rds-cpu-high-production"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "High CPU on RDS - may impact audit performance"
  alarm_actions       = [data.aws_sns_topic.alerts.arn]
}
```

---

## 🔌 SIEM Integration Details

### Splunk Configuration

**HEC (HTTP Event Collector) Setup**:

1. **Enable HEC**:
   - Splunk: **Settings → Data Inputs → HTTP Event Collector → Global Settings**
   - Enable HTTP Event Collector: ☑️
   - Default Port: 8088
   - Default Source Type: aws:rds:sqlserver:audit
   - Enable SSL: ☑️ (required)

2. **Create HEC Token**:
   - **Settings → Data Inputs → HTTP Event Collector → New Token**
   - Name: "Buzz Tutor RDS Audit Production"
   - Description: "SQL Server audit logs from RDS for compliance"
   - Source Type Override: aws:rds:sqlserver:audit
   - Index: `aws_buzz_tutor_audit`
   - Click: **Next → Review → Submit**
   - **IMPORTANT**: Copy token value (only shown once)

3. **Configure Index**:
   - **Settings → Data → Indexes → New Index**
   - Index Name: `aws_buzz_tutor_audit`
   - Max Size: 50 GB (adjust based on volume)
   - Retention: 90 days (hot), 1 year (frozen)
   - Click: **Save**

4. **Store Token in AWS Secrets Manager**:
```bash
aws secretsmanager create-secret \
  --name buzz-tutor/splunk-hec-production \
  --secret-string '{"splunk_host":"https://your-splunk.splunkcloud.com:8088","hec_token":"YOUR_TOKEN","splunk_index":"aws_buzz_tutor_audit"}' \
  --region us-east-1
```

**Field Extraction (props.conf)**:

```ini
# In $SPLUNK_HOME/etc/apps/buzz_tutor_audit/local/props.conf
[aws:rds:sqlserver:audit]

# Auto-extract JSON fields
KV_MODE = json

# Extract specific fields
EXTRACT-event_time = "event_time":\s*"(?<event_time>[^"]+)"
EXTRACT-server_principal_name = "server_principal_name":\s*"(?<user>[^"]+)"
EXTRACT-object_name = "object_name":\s*"(?<table>[^"]+)"
EXTRACT-action_id = "action_id":\s*"(?<action>[^"]+)"
EXTRACT-client_ip = "client_ip":\s*"(?<source_ip>[^"]+)"
EXTRACT-success = "success":\s*(?<success>\d)
EXTRACT-affected_rows = "affected_rows":\s*(?<affected_rows>\d+)

# Create compliance scope field
EVAL-compliance_scope = case(
    table=="Users" OR table=="UserProfiles" OR table=="ChatLogs", "GDPR_PII",
    table=="Payments" OR table=="PaymentMethods", "PCI_CardholderData",
    1=1, "General"
)

# Time parsing
TIME_PREFIX = "event_time":\s*"
TIME_FORMAT = %Y-%m-%dT%H:%M:%S.%N
MAX_TIMESTAMP_LOOKAHEAD = 30

# Line breaking
SHOULD_LINEMERGE = false
LINE_BREAKER = ([\r\n]+)
TRUNCATE = 10000

# Field aliases for CIM compliance
FIELDALIAS-user = user AS user
FIELDALIAS-src = source_ip AS src
FIELDALIAS-action = action AS action
FIELDALIAS-object = table AS object
```

**Transformations (transforms.conf)**:
```ini
# In $SPLUNK_HOME/etc/apps/buzz_tutor_audit/local/transforms.conf

# Lookup for user attribution
[buzz_tutor_user_lookup]
filename = buzz_tutor_users.csv
case_sensitive_match = false

# Lookup for table classification
[buzz_tutor_table_classification]
filename = table_classification.csv
case_sensitive_match = false
```

**CIM (Common Information Model) Compliance**:

Map our audit fields to CIM Data Model:

| Audit Field | CIM Field | Why |
|-------------|-----------|-----|
| `server_principal_name` | `user` | User identity |
| `client_ip` | `src` | Source IP |
| `action_id` | `action` | Operation type |
| `object_name` | `object` | Resource accessed |
| `event_time` | `_time` | Event timestamp |
| `success` | `success` | Outcome |
| `response_code` | `result_code` | Error code |

**Dashboards** (create in Splunk):

```xml
<!-- $SPLUNK_HOME/etc/apps/buzz_tutor_audit/local/data/ui/views/gdpr_compliance.xml -->
<dashboard>
  <label>GDPR Compliance - Buzz Tutor</label>
  <row>
    <panel>
      <title>PII Access by User (Last 24h)</title>
      <table>
        <search>
          <query>index=aws_buzz_tutor_audit compliance_scope="GDPR_PII"
| stats count by user, table
| where count > 10
| sort -count</query>
          <earliest>-24h</earliest>
          <latest>now</latest>
        </search>
      </table>
    </panel>
  </row>
  <row>
    <panel>
      <title>Data Subject Access Pattern</title>
      <chart>
        <search>
          <query>index=aws_buzz_tutor_audit compliance_scope="GDPR_PII"
| timechart count by table</query>
          <earliest>-7d</earliest>
          <latest>now</latest>
        </search>
      </chart>
    </panel>
  </row>
</dashboard>
```

### Alternative SIEM Configuration

**If using Sumo Logic instead of Splunk**:

```terraform
# In siem_integration.tf - Alternative configuration

resource "aws_lambda_function" "sumologic_forwarder" {
  filename         = "sumologic_forwarder_lambda.zip"
  function_name    = "buzz-tutor-audit-to-sumologic"
  handler          = "index.handler"
  runtime          = "python3.11"
  timeout          = 60
  
  environment {
    variables = {
      SUMOLOGIC_HTTP_SOURCE = var.sumologic_http_source
      ENVIRONMENT           = each.key
    }
  }
}

resource "aws_cloudwatch_log_subscription_filter" "sql_audit_to_sumologic" {
  name            = "buzz-tutor-sql-audit-to-sumologic-${each.key}"
  log_group_name  = aws_cloudwatch_log_group.sql_server_audit[each.key].name
  filter_pattern  = "[event_time, server_principal_name, object_name]"
  destination_arn = aws_lambda_function.sumologic_forwarder[each.key].arn
}
```

---

## 🆘 Emergency Procedures

### Procedure 1: Suspected Data Breach

**Trigger**: Bulk data export alert, unauthorized access spike, or manual detection

**Immediate Actions** (< 5 minutes):

```bash
#!/bin/bash
# emergency_data_breach_response.sh

set -e

echo "[$(date)] DATA BREACH DETECTED - Initiating emergency response"

# 1. PRESERVE EVIDENCE (do this FIRST)
echo "1. Creating forensic snapshot..."
sqlcmd -S $RDS_ENDPOINT -d buzz_tutor \
  -Q "SELECT * INTO dbo.AuditForensics_$(date +%Y%m%d_%H%M%S) 
      FROM sys.fn_get_audit_file('D:\\rdsdbdata\\SQLServer\\Audit\\*\\*.sqlaudit', DEFAULT, DEFAULT)
      WHERE event_time >= DATEADD(hour, -4, GETUTCDATE())"

# 2. IDENTIFY SCOPE
echo "2. Identifying breach scope..."
sqlcmd -S $RDS_ENDPOINT -d buzz_tutor \
  -Q "EXEC dbo.GetGDPRComplianceReport @DaysBack = 1" \
  -o "/forensics/breach_scope_$(date +%Y%m%d_%H%M%S).csv"

# 3. CONTAINMENT (revoke suspicious access)
echo "3. Containing breach..."
# Query for suspicious users
SUSPICIOUS_USERS=$(sqlcmd -S $RDS_ENDPOINT -d buzz_tutor -h -1 \
  -Q "SELECT DISTINCT server_principal_name 
      FROM sys.fn_get_audit_file('D:\\rdsdbdata\\SQLServer\\Audit\\*\\*.sqlaudit', DEFAULT, DEFAULT)
      WHERE event_time >= DATEADD(minute, -30, GETUTCDATE())
        AND success = 1
        AND affected_rows > 1000")

for user in $SUSPICIOUS_USERS; do
  if [[ "$user" != "sqladmin" && "$user" != "rdsa" ]]; then
    echo "Revoking access for: $user"
    sqlcmd -S $RDS_ENDPOINT -d buzz_tutor \
      -Q "ALTER ROLE db_datareader DROP MEMBER [$user]"
  fi
done

# 4. NOTIFY STAKEHOLDERS
echo "4. Notifying incident response team..."
aws sns publish \
  --topic-arn $SECURITY_INCIDENT_TOPIC \
  --subject "URGENT: Data Breach Detected - $(date)" \
  --message "Breach detected and contained. Forensic data preserved. 
             Scope file: /forensics/breach_scope_$(date +%Y%m%d_%H%M%S).csv
             Next: Full incident response protocol initiated."

# 5. ENGAGE INCIDENT RESPONSE
echo "5. Creating incident ticket..."
# Create PagerDuty incident
curl -X POST https://events.pagerduty.com/v2/enqueue \
  -H "Content-Type: application/json" \
  -d @<(jq -n \
    --arg id "$(uuidgen)" \
    --arg summary "Data Breach - Buzz Tutor Production" \
    --arg severity "critical" \
    '{
      "routing_key": "'$PAGERDUTY_ROUTING_KEY'",
      "event_action": "trigger",
      "dedup_key": $id,
      "payload": {
        "summary": $summary,
        "severity": $severity,
        "source": "SQL Server Audit",
        "component": "RDS SQL Server",
        "custom_details": {
          "breach_time": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
          "affected_systems": "Users, UserProfiles, Payments"
        }
      }
    }')

echo "[$(date)] Emergency response complete. Forensic data preserved."
echo "Next steps:"
echo "- Review /forensics/breach_scope_*.csv"
echo "- Run full incident response playbook"
echo "- Notify CISO, Legal, Compliance within 1 hour"
echo "- Prepare customer notification if PII affected (GDPR 72h)"
```

**GDPR 72-Hour Notification**:
- **Timeline**: Notify supervisory authority within 72 hours of discovery
- **Contents**: Nature of breach, categories of data, approximate subjects, consequences, remediation
- **Recipients**: Data protection authority, affected data subjects (if high risk)

### Procedure 2: Audit Log Tampering Suspected

**Trigger**: Missing audit logs, gaps in sequence, unexpected deletions

**Actions**:

```bash
#!/bin/bash
# audit_tampering_investigation.sh

echo "[$(date)] Investigating potential audit log tampering"

# 1. Verify S3 backup integrity (tamper-proof copy)
echo "1. Checking S3 backup integrity..."
aws s3api list-object-versions \
  --bucket buzz-tutor-audit-backup-production-{account} \
  --prefix failed-splunk/ \
  --query 'Versions[?IsLatest==true].[Key, Size, LastModified]' \
  --output table

# 2. Check CloudWatch log integrity
LOG_START=$(($(date -u +%s) - 86400))000
LOG_END=$(date -u +%s)000

aws logs describe-log-streams \
  --log-group-name "/aws/rds/instance/buzz-tutor-sql-server-tls-production/audit" \
  --order-by LastEventTime \
  --descending \
  --query 'logStreams[0:5]'

# Check for deletion markers (tampering indicator)
aws logs describe-log-streams \
  --log-group-name "/aws/rds/instance/buzz-tutor-sql-server-tls-production/audit" \
  --query 'logStreams[?storedBytes==0]'
# Should be empty - zero byte streams may indicate tampering

# 3. Verify SQL Server audit status
echo "3. Checking SQL Server audit integrity..."
sqlcmd -S $RDS_ENDPOINT -d master \
  -Q "SELECT 
        audit_id,
        name,
        is_state_enabled,
        type_desc,
        create_date,
        modify_date
      FROM sys.server_audits
      WHERE name = 'BuzzTutorSensitiveDataAccess'"

# Check for unexpected modifications
sqlcmd -S $RDS_ENDPOINT -d master \
  -Q "SELECT 
        database_specification_id,
        name,
        is_state_enabled,
        create_date,
        modify_date,
        audit_name
      FROM sys.database_audit_specifications
      WHERE name IN ('GDPR_PII_Access', 'PCI_CardholderData', 'HighRiskOperations')
        AND modify_date > DATEADD(day, -1, GETUTCDATE())"

# 4. Validate archive checksums
echo "4. Validating archive integrity..."
sqlcmd -S $RDS_ENDPOINT -d buzz_tutor \
  -Q "SELECT 
        ArchiveId,
        ArchiveDate,
        ComplianceScope,
        RecordCount,
        Checksum,
        LastModified
      FROM dbo.AuditArchive
      WHERE RetentionEndDate > GETUTCDATE()
        AND LastModified > DATEADD(day, -7, GETUTCDATE())
      ORDER BY LastModified DESC"

# Calculate checksum for verification
# (For production, implement checksum generation in ArchiveOldAuditLogs proc)

# 5. Escalate if tampering confirmed
TAMPERING_EVIDENCE=$(sqlcmd -S $RDS_ENDPOINT -d master -h -1 \
  -Q "SELECT COUNT(*) 
      FROM sys.dm_audit_actions 
      WHERE action_id = 'ALDB' 
        AND event_time > DATEADD(hour, -24, GETUTCDATE())")

if [[ "$TAMPERING_EVIDENCE" -gt 0 ]]; then
  echo "POTENTIAL TAMPERING DETECTED: Audit disabled recently"
  
  aws sns publish \
    --topic-arn  arn:aws:sns:us-east-1:{account}:security-incidents  \
    --subject "CRITICAL: Audit Log Tampering Detected" \
    --message "Potential audit log tampering detected. 
               Investigate S3 backup for tamper-proof evidence. 
               Engage forensics firm immediately."
  
  # Preserve immutable backups
  aws s3 cp s3://buzz-tutor-audit-backup-production-{account}/ \
    s3://buzz-tutor-forensics-preserved/preserved-$(date +%Y-%m-%d)/ \
    --recursive \
    --storage-class GLACIER
    
  echo "Backups preserved to tamper-proof Glacier storage"
fi

echo "Tampering investigation complete"
```

**Prevention**:
- Multi-factor authentication for all RDS access
- Least privilege: Only security team can modify audit specs
- Separation of duties: Developers cannot delete audit logs
- S3 versioning + MFA delete on backup bucket
- CloudWatch Logs retention lock (compliance mode)

### Procedure 3: Table-Top Exercise (Quarterly)

**Scenario**: Simulated data breach during peak hours

**Participants**: Security team, compliance officer, DPO, on-call engineer

**Exercise Steps**:

1. **Preparation** (1 week before):
```bash
# Create test data in staging
sqlcmd -S $STAGING_RDS -d buzz_tutor_staging \
  -Q "INSERT INTO Users (UserId, Email, PII_Data) 
      VALUES 
      ('TEST_USER_001', 'test1@example.com', 'Simulated PII for drill'),
      ('TEST_USER_002', 'test2@example.com', 'Simulated PII for drill')"
```

2. **Simulate breach** (during exercise):
```sql
-- Unauthorized access by simulated attacker
-- This should trigger alarms
SELECT * FROM Users WHERE Email LIKE '%test%';
SELECT * FROM Payments WHERE Amount > 1000;
```

3. **Detect and respond** (team actions):
- Monitor CloudWatch alarms
- Review Splunk alerts
- Execute emergency response playbook
- Document actions and timing

4. **Post-exercise review**:
```bash
# Generate after-action report
sqlcmd -S $RDS_ENDPOINT -d buzz_tutor \
  -Q "EXEC dbo.GetGDPRComplianceReport @DaysBack = 1" \
  -o table_top_exercise_results.txt

# Review questions:
# - How quickly were alerts triggered? (< 1 minute target)
# - Were all stakeholders notified? (CISO, DPO, Legal)
# - Did team follow runbook correctly?
# - What gaps were identified?
# - How can we improve?
```

---

## 📞 Contacts & Escalation

### Primary Contacts

| Role | Name | Email | Slack | PagerDuty | Responsibility |
|------|------|-------|-------|-----------|----------------|
| Security Lead | [To Be Assigned] | security-lead@buzztutor.com | @security-lead | PD-SEC-001 | Incident commander |
| Compliance Officer | [To Be Assigned] | compliance@buzztutor.com | @compliance | PD-COM-001 | Regulatory liaison |
| DPO (GDPR) | [To Be Assigned] | dpo@buzztutor.com | @dpo | - | Privacy officer |
| On-Call Engineer | Rotation | oncall@buzztutor.com | @oncall | Auto | First responder |
| DBA Team | DBA Rotation | dba-team@buzztutor.com | @dba-team | - | Audit system health |

### Escalation Matrix

**Level 1** - Detection (0-5 min):
- **Trigger**: CloudWatch alarm, Splunk alert, manual detection
- **Action**: On-call engineer investigates
- **Tools**: Audit logs, CloudWatch dashboard, Splunk queries
- **Decision**: False positive or escalate to Level 2

**Level 2** - Investigation (5-30 min):
- **Trigger**: Confirmed suspicious activity
- **Action**: Security Lead engaged, forensic snapshot created
- **Tools**: Emergency response playbook, incident ticket
- **Decision**: Contained or escalate to Level 3

**Level 3** - Confirmed Breach (30-60 min):
- **Trigger**: Unauthorized access confirmed, data exfiltration detected
- **Action**: CISO, Legal, DPO notified; customer impact assessment
- **Tools**: Forensics, legal counsel, breach notification templates
- **Decision**: Notify supervisory authority within 72h (GDPR)

**Level 4** - Executive Escalation (1-4 hours):
- **Trigger**: Material breach, customer PII affected, media attention
- **Action**: Executive team, board notification, customer communication
- **Tools**: Crisis communication plan, insurance claim, legal team
- **Outcome**: Full incident response, regulatory reporting, remediation

### External Contacts

**For Severe Incidents**:
- **AWS Enterprise Support**: 1-800-555-0000 (24x7)
- **Splunk TAM**: your-tam@splunk.com
- **Legal Counsel**: [External data breach law firm]
- **Forensics Firm**: [Retained for breach investigation]
- **GDPR Supervisory Authority**: [Contact info for your jurisdiction]
- **PCI DSS QSA**: [Qualified Security Assessor]
- **Cyber Insurance**: [Claims hotline]

---

## 🔄 Maintenance Schedule

### Daily (Automated)

| Task | Time | Tool | Owner | On Failure |
|------|------|------|-------|------------|
| Summarize audit logs | 1:00 AM UTC | EventBridge → `EXEC dbo.SummarizeAuditLogs` | Automated | Alert DBA team |
| Monitor alert health | Continuous | CloudWatch alarms | Automated | Page on-call |
| Splunk health check | Every 5 min | Splunk monitoring | Automated | Email Splunk admin |

### Weekly (Automated)

| Task | Time | Tool | Owner | On Failure |
|------|------|------|-------|------------|
| Index maintenance | 2:00 AM Sunday | SQL Agent Job | Automated | Alert DBA |
| Statistics update | 3:00 AM Sunday | `EXEC dbo.InitializeAuditOptimization` | Automated | Alert DBA |
| Health verification | 4:00 AM Sunday | `EXEC dbo.VerifyAuditHealth` | Automated | Alert DBA |
| CloudWatch dashboard review | Monday 9 AM | Security Lead | Manual | N/A |

### Monthly (Automated)

| Task | Time | Tool | Owner | On Failure |
|------|------|------|-------|------------|
| Archive old logs | 1st, 2:00 AM | `EXEC dbo.ArchiveOldAuditLogs` | Automated | Alert DBA |
| Compliance reports | 1st, 9:00 AM | Generate GDPR & PCI reports | Automated | Alert Compliance |
| Cost estimation | 1st, 10:00 AM | `EXEC dbo.EstimateAuditStorage` | Automated | Alert Finance |
| SIEM rule review | 1st | Security Lead | Manual | N/A |

### Quarterly (Manual)

- **Index rebuild**: Full rebuild of all audit table indexes
- **Performance review**: Analyze query patterns, optimize slow queries
- **Compliance review**: Internal audit of audit system
- **Table-top exercise**: Simulate data breach, test response
- **Cost optimization**: Review CloudWatch/Splunk costs, adjust retention
- **Access review**: Verify least-privilege access to audit systems

### Annually (Manual)

- **Legal review**: Retention policies with Legal/Compliance teams
- **Regulatory updates**: Update for new GDPR/PCI DSS requirements
- **Technology refresh**: Evaluate new audit tools and SIEM features
- **Budget planning**: Forecast costs for next year
- **Vendor assessment**: Review Splunk, AWS partnerships
- **Audit the auditor**: Third-party assessment of audit controls

---

**Document maintained by**: Security Team  
**Next review date**: 2024-04-06 (Quarterly review)  
**Last drill/exercise**: [Schedule quarterly]  
**Document classification**: Internal Use  

**For questions or updates**: security-lead@buzztutor.com
