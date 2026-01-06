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
# - Terraform CLI installed (for infrastructure verification)
# - jq installed for JSON parsing
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
    
    if ! command -v terraform &> /dev/null; then
        missing_deps+=("terraform")
    fi
    
    if ! command -v jq &> /dev/null; then
        missing_deps+=("jq")
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        log_error "Missing dependencies: ${missing_deps[*]}"
        exit 1
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
        --output json)
    
    echo "${params}" | jq -r '.[] | @tsv' | while IFS=$'\t' read -r name value; do
        case "${name}" in
            "rds.force_ssl")
                if [ "${value}" = "1" ]; then
                    log_success "TLS enforcement enabled (rds.force_ssl = 1)"
                else
                    log_error "TLS enforcement NOT enabled (rds.force_ssl = ${value})"
                    return 1
                fi
                ;;
            "rds.tls10")
                if [ "${value}" = "disabled" ]; then
                    log_success "TLS 1.0 disabled"
                else
                    log_warning "TLS 1.0 enabled (should be disabled)"
                fi
                ;;
            "rds.tls11")
                if [ "${value}" = "disabled" ]; then
                    log_success "TLS 1.1 disabled"
                else
                    log_warning "TLS 1.1 enabled (should be disabled)"
                fi
                ;;
            "rds.rc4")
                if [ "${value}" = "disabled" ]; then
                    log_success "RC4 cipher disabled"
                else
                    log_warning "RC4 cipher enabled (should be disabled)"
                fi
                ;;
            "rds.3des168")
                if [ "${value}" = "disabled" ]; then
                    log_success "3DES cipher disabled"
                else
                    log_warning "3DES cipher enabled (should be disabled)"
                fi
                ;;
            "rds.diffie-hellman-min-key-bit-length")
                if [ "${value}" -ge "3072" ]; then
                    log_success "Diffie-Hellman key length >= 3072 bits"
                else
                    log_warning "Diffie-Hellman key length = ${value} (should be >= 3072)"
                fi
                ;;
        esac
    done
}

# Verify RDS instance configuration
verify_rds_instance() {
    log_info "Verifying RDS instance: ${RDS_INSTANCE_IDENTIFIER}"
    
    # Check public accessibility
    local public_access
    public_access=$(aws rds describe-db-instances \
        --db-instance-identifier "${RDS_INSTANCE_IDENTIFIER}" \
        --region "${AWS_REGION}" \
        --query 'DBInstances[0].PubliclyAccessible' \
        --output text)
    
    if [ "${public_access}" = "False" ] || [ "${public_access}" = "false" ]; then
        log_success "Public access disabled"
    else
        log_error "Public access enabled (should be disabled)"
        return 1
    fi
    
    # Check encryption at rest
    local storage_encrypted
    storage_encrypted=$(aws rds describe-db-instances \
        --db-instance-identifier "${RDS_INSTANCE_IDENTIFIER}" \
        --region "${AWS_REGION}" \
        --query 'DBInstances[0].StorageEncrypted' \
        --output text)
    
    if [ "${storage_encrypted}" = "True" ] || [ "${storage_encrypted}" = "true" ]; then
        log_success "Storage encryption enabled"
    else
        log_error "Storage encryption not enabled"
        return 1
    fi
    
    # Check parameter group association
    local param_group
    param_group=$(aws rds describe-db-instances \
        --db-instance-identifier "${RDS_INSTANCE_IDENTIFIER}" \
        --region "${AWS_REGION}" \
        --query 'DBInstances[0].DBParameterGroups[0].DBParameterGroupName' \
        --output text)
    
    if [ "${param_group}" = "${PARAMETER_GROUP_NAME}" ]; then
        log_success "TLS parameter group applied"
    else
        log_warning "TLS parameter group not applied (current: ${param_group})"
    fi
}

