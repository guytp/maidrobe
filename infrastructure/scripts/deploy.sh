#!/bin/bash
# ============================================
# Buzz A Tutor RDS SQL Server TDE Deployment
# ============================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="${SCRIPT_DIR}/../terraform"

# Configuration
ENVIRONMENT="${1:-}"
if [[ -z "${ENVIRONMENT}" ]]; then
    echo -e "${RED}❌ Error: Environment not specified${NC}"
    echo "Usage: ./deploy.sh <staging|production>"
    exit 1
fi

if [[ ! "${ENVIRONMENT}" =~ ^(staging|production)$ ]]; then
    echo -e "${RED}❌ Error: Invalid environment '${ENVIRONMENT}'${NC}"
    echo "Valid environments: staging, production"
    exit 1
fi

# Terraform variables file
VARS_FILE="${TERRAFORM_DIR}/terraform.tfvars"

# Functions
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

# Pre-deployment checks
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check Terraform
    if ! command -v terraform &> /dev/null; then
        log_error "Terraform not found. Please install Terraform >= 1.0"
        exit 1
    fi

    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI not found. Please install and configure AWS CLI"
        exit 1
    fi

    # Check if AWS credentials are configured
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS credentials not configured. Please run 'aws configure'"
        exit 1
    fi

    # Check if vars file exists
    if [[ ! -f "${VARS_FILE}" ]]; then
        log_error "Terraform variables file not found: ${VARS_FILE}"
        echo "Please create terraform/terraform.tfvars with required variables"
        exit 1
    fi

    # Check for required variables
    if ! grep -q "password" "${VARS_FILE}"; then
        log_warning "SQL Server passwords not found in ${VARS_FILE}"
        log_info "Set TF_VAR_sql_server_credentials_${ENVIRONMENT}_password environment variable"
    fi

    log_success "Prerequisites check passed"
}

# Deploy infrastructure
deploy_terraform() {
    log_info "Initializing Terraform..."

    cd "${TERRAFORM_DIR}"

    # Initialize
    terraform init -upgrade

    log_success "Terraform initialized"

    # Plan
    log_info "Running Terraform plan..."

    terraform plan \
        -var-file="terraform.tfvars" \
        -out=tfplan \
        -target=aws_kms_key.buzz_tutor_tde \
        -target=aws_iam_role.buzz_tutor_rds_role \
        -target=aws_db_instance.buzz_tutor_sql_server

    if [[ $? -ne 0 ]]; then
        log_error "Terraform plan failed"
        exit 1
    fi

    log_success "Plan successful"

    # Confirm deployment
    echo ""
    log_warning "Ready to deploy infrastructure for ${ENVIRONMENT}"
    read -p "Do you want to continue? (y/N): " -n 1 -r
    echo ""

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Deployment cancelled"
        exit 0
    fi

    # Apply
    log_info "Applying Terraform changes..."

    terraform apply tfplan

    if [[ $? -ne 0 ]]; then
        log_error "Terraform apply failed"
        exit 1
    fi

    log_success "Terraform apply successful"

    # Clean up
    rm -f tfplan

    cd - > /dev/null
}

# Wait for RDS instance to be available
wait_for_rds() {
    log_info "Waiting for RDS instance to be available..."

    local instance_identifier="buzz-tutor-sql-server-${ENVIRONMENT}"

    aws rds wait db-instance-available \
        --db-instance-identifier "${instance_identifier}"

    log_success "RDS instance is available"
}

# Verify encryption
verify_encryption() {
    log_info "Verifying TDE encryption..."

    "${SCRIPT_DIR}/verify-tde.sh" "${ENVIRONMENT}"

    if [[ $? -ne 0 ]]; then
        log_error "Encryption verification failed"
        exit 1
    fi

    log_success "Encryption verification passed"
}

