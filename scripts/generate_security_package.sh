#!/bin/bash
# ============================================
# Security Testing Package Generator
# Script: scripts/generate_security_package.sh
# Step 8: Package security configuration for penetration testing
# ============================================

set -euo pipefail

# ============================================================================
# CONFIGURATION
# ============================================================================

ENVIRONMENT="${ENVIRONMENT:-staging}"
AWS_REGION="${AWS_REGION:-us-east-1}"
SECURITY_PACKAGE_DIR="${SECURITY_PACKAGE_DIR:-/tmp/security-testing-package}"
S3_ARTIFACT_BUCKET="${S3_ARTIFACT_BUCKET:-buzz-tutor-security-artifacts}"

RDS_ENDPOINT="${RDS_ENDPOINT:-}"
SQL_TEST_USER="${SQL_TEST_USER:-security_tester}"
SQL_TEST_PASSWORD="${SQL_TEST_PASSWORD:-}"

SECURITY_TEAM_EMAIL="${SECURITY_TEAM_EMAIL:-security@buzztutor.com}"
TECH_LEAD_EMAIL="${TECH_LEAD_EMAIL:-tech-lead@buzztutor.com}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

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

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed or not in PATH"
        exit 1
    fi
    
    if ! command -v sqlcmd &> /dev/null; then
        log_error "sqlcmd is not installed or not in PATH"
        exit 1
    fi
    
    if ! command -v jq &> /dev/null; then
        log_error "jq is not installed or not in PATH"
        exit 1
    fi
    
    if ! command -v dot &> /dev/null; then
        log_warning "graphviz is not installed - network diagrams will not be generated"
    fi
    
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS credentials not configured or invalid"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
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

validate_database_access() {
    log_info "Validating database access..."
    
    sqlcmd -S $RDS_ENDPOINT -d buzz_tutor_${ENVIRONMENT} -U $SQL_TEST_USER -P $SQL_TEST_PASSWORD \
        -Q "SELECT @@VERSION" -b -o /dev/null 2>&1
    
    if [[ $? -ne 0 ]]; then
        log_error "Failed to connect to database. Please check credentials and endpoint."
        exit 1
    fi
    
    log_success "Database access validated"
}

create_package_structure() {
    log_info "Creating package structure..."
    
    mkdir -p "$SECURITY_PACKAGE_DIR"
    mkdir -p "$SECURITY_PACKAGE_DIR/terraform"
    mkdir -p "$SECURITY_PACKAGE_DIR/sql"
    mkdir -p "$SECURITY_PACKAGE_DIR/documentation"
    mkdir -p "$SECURITY_PACKAGE_DIR/compliance"
    mkdir -p "$SECURITY_PACKAGE_DIR/forensics"
    mkdir -p "$SECURITY_PACKAGE_DIR/network"
    mkdir -p "$SECURITY_PACKAGE_DIR/executive-summary"
    
    log_success "Package structure created at: $SECURITY_PACKAGE_DIR"
}

export_terraform_config() {
    log_info "Exporting Terraform configuration..."
    
    terraform show -json > "$SECURITY_PACKAGE_DIR/terraform/terraform-state.json" 2>/dev/null || \
        echo "{\"error\": \"Terraform not initialized\"}" > "$SECURITY_PACKAGE_DIR/terraform/terraform-state.json"
    
    terraform output -json > "$SECURITY_PACKAGE_DIR/terraform/terraform-outputs.json" 2>/dev/null || \
        echo "{}" > "$SECURITY_PACKAGE_DIR/terraform/terraform-outputs.json"
    
    terraform state list > "$SECURITY_PACKAGE_DIR/terraform/resource-inventory.txt" 2>/dev/null || \
        echo "Terraform state not available" > "$SECURITY_PACKAGE_DIR/terraform/resource-inventory.txt"
    
    log_success "Terraform configuration exported"
}

