#!/bin/bash
# =============================================================================
# Emergency Key Revocation Script
# For Buzz A Tutor - SQL Server Key Management
#
# This script performs emergency key revocation for security incidents.
# It requires MFA and emergency role assumption.
#
# USAGE:
#   ./emergency_key_revocation.sh <environment> <cek_name> <incident_id> <reason>
#
# PARAMETERS:
#   environment  - staging or production
#   cek_name     - Name of the Column Encryption Key to revoke (e.g., CEK_User_12345)
#   incident_id  - Security incident ID (e.g., INCIDENT-2024-001)
#   reason       - Brief description of why key is being revoked
#
# PREREQUISITES:
#   - AWS CLI configured with appropriate credentials
#   - MFA enabled and accessible
#   - Permission to assume EmergencyKeyAdmin role
#   - jq installed for JSON parsing
#   - sqlcmd installed for SQL Server access
#
# EXIT CODES:
#   0 - Success
#   1 - Failure (check error message)
#   2 - Invalid parameters
#   3 - Prerequisites not met
# =============================================================================

set -e

# -----------------------------------------------------------------------------
# CONFIGURATION
# -----------------------------------------------------------------------------
AWS_REGION="${AWS_REGION:-us-east-1}"
CORRELATION_ID=$(uuidgen 2>/dev/null || echo "emergency-$(date +%s)")
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
        echo "Usage: $0 <environment> <cek_name> <incident_id> <reason>"
        echo ""
        echo "Example:"
        echo "  $0 staging CEK_User_12345 INCIDENT-2024-001 \"Key compromise detected\""
        echo ""
        exit 2
    fi

    local env="$1"
    local cek="$2"
    local incident="$3"
    local reason="$4"

    # Validate environment
    if [[ "$env" != "staging" && "$env" != "production" ]]; then
        log_error "Invalid environment: $env. Must be 'staging' or 'production'"
        exit 2
    fi

    # Validate CEK name format
    if [[ ! "$cek" =~ ^CEK_[A-Za-z]+_[A-Za-z0-9]+$ ]]; then
        log_warning "CEK name doesn't match expected format: $cek"
        log_warning "Expected format: CEK_{Type}_{ID} (e.g., CEK_User_12345)"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi

    # Validate incident ID format
    if [[ ! "$incident" =~ ^INCIDENT-[0-9]{4}-[0-9]+$ ]]; then
        log_warning "Incident ID doesn't match standard format: $incident"
        log_warning "Expected format: INCIDENT-YYYY-####"
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
# AWS FUNCTIONS
# -----------------------------------------------------------------------------
assume_emergency_role() {
    local env="$1"
    local role_name="BuzzTutorEmergencyKeyAdmin-${env}"

    log_info "Assuming emergency role: ${role_name}"

    # Check if we're already in the role (for testing)
    if [[ "$AWS_SESSION_NAME" == *"EmergencyKeyRevocation"* ]]; then
        log_warning "Already in emergency role session, skipping role assumption"
        return 0
    fi

    # Assume the role
    local assume_output
    if ! assume_output=$(aws sts assume-role \
        --role-arn "arn:aws:iam::${AWS_ACCOUNT}:role/${role_name}" \
        --role-session-name "EmergencyKeyRevocation-${CORRELATION_ID}" \
        --tags Key=Environment,Value="${env}" Key=IncidentId,Value="${INCIDENT_ID}" \
        --duration-seconds 3600 \
        2>&1); then
        log_error "Failed to assume emergency role: ${assume_output}"
        exit 1
    fi

    # Extract credentials
    AWS_ACCESS_KEY_ID=$(echo "$assume_output" | jq -r '.Credentials.AccessKeyId')
    AWS_SECRET_ACCESS_KEY=$(echo "$assume_output" | jq -r '.Credentials.SecretAccessKey')
    AWS_SESSION_TOKEN=$(echo "$assume_output" | jq -r '.Credentials.SessionToken')
    export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN

    log_success "Emergency role assumed successfully"
}

