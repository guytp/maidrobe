# Performance Testing Guide

## Automated Performance Testing for Encryption and Audit

**Version**: 1.0
**Last Updated**: 2024-01-06
**Status**: Production Ready

---

## 📋 Overview

This script performs comprehensive performance testing to measure the impact of Always Encrypted and SQL Server Audit on query execution performance, ensuring we remain within the 5% CPU and 100ms per-query latency budgets.

---

## 🎯 Performance Budgets

The following budgets are configured:

| Metric | Budget | Rationale |
|--------|--------|-----------|
| **CPU Impact** | < 5% increase | Minimal server load increase |
| **Latency Impact** | < 10% increase | < 100ms per query |
| **Logical Reads** | < 10% increase | Minimal I/O overhead |
| **Memory Grant** | < 15% increase | Acceptable memory overhead |

Assumptions:
- Baseline query latency: ~50ms average
- Baseline CPU time: ~25ms per query
- With 10% budget: 55ms latency (well under 100ms budget)

---

## 🚀 Quick Start

### Prerequisites

1. **AWS CLI** configured with appropriate credentials
2. **sqlcmd** installed (SQL Server command-line tool)
3. **bc** calculator installed (for percentage calculations)
4. Access to RDS SQL Server instance
5. SNS topic configured for alerts (optional)

### Running the Test

```bash
# Set required environment variables
export ENVIRONMENT=staging
export SQL_USERNAME=sqladmin
export SQL_PASSWORD=your_password
export AWS_REGION=us-east-1

# Run with defaults (100 executions per test)
./scripts/performance_test.sh

# Run with custom sample size
export SAMPLE_SIZE=500
./scripts/performance_test.sh

# Run against specific RDS endpoint
export RDS_ENDPOINT="your-rds-instance.rds.amazonaws.com"
./scripts/performance_test.sh
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ENVIRONMENT` | Target environment (staging/production) | staging |
| `SAMPLE_SIZE` | Number of query executions per test | 100 |
| `RDS_ENDPOINT` | RDS instance endpoint (auto-detected if not set) | - |
| `SQL_USERNAME` | SQL Server username | sqladmin |
| `SQL_PASSWORD` | SQL Server password | - |
| `SNS_ALERT_TOPIC` | SNS topic for alerts | buzz-tutor-alerts |
| `AWS_REGION` | AWS region | us-east-1 |
| `S3_BUCKET` | S3 bucket for result storage | buzz-tutor-performance-metrics |

---

## 📊 Test Phases

The script executes 4 test phases:

### Phase 1: Baseline (No Security Features)
**Purpose**: Establish baseline performance without encryption or audit

**Queries Tested**:
- `QueryUsers_Baseline`: SELECT from Users table
- `QueryPayments_Baseline`: SELECT from Payments table

**Feature Flags**:
- Always Encrypted: Disabled
- TDE: Disabled (for test purposes)
- SQL Audit: Disabled

**Expected Outcome**:
- Baseline metrics for duration, CPU, reads, and memory
- Baseline for calculating impact percentages

### Phase 2: Encryption Only
**Purpose**: Measure Always Encrypted + TDE impact

**Feature Flags**:
- Always Encrypted: Enabled (column-level)
- TDE: Enabled (transparent)
- SQL Audit: Disabled

**Expected Outcome**:
- Latency increase: 5-15% (column decryption overhead)
- CPU increase: 3-8% (encryption operations)
- Reads impact: Minimal (same query plan)

### Phase 3: Audit Only
**Purpose**: Measure SQL Server Audit impact

**Feature Flags**:
- Always Encrypted: Disabled
- TDE: Disabled (for test purposes)
- SQL Audit: Enabled (GDPR + PCI specs)

**Expected Outcome**:
- Latency increase: 2-5% (async audit write)
- CPU increase: 1-3% (audit serialization)
- Queue delay: Minimal (< 100ms average)

### Phase 4: Combined (Encryption + Audit)
**Purpose**: Measure combined feature impact

**Feature Flags**:
- Always Encrypted: Enabled
- TDE: Enabled
- SQL Audit: Enabled

**Expected Outcome**:
- Latency increase: 8-20% (additive impact)
- CPU increase: 5-15% (additive impact)
- Should stay within combined budget

---

## 📈 Test Results

### Output Files

Test results are stored in `/tmp/buzz-tutor-performance-YYYYMMDD_HHMMSS/`:

```
/tmp/buzz-tutor-performance-20240106_143022/
├── baseline_users.csv
├── baseline_payments.csv
├── encryption_users.csv
├── encryption_payments.csv
├── audit_users.csv
├── audit_payments.csv
├── combined_users.csv
├── combined_payments.csv
└── performance_report_20240106_143022.txt
```

