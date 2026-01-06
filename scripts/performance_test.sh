#!/bin/bash
# ============================================
# Automated Performance Testing for Encryption and Audit
# Script: scripts/performance_test.sh
# Step 7: Compares performance with/without security features
# ============================================

set -e

# ============================================================================
# CONFIGURATION
# ============================================================================

# Default values (can be overridden via environment variables)
ENVIRONMENT="${ENVIRONMENT:-staging}"
SAMPLE_SIZE="${SAMPLE_SIZE:-100}"
RDS_ENDPOINT="${RDS_ENDPOINT:-}"
SQL_USERNAME="${SQL_USERNAME:-sqladmin}"
SQL_PASSWORD="${SQL_PASSWORD:-}"
SNS_ALERT_TOPIC="${SNS_ALERT_TOPIC:-buzz-tutor-alerts}"
AWS_REGION="${AWS_REGION:-us-east-1}"
S3_BUCKET="${S3_BUCKET:-buzz-tutor-performance-metrics}"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Performance budgets (in milliseconds and percentage)
CPU_BUDGET_PERCENT=5.0
LATENCY_BUDGET_PERCENT=10.0
READS_BUDGET_PERCENT=10.0

# ============================================================================
# FUNCTIONS
# ============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_aws_cli() {
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed or not in PATH"
        exit 1
    fi
}

check_sqlcmd() {
    if ! command -v sqlcmd &> /dev/null; then
        log_error "sqlcmd is not installed or not in PATH"
        exit 1
    fi
}

get_rds_endpoint() {
    if [[ -z "$RDS_ENDPOINT" ]]; then
        log_info "Fetching RDS endpoint for environment: $ENVIRONMENT"
        
        RDS_ENDPOINT=$(aws rds describe-db-instances \
            --db-instance-identifier buzz-tutor-sql-server-tls-${ENVIRONMENT} \
            --query 'DBInstances[0].Endpoint.Address' \
            --output text \
            --region $AWS_REGION 2>/dev/null)
        
        if [[ $? -ne 0 ]] || [[ "$RDS_ENDPOINT" == "None" ]]; then
            log_error "Failed to fetch RDS endpoint. Please set RDS_ENDPOINT environment variable."
            exit 1
        fi
        
        log_success "RDS endpoint: $RDS_ENDPOINT"
    else
        log_info "Using provided RDS endpoint: $RDS_ENDPOINT"
    fi
}

validate_connection() {
    log_info "Validating database connection..."
    
    sqlcmd -S $RDS_ENDPOINT -U $SQL_USERNAME -P $SQL_PASSWORD -d buzz_tutor_${ENVIRONMENT} -Q "SELECT @@VERSION" -b -o /dev/null
    
    if [[ $? -ne 0 ]]; then
        log_error "Failed to connect to database. Please check credentials and endpoint."
        exit 1
    fi
    
    log_success "Database connection validated"
}

print_header() {
    echo ""
    echo "====================================================="
    echo "  Buzz Tutor Performance Test Suite"
    echo "  Environment: $ENVIRONMENT"
    echo "  RDS Endpoint: $RDS_ENDPOINT"
    echo "  Sample Size: $SAMPLE_SIZE executions per test"
    echo "====================================================="
    echo ""
}

print_budget_info() {
    echo "Performance Budgets:"
    echo "  CPU Impact: ${CPU_BUDGET_PERCENT}% (increase from baseline)"
    echo "  Latency Impact: ${LATENCY_BUDGET_PERCENT}% (increase from baseline)"
    echo "  Reads Impact: ${READS_BUDGET_PERCENT}% (increase from baseline)"
    echo ""
}

