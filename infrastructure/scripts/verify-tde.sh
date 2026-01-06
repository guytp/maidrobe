#!/bin/bash
# ============================================
# Buzz A Tutor TDE Verification Script
# Validates encryption at rest configuration
# ============================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Script configuration
ENVIRONMENT="${1:-}"
if [[ -z "${ENVIRONMENT}" ]]; then
    echo "❌ Environment not specified"
    echo "Usage: ./verify-tde.sh <staging|production>"
    exit 1
fi

INSTANCE_IDENTIFIER="buzz-tutor-sql-server-${ENVIRONMENT}"
TERRAFORM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"

# Metrics
VERIFICATION_PASSED=0
VERIFICATION_FAILED=0

# Logging
log_success() {
    echo -e "${GREEN}✓${NC} $1"
    ((VERIFICATION_PASSED++))
}

log_error() {
    echo -e "${RED}✗${NC} $1"
    ((VERIFICATION_FAILED++))
}

log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Verification functions
check_rds_encryption() {
    log_info "Checking RDS instance encryption..."

    local storage_encrypted=$(aws rds describe-db-instances \
        --db-instance-identifier "${INSTANCE_IDENTIFIER}" \
        --query 'DBInstances[0].StorageEncrypted' \
        --output text \
        2>/dev/null || echo "ERROR")

    if [[ "${storage_encrypted}" == "True" ]]; then
        log_success "Storage encryption enabled"
    else
        log_error "Storage encryption NOT enabled"
        return 1
    fi

    local kms_key_id=$(aws rds describe-db-instances \
        --db-instance-identifier "${INSTANCE_IDENTIFIER}" \
        --query 'DBInstances[0].KmsKeyId' \
        --output text \
        2>/dev/null || echo "ERROR")

    if [[ "${kms_key_id}" != "ERROR" ]] && [[ -n "${kms_key_id}" ]]; then
        log_success "KMS key configured: $(basename "${kms_key_id}")"
    else
        log_error "KMS key NOT configured"
        return 1
    fi
}

check_backup_encryption() {
    log_info "Checking backup encryption..."

    local backup_encrypted=$(aws rds describe-db-snapshots \
        --db-instance-identifier "${INSTANCE_IDENTIFIER}" \
        --snapshot-type automated \
        --query 'DBSnapshots[0].Encrypted' \
        --output text \
        2>/dev/null || echo "None")

    if [[ "${backup_encrypted}" == "True" ]]; then
        log_success "Automated backups are encrypted"
    elif [[ "${backup_encrypted}" == "None" ]]; then
        log_warning "No automated backups found (yet)"
    else
        log_error "Automated backups are NOT encrypted"
        return 1
    fi
}

check_kms_key_rotation() {
    log_info "Checking KMS key rotation..."

    local kms_key_id=$(aws rds describe-db-instances \
        --db-instance-identifier "${INSTANCE_IDENTIFIER}" \
        --query 'DBInstances[0].KmsKeyId' \
        --output text \
        2>/dev/null || echo "")

    if [[ -z "${kms_key_id}" ]]; then
        log_error "Could not determine KMS key ID"
        return 1
    fi

    local key_rotation=$(aws kms get-key-rotation-status \
        --key-id "${kms_key_id}" \
        --query 'KeyRotationEnabled' \
        --output text \
        2>/dev/null || echo "ERROR")

    if [[ "${key_rotation}" == "True" ]]; then
        log_success "KMS key rotation enabled"
    else
        log_warning "KMS key rotation NOT enabled"
    fi
}

check_performance_insights_encryption() {
    log_info "Checking Performance Insights encryption..."

    local pi_enabled=$(aws rds describe-db-instances \
        --db-instance-identifier "${INSTANCE_IDENTIFIER}" \
        --query 'DBInstances[0].PerformanceInsightsEnabled' \
        --output text \
        2>/dev/null || echo "False")

    if [[ "${pi_enabled}" != "True" ]]; then
        log_warning "Performance Insights not enabled"
        return 0
    fi

    local pi_kms_key=$(aws rds describe-db-instances \
        --db-instance-identifier "${INSTANCE_IDENTIFIER}" \
        --query 'DBInstances[0].PerformanceInsightsKMSKeyId' \
        --output text \
        2>/dev/null || echo "")

    if [[ -n "${pi_kms_key}" ]]; then
        log_success "Performance Insights encryption enabled"
    else
        log_warning "Performance Insights encryption NOT configured"
    fi
}

check_cloudwatch_logs() {
    log_info "Checking CloudWatch Logs configuration..."

    local log_exports=$(aws rds describe-db-instances \
        --db-instance-identifier "${INSTANCE_IDENTIFIER}" \
        --query 'DBInstances[0].EnabledCloudwatchLogsExports' \
        --output text \
        2>/dev/null || echo "")

    if [[ "${log_exports}" == *"error"* ]] && [[ "${log_exports}" == *"general"* ]]; then
        log_success "CloudWatch Logs configured (error, general)"
    else
        log_warning "CloudWatch Logs not fully configured: ${log_exports}"
    fi
}