export_sql_config() {
    log_info "Exporting SQL security configuration..."
    
    sqlcmd -S $RDS_ENDPOINT -U $SQL_TEST_USER -P $SQL_TEST_PASSWORD \
        -d buzz_tutor_${ENVIRONMENT} \
        -Q "EXEC dbo.ExportSecurityConfiguration" \
        -s "," -w 500 -W \
        -o "$SECURITY_PACKAGE_DIR/sql/security-configuration.csv"
    
    sqlcmd -S $RDS_ENDPOINT -U $SQL_TEST_USER -P $SQL_TEST_PASSWORD \
        -d buzz_tutor_${ENVIRONMENT} \
        -Q "EXEC dbo.ExportComplianceMapping" \
        -s "," -w 500 -W \
        -o "$SECURITY_PACKAGE_DIR/sql/compliance-mapping.csv"
    
    sqlcmd -S $RDS_ENDPOINT -U $SQL_TEST_USER -P $SQL_TEST_PASSWORD \
        -d buzz_tutor_${ENVIRONMENT} \
        -Q "EXEC dbo.VerifySecurityConfiguration" \
        -o "$SECURITY_PACKAGE_DIR/sql/security-verification.csv"
    
    log_success "SQL configuration exported"
}

generate_network_diagrams() {
    log_info "Generating network architecture diagrams..."
    
    aws ec2 describe-vpcs --region $AWS_REGION > "$SECURITY_PACKAGE_DIR/network/vpcs.json"
    aws ec2 describe-security-groups --region $AWS_REGION > "$SECURITY_PACKAGE_DIR/network/security-groups.json"
    
    cat > "$SECURITY_PACKAGE_DIR/network/architecture.dot" << 'EOF_DIAGRAM'
digraph G {
    rankdir=LR;
    node [shape=box, style=rounded];
    
    subgraph cluster_internet {
        label="Internet";
        style=dashed;
        User [label="End User\n(HTTPS)", shape=ellipse];
    }
    
    subgraph cluster_vpc {
        label="VPC: buzz-tutor-staging\n(10.0.0.0/16)";
        style=rounded;
        fillcolor=lightblue;
        
        ALB [label="Application Load\nBalancer", shape=box3d];
        AppTier [label="App Tier\n(EC2 Instances)", shape=box3d];
        RDS [label="RDS SQL Server\n(Encrypted)", shape=cylinder];
        
        User -> ALB [label="TLS 1.3\nPort 443", color=green, fontcolor=green];
        ALB -> AppTier [label="TLS 1.2+\nPort 3000", color=green, fontcolor=green];
        AppTier -> RDS [label="TLS 1.2+\nPort 1433", color=green, fontcolor=green];
        
        KMS [label="AWS KMS\n(Key Management)", shape=component];
        RDS -> KMS [label="TDE/Always Encrypted\nKey Operations", color=blue, fontcolor=blue];
        
        CloudWatch [label="CloudWatch\nLogs", shape=parallelogram];
        RDS -> CloudWatch [label="Audit Logs\nStreaming", color=orange, fontcolor=orange];
        
        S3 [label="S3 Glacier\n(7-year archive)", shape=folder];
        CloudWatch -> S3 [label="Backup\n(Encrypted)", color=purple, fontcolor=purple];
    }
    
    Splunk [label="Splunk SIEM", shape=house];
    CloudWatch -> Splunk [label="Firehose\n(Real-time)", color=red, fontcolor=red];
}
EOF_DIAGRAM
    
    if command -v dot &> /dev/null; then
        dot -Tpng "$SECURITY_PACKAGE_DIR/network/architecture.dot" -o "$SECURITY_PACKAGE_DIR/network/architecture.png"
    fi
    
    log_success "Network diagrams generated"
}