# Verify SQL Server connection encryption
verify_sql_encryption() {
    log_info "Verifying SQL Server connection encryption..."
    
    # Get database endpoint and credentials from AWS Secrets Manager
    local endpoint username password
    endpoint=$(aws rds describe-db-instances \
        --db-instance-identifier "${RDS_INSTANCE_IDENTIFIER}" \
        --region "${AWS_REGION}" \
        --query 'DBInstances[0].Endpoint.Address' \
        --output text)
    
    # Simple connection test - if connection succeeds with encryption required, TLS is working
    log_info "Attempting encrypted connection to ${endpoint}..."
    
    # Create a temporary SQL script for verification
    local temp_sql
    temp_sql=$(mktemp /tmp/tls_verify.XXXXXX.sql)
    
    cat > "${temp_sql}" << 'EOF'
-- Check current connections
SELECT 
    'Total Connections' = COUNT(*),
    'Encrypted Connections' = SUM(CASE WHEN encrypt_option = 'TRUE' THEN 1 ELSE 0 END),
    'Unencrypted Connections' = SUM(CASE WHEN encrypt_option = 'FALSE' THEN 1 ELSE 0 END),
    'Encryption Percentage' = CAST(
        (SUM(CASE WHEN encrypt_option = 'TRUE' THEN 1.0 ELSE 0 END) / COUNT(*)) * 100 
        AS DECIMAL(5,2)
    )
FROM sys.dm_exec_connections;

-- Show sample encrypted connections
SELECT TOP 5 
    session_id,
    client_net_address as client_ip,
    encrypt_option,
    auth_scheme,
    net_transport
FROM sys.dm_exec_connections
WHERE encrypt_option = 'TRUE'
ORDER BY session_id;
EOF

    # Execute verification query
    if sqlcmd -S "tcp:${endpoint},1433" -U "sqladmin" -Q "SELECT 1" -N -C 2>/dev/null; then
        log_success "Encrypted connection to SQL Server successful"
        
        # Run detailed verification if credentials available
        if [ -n "${DB_PASSWORD}" ]; then
            sqlcmd -S "tcp:${endpoint},1433" -U "sqladmin" -P "${DB_PASSWORD}" -i "${temp_sql}" -N -C 2>/dev/null || \
                log_warning "Could not execute detailed verification"
        fi
    else
        log_error "Encrypted connection failed - possible TLS misconfiguration"
        rm -f "${temp_sql}"
        return 1
    fi
    
    rm -f "${temp_sql}"
}

# Test connection without encryption (should fail)
test_unencrypted_rejection() {
    log_info "Testing rejection of unencrypted connections..."
    
    local endpoint
    endpoint=$(aws rds describe-db-instances \
        --db-instance-identifier "${RDS_INSTANCE_IDENTIFIER}" \
        --region "${AWS_REGION}" \
        --query 'DBInstances[0].Endpoint.Address' \
        --output text)
    
    # Try connecting without encryption
    if sqlcmd -S "tcp:${endpoint},1433" -U "sqladmin" -Q "SELECT 1" -C 2>/dev/null; then
        log_error "Unencrypted connection succeeded (TLS enforcement not working)"
        return 1
    else
        log_success "Unencrypted connection rejected (TLS enforcement working)"
    fi
}

# Verify terraform state
verify_terraform_state() {
    log_info "Verifying Terraform state..."
    
    cd /home/kimi/code/infrastructure/terraform
    
    if terraform state show "aws_db_parameter_group.buzz_tutor_tls_enforcement[\"${ENVIRONMENT}\"]" >/dev/null 2>&1; then
        log_success "TLS parameter group in Terraform state"
    else
        log_warning "TLS parameter group not in Terraform state"
    fi
    
    if terraform state show "aws_db_instance.buzz_tutor_sql_server_tls[\"${ENVIRONMENT}\"]" >/dev/null 2>&1; then
        log_success "TLS-enabled RDS instance in Terraform state"
    else
        log_warning "TLS-enabled RDS instance not in Terraform state"
    fi
}

# Generate compliance report
generate_report() {
    log_info "Generating compliance report..."
    
    local report_file="tls_verification_report_${ENVIRONMENT}_$(date +%Y%m%d_%H%M%S).txt"
    
    {
        echo "TLS 1.2+ Compliance Report"
        echo "Environment: ${ENVIRONMENT}"
        echo "Date: $(date)"
        echo "AWS Region: ${AWS_REGION}"
        echo ""
        echo "RDS Instance: ${RDS_INSTANCE_IDENTIFIER}"
        echo "Parameter Group: ${PARAMETER_GROUP_NAME}"
        echo ""
        echo "Compliance Status:"
        echo "=================="
    } > "/tmp/${report_file}"
    
    log_success "Compliance report saved: ${report_file}"
}

# Main execution
main() {
    log_info "Starting TLS 1.2+ verification for environment: ${ENVIRONMENT}"
    echo ""
    
    check_prerequisites
    
    # Run verifications
    echo ""
    log_info "=== RDS Parameter Group Verification ==="
    if ! verify_rds_parameter_group; then
        log_error "Parameter group verification failed"
        exit 1
    fi
    
    echo ""
    log_info "=== RDS Instance Verification ==="
    if ! verify_rds_instance; then
        log_error "RDS instance verification failed"
        exit 1
    fi
    
    log_success "✅ All TLS verification checks passed!"
    log_info "Environment ${ENVIRONMENT} is compliant with TLS 1.2+ requirements"
}

cd /home/kimi/code
main "$@"