check_sql_server_tde() {
    log_info "Checking SQL Server TDE status..."

    local endpoint=$(aws rds describe-db-instances \
        --db-instance-identifier "${INSTANCE_IDENTIFIER}" \
        --query 'DBInstances[0].Endpoint.Address' \
        --output text \
        2>/dev/null || echo "")

    if [[ -z "${endpoint}" ]]; then
        log_error "Could not get RDS endpoint"
        return 1
    fi

    log_info "SQL Server TDE check requires database connection"
    log_info "Endpoint: ${endpoint}"
    log_info "Run the following SQL to verify TDE:"
    echo ""
    echo "------------------------------------------------------"
    echo "SELECT DB_NAME(database_id) AS DatabaseName,"
    echo "       is_encrypted,"
    echo "       encryption_state,"
    echo "       key_algorithm"
    echo "FROM sys.databases db"\n    echo "LEFT JOIN sys.dm_database_encryption_keys dek"\n    echo "ON db.database_id = dek.database_id;"
    echo "------------------------------------------------------"
    echo ""
}

check_tags() {
    log_info "Checking resource tags..."

    local tags=$(aws rds describe-db-instances \
        --db-instance-identifier "${INSTANCE_IDENTIFIER}" \
        --query 'DBInstances[0].TagList' \
        --output json \
        2>/dev/null || echo "[]")

    if echo "${tags}" | grep -q "buzz-tutor"; then
        log_success "Tags configured correctly"
    else
        log_warning "Tags may not be configured"
    fi
}

check_iam_role() {
    log_info "Checking IAM role..."

    local role_arn=$(aws rds describe-db-instances \
        --db-instance-identifier "${INSTANCE_IDENTIFIER}" \
        --query 'DBInstances[0].MonitoringRoleArn' \
        --output text \
        2>/dev/null)

    if [[ -n "${role_arn}" ]] && [[ "${role_arn}" != "None" ]]; then
        log_success "IAM monitoring role configured: $(basename "${role_arn}")"
    else
        log_warning "IAM monitoring role not configured"
    fi
}

check_cloudwatch_alarms() {
    log_info "Checking CloudWatch alarms..."

    local alarms=$(aws cloudwatch describe-alarms \
        --alarm-name-prefix "buzz-tutor-sql" \
        --query "MetricAlarms[?Dimensions[?Name=='DBInstanceIdentifier' && Value=='${INSTANCE_IDENTIFIER}']].AlarmName" \
        --output text \
        2>/dev/null || echo "")

    if [[ -n "${alarms}" ]]; then
        log_success "CloudWatch alarms configured"
        while IFS= read -r alarm; do
            echo "  - ${alarm}"
        done <<< "${alarms}"
    else
        log_warning "No CloudWatch alarms found"
    fi
}

generate_report() {
    log_info "Generating verification report..."

    cat > "${SCRIPT_DIR}/tde-verification-report-${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S).txt" <<EOF
============================================
TDE Verification Report - ${ENVIRONMENT}
Generated: $(date)
============================================

RDS Instance: ${INSTANCE_IDENTIFIER}
Verification Summary:
- Tests Passed: ${VERIFICATION_PASSED}
- Tests Failed: ${VERIFICATION_FAILED}
- Overall Status: $([[ ${VERIFICATION_FAILED} -eq 0 ]] && echo "PASS" || echo "FAIL")

Details:
EOF

    if [[ ${VERIFICATION_FAILED} -eq 0 ]]; then
        echo "✅ All verification checks passed!" >> "${REPORT_FILE}"
        echo "" >> "${REPORT_FILE}"
        echo "Encryption at rest is properly configured for ${ENVIRONMENT}." >> "${REPORT_FILE}"
    else
        echo "❌ Some verification checks failed." >> "${REPORT_FILE}"
        echo "Please review the errors above and address them." >> "${REPORT_FILE}"
    fi

    log_success "Report generated"
}

# Main execution
main() {
    echo ""
    echo "=========================================="
    echo "Buzz A Tutor TDE Verification"
    echo "Environment: ${ENVIRONMENT}"
    echo "=========================================="
    echo ""

    check_rds_encryption
    check_backup_encryption
    check_kms_key_rotation
    check_performance_insights_encryption
    check_cloudwatch_logs
    check_iam_role
    check_tags
    check_cloudwatch_alarms
    check_sql_server_tde

    echo ""
    echo "=========================================="
    echo "Verification Summary"
    echo "=========================================="
    echo -e "${GREEN}Passed: ${VERIFICATION_PASSED}${NC}"
    echo -e "${RED}Failed: ${VERIFICATION_FAILED}${NC}"
    echo ""

    if [[ ${VERIFICATION_FAILED} -eq 0 ]]; then
        log_success "🎉 All verification checks passed!"
    else
        log_error "❌ Some verification checks failed"
        exit 1
    fi

    generate_report
}

# Run main function
main