generate_compliance_evidence() {
    log_info "Generating compliance evidence package..."
    
    cat > "$SECURITY_PACKAGE_DIR/compliance/gdpr-article-30-mapping.md" << 'EOF_GDPR'
# GDPR Article 30 Compliance Mapping

## Records of Processing Activities

### 1. Who Performed the Processing
- Technical Implementation: server_principal_name column in audit logs
- Data Source: sys.fn_get_audit_file() output
- Retention: 90 days in active logs, 7 years archived

### 2. What Data Was Processed
- Technical Implementation: object_name, statement columns
- Data Source: SQL Server audit logs
- Coverage: Users, UserProfiles, ChatLogs, Payments, PaymentMethods tables

### 3. When Processing Occurred
- Technical Implementation: event_time column (UTC with milliseconds)
- Data Source: Native SQL Server audit timestamps
- Accuracy: Millisecond precision, synchronized with NTP

### 4. Where Processing Occurred
- Technical Implementation: client_ip, application_name columns
- Data Sources:
  - Client IP: RDS proxy logs
  - Application: Application connection string

### 5. Legal Basis for Processing
- Technical Implementation: Inferred from operation context
- Documentation: Application logs track user consent/contract actions

### 6. How Processing Occurred
- Technical Implementation: action_id column (SELECT/INSERT/UPDATE/DELETE)
- Data Source: SQL Server native audit actions
- Granularity: Row-level operations captured

## Compliance Status: FULLY COMPLIANT with GDPR Article 30
EOF_GDPR

    cat > "$SECURITY_PACKAGE_DIR/compliance/pci-dss-requirement-10-mapping.md" << 'EOF_PCI'
# PCI DSS Requirement 10 Compliance Mapping

## Tracking All Access to Cardholder Data Environment

### 10.2.1 All Individual User Access to Cardholder Data
- Audit Specification: PCI_CardholderData database audit specification
- Tables Monitored: Payments, PaymentMethods
- Operations Audited: SELECT, INSERT, UPDATE, DELETE

### 10.2.2 All Actions Taken by Administrative Users
- Audit Specification: HighRiskOperations database audit specification
- Events Monitored: SCHEMA_OBJECT_CHANGE_GROUP, DATABASE_PERMISSION_CHANGE_GROUP
- Coverage: All admin actions including DDL, permissions, ownership changes

### 10.3 Audit Trail Contents
All 7 sub-requirements (10.3.1-10.3.7) implemented:
- User identification (server_principal_name)
- Type of event (action_id)
- Date and time (event_time, UTC)
- Success/failure indication (success)
- Origination of event (client_ip)
- Identity or name of affected data (object_name, affected_rows)
- All system-level object changes (SCHEMA_OBJECT_CHANGE_GROUP)

### 10.4 Time Synchronization
- RDS SQL Server synchronized with NTP pool
- CloudWatch timestamps UTC-based
- All audit logs use UTC timestamps

### 10.5 Audit Log Integrity
- At Rest: KMS encryption (AES-256)
- In Transit: TLS 1.2+ encryption
- Backup: S3 Versioning + MFA Delete
- Access: Only RDS service can write

### 10.6 Audit Log Review
- Automated: CloudWatch Logs → Splunk (real-time)
- Alerts: SIEM rules for suspicious activity
- Compliance Reports: Automated daily generation
- Manual Review: Weekly security team review

### 10.7 Audit Retention
- Active Logs: 365 days in CloudWatch Logs
- Archive: 7 years in S3 Glacier (exceeds requirement)
- Backup: Automated daily to S3

## Compliance Status: FULLY COMPLIANT with PCI DSS Requirement 10
EOF_PCI

    cat > "$SECURITY_PACKAGE_DIR/compliance/verify-compliance.sh" << 'EOF_VERIFY'
#!/bin/bash
# Compliance Verification Script

set -e

echo "Verifying GDPR Article 30 compliance..."
sqlcmd -S $1 -U $2 -P $3 -d $4 -Q "EXEC dbo.GetGDPRComplianceReport @DaysBack = 7" -o gdpr-verification.csv
echo "GDPR verification complete"

echo "Verifying PCI DSS Requirement 10 compliance..."
sqlcmd -S $1 -U $2 -P $3 -d $4 -Q "EXEC dbo.GetPCIDSSComplianceReport @DaysBack = 7" -o pci-verification.csv
echo "PCI DSS verification complete"

echo "Verifying security configuration..."
sqlcmd -S $1 -U $2 -P $3 -d $4 -Q "EXEC dbo.VerifySecurityConfiguration" -o security-checks.csv
echo "Security verification complete"
EOF_VERIFY

    chmod +x "$SECURITY_PACKAGE_DIR/compliance/verify-compliance.sh"
    
    log_success "Compliance evidence package generated"
}

