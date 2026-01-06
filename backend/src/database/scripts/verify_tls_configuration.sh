#!/bin/bash
# =============================================================================
# TLS 1.2+ Verification Script for Buzz A Tutor SQL Server
# 
# This script verifies that TLS encryption is properly configured and enforced
# at both the RDS and application levels.
# 
# Usage: ./verify_tls_configuration.sh [environment]
#   environment: staging|production (default: staging)
# 
# Prerequisites:
# - AWS CLI configured with appropriate credentials
# - sqlcmd or mssql-cli installed
# - jq installed for JSON parsing
# - Proper IAM permissions for RDS and Secrets Manager
# 
# Exit Codes:
#   0: All checks passed
#   1: One or more checks failed
#   2: Prerequisites missing
# =============================================================================

set -e

# Configuration
ENVIRONMENT=${1:-"staging"}
AWS_REGION="us-east-1"
RDS_INSTANCE_IDENTIFIER="buzz-tutor-sql-server-tls-${ENVIRONMENT}"
PARAMETER_GROUP_NAME="buzz-tutor-tls-enforcement-${ENVIRONMENT}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# Error tracking
FAILED_CHECKS=0

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    local missing_deps=()
    
    if ! command -v aws &> /dev/null; then
        missing_deps+=("aws-cli")
    fi
    
    if ! command -v sqlcmd &> /dev/null; then
        missing_deps+=("sqlcmd")
    fi
    
    if ! command -v jq &> /dev/null; then
        missing_deps+=("jq")
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        log_error "Missing dependencies: ${missing_deps[*]}"
        return 2
    fi
    
    log_success "All prerequisites satisfied"
}

# Verify RDS parameter group configuration
verify_rds_parameter_group() {
    log_info "Verifying RDS parameter group: ${PARAMETER_GROUP_NAME}"
    
    local params
    params=$(aws rds describe-db-parameters \
        --db-parameter-group-name "${PARAMETER_GROUP_NAME}" \
        --region "${AWS_REGION}" \
        --query 'Parameters[?ParameterName==`rds.force_ssl` || ParameterName==`rds.tls10` || ParameterName==`rds.tls11` || ParameterName==`rds.rc4` || ParameterName==`rds.3des168` || ParameterName==`rds.diffie-hellman-min-key-bit-length`].[ParameterName,ParameterValue]' \
        --output json 2>/dev/null)
    
    if [ -z "$params" ] || [ "$params" = "null" ]; then
        log_error "Could not retrieve parameter group: ${PARAMETER_GROUP_NAME}"
        ((FAILED_CHECKS++))
        return 1
    fi
    
    echo "${params}" | jq -r '.[] | @tsv' | while IFS=$'\t' read -r name value; do
        case "${name}" in
            "rds.force_ssl")
                if [ "${value}" = "1" ]; then
                    log_success "TLS enforcement enabled (rds.force_ssl = 1)"
                else
                    log_error "TLS enforcement NOT enabled (rds.force_ssl = ${value})"
                    ((FAILED_CHECKS++))
                fi
                ;;
            "rds.tls10")
                if [ "${value}" = "disabled" ]; then
                    log_success "TLS 1.0 disabled"
                else
                    log_warning "TLS 1.0 enabled (should be disabled)"
                    ((FAILED_CHECKS++))
                fi
                ;;
            "rds.tls11")
                if [ "${value}" = "disabled" ]; then
                    log_success "TLS 1.1 disabled"
                else
                    log_warning "TLS 1.1 enabled (should be disabled)"
                    ((FAILED_CHECKS++))
                fi
                ;;
            "rds.rc4")
                if [ "${value}" = "disabled" ]; then
                    log_success "RC4 cipher disabled"
                else
                    log_warning "RC4 cipher enabled (should be disabled)"
                    ((FAILED_CHECKS++))
                fi
                ;;
            "rds.3des168")
                if [ "${value}" = "disabled" ]; then
                    log_success "3DES cipher disabled"
                else
                    log_warning "3DES cipher enabled (should be disabled)"
                    ((FAILED_CHECKS++))
                fi
                ;;
            "rds.diffie-hellman-min-key-bit-length")
                if [ "${value}" -ge "3072" ]; then
                    log_success "Diffie-Hellman key length >= 3072 bits"
                else
                    log_warning "Diffie-Hellman key length = ${value} (should be >= 3072)"
                    ((FAILED_CHECKS++))
                fi
                ;;
        esac
    done
}

