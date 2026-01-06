#!/bin/bash
# ============================================
# Emergency Key Rotation Script
# Rotates KMS keys in case of security incident
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
REASON="${2:-Security incident - key compromise suspected}"
TERRAFORM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform" && pwd)"

if [[ -z "${ENVIRONMENT}" ]]; then
    echo "❌ Environment not specified"
    echo "Usage: ./rotate-keys.sh <staging|production> [reason]"
    exit 1
fi

INSTANCE_IDENTIFIER="buzz-tutor-sql-server-${ENVIRONMENT}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Logging
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

# Confirm emergency rotation
confirm_rotation() {
    log_warning "=========================================="
    log_warning "⚠️  EMERGENCY KEY ROTATION"
    log_warning "=========================================="
    echo ""
    log_warning "This is a critical operation!"
    echo ""
    log_info "Environment: ${ENVIRONMENT}"
    log_info "Reason: ${REASON}"
    log_info "Timestamp: ${TIMESTAMP}"
    echo ""
    log_warning "Consequences:"
    echo "  - Old key version will be disabled"
    echo "  - New key version will be activated"
    echo "  - Re-encryption of data will be required"
    echo "  - Brief performance impact expected"
    echo ""

    read -p "Are you sure you want to proceed? (type YES to confirm): " -r
    echo ""

    if [[ $REPLY != "YES" ]]; then
        log_info "Key rotation cancelled"
        exit 0
    fi
}

# Get current KMS key
get_kms_key() {
    log_info "Retrieving KMS key for ${ENVIRONMENT}..."

    local kms_key_id=$(aws rds describe-db-instances \
        --db-instance-identifier "${INSTANCE_IDENTIFIER}" \
        --query 'DBInstances[0].KmsKeyId' \
        --output text \
        2>/dev/null || echo "")

    if [[ -z "${kms_key_id}" ]]; then
        log_error "Failed to get KMS key ID"
        exit 1
    fi

    echo "${kms_key_id}"
}

# Schedule key deletion (emergency revocation)
revoke_key() {
    local kms_key_id=$1
    local old_key_id=$(basename "${kms_key_id}")

    log_info "Revoking old KMS key..."
    log_warning "Key ID: ${old_key_id}"

    # Disable the key first
    aws kms disable-key \
        --key-id "${kms_key_id}" \
        --no-cli-pager

    if [[ $? -ne 0 ]]; then
        log_error "Failed to disable KMS key"
        exit 1
    fi

    log_success "Key disabled successfully"

    # Schedule deletion (7-day window for recovery)
    aws kms schedule-key-deletion \
        --key-id "${kms_key_id}" \
        --pending-window-in-days 7 \
        --no-cli-pager

    if [[ $? -ne 0 ]]; then
        log_error "Failed to schedule key deletion"
        exit 1
    fi

    log_success "Key deletion scheduled (7-day window)"

    # Log to audit trail
    log_key_revocation "${old_key_id}"
}

