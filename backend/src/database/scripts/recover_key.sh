#!/bin/bash
# =============================================================================
# Key Recovery Script
# For Buzz A Tutor - SQL Server Key Management
#
# This script recovers a revoked key within the 7-day recovery window.
# Requires proper approvals and verification.
#
# USAGE:
#   ./recover_key.sh <environment> <cek_name> <approval_id> <reason>
#
# PARAMETERS:
#   environment  - staging or production
#   cek_name     - Name of the Column Encryption Key to recover (e.g., CEK_User_12345)
#   approval_id  - Change approval ID (e.g., CHANGE-2024-001)
#   reason       - Brief description of why key is being recovered
#
# PREREQUISITES:
#   - AWS CLI configured with appropriate credentials
#   - MFA enabled and accessible
#   - Permission to assume KeyRecoveryAdmin role
#   - Approval from Security Team Lead and DevOps Manager
#   - Key must be in recoverable state (revoked < 7 days ago)
#   - Key must be recoverable (not permanently deleted)
#
# EXIT CODES:
#   0 - Success
#   1 - Failure (check error message)
#   2 - Invalid parameters
#   3 - Prerequisites not met
#   4 - Key not recoverable (window expired or not revocable)
# =============================================================================

set -e

# -----------------------------------------------------------------------------
# CONFIGURATION
# -----------------------------------------------------------------------------
AWS_REGION="${AWS_REGION:-us-east-1}"
CORRELATION_ID=$(uuidgen 2>/dev/null || echo "recovery-$(date +%s)")
TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S")

# ANSI colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# -----------------------------------------------------------------------------
# LOGGING FUNCTIONS
# -----------------------------------------------------------------------------
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