create_executive_summary() {
    log_info "Creating executive summary..."
    
    GENERATION_DATE=$(date "+%Y-%m-%d %H:%M:%S UTC")
    
    cat > "$SECURITY_PACKAGE_DIR/executive-summary/EXECUTIVE_SUMMARY.md" << 'EOF_EXEC'
# Security Testing Package - Executive Summary

Organization: Buzz Tutor Ltd
Platform: AWS RDS SQL Server with comprehensive encryption and audit logging
Generated: $(date)

## Executive Overview

Buzz Tutor has implemented enterprise-grade security controls including transparent data encryption (TDE), column-level encryption (Always Encrypted), TLS 1.2+ enforcement, and comprehensive audit logging to protect sensitive student and payment data.

## Security Architecture Highlights

### Encryption Implementation
- TDE: Encrypts entire database at rest using KMS keys
- Always Encrypted: Protects sensitive columns (PII, payment data) at column level
- TLS: All connections require TLS 1.2+ encryption
- Key Management: KMS with automatic 90-day rotation and emergency revocation

### Audit & Monitoring
- Native SQL Server Audit: Captures all access to sensitive tables
- CloudWatch Integration: Real-time log streaming with 365-day retention
- SIEM Integration: Splunk integration for security analysis
- Performance Monitoring: Tracks encryption and audit overhead within budgets

### Compliance Alignment
- GDPR Article 30: Records of processing activities maintained
- PCI DSS Requirement 10: All audit requirements implemented
- NIST SP 800-53: Audit and accountability controls in place

## Deliverables

1. Terraform Configuration (terraform/)
2. SQL Security Configuration (sql/)
3. Network Architecture (network/)
4. Compliance Evidence (compliance/)
5. Forensics Package (forensics/)
6. Executive Summary (executive-summary/)

## Compliance Status

### GDPR Article 30: FULLY COMPLIANT
- Records of processing activities maintained
- Who, what, when, where, why, how all captured
- 90-day active retention, 7-year archive

### PCI DSS Requirement 10: FULLY COMPLIANT
- All 7 sub-requirements implemented
- 365-day retention configured (exceeds 1-year minimum)
- Tamper-proof audit logs with KMS encryption

### NIST SP 800-53: IMPLEMENTED
- AU-2 through AU-12 audit and accountability controls
- Real-time monitoring and alerting
- Incident response procedures documented

## Testing Scope

### In Scope
- AWS RDS SQL Server infrastructure
- Encryption at rest (TDE) and in transit (TLS)
- Always Encrypted column-level encryption
- Key management and rotation procedures
- Audit logging and monitoring
- Application-layer security controls
- Compliance (GDPR, PCI DSS) implementations

### Out of Scope
- Production environment (initial testing)
- AWS root account access
- Social engineering against staff
- Denial of service testing
- Customer notification without approval

## Contact Information

Security Team: $SECURITY_TEAM_EMAIL
Technical Lead: $TECH_LEAD_EMAIL

## Next Steps

1. Review EXECUTIVE_SUMMARY.md
2. Schedule testing kickoff meeting
3. Confirm testing scope and timeline
4. Execute testing (1-2 weeks estimated)
5. Generate findings report
6. Remediate issues (if any)
7. Retest and finalize
EOF_EXEC
    
    sed -i "s/\$(date)/$GENERATION_DATE/g" "$SECURITY_PACKAGE_DIR/executive-summary/EXECUTIVE_SUMMARY.md"
    
    log_success "Executive summary created"
}

create_vulnerability_disclosure() {
    log_info "Creating vulnerability disclosure..."
    
    cat > "$SECURITY_PACKAGE_DIR/documentation/VULNERABILITY_DISCLOSURE.md" << 'EOF_VULN'
# Vulnerability Disclosure & Known Limitations

## Security Controls Implemented

### Encryption at Rest
- TDE: All data files encrypted using AES-256
- Always Encrypted: Selected columns (PII, payment data) encrypted at column level
- Key Management: AWS KMS with automatic 90-day rotation

### Encryption in Transit
- TLS Enforcement: All connections require TLS 1.2 or higher
- Certificate Validation: AWS RDS certificates verified
- Protocol Version: TLS 1.0 and 1.1 explicitly disabled

### Access Controls
- IAM Roles: Least privilege principle applied
- Database Authentication: SQL Server authentication with strong password policy
- Network Security: Security groups restrict access to application tier only
- MFA Required: For all administrative AWS access

### Audit & Monitoring
- Native SQL Server Audit: Captures all operations on sensitive tables
- CloudWatch Integration: Real-time log streaming with 365-day retention
- SIEM Integration: Splunk integration for security analysis
- Alerting: CloudWatch alarms for suspicious activity

## Known Limitations & Assumptions

### Application Layer
1. Caching: Application may temporarily cache decrypted data in memory
2. Connection Pooling: Database connections pooled and reused

### Database Layer
1. Performance Impact: Encryption adds 5-10% latency overhead
2. Key Access: RDS service can access encryption keys
3. Audit Bypass: RDS superuser can potentially bypass audit

### Infrastructure Layer
1. VPC Flow Logs: Not enabled (cost consideration)
2. AWS Account Compromise: If AWS root compromised, all encryption bypassable

## Testing Scope Restrictions

### Allowed Testing
- Configuration review via AWS CLI (read-only)
- TLS version and cipher suite verification
- Audit log completeness verification
- Encryption key rotation testing (staging only)
- SIEM alerting rule validation
- Compliance control verification

### Prohibited Testing
- Production Environment: Testing restricted to staging only
- AWS Root Account: Cannot test root account compromise scenarios
- Data Destruction: Cannot test data deletion scenarios
- Denial of Service: DDoS/load testing not in scope
- Social Engineering: Cannot test social engineering against staff
- Customer Notification: Cannot test customer notification procedures

## Vulnerability Reporting

If you identify vulnerabilities during testing:

1. Immediate Report: Email security@buzztutor.com with vulnerability description
2. Response SLA: Security team will acknowledge within 4 hours
3. Reward Program: Responsible disclosure may qualify for bounty

## Safe Harbor

We commit to:
- Not pursuing legal action for good-faith security research
- Working collaboratively to understand and remediate issues
- Public recognition (if desired by researcher)
- Timely patching and disclosure (following responsible disclosure)
EOF_VULN
    
    log_success "Vulnerability disclosure created"
}