# Configure backups
configure_backups() {
    log_info "Configuring backup settings..."

    local instance_identifier="buzz-tutor-sql-server-${ENVIRONMENT}"
    local retention_days=$([[ "${ENVIRONMENT}" == "production" ]] && echo "30" || echo "7")

    aws rds modify-db-instance \
        --db-instance-identifier "${instance_identifier}" \
        --backup-retention-period "${retention_days}" \
        --apply-immediately \
        --no-cli-pager > /dev/null

    log_success "Backup retention set to ${retention_days} days"
}

# Create manual backup
create_initial_backup() {
    log_info "Creating initial backup..."

    local instance_identifier="buzz-tutor-sql-server-${ENVIRONMENT}"
    local snapshot_name="${instance_identifier}-initial-$(date +%Y%m%d-%H%M%S)"

    aws rds create-db-snapshot \
        --db-instance-identifier "${instance_identifier}" \
        --db-snapshot-identifier "${snapshot_name}" \
        --tags Key=Purpose,Value=InitialBackup Key=Environment,Value="${ENVIRONMENT}" \
        --no-cli-pager > /dev/null

    log_info "Waiting for snapshot to complete..."
    aws rds wait db-snapshot-available \
        --db-snapshot-identifier "${snapshot_name}"

    log_success "Initial backup created: ${snapshot_name}"
}

# Deploy CloudWatch alarms
deploy_alarms() {
    log_info "Deploying CloudWatch alarms..."

    cd "${TERRAFORM_DIR}"

    terraform apply \
        -var-file="terraform.tfvars" \
        -target=aws_cloudwatch_metric_alarm.cpu_high \
        -target=aws_cloudwatch_metric_alarm.read_latency_high \
        -target=aws_cloudwatch_metric_alarm.backup_failed \
        -auto-approve

    if [[ $? -ne 0 ]]; then
        log_warning "Failed to deploy some alarms (non-critical)"
    else
        log_success "CloudWatch alarms deployed"
    fi

    cd - > /dev/null
}

# Display deployment summary
show_summary() {
    log_info "Deployment Summary"
    echo "=================="
    echo ""

    cd "${TERRAFORM_DIR}"

    # Get outputs
    local endpoint=$(terraform output -json rds_instance_details | jq -r ".${ENVIRONMENT}.endpoint")
    local kms_key=$(terraform output -json kms_key_details | jq -r ".${ENVIRONMENT}.arn")
    local instance_class=$(terraform output -json rds_instance_details | jq -r ".${ENVIRONMENT}.instance_class")

    cd - > /dev/null

    echo -e "${GREEN}Environment:${NC}       ${ENVIRONMENT}"
    echo -e "${GREEN}Instance:${NC}           ${instance_class}"
    echo -e "${GREEN}Endpoint:${NC}           ${endpoint}"
    echo -e "${GREEN}KMS Key:${NC}            ${kms_key}"
    echo -e "${GREEN}Encryption:${NC}         Enabled (TDE)"
    echo -e "${GREEN}Backup Retention:${NC}   $([[ "${ENVIRONMENT}" == "production" ]] && echo "30 days" || echo "7 days")"
    echo ""

    log_success "🎉 Deployment completed successfully!"
    echo ""
    log_info "Next steps:"
    echo "  1. Run database migrations"
    echo "  2. Configure Always Encrypted columns"
    echo "  3. Update application connection strings"
    echo "  4. Test encryption (run verify-tde.sh)"
    echo "  5. Set up monitoring dashboards"
}

# Main execution
main() {
    echo ""
    echo "=========================================="
    echo "Buzz A Tutor RDS SQL Server TDE Deployment"
    echo "Environment: ${ENVIRONMENT}"
    echo "=========================================="
    echo ""

    check_prerequisites
    deploy_terraform
    wait_for_rds
    verify_encryption
    configure_backups
    create_initial_backup
    deploy_alarms
    show_summary

    echo ""
    log_info "Deployment logs available at: /var/log/buzz-tutor-deploy.log"
}

# Run main function
main