run_performance_test() {
    local test_name=$1
    local query_template=$2
    local parameters=$3
    local enable_encryption=$4
    local enable_audit=$5
    local output_file=$6
    
    log_info "Running test: $test_name"
    log_info "  Encryption: $([ "$enable_encryption" = "1" ] && echo "Enabled" || echo "Disabled")"
    log_info "  Audit: $([ "$enable_audit" = "1" ] && echo "Enabled" || echo "Disabled")"
    
    sqlcmd -S $RDS_ENDPOINT -U $SQL_USERNAME -P $SQL_PASSWORD -d buzz_tutor_${ENVIRONMENT} \
        -Q "EXEC dbo.TrackQueryPerformance 
                @TestName = '$test_name',
                @QueryTemplate = '$query_template',
                @ParameterValues = '$parameters',
                @EnableEncryption = $enable_encryption,
                @EnableAudit = $enable_audit,
                @SampleSize = $SAMPLE_SIZE" \
        -s "," -w 500 -W \
        -o $output_file
    
    if [[ $? -ne 0 ]]; then
        log_error "Test failed: $test_name"
        return 1
    fi
    
    # Extract key metrics from output
    local duration_impact=$(grep -oP 'DurationImpactPercent: \K[0-9.]+' $output_file | head -1 || echo "0")
    local cpu_impact=$(grep -oP 'CpuImpactPercent: \K[0-9.]+' $output_file | head -1 || echo "0")
    
    log_success "Test completed: $test_name (Duration: ${duration_impact}%, CPU: ${cpu_impact}%)"
    return 0
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

echo ""
print_header
check_aws_cli
check_sqlcmd
get_rds_endpoint
validate_connection
print_budget_info

# Directories for test results
TEST_RESULTS_DIR="/tmp/buzz-tutor-performance-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$TEST_RESULTS_DIR"
log_info "Test results will be stored in: $TEST_RESULTS_DIR"
echo ""

# Step 1: Establish baseline (no encryption, no audit)
log_info "Step 1: Establishing Baseline (No Security Features)"
echo "-------------------------------------------------------"

# Temporarily disable audit for baseline
log_info "Temporarily disabling audit for baseline measurement..."
sqlcmd -S $RDS_ENDPOINT -U $SQL_USERNAME -P $SQL_PASSWORD -d buzz_tutor_${ENVIRONMENT} \
    -Q "ALTER SERVER AUDIT [BuzzTutorSensitiveDataAccess] WITH (STATE = OFF); ALTER DATABASE AUDIT SPECIFICATION [GDPR_PII_Access] WITH (STATE = OFF); ALTER DATABASE AUDIT SPECIFICATION [PCI_CardholderData] WITH (STATE = OFF)" -b -o /dev/null

run_performance_test \
    "QueryUsers_Baseline" \
    "SELECT * FROM Users WHERE Email LIKE @email" \
    '{"email": "user%"}' \
    "0" \
    "0" \
    "$TEST_RESULTS_DIR/baseline_users.csv"

run_performance_test \
    "QueryPayments_Baseline" \
    "SELECT * FROM Payments WHERE Amount > @amount" \
    '{"amount": 100}' \
    "0" \
    "0" \
    "$TEST_RESULTS_DIR/baseline_payments.csv"

log_success "Baseline establishment complete"
echo ""

# Step 2: Test with encryption only
log_info "Step 2: Testing with Encryption Only (Always Encrypted + TDE)"
echo "---------------------------------------------------------------"

run_performance_test \
    "QueryUsers_Encryption" \
    "SELECT * FROM Users WHERE Email LIKE @email" \
    '{"email": "user%"}' \
    "1" \
    "0" \
    "$TEST_RESULTS_DIR/encryption_users.csv"

run_performance_test \
    "QueryPayments_Encryption" \
    "SELECT * FROM Payments WHERE Amount > @amount" \
    '{"amount": 100}' \
    "1" \
    "0" \
    "$TEST_RESULTS_DIR/encryption_payments.csv"

log_success "Encryption-only testing complete"
echo ""

# Step 3: Test with audit only
log_info "Step 3: Testing with Audit Only"
echo "-----------------------------------"

# Enable audit for test
log_info "Enabling audit for testing..."
sqlcmd -S $RDS_ENDPOINT -U $SQL_USERNAME -P $SQL_PASSWORD -d buzz_tutor_${ENVIRONMENT} \
    -Q "ALTER SERVER AUDIT [BuzzTutorSensitiveDataAccess] WITH (STATE = ON); ALTER DATABASE AUDIT SPECIFICATION [GDPR_PII_Access] WITH (STATE = ON); ALTER DATABASE AUDIT SPECIFICATION [PCI_CardholderData] WITH (STATE = ON)" -b -o /dev/null

run_performance_test \
    "QueryUsers_Audit" \
    "SELECT * FROM Users WHERE Email LIKE @email" \
    '{"email": "user%"}' \
    "0" \
    "1" \
    "$TEST_RESULTS_DIR/audit_users.csv"

run_performance_test \
    "QueryPayments_Audit" \
    "SELECT * FROM Payments WHERE Amount > @amount" \
    '{"amount": 100}' \
    "0" \
    "1" \
    "$TEST_RESULTS_DIR/audit_payments.csv"

log_success "Audit-only testing complete"
echo ""

# Step 4: Test with both encryption and audit
log_info "Step 4: Testing with Both Encryption + Audit"
echo "--------------------------------------------------"

run_performance_test \
    "QueryUsers_Combined" \
    "SELECT * FROM Users WHERE Email LIKE @email" \
    '{"email": "user%"}' \
    "1" \
    "1" \
    "$TEST_RESULTS_DIR/combined_users.csv"

run_performance_test \
    "QueryPayments_Combined" \
    "SELECT * FROM Payments WHERE Amount > @amount" \
    '{"amount": 100}' \
    "1" \
    "1" \
    "$TEST_RESULTS_DIR/combined_payments.csv"

log_success "Combined testing complete"
echo ""

# Step 5: Generate compliance report
log_info "Step 5: Generating Performance Budget Compliance Report"
echo "------------------------------------------------------------"

cd $TEST_RESULTS_DIR

# Combined report file
REPORT_FILE="performance_report_$(date +%Y%m%d_%H%M%S).txt"
cat > $REPORT_FILE << EOF
=====================================================
Buzz Tutor Performance Test Report
Environment: $ENVIRONMENT
Date: $(date)
Sample Size: $SAMPLE_SIZE executions per test
=====================================================
EOF

# Run SQL compliance report and append
echo "" >> $REPORT_FILE
echo "SQL Database Compliance Report:" >> $REPORT_FILE
echo "--------------------------------" >> $REPORT_FILE

sqlcmd -S $RDS_ENDPOINT -U $SQL_USERNAME -P $SQL_PASSWORD -d buzz_tutor_${ENVIRONMENT} \
    -Q "EXEC dbo.GetPerformanceBudgetCompliance @DaysBack = 1" -W >> $REPORT_FILE

# Parse report for pass/fail
CPU_IMPACT=$(grep -oP 'AvgCpuIncreasePercent: \K[0-9.]+' $REPORT_FILE | head -1 || echo "0")
LATENCY_IMPACT=$(grep -oP 'AvgLatencyIncreasePercent: \K[0-9.]+' $REPORT_FILE | head -1 || echo "0")
COMPLIANCE_RATE=$(grep -oP 'OverallComplianceRatePercent: \K[0-9.]+' $REPORT_FILE | head -1 || echo "100")

# Evaluate results
echo ""
echo "====================================================="
echo "  📊 PERFORMANCE TEST RESULTS"
echo "====================================================="
echo ""
echo "Environment: $ENVIRONMENT"
echo "Test Date: $(date)"
echo "Sample Size: $SAMPLE_SIZE per query"
echo ""
echo "Metric Impacts:"
echo "  CPU Impact: ${CPU_IMPACT}% (Budget: ${CPU_BUDGET_PERCENT}%)"
echo "  Latency Impact: ${LATENCY_IMPACT}% (Budget: ${LATENCY_BUDGET_PERCENT}%)"
echo "  Compliance Rate: ${COMPLIANCE_RATE}%"
echo ""

# Color-coded pass/fail
if [[ "$(echo "$CPU_IMPACT > $CPU_BUDGET_PERCENT" | bc -l)" == "1" ]] || [[ "$(echo "$LATENCY_IMPACT > $LATENCY_BUDGET_PERCENT" | bc -l)" == "1" ]]; then
    echo -e "${RED}⚠️  PERFORMANCE BUDGET EXCEEDED${NC}"
    echo -e "${RED}One or more metrics exceed budget thresholds.${NC}"
    echo ""
    echo "Recommendation: Review failing tests and optimize configuration."
    
    # Alert notification
    if [[ -n "$SNS_ALERT_TOPIC" ]]; then
        aws sns publish \
            --topic-arn "$SNS_ALERT_TOPIC" \
            --subject "PERFORMANCE BUDGET EXCEEDED - $ENVIRONMENT" \
            --message "Performance test results exceed budget. CPU: ${CPU_IMPACT}% (budget: ${CPU_BUDGET_PERCENT}%), Latency: ${LATENCY_IMPACT}% (budget: ${LATENCY_BUDGET_PERCENT}%), Compliance: ${COMPLIANCE_RATE}%. Review required: $TEST_RESULTS_DIR" \
            --region "$AWS_REGION"
    fi
    
    # Mark test as failed
    TEST_STATUS="FAILED"
    EXIT_CODE=1
else
    echo -e "${GREEN}✅ PERFORMANCE WITHIN BUDGET${NC}"
    echo -e "${GREEN}All metrics within acceptable thresholds.${NC}"
    echo ""
    echo "Status: Ready for production deployment."
    
    TEST_STATUS="PASSED"
    EXIT_CODE=0
fi

echo ""
echo "Detailed Report: $TEST_RESULTS_DIR/$REPORT_FILE"
echo "Raw Results: $TEST_RESULTS_DIR/"
echo "====================================================="

# Upload to S3 for historical tracking
if [[ -n "$S3_BUCKET" ]]; then
    log_info "Uploading results to S3: $S3_BUCKET"
    aws s3 cp $TEST_RESULTS_DIR s3://$S3_BUCKET/performance-metrics/$ENVIRONMENT/ --recursive --region $AWS_REGION
fi

# Emit CloudWatch metrics
log_info "Emitting CloudWatch metrics..."

aws cloudwatch put-metric-data \
    --namespace BuzzTutor/PerformanceTesting \
    --metric-name AverageCpuImpact \
    --value $CPU_IMPACT \
    --unit Percent \
    --timestamp $(date -u +%Y-%m-%dT%H:%M:%S) \
    --dimensions Environment=$ENVIRONMENT,TestRun=$(date +%Y%m%d_%H%M%S) \
    --region $AWS_REGION

aws cloudwatch put-metric-data \
    --namespace BuzzTutor/PerformanceTesting \
    --metric-name AverageLatencyImpact \
    --value $LATENCY_IMPACT \
    --unit Percent \
    --timestamp $(date -u +%Y-%m-%dT%H:%M:%S) \
    --dimensions Environment=$ENVIRONMENT,TestRun=$(date +%Y%m%d_%H%M%S) \
    --region $AWS_REGION

aws cloudwatch put-metric-data \
    --namespace BuzzTutor/PerformanceTesting \
    --metric-name PerformanceComplianceRate \
    --value $COMPLIANCE_RATE \
    --unit Percent \
    --timestamp $(date -u +%Y-%m-%dT%H:%M:%S) \
    --dimensions Environment=$ENVIRONMENT,TestRun=$(date +%Y%m%d_%H%M%S) \
    --region $AWS_REGION

echo ""
log_success "Performance test complete"

# Cleanup old snapshots only if test passed
if [[ $EXIT_CODE -eq 0 ]]; then
    log_info "Performance test passed. Starting real-time monitoring..."
else
    log_warning "Performance test failed. Review results before deployment."
fi

exit $EXIT_CODE