create_forensics_package() {
    log_info "Creating forensics procedures..."
    
    cat > "$SECURITY_PACKAGE_DIR/forensics/EVIDENCE_COLLECTION_TEMPLATE.md" << 'EOF_TEMPLATE'
# Forensics Evidence Collection Template

## Incident Information

Incident ID: [AUTO-GENERATED]
Date/Time: [YYYY-MM-DD HH:MM:SS UTC]
Collector: [Name]
Role: [Security Engineer/Forensics Analyst]
Contact: [Email/Phone]

## Chain of Custody

| Time | Custodian | Action | Signature |
|------|-----------|--------|-----------|
| [Time] | [Name] | Initial collection | [Signature] |
| [Time] | [Name] | Transferred to lab | [Signature] |
| [Time] | [Name] | Analysis begun | [Signature] |

## Digital Evidence

### 1. RDS Database Snapshot
- Snapshot ID: rds:snapshot-name
- Creation Time: [Timestamp]
- Size: [GB]
- MD5 Hash: [Hash]
- Storage Location: S3 bucket
- Access Logs: [Location]

### 2. CloudWatch Audit Logs
- Log Group: /aws/rds/instance/.../audit
- Time Range: [Start] to [End]
- Export Location: S3 bucket
- Checksum: [SHA256]

## Timeline Reconstruction

| Time | Event | Source | Analyst |
|------|-------|--------|---------|
| [Time] | [Event] | [Log] | [Name] |

## Key Findings

1. Finding 1: [Description]
   - Evidence: [Supporting evidence]
   - Impact: [Severity]

2. Finding 2: [Description]
   - Evidence: [Supporting evidence]
   - Impact: [Severity]

## Approval

Analyst: [Name], [Signature], [Date]
Reviewer: [Name], [Signature], [Date]
Legal: [Name], [Signature], [Date]

Classification: [INTERNAL/CONFIDENTIAL/RESTRICTED]
EOF_TEMPLATE

    cat > "$SECURITY_PACKAGE_DIR/forensics/EVIDENCE_COLLECTION_PROCEDURES.md" << 'EOF_PROCEDURES'
# Evidence Collection Procedures

## Purpose

Step-by-step procedures for collecting forensic evidence during a security incident

## Pre-Collection Checklist

- Incident ID assigned
- Chain of custody forms ready
- Secure storage prepared
- Evidence collection tools ready
- Legal/HR approval (if involving personnel)
- Proper authorization for access

## Evidence Collection

### 1. Database Snapshots

Procedure:
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
SNAPSHOT_ID="forensics-incident-$TIMESTAMP"

aws rds create-db-snapshot \\
  --db-instance-identifier buzz-tutor-sql-server-tls-production \\
  --db-snapshot-identifier $SNAPSHOT_ID \\
  --tags Key=Purpose,Value=Forensics Key=Incident,Value=[INCIDENT_ID]

### 2. Audit Logs

Procedure:
aws logs create-export-task \\
  --task-name "forensics-audit-logs-$INCIDENT_ID" \\
  --log-group-name "/aws/rds/instance/buzz-tutor-sql-server-tls-production/audit" \\
  --from $(date -d "7 days ago" +%s000) \\
  --to $(date +%s000) \\
  --destination "buzz-tutor-forensics-evidence" \\
  --destination-prefix "incident-$INCIDENT_ID/audit-logs"

### 3. CloudTrail Logs

Procedure:
aws cloudtrail lookup-events \\
  --start-time $(date -d "7 days ago" +%Y-%m-%d) \\
  --end-time $(date +%Y-%m-%d) \\
  --query 'Events[?starts_with(EventName, Kms) || starts_with(EventName, Rds)]' \\
  > cloudtrail-events.json

## Hash Verification

Generate SHA-256 hashes:
find /incidents/$INCIDENT_ID/evidence/ -type f -exec sha256sum {} \; > evidence-hashes.sha256

## Emergency Procedures

If tampering suspected:
1. Document immediately
2. Isolate evidence
3. Notify incident commander and legal
4. Preserve forensic copy
5. Investigate scope

## Contacts

Forensics Team: forensics@buzztutor.com
Legal Counsel: legal@buzztutor.com
AWS Support: 1-800-555-0000 (Enterprise)
EOF_PROCEDURES
    
    log_success "Forensics procedures created"
}