log_header() {
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}$1${NC}"
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# -----------------------------------------------------------------------------
# VALIDATION FUNCTIONS
# -----------------------------------------------------------------------------
validate_prerequisites() {
    log_info "Checking prerequisites..."

    local missing_deps=()

    # Check AWS CLI
    if ! command -v aws &>/dev/null; then
        missing_deps+=("aws-cli")
    fi

    # Check jq
    if ! command -v jq &>/dev/null; then
        missing_deps+=("jq")
    fi

    # Check sqlcmd
    if ! command -v sqlcmd &>/dev/null; then
        missing_deps+=("sqlcmd")
    fi

    # Check uuidgen
    if ! command -v uuidgen &>/dev/null; then
        missing_deps+=("uuidgen")
    fi

    if [ ${#missing_deps[@]} -ne 0 ]; then
        log_error "Missing prerequisites: ${missing_deps[*]}"
        log_error "Please install missing tools before proceeding"
        exit 3
    fi

    log_success "All prerequisites verified"
}

validate_parameters() {
    log_info "Validating parameters..."

    # Check parameter count
    if [ $# -ne 4 ]; then
        log_error "Invalid number of parameters"
        echo ""
        echo "Usage: $0 <environment> <cek_name> <approval_id> <reason>"
        echo ""
        echo "Example:"
        echo "  $0 staging CEK_User_12345 CHANGE-2024-001 \"Recovered after troubleshooting\""
        echo ""
        exit 2
    fi

    local env="$1"
    local cek="$2"
    local approval="$3"
    local reason="$4"

    # Validate environment
    if [[ "$env" != "staging" && "$env" != "production" ]]; then
        log_error "Invalid environment: $env. Must be 'staging' or 'production'"
        exit 2
    fi

    # Validate CEK name format
    if [[ ! "$cek" =~ ^CEK_[A-Za-z]+_[A-Za-z0-9]+$ ]]; then
        log_warning "CEK name doesn't match expected format: $cek"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi

    # Check reason length
    if [ ${#reason} -lt 10 ]; then
        log_error "Reason too brief. Please provide detailed explanation (min 10 characters)"
        exit 2
    fi

    log_success "Parameters validated"
}

# -----------------------------------------------------------------------------
# VERIFY KEY RECOVERABILITY
# -----------------------------------------------------------------------------
check_key_recoverability() {
    local env="$1"
    local cek="$2"

    log_info "Checking if key is recoverable..."

    # Get SQL credentials
    local secret_value
    secret_value=$(aws secretsmanager get-secret-value \
        --secret-id "buzz-tutor/sql-server-${env}" \
        --region "${AWS_REGION}" \
        --query 'SecretString' \
        --output text 2>&1)

    if [ -z "$secret_value" ] || [ "$secret_value" = "null" ]; then
        log_error "Could not retrieve SQL credentials"
        return 1
    fi

    local username password endpoint
    username=$(echo "$secret_value" | jq -r '.username // empty')
    password=$(echo "$secret_value" | jq -r '.password // empty')
    endpoint=$(echo "$secret_value" | jq -r '.host // empty')

    if [ -z "$username" ] || [ -z "$password" ] || [ -z "$endpoint" ]; then
        log_error "Invalid SQL credentials format"
        return 1
    fi

    # Check key status
    local key_status
    key_status=$(sqlcmd -S "tcp:${endpoint},1433" \
        -U "${username}" \
        -P "${password}" \
        -Q "SET NOCOUNT ON; SELECT CASE WHEN CanBeRecoveredUntil >= GETUTCDATE() THEN 'RECOVERABLE' WHEN IsRevoked = 1 THEN 'NOT_RECOVERABLE' ELSE 'NOT_REVOKED' END FROM dbo.KeyStatus WHERE KeyName = '${cek}'" \
        -h -1 -N -C 2>&1 | tr -d ' \r\n')

    case "$key_status" in
        "RECOVERABLE")
            log_success "Key is recoverable (within 7-day window)"
            return 0
            ;;
        "NOT_RECOVERABLE")
            log_error "Key cannot be recovered (revoked more than 7 days ago)"
            return 4
            ;;
        "NOT_REVOKED")
            log_warning "Key is not revoked (no recovery needed)"
            return 0
            ;;
        *)
            log_error "Could not determine key status: ${key_status}"
            return 1
            ;;
    esac
}

verify_backup_integrity() {
    local env="$1"

    log_info "Verifying backup integrity..."

    # Check RDS automated backups
    local backup_info
    if backup_info=$(aws rds describe-db-instances \
        --db-instance-identifier "buzz-tutor-sql-server-tls-${env}" \
        --region "${AWS_REGION}" \
        --query 'DBInstances[0].[BackupRetentionPeriod,LatestRestorableTime]' \
        --output text 2>&1); then

        local retention_days=$(echo "$backup_info" | awk '{print $1}')
        local latest_backup=$(echo "$backup_info" | awk '{print $2}')

        log_success "Backup retention: ${retention_days} days"
        log_success "Latest backup: ${latest_backup}"

        if [ "$retention_days" -lt 7 ]; then
            log_warning "Backup retention less than 7 days (${retention_days})"
            read -p "Continue anyway? (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                exit 1
            fi
        fi

        return 0
    else
        log_error "Failed to verify backup integrity: ${backup_info}"
        return 1
    fi
}

# -----------------------------------------------------------------------------
# RECOVERY FUNCTIONS
# -----------------------------------------------------------------------------
assume_recovery_role() {
    local env="$1"
    local role_name="BuzzTutorKeyRecoveryAdmin-${env}"

    log_info "Assuming recovery role: ${role_name}"

    local assume_output
    if ! assume_output=$(aws sts assume-role \
        --role-arn "arn:aws:iam::${AWS_ACCOUNT}:role/${role_name}" \
        --role-session-name "KeyRecovery-${CORRELATION_ID}" \
        --tags Key=Environment,Value="${env}" Key=OperationType,Value="key_recovery" \
        --duration-seconds 3600 \
        2>&1); then
        log_error "Failed to assume recovery role: ${assume_output}"
        exit 1
    fi

    AWS_ACCESS_KEY_ID=$(echo "$assume_output" | jq -r '.Credentials.AccessKeyId')
    AWS_SECRET_ACCESS_KEY=$(echo "$assume_output" | jq -r '.Credentials.SecretAccessKey')
    AWS_SESSION_TOKEN=$(echo "$assume_output" | jq -r '.Credentials.SessionToken')
    export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN

    log_success "Recovery role assumed successfully"
}

enable_kms_key() {
    local key_arn="$1"

    log_info "Enabling KMS key: ${key_arn}"

    if aws kms enable-key \
        --key-id "${key_arn}" \
        --region "${AWS_REGION}" 2>&1; then
        log_success "KMS key enabled successfully"
    else
        log_error "Failed to enable KMS key"
        exit 1
    fi
}

confirm_key_enabled() {
    local key_arn="$1"

    log_info "Confirming key is enabled..."

    local key_state
    key_state=$(aws kms describe-key \
        --key-id "${key_arn}" \
        --region "${AWS_REGION}" \
        --query 'KeyMetadata.KeyState' \
        --output text 2>&1)

    if [ "$key_state" = "Enabled" ]; then
        log_success "Key verified as enabled"
        return 0
    else
        log_error "Key not enabled. Current state: ${key_state}"
        exit 1
    fi
}

log_recovery_to_audit() {
    local env="$1"
    local cek="$2"
    local approval="$3"
    local reason="$4"

    log_info "Logging recovery to audit table..."

    # Get SQL credentials
    local secret_value
    secret_value=$(aws secretsmanager get-secret-value \
        --secret-id "buzz-tutor/sql-server-${env}" \
        --region "${AWS_REGION}" \
        --query 'SecretString' \
        --output text 2>&1)

    if [ -z "$secret_value" ] || [ "$secret_value" = "null" ]; then
        log_warning "Could not retrieve SQL credentials"
        return 1
    fi

    local username password endpoint
    username=$(echo "$secret_value" | jq -r '.username // empty')
    password=$(echo "$secret_value" | jq -r '.password // empty')
    endpoint=$(echo "$secret_value" | jq -r '.host // empty')

    if [ -z "$username" ] || [ -z "$password" ] || [ -z "$endpoint" ]; then
        log_warning "Invalid SQL credentials format"
        return 1
    fi

    local client_ip=$(curl -s http://checkip.amazonaws.com/ || echo "unknown")

    sqlcmd -S "tcp:${endpoint},1433" \
        -U "${username}" \
        -P "${password}" \
        -Q "EXEC dbo.LogKeyManagementOperation @OperationType='RECOVER', @KeyName='${cek}', @PerformedBy='${AWS_PRINCIPAL}', @CorrelationId='${CORRELATION_ID}', @Reason='[KEY RECOVERY] ${approval}: ${reason}', @Success=1, @ClientIPAddress='${client_ip}', @ApprovalGrantedBy='${APPROVAL_GRANTED_BY}'" \
        -N -C -b 2>&1

    if [ $? -eq 0 ]; then
        log_success "Recovery logged to audit table"
    else
        log_warning "Failed to log recovery to audit table"
    fi
}

test_application_access() {
    local env="$1"

    log_info "Testing application access..."

    # Get SQL credentials
    local secret_value
    secret_value=$(aws secretsmanager get-secret-value \
        --secret-id "buzz-tutor/sql-server-${env}" \
        --region "${AWS_REGION}" \
        --query 'SecretString' \
        --output text 2>&1)

    if [ -z "$secret_value" ] || [ "$secret_value" = "null" ]; then
        log_error "Could not retrieve SQL credentials"
        return 1
    fi

    local username password endpoint
    username=$(echo "$secret_value" | jq -r '.username // empty')
    password=$(echo "$secret_value" | jq -r '.password // empty')
    endpoint=$(echo "$secret_value" | jq -r '.host // empty')

    if [ -z "$username" ] || [ -z "$password" ] || [ -z "$endpoint" ]; then
        log_error "Invalid SQL credentials format"
        return 1
    fi

    # Test encrypted connection
    if sqlcmd -S "tcp:${endpoint},1433" \
        -U "${username}" \
        -P "${password}" \
        -Q "SELECT 1" \
        -N -C 2>&1; then
        log_success "Application access test passed"
        return 0
    else
        log_error "Application access test failed"
        return 1
    fi
}

# -----------------------------------------------------------------------------
# MAIN EXECUTION
# -----------------------------------------------------------------------------
main() {
    log_header "KEY RECOVERY OPERATION - Buzz A Tutor"

    # Parse parameters
    ENVIRONMENT="$1"
    CEK_NAME="$2"
    APPROVAL_ID="$3"
    REASON="$4"

    log_info "Environment: ${ENVIRONMENT}"
    log_info "Key Name: ${CEK_NAME}"
    log_info "Approval ID: ${APPROVAL_ID}"
    log_info "Correlation ID: ${CORRELATION_ID}"
    log_info "Reason: ${REASON}"

    # Validate prerequisites
    validate_prerequisites

    # Validate parameters
    validate_parameters "$@"

    log_header "STEP 1: PRE-RECOVERY VERIFICATION"

    # Check key recoverability
    if ! check_key_recoverability "${ENVIRONMENT}" "${CEK_NAME}"; then
        exit 4
    fi

    # Verify backup integrity
    if ! verify_backup_integrity "${ENVIRONMENT}"; then
        log_error "Backup integrity check failed"
        exit 1
    fi

    # Get approval verification
    log_info "Approval verification required"
    log_info "Approval ID: ${APPROVAL_ID}"
    echo ""
    read -p "Have you obtained approval from Security Team Lead and DevOps Manager? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_error "Approval required for key recovery"
        exit 1
    fi

    if [ -z "$APPROVAL_GRANTED_BY" ]; then
        echo "Enter the name of the person who granted approval:"
        read -r APPROVAL_GRANTED_BY
    fi

    log_header "STEP 2: ROLE ASSUMPTION"

    # Assume recovery role
    export AWS_PRINCIPAL="arn:aws:iam::${AWS_ACCOUNT}:role/BuzzTutorKeyRecoveryAdmin-${ENVIRONMENT}"
    assume_recovery_role "${ENVIRONMENT}"

    log_header "STEP 3: KEY RECOVERY"

    # Get KMS key ARN
    export KMS_KEY_ARN=$(aws secretsmanager get-secret-value \
        --secret-id "buzz-tutor/key-management-config-${ENVIRONMENT}" \
        --region "${AWS_REGION}" \
        --query 'SecretString' \
        --output text | jq -r '.key_identifiers.tde_key_arn')

    # Enable KMS key
    enable_kms_key "$KMS_KEY_ARN"

    # Confirm key enabled
    confirm_key_enabled "$KMS_KEY_ARN"

    log_header "STEP 4: AUDIT AND VERIFICATION"

    # Update SQL audit
    log_recovery_to_audit "${ENVIRONMENT}" "${CEK_NAME}" "${APPROVAL_ID}" "${REASON}"

    # Update key status
    update_key_status "${ENVIRONMENT}" "${CEK_NAME}"

    # Test application access
    test_application_access "${ENVIRONMENT}"

    log_header "✅ KEY RECOVERY COMPLETE"
    log_success "Key recovered successfully"
    log_info "Correlation ID: ${CORRELATION_ID}"
    log_info "Key Name: ${CEK_NAME}"
    log_info "Environment: ${ENVIRONMENT}"

    echo ""
    echo "✅ KEY RECOVERY SUMMARY"
    echo "━━━━━━━━━━━━━━━━━━━━━━"
    echo "Key: ${CEK_NAME}"
    echo "Environment: ${ENVIRONMENT}"
    echo "Approved By: ${APPROVAL_GRANTED_BY}"
    echo "Correlation ID: ${CORRELATION_ID}"
    echo ""
    echo "✅ POST-RECOVERY TASKS"
    echo "──────────────────────"
    echo "1. Monitor application logs for 24 hours"
    echo "2. Verify all dependent systems are operational"
    echo "3. Document recovery in incident log"
    echo "4. Schedule key rotation if needed"
    echo "5. Review and update recovery procedures"
    echo ""
    echo "Recovery Procedures: docs/runbooks/key-recovery.md"
    echo ""

    exit 0
}

# -----------------------------------------------------------------------------
# UPDATE KEY STATUS
# -----------------------------------------------------------------------------
update_key_status() {
    local env="$1"
    local cek="$2"

    log_info "Updating key status in KeyStatus table..."

    # Get SQL credentials
    local secret_value
    secret_value=$(aws secretsmanager get-secret-value \
        --secret-id "buzz-tutor/sql-server-${env}" \
        --region "${AWS_REGION}" \
        --query 'SecretString' \
        --output text 2>&1)

    if [ -z "$secret_value" ] || [ "$secret_value" = "null" ]; then
        log_error "Could not retrieve SQL credentials"
        return 1
    fi

    local username password endpoint
    username=$(echo "$secret_value" | jq -r '.username // empty')
    password=$(echo "$secret_value" | jq -r '.password // empty')
    endpoint=$(echo "$secret_value" | jq -r '.host // empty')

    if [ -z "$username" ] || [ -z "$password" ] || [ -z "$endpoint" ]; then
        log_error "Invalid SQL credentials format"
        return 1
    fi

    sqlcmd -S "tcp:${endpoint},1433" \
        -U "${username}" \
        -P "${password}" \
        -Q "UPDATE dbo.KeyStatus SET IsEnabled = 1, IsRevoked = 0, RevokedAt = NULL, RevocationReason = NULL, RevokedBy = NULL, CanBeRecoveredUntil = NULL WHERE KeyName = '${cek}'" \
        -N -C -b 2>&1

    if [ $? -eq 0 ]; then
        log_success "Key status updated"
    else
        log_warning "Failed to update key status"
    fi
}

# -----------------------------------------------------------------------------
# ERROR HANDLING
# -----------------------------------------------------------------------------
trap 'log_error "Script interrupted or failed"' ERR INT TERM

# -----------------------------------------------------------------------------
# SCRIPT EXECUTION
# -----------------------------------------------------------------------------
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Check if approval granted by is set
    if [ -n "$APPROVAL_GRANTED_BY" ]; then
        main "$@"
    else
        echo "Enter the name of the person who approved this recovery:"
        read -r APPROVAL_GRANTED_BY
        export APPROVAL_GRANTED_BY
        main "$@"
    fi
fi