### Result Files

**CSV Files**: Contain detailed test results
- Baseline metrics
- Test metrics  
- Impact percentages
- Budget compliance status

**Report File**: Consolidated report with:
- Overall compliance summary
- Test-by-test breakdown
- Worst/best performers
- Recommendations

### Example Report

```
=====================================================
Buzz Tutor Performance Test Report
Environment: staging
Date: 2024-01-06 14:30:22
Sample Size: 100 executions per test
=====================================================

Metric Impacts:
  CPU Impact: 3.2% (Budget: 5.0%)
  Latency Impact: 7.1% (Budget: 10.0%)
  Compliance Rate: 94.5%

Status: ✅ PERFORMANCE WITHIN BUDGET
All metrics within acceptable thresholds.

Failing Tests:
  - QueryPayments_Combined (CPU: 6.3%, Latency: 12.1%)

Recommendation: Review payment query optimization.
```

---

## 🚨 Alerting

### SNS Alert Triggers

Alerts are sent when:
1. **CPU Budget Exceeded**: Average CPU impact > 5%
2. **Latency Budget Exceeded**: Average latency impact > 10%
3. **Individual Test Failure**: Any test exceeds all budgets

**Alert Contains**:
- Environment (staging/production)
- CPU and latency impact percentages
- Compliance rate
- S3 location of detailed results
- Recommendation for investigation

### Example Alert

```
Subject: PERFORMANCE BUDGET EXCEEDED - staging

Performance test results exceed budget:
CPU: 6.3% (budget: 5.0%)
Latency: 12.1% (budget: 10.0%)
Compliance: 85.5%

Recommendation: Review QueryPayments_Combined optimization.
Results: s3://buzz-tutor-performance-metrics/staging/performance_20240106_143022/
```

---

## 📊 CloudWatch Metrics

The script automatically emits metrics to CloudWatch:

**Namespace**: `BuzzTutor/PerformanceTesting`

**Metrics**:
- `AverageCpuImpact` (Percent)
- `AverageLatencyImpact` (Percent)
- `PerformanceComplianceRate` (Percent)

**Dimensions**:
- `Environment`: staging/production
- `TestRun`: YYYYMMDD_HHMMSS

**Usage**:
- Track performance trends over time
- Compare across environments
- Set up dashboards for visualization

---

## 🔧 Troubleshooting

### Common Issues

**1. Connection Failure**
```
Error: Cannot connect to RDS instance

Solution:
- Verify RDS endpoint is correct
- Check security group rules (port 1433)
- Validate SQL credentials
- Ensure RDS instance is running
```

**2. SQL Permissions Error**
```
Error: Permission denied to alter audit specifications

Solution:
- Use admin credentials (sqladmin)
- Verify user has ALTER ANY DATABASE AUDIT permission
- Check if audit is already enabled/disabled
```

**3. AWS CLI Not Found**
```
Error: aws: command not found

Solution:
- Install AWS CLI: pip install awscli
- Configure with aws configure
- Set AWS_REGION environment variable
```

**4. Budget Exceeded** (intentional)
```
Status: ⚠️  PERFORMANCE BUDGET EXCEEDED

Next Steps:
1. Review failing tests in generated report
2. Identify queries with highest impact
3. Consider query optimization
4. Review encryption column usage
5. Consider audit specification tuning
```

---

## 🎯 Continuous Integration

### GitHub Actions Integration

```yaml
name: Performance Testing

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  performance-test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      
      - name: Run Performance Test
        env:
          ENVIRONMENT: staging
          SQL_USERNAME: ${{ secrets.SQL_USERNAME }}
          SQL_PASSWORD: ${{ secrets.SQL_PASSWORD }}
          SAMPLE_SIZE: 200
        run: ./scripts/performance_test.sh
      
      - name: Upload Results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: performance-results
          path: /tmp/buzz-tutor-performance-*/
```

---

## 📚 Related Documentation

- **Step 7 Analysis**: `STEP_7_PERFORMANCE_ANALYSIS.md`
- **Performance Runbook**: `docs/runbooks/performance_monitoring.md`
- **Database Migrations**: `database/migrations/012_*.sql`, `013_*.sql`

---

## 📞 Support

For issues or questions:
1. Check troubleshooting section above
2. Review generated report in `/tmp/buzz-tutor-performance-*/`
3. Contact: devops-team@buzztutor.com

---

**Document Version**: 1.0  
**Last Updated**: 2024-01-06  
**Maintained By**: DevOps Team