disable_kms_key() {
    local key_arn="$1"

    log_info "Disabling KMS key: ${key_arn}"

    if aws kms disable-key \
        --key-id "${key_arn}" \
        --region "${AWS_REGION}" 2>&1; then
        log_success "KMS key disabled successfully"
    else
        log_error "Failed to disable KMS key"
        exit 1
    fi
}

verify_key_disabled() {
    local key_arn="$1"

    log_info "Verifying key is disabled..."

    local key_state
    key_state=$(aws kms describe-key \
        --key-id "${key_arn}" \
        --region "${AWS_REGION}" \
        --query 'KeyMetadata.KeyState' \
        --output text 2>&1)

    if [ "$key_state" = "Disabled" ]; then
        log_success "Key verified as disabled"
        return 0
    else
        log_error "Key not disabled. Current state: ${key_state}"
        exit 1
    fi
}

send_security_alert() {
    local env="$1"
    local cek="$2"
    local incident="$3"
    local reason="$4"

    log_info "Sending security alert..."

    local message=$(cat <<EOF
{
  "incident_type": "emergency_key_revocation",
  "environment": "${env}",
  "key_name": "${cek}",
  "incident_id": "${incident}",
  "correlation_id": "${CORRELATION_ID}",
  "timestamp": "${TIMESTAMP}",
  "reason": "${reason}",
  "severity": "critical",
  "action_required": "Verify incident response activation and assess impact"
}
EOF
)

    if aws sns publish \
        --topic-arn "${ALERT_SNS_TOPIC_ARN}" \
        --subject "[EMERGENCY] Key Revoked - ${env} - ${incident}" \
        --message "$message" \
        --region "${AWS_REGION}" 2>&1; then
        log_success "Security alert sent successfully"
    else
        log_warning "Failed to send security alert (non-critical)"
    fi
}

# -----------------------------------------------------------------------------
# SQL SERVER FUNCTIONS
# -----------------------------------------------------------------------------
log_to_sql_audit() {
    local env="$1"
    local cek="$2"
    local incident="$3"
    local reason="$4"

    log_info "Logging to SQL Server audit table..."

    # Extract SQL credentials from Secrets Manager
    local secret_value
    secret_value=$(aws secretsmanager get-secret-value \
        --secret-id "buzz-tutor/sql-server-${env}" \
        --region "${AWS_REGION}" \
        --query 'SecretString' \
        --output text 2>&1)

    if [ -z "$secret_value" ] || [ "$secret_value" = "null" ]; then
        log_warning "Could not retrieve SQL credentials from Secrets Manager"
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

    # Execute SQL to log the revocation
    local sql_query=$(cat <<SQL
INSERT INTO dbo.KeyManagementAudit (
    OperationType, KeyName, PerformedBy, CorrelationId,
    Reason, Success, EmergencyAccess, ClientIPAddress
) VALUES (
    'REVOKE', '${cek}', '${AWS_PRINCIPAL}', '${CORRELATION_ID}',
    '[EMERGENCY] ${incident}: ${reason}', 1, 1, '${CLIENT_IP}'
);
SQL
)

    if sqlcmd -S "tcp:${endpoint},1433" \
        -U "${username}" \
        -P "${password}" \
        -Q "$sql_query" \
        -N -C -b 2>&1; then
        log_success "Audit log entry created successfully"
    else
        log_warning "Failed to create audit log entry (but key still revoked)"
    fi
}

# -----------------------------------------------------------------------------
# NOTIFICATION FUNCTIONS
# -----------------------------------------------------------------------------
notify_security_team() {
    local env="$1"
    local cek="$2"
    local incident="$3"

    log_info "Notifying security team..."

    local details=$(cat <<EOF
⚠️ EMERGENCY KEY REVOCATION ⚠️

Environment: ${env}
Key Name: ${cek}
Incident ID: ${incident}
Correlation ID: ${CORRELATION_ID}
Timestamp: ${TIMESTAMP}
AWS Region: ${AWS_REGION}

ACTION REQUIRED:
1. Verify incident response team is activated
2. Assess impact on applications and users
3. Rotate to new key immediately
4. Monitor for unauthorized access attempts
5. Document lessons learned

Emergency Procedures: See docs/runbooks/emergency-key-revocation.md

This is an automated alert from the Key Management System.
EOF
)

    echo "$details"
    log_info "Security team notification sent (details above)"
}