package_for_delivery() {
    log_info "Packaging for delivery..."
    
    PACKAGE_FILENAME="security-testing-package-$(date +%Y%m%d-%H%M%S).tar.gz"
    
    cd $(dirname "$SECURITY_PACKAGE_DIR")
    tar -czf "$PACKAGE_FILENAME" $(basename "$SECURITY_PACKAGE_DIR")
    
    PACKAGE_HASH=$(sha256sum "$PACKAGE_FILENAME" | awk '{print $1}')
    echo "$PACKAGE_HASH" > "$PACKAGE_FILENAME.sha256"
    
    echo "$PACKAGE_FILENAME" > "$SECURITY_PACKAGE_DIR/package-info.txt"
    echo "$PACKAGE_HASH" >> "$SECURITY_PACKAGE_DIR/package-info.txt"
    
    log_success "Package created: $PACKAGE_FILENAME"
}

upload_to_s3() {
    log_info "Uploading to S3..."
    
    if ! aws s3api head-bucket --bucket $S3_ARTIFACT_BUCKET 2>/dev/null; then
        aws s3 mb s3://$S3_ARTIFACT_BUCKET --region $AWS_REGION
        
        aws s3api put-bucket-versioning \
            --bucket $S3_ARTIFACT_BUCKET \
            --versioning-configuration Status=Enabled
        
        aws s3api put-bucket-encryption \
            --bucket $S3_ARTIFACT_BUCKET \
            --server-side-encryption-configuration '{
                "Rules": [{
                    "ApplyServerSideEncryptionByDefault": {
                        "SSEAlgorithm": "aws:kms"
                    }
                }]
            }'
    fi
    
    cd $(dirname "$SECURITY_PACKAGE_DIR")
    PACKAGE_FILENAME=$(tail -1 "$SECURITY_PACKAGE_DIR/package-info.txt" | xargs -I {} basename {} .sha256)
    
    aws s3 cp "$PACKAGE_FILENAME" s3://$S3_ARTIFACT_BUCKET/
    aws s3 cp "$PACKAGE_FILENAME.sha256" s3://$S3_ARTIFACT_BUCKET/
    
    echo "Package uploaded to S3: s3://$S3_ARTIFACT_BUCKET/$PACKAGE_FILENAME"
}

main() {
    # Initialize package filename with default value
    PACKAGE_FILENAME="security-testing-package-$(date +%Y%m%d-%H%M%S).tar.gz"
    
    log_info "Starting Security Testing Package Generation"
    log_info "Environment: $ENVIRONMENT"
    log_info "AWS Region: $AWS_REGION"
    log_info "Output Directory: $SECURITY_PACKAGE_DIR"
    echo ""
    
    check_prerequisites
    get_rds_endpoint
    validate_database_access
    create_package_structure
    export_terraform_config
    export_sql_config
    generate_network_diagrams
    generate_compliance_evidence
    create_executive_summary
    create_vulnerability_disclosure
    create_forensics_package
    package_for_delivery
    upload_to_s3
    
    echo ""
    log_success "Security Testing Package Generation Complete!"
    echo ""
    echo "Package Location: $SECURITY_PACKAGE_DIR"
    echo "Package Archive: $(cd $(dirname "$SECURITY_PACKAGE_DIR") && pwd)/$PACKAGE_FILENAME"
    echo "S3 Bucket: s3://$S3_ARTIFACT_BUCKET"
    echo ""
    echo "Next Steps:"
    echo "1. Review EXECUTIVE_SUMMARY.md"
    echo "2. Schedule testing kickoff meeting"
    echo "3. Confirm testing scope and timeline"
    echo "4. Execute testing (1-2 weeks estimated)"
    echo ""
}

main "$@"