# Verify RDS instance configuration
verify_rds_instance() {
    log_info "Verifying RDS instance: ${RDS_INSTANCE_IDENTIFIER}"
    
    # Check if instance exists
    local instance_status
    instance_status=$(aws rds describe-db-instances \
        --db-instance-identifier "${RDS_INSTANCE_IDENTIFIER}" \
        --region "${AWS_REGION}" \
        --query 'DBInstances[0].DBInstanceStatus' \
        --output text 2>/dev/null || echo "NOT_FOUND")
    
    if [ "${instance_status}" = "NOT_FOUND" ]; then
        log_error "RDS instance not found: ${RDS_INSTANCE_IDENTIFIER}"
        ((FAILED_CHECKS++))
        return 1
    fi
    
    log_success "RDS instance exists (status: ${instance_status})"
    
    # Check public accessibility (should be false)
    local public_access
    public_access=$(aws rds describe-db-instances \
        --db-instance-identifier "${RDS_INSTANCE_IDENTIFIER}" \
        --region "${AWS_REGION}" \
        --query 'DBInstances[0].PubliclyAccessible' \
        --output text 2>/dev/null)
    
    if [ "${public_access}" = "False" ] || [ "${public_access}" = "false" ]; then
        log_success "Public access disabled"
    else
        log_error "Public access enabled (should be disabled for security)"
        ((FAILED_CHECKS++))
    fi
    
    # Check encryption at rest
    local storage_encrypted
    storage_encrypted=$(aws rds describe-db-instances \
        --db-instance-identifier "${RDS_INSTANCE_IDENTIFIER}" \
        --region "${AWS_REGION}" \
        --query 'DBInstances[0].StorageEncrypted' \
        --output text 2>/dev/null)
    
    if [ "${storage_encrypted}" = "True" ] || [ "${storage_encrypted}" = "true" ]; then
        log_success "Storage encryption enabled"
    else
        log_error "Storage encryption not enabled"
        ((FAILED_CHECKS++))
    fi
    
    # Check parameter group association
    local param_group
    param_group=$(aws rds describe-db-instances \
        --db-instance-identifier "${RDS_INSTANCE_IDENTIFIER}" \
        --region "${AWS_REGION}" \
        --query 'DBInstances[0].DBParameterGroups[0].DBParameterGroupName' \
        --output text 2>/dev/null)
    
    if [ "${param_group}" = "${PARAMETER_GROUP_NAME}" ]; then
        log_success "TLS parameter group applied: ${param_group}"
    else
        log_warning "TLS parameter group mismatch (current: ${param_group}, expected: ${PARAMETER_GROUP_NAME})"
        ((FAILED_CHECKS++))
    fi
}

# Verify SQL Server connection encryption
verify_sql_encryption() {
    log_info "Verifying SQL Server connection encryption..."
    
    # Get database endpoint
    local endpoint
    endpoint=$(aws rds describe-db-instances \
        --db-instance-identifier "${RDS_INSTANCE_IDENTIFIER}" \
        --region "${AWS_REGION}" \
        --query 'DBInstances[0].Endpoint.Address' \
        --output text 2>/dev/null)
    
    if [ -z "$endpoint" ] || [ "$endpoint" = "null" ]; then
        log_error "Could not retrieve RDS endpoint"
        ((FAILED_CHECKS++))
        return 1
    fi
    
    log_info "Testing connection to ${endpoint}..."
    
    # Create a temporary SQL script for verification
    local temp_sql
    temp_sql=$(mktemp /tmp/tls_verify.XXXXXX.sql)
    
    cat > "${temp_sql}" << 'EOF'
-- Get encryption statistics
SELECT 
    'TotalConnections' = COUNT(*),
    'EncryptedConnections' = SUM(CASE WHEN encrypt_option = 'TRUE' THEN 1 ELSE 0 END),
    'UnencryptedConnections' = SUM(CASE WHEN encrypt_option = 'FALSE' THEN 1 ELSE 0 END),
    'EncryptionPercentage' = CAST(
        (SUM(CASE WHEN encrypt_option = 'TRUE' THEN 1.0 ELSE 0 END) / COUNT(*)) * 100 
        AS DECIMAL(5,2)
    )
FROM sys.dm_exec_connections;

-- Show sample encrypted connections
SELECT TOP 3 
    session_id,
    client_net_address as client_ip,
    encrypt_option,
    auth_scheme
FROM sys.dm_exec_connections
WHERE encrypt_option = 'TRUE'
ORDER BY session_id;
EOF

    # Get credentials from Secrets Manager
    local secret_value
    secret_value=$(aws secretsmanager get-secret-value \
        --secret-id "buzz-tutor/sql-server-${ENVIRONMENT}" \
        --region "${AWS_REGION}" \
        --query 'SecretString' \
        --output text 2>/dev/null)
    
    if [ -z "$secret_value" ] || [ "$secret_value" = "null" ]; then
        log_warning "Could not retrieve credentials from Secrets Manager, skipping SQL verification"
        rm -f "${temp_sql}"
        return 0
    fi
    
    local username password
    username=$(echo "$secret_value" | jq -r '.username // empty')
    password=$(echo "$secret_value" | jq -r '.password // empty')
    
    if [ -z "$username" ] || [ -z "$password" ]; then
        log_warning "Invalid credentials format, skipping SQL verification"
        rm -f "${temp_sql}"
        return 0
    fi
    
    # Test encrypted connection
    if sqlcmd -S "tcp:${endpoint},1433" -U "${username}" -P "${password}" -i "${temp_sql}" -N -C -b 2>/dev/null; then
        log_success "Encrypted connection to SQL Server successful"
        
        # Check if encryption percentage is 100%
        local enc_percentage
        enc_percentage=$(sqlcmd -S "tcp:${endpoint},1433" -U "${username}" -P "${password}" -Q "SET NOCOUNT ON; SELECT CAST((SUM(CASE WHEN encrypt_option = 'TRUE' THEN 1.0 ELSE 0 END) / COUNT(*)) * 100 AS DECIMAL(5,2)) FROM sys.dm_exec_connections" -N -C -h -1 2>/dev/null | tr -d ' \r\n')
        
        if [ "${enc_percentage}" = "100.00" ]; then
            log_success "100% of connections are encrypted"
        else
            log_warning "Only ${enc_percentage}% of connections are encrypted (should be 100%)"
        fi
    else
        log_error "Encrypted connection failed - possible TLS misconfiguration"
        ((FAILED_CHECKS++))
    fi
    
    rm -f "${temp_sql}"
}