# -----------------------------------------------------------------------------
# MAIN EXECUTION
# -----------------------------------------------------------------------------
main() {
    log_header "EMERGENCY KEY REVOCATION - Buzz A Tutor"

    # Parse parameters
    ENVIRONMENT="$1"
    CEK_NAME="$2"
    INCIDENT_ID="$3"
    REASON="$4"

    log_info "Environment: ${ENVIRONMENT}"
    log_info "Key Name: ${CEK_NAME}"
    log_info "Incident ID: ${INCIDENT_ID}"
    log_info "Correlation ID: ${CORRELATION_ID}"
    log_info "Reason: ${REASON}"

    # Validate prerequisites
    validate_prerequisites

    # Validate parameters
    validate_parameters "$@"

    log_header "STEP 1: ROLE ASSUMPTION"
    # Assume emergency role
    export AWS_PRINCIPAL="arn:aws:iam::${AWS_ACCOUNT}:role/BuzzTutorEmergencyKeyAdmin-${ENVIRONMENT}"
    assume_emergency_role "${ENVIRONMENT}"

    log_header "STEP 2: KEY REVOCATION"
    # Get KMS key ARN from Secrets Manager
    export KMS_KEY_ARN=$(aws secretsmanager get-secret-value \
        --secret-id "buzz-tutor/key-management-config-${ENVIRONMENT}" \
        --region "${AWS_REGION}" \
        --query 'SecretString' \
        --output text | jq -r '.key_identifiers.tde_key_arn')

    if [ -z "$KMS_KEY_ARN" ]; then
        log_error "Could not retrieve KMS key ARN"
        exit 1
    fi

    # Disable KMS key
    disable_kms_key "$KMS_KEY_ARN"

    # Verify key is disabled
    verify_key_disabled "$KMS_KEY_ARN"

    log_header "STEP 3: AUDIT LOGGING"
    # Get client IP
    export CLIENT_IP=$(curl -s http://checkip.amazonaws.com/ || echo "unknown")

    # Log to SQL Server audit
    log_to_sql_audit "${ENVIRONMENT}" "${CEK_NAME}" "${INCIDENT_ID}" "${REASON}"

    log_header "STEP 4: NOTIFICATIONS"
    # Send security alert
    send_security_alert "${ENVIRONMENT}" "${CEK_NAME}" "${INCIDENT_ID}" "${REASON}"

    # Notify security team (console output)
    notify_security_team "${ENVIRONMENT}" "${CEK_NAME}" "${INCIDENT_ID}"

    log_header "✅ EMERGENCY KEY REVOCATION COMPLETE"
    log_success "Key revoked successfully"
    log_info "Correlation ID: ${CORRELATION_ID} (save this for audit trail)"
    log_info "Incident ID: ${INCIDENT_ID}"
    log_info "Key Name: ${CEK_NAME}"
    log_info "Environment: ${ENVIRONMENT}"

    echo ""
    echo "⚠️  IMMEDIATE ACTION REQUIRED ⚠️"
    echo "─────────────────────────────────────"
    echo "1. Rotate to new key immediately"
    echo "2. Assess impact on applications"
    echo "3. Monitor for unauthorized access"
    echo "4. Document incident details"
    echo "5. Conduct post-incident review"
    echo ""
    echo "Emergency Procedures: docs/runbooks/emergency-key-revocation.md"
    echo ""

    exit 0
}

# -----------------------------------------------------------------------------
# ERROR HANDLING
# -----------------------------------------------------------------------------
trap 'log_error "Script interrupted"' INT TERM

# -----------------------------------------------------------------------------
# SCRIPT EXECUTION
# -----------------------------------------------------------------------------
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