# Create new KMS key
create_new_key() {
    log_info "Creating new KMS key for ${ENVIRONMENT}..."

    cd "${TERRAFORM_DIR}"

    # Force recreation of KMS key
    terraform taint "aws_kms_key.buzz_tutor_tde[\"${ENVIRONMENT}\"]"

    log_info "Applying Terraform changes..."

    terraform apply \
        -var-file="terraform.tfvars" \
        -target aws_kms_key.buzz_tutor_tde[\"${ENVIRONMENT}\"] \
        -target aws_kms_alias.buzz_tutor_tde_alias[\"${ENVIRONMENT}\"] \
        -auto-approve

    if [[ $? -ne 0 ]]; then
        log_error "Failed to create new KMS key"
        exit 1
    fi

    local new_key_id=$(terraform output -json kms_key_details | jq -r ".${ENVIRONMENT}.key_id")

    log_success "New KMS key created: ${new_key_id}"

    cd - > /dev/null

    echo "${new_key_id}"
}

# Update RDS instance with new key
update_rds_key() {
    local new_key_id=$1

    log_info "Updating RDS instance with new KMS key..."

    # Note: RDS doesn't allow in-place KMS key change
    # Must restore from encrypted snapshot

    log_info "Creating snapshot with new encryption..."

    local temp_snapshot="${INSTANCE_IDENTIFIER}-rotation-$(date +%Y%m%d-%H%M%S)"

    aws rds create-db-snapshot \
        --db-instance-identifier "${INSTANCE_IDENTIFIER}" \
        --db-snapshot-identifier "${temp_snapshot}" \
        --no-cli-pager > /dev/null

    log_info "Waiting for snapshot..."
    aws rds wait db-snapshot-available \
        --db-snapshot-identifier "${temp_snapshot}"

    log_success "Snapshot created"

    log_warning "⚠️  Manual intervention required for RDS key change"
    log_info "RDS instances cannot change KMS keys in-place"
    echo ""
    log_info "Please follow these steps:"
    echo "  1. Restore snapshot to new instance with new key"
    echo "  2. Update application connection strings"
    echo "  3. Test thoroughly before deletion"
    echo "  4. Delete old instance after verification"
    echo ""

    # Document in incident report
    cat > "key-rotation-${ENVIRONMENT}-${TIMESTAMP}.md" <<EOF
# Emergency Key Rotation - ${ENVIRONMENT}

## Incident Details
- Environment: ${ENVIRONMENT}
- Reason: ${REASON}
- Timestamp: ${TIMESTAMP}
- Old Key: ${old_key_id}
- New Key: ${new_key_id}

## Required Actions
1. Restore RDS from snapshot: ${temp_snapshot}
2. Use new KMS key: ${new_key_id}
3. Update application configs
4. Re-encrypt Always Encrypted columns
5. Test application functionality
6. Delete old RDS instance (after 24h)

## Verification Steps
- [ ] New instance responds to queries
- [ ] Always Encrypted columns accessible
- [ ] Application performance normal
- [ ] Monitoring working correctly
- [ ] Backup encryption verified

EOF

    log_success "Incident report generated: key-rotation-${ENVIRONMENT}-${TIMESTAMP}.md"
}

# Log key revocation to audit trail
log_key_revocation() {
    local old_key_id=$1

    log_info "Logging key revocation to audit trail..."

    # Get current user
    local user_arn=$(aws sts get-caller-identity \
        --query 'Arn' \
        --output text)

    # Create audit log entry
    cat > "key-revocation-audit-${ENVIRONMENT}-${TIMESTAMP}.json" <<EOF
{
  "timestamp": "${TIMESTAMP}",
  "environment": "${ENVIRONMENT}",
  "event": "emergency_key_revocation",
  "reason": "${REASON}",
  "oldKeyId": "${old_key_id}",
  "performedBy": "${user_arn}",
  "incidentId": "INC-$(date +%Y%m%d)-$(openssl rand -hex 4 | tr '[:lower:]' '[:upper:]')"
}
EOF

    log_success "Audit log created"
}

# Notify security team
notify_security_team() {
    log_info "Notifying security team..."

    local sns_topic=$(aws sns list-topics \
        --query 'Topics[?contains(TopicArn, `security-alerts`)].TopicArn' \
        --output text \
        2>/dev/null || echo "")

    if [[ -n "${sns_topic}" ]]; then
        aws sns publish \
            --topic-arn "${sns_topic}" \
            --subject "URGENT: KMS Key Revocation - ${ENVIRONMENT}" \
            --message "Emergency key rotation initiated for ${ENVIRONMENT} environment.

Reason: ${REASON}
Timestamp: ${TIMESTAMP}
Incident ID: INC-$(date +%Y%m%d)-$(openssl rand -hex 4 | tr '[:lower:]' '[:upper:]')

Action Required:
1. Review incident report
2. Monitor new key usage
3. Verify application functionality
4. Complete re-encryption process

This is an automated alert from the emergency key rotation script."

        log_success "Security team notified via SNS"
    else
        log_warning "Security SNS topic not found - manual notification required"
    fi
}

# Verify new key
verify_new_key() {
    local new_key_id=$1

    log_info "Verifying new KMS key..."

    # Check key is enabled
    local key_state=$(aws kms describe-key \
        --key-id "${new_key_id}" \
        --query 'KeyMetadata.KeyState' \
        --output text \
        2>/dev/null || echo "ERROR")

    if [[ "${key_state}" == "Enabled" ]]; then
        log_success "New key is enabled and ready"
    else
        log_error "New key verification failed (state: ${key_state})"
        exit 1
    fi

    # Check rotation status
    local rotation_enabled=$(aws kms get-key-rotation-status \
        --key-id "${new_key_id}" \
        --query 'KeyRotationEnabled' \
        --output text \
        2>/dev/null || echo "False")

    if [[ "${rotation_enabled}" == "True" ]]; then
        log_success "Key rotation schedule configured"
    else
        log_warning "Key rotation not enabled on new key"
    fi
}

# Main execution
main() {
    echo ""
    echo "=========================================="
    echo "Emergency Key Rotation"
    echo "Environment: ${ENVIRONMENT}"
    echo "=========================================="
    echo ""

    confirm_rotation

    local old_key_id=$(get_kms_key)
    log_info "Current KMS key: $(basename "${old_key_id}")"

    revoke_key "${old_key_id}"

    local new_key_id=$(create_new_key)
    verify_new_key "${new_key_id}"

    update_rds_key "${new_key_id}"
    notify_security_team

    echo ""
    log_success "Emergency key rotation initiated"
    echo ""
    log_warning "⚠️  Manual steps required to complete rotation"
    echo "Follow the incident report: key-rotation-${ENVIRONMENT}-*.md"
}

# Run main function
main