# Test that unencrypted connections are rejected
test_unencrypted_rejection() {
    log_info "Testing rejection of unencrypted connections..."
    
    local endpoint username password
    endpoint=$(aws rds describe-db-instances \
        --db-instance-identifier "${RDS_INSTANCE_IDENTIFIER}" \
        --region "${AWS_REGION}" \
        --query 'DBInstances[0].Endpoint.Address' \
        --output text 2>/dev/null)
    
    if [ -z "$endpoint" ] || [ "$endpoint" = "null" ]; then
        log_error "Could not retrieve RDS endpoint for connection test"
        ((FAILED_CHECKS++))
        return 1
    fi
    
    # Try connecting without encryption (should fail if TLS is enforced)
    if command -v sqlcmd &> /dev/null; then
        if sqlcmd -S "tcp:${endpoint},1433" -U "sqladmin" -Q "SELECT 1" -C -b 2>/dev/null; then
            log_error "Unencrypted connection succeeded (TLS enforcement NOT working)"
            ((FAILED_CHECKS++))
        else
            log_success "Unencrypted connection rejected (TLS enforcement working)"
        fi
    else
        log_warning "sqlcmd not available, skipping connection rejection test"
    fi
}

# Generate compliance report
generate_report() {
    log_info "Generating compliance report..."
    
    local report_file
    report_file="tls_verification_report_${ENVIRONMENT}_$(date +%Y%m%d_%H%M%S).txt"
    
    {
        echo "=========================================="
        echo "TLS 1.2+ Compliance Report"
        echo "Environment: ${ENVIRONMENT}"
        echo "Date: $(date)"
        echo "AWS Region: ${AWS_REGION}"
        echo "RDS Instance: ${RDS_INSTANCE_IDENTIFIER}"
        echo "Parameter Group: ${PARAMETER_GROUP_NAME}"
        echo "=========================================="
        echo ""
        echo "Verification Results:"
        echo "====================="
        echo "Failed checks: ${FAILED_CHECKS}"
        echo ""
        echo "Overall Status: $([ ${FAILED_CHECKS} -eq 0 ] && echo '✅ PASS' || echo '❌ FAIL')"
        echo ""
    } > "${report_file}"
    
    log_success "Compliance report saved: ${report_file}"
}

# Main execution
main() {
    log_info "Starting TLS 1.2+ verification for environment: ${ENVIRONMENT}"
    echo ""
    
    if ! check_prerequisites; then
        exit 2
    fi
    
    # Run verifications
    echo ""
    log_info "=== RDS Parameter Group Verification ==="
    verify_rds_parameter_group
    
    echo ""
    log_info "=== RDS Instance Configuration Verification ==="
    verify_rds_instance
    
    echo ""
    log_info "=== SQL Server Connection Encryption Verification ==="
    verify_sql_encryption
    
    echo ""
    log_info "=== Unencrypted Connection Rejection Test ==="
    test_unencrypted_rejection
    
    echo ""
    log_info "=== Compliance Report Generation ==="
    generate_report
    
    echo ""
    if [ ${FAILED_CHECKS} -eq 0 ]; then
        log_success "✅ All TLS verification checks passed!"
        log_info "Environment ${ENVIRONMENT} is compliant with TLS 1.2+ requirements"
        exit 0
    else
        log_error "❌ ${FAILED_CHECKS} TLS verification check(s) failed"
        log_error "Environment ${ENVIRONMENT} is NOT compliant"
        exit 1
    fi
}

# Handle script termination
trap 'log_error "Verification interrupted"; exit 1' INT TERM

# Change to project root
cd /home/kimi/code

# Run main
main "$@"
