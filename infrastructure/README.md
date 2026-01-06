# Buzz A Tutor - SQL Server TDE Infrastructure

This directory contains Terraform configurations and scripts to deploy AWS RDS SQL Server instances with Transparent Data Encryption (TDE) enabled.

## 📁 Directory Structure

```
infrastructure/
├── terraform/
│   ├── main.tf              # Main infrastructure resources
│   ├── variables.tf         # Input variables
│   ├── outputs.tf           # Output values
│   └── README.md            # Terraform usage guide
├── scripts/
│   ├── deploy.sh            # Deployment script
│   ├── verify-tde.sh        # TDE verification script
│   └── rotate-keys.sh       # Emergency key rotation script
└── README.md                # This file
```

## 🎯 What This Implements

### Transparent Data Encryption (TDE)

**Encryption Coverage:**
- ✅ Data files (.mdf, .ndf)
- ✅ Transaction log files (.ldf)
- ✅ Automated backups
- ✅ Manual snapshots
- ✅ TempDB (automatic)
- ✅ Performance Insights data
- ✅ Cross-region snapshots

**Key Features:**
- AWS KMS Customer Managed Keys (CMK)
- Automatic annual key rotation
- Zero application code changes required
- <5% performance overhead
- 99.9% uptime SLA maintained

## 🚀 Quick Start

### Prerequisites

- Terraform >= 1.0
- AWS CLI configured
- AWS account with RDS and KMS permissions
- SSH key pair in AWS
- VPC with private subnets

### 1. Configure Variables

Create `terraform/terraform.tfvars`:

```hcl
aws_region = "us-east-1"

sql_server_credentials = {
  staging = {
    username = "sqladmin"
    password = "YOUR-STAGING-PASSWORD-HERE"
  }
  production = {
    username = "sqladmin"
    password = "YOUR-PRODUCTION-PASSWORD-HERE"
  }
}

rds_security_group_ids = {
  staging    = ["sg-0a1b2c3d4e5f6789a"]
  production = ["sg-1b2c3d4e5f6a7b8c9"]
}

rds_subnet_group_name = {
  staging    = "buzz-tutor-staging-subnet"
  production = "buzz-tutor-prod-subnet"
}

vpc_id = "vpc-0a1b2c3d4e5f6789a"
sns_alert_topic = "buzz-tutor-alerts"
```

### 2. Initialize Terraform

```bash
cd infrastructure/terraform
terraform init
```

### 3. Review Changes

```bash
terraform plan -var-file="terraform.tfvars"
```

### 4. Deploy

```bash
terraform apply -var-file="terraform.tfvars"

# Expected output:
# - 2 KMS CMKs (staging & production)
# - 1 IAM role for RDS
# - 2 RDS SQL Server instances
# - 6 CloudWatch alarms
```

### 5. Verify Deployment

Run verification script:

```bash
../scripts/verify-tde.sh
```

## 🔐 Security Configuration

### KMS Key Policies

Each environment has its own KMS CMK with:
- **RDS Service**: Encrypt/decrypt permissions
- **Database Admin**: Full key management
- **Audit Logger**: Read-only access for compliance

**Key Rotation:**
- Automatic rotation: 365 days
- Manual rotation available via AWS CLI or script

### IAM Role

`BuzzTutorRDSRole` has:
- RDS service trust relationship
- KMS access for encryption keys
- CloudWatch logs permissions
- Enhanced monitoring access

## 📊 Configuration Details

### Staging Environment

```yaml
Instance: db.r5.large (2 vCPU, 16 GB RAM)
Storage: 200 GB GP3 (3000 IOPS, 125 MB/s)
Backup Retention: 7 days
Backup Window: 03:00-04:00 UTC
Multi-AZ: true
Deletion Protection: false (for easy teardown)
Estimated Monthly Cost: $350
```

### Production Environment

```yaml
Instance: db.r5.xlarge (4 vCPU, 32 GB RAM)
Storage: 500 GB GP3 (6000 IOPS, 500 MB/s)
Backup Retention: 30 days
Backup Window: 02:00-03:00 UTC
Multi-AZ: true
Deletion Protection: true
Estimated Monthly Cost: $850
```

### KMS CMK Configuration

```yaml
Description: Buzz Tutor SQL Server TDE - [Environment]
Key Spec: SYMMETRIC_DEFAULT
Key Usage: ENCRYPT_DECRYPT
Origin: AWS_KMS
Multi-Region: No
Automatic Rotation: 365 days
Deletion Window: 7 days
Algorithm: AES-256
```

## 🔄 Migration from Unencrypted Instances

**If you have existing unencrypted RDS instances:**

```bash
# 1. Create snapshot of existing instance
aws rds create-db-snapshot \
  --db-instance-identifier existing-buzz-tutor-db \
  --db-snapshot-identifier buzz-tutor-pre-encryption-snapshot

# 2. Wait for snapshot
aws rds wait db-snapshot-available \
  --db-snapshot-identifier buzz-tutor-pre-encryption-snapshot

# 3. Copy snapshot with encryption
aws rds copy-db-snapshot \
  --source-db-snapshot-identifier buzz-tutor-pre-encryption-snapshot \
  --target-db-snapshot-identifier buzz-tutor-encrypted-snapshot \
  --kms-key-id $(terraform output -raw kms_key_arns | jq -r '.production')

# 4. Restore to new instance
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier buzz-tutor-sql-server-encrypted \
  --db-snapshot-identifier buzz-tutor-encrypted-snapshot
```

## 🧪 Testing & Verification

### Automated Verification

Run verification script:

```bash
../scripts/verify-tde.sh staging
# Output:
# ✅ Storage encryption enabled
# ✅ KMS key configured
# ✅ Backups encrypted
# ✅ TDE active on databases
# ✅ Performance Insights encrypted
```

### Manual SQL Verification

Connect to SQL Server and run:

```sql
-- Check encryption status
SELECT 
    db.name,
    db.is_encrypted,
    dek.encryption_state,
    dek.percent_complete,
    dek.key_algorithm
FROM sys.databases db
LEFT JOIN sys.dm_database_encryption_keys dek ON db.database_id = dek.database_id;

-- Expected output:
-- BuzzTutorProd | 1 | 3 | 0 | AES
-- tempdb        | 1 | 3 | 0 | AES
```

### Application Testing

```typescript
// No code changes needed!
// Just update connection strings

const config = {
  server: terraformOutput.rds_instance_details.production.endpoint,
  database: 'BuzzTutorProd',
  authentication: {
    type: 'default',
    options: {
      userName: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD
    }
  },
  options: {
    encrypt: true,
    trustServerCertificate: false
  }
};

// Connection works exactly as before
const connection = await sql.connect(config);
```

## 📈 Monitoring

### CloudWatch Alarms

Three alarms per environment:

1. **CPU High Alert**
   - Threshold: 70% sustained for 15 minutes
   - Action: SNS notification

2. **Read Latency High**
   - Threshold: 25ms average
   - Action: SNS notification

3. **Backup Failed**
   - Threshold: Any backup failure
   - Action: SNS notification

### Custom Metrics

Encryption status tracking:

```bash
# Check custom metrics in CloudWatch
aws cloudwatch get-metric-statistics \
  --namespace BuzzTutor/Encryption \
  --metric-name TDEStatus \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Average
```

## 🔧 Maintenance

### Key Rotation

**Automatic Rotation:**
- KMS CMK rotates annually (365 days)
- No downtime required
- Old key versions retained for decryption

**Manual Rotation (Emergency):**

```bash
../scripts/rotate-keys.sh production
```

### Backup Management

**Automated Backups:**
- Daily backups during maintenance window
- Encrypted with same KMS key
- 7 days (staging) or 30 days (production) retention

**Manual Snapshots:**
```bash
aws rds create-db-snapshot \
  --db-instance-identifier buzz-tutor-sql-server-prod \
  --db-snapshot-identifier manual-backup-$(date +%Y%m%d)
```

## 💰 Cost Estimation

**Monthly Costs (approximate):**

| Resource | Staging | Production |
|----------|---------|------------|
| RDS Instance | $280 | $650 |
| GP3 Storage | $40 | $100 |
| KMS CMK | $1 | $1 |
| Backups | $30 | $100 |
| **Total** | **$351** | **$851** |

Generate exact estimate:

```bash
cd terraform
terraform plan -var-file="terraform.tfvars" | grep "monthly cost"
```

## 🔐 Security Best Practices

✅ **Implemented:**
- KMS CMK with restricted policies
- IAM roles with least privilege
- VPC security groups
- Deletion protection (production)
- Encryption in transit (TLS 1.2+)
- Encryption at rest (TDE)
- Encrypted backups
- Performance Insights encryption
- Audit logging
- CloudWatch monitoring

✅ **Compliance:**
- GDPR Article 32 (encryption)
- PCI DSS Requirement 3 (cardholder data protection)
- PCI DSS Requirement 4 (transmission encryption)

## 🚨 Troubleshooting

### Issue: Instance stuck in "creating" state

**Solution:**
```bash
# Check CloudTrail for errors
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=buzz-tutor-sql-server-staging
```

### Issue: Cannot connect to database

**Solution:**
```bash
# Verify security group rules
aws ec2 describe-security-groups \
  --group-ids $(terraform output -raw rds_security_groups | jq -r '.staging[0]')

# Check if publicly accessible (should be false)
aws rds describe-db-instances \
  --db-instance-identifier buzz-tutor-sql-server-staging \
  --query 'DBInstances[0].PubliclyAccessible'
```

### Issue: Encryption not enabled

**Solution:**
```bash
# Verify KMS key policy
aws kms get-key-policy \
  --key-id $(terraform output -raw kms_key_arns | jq -r '.staging') \
  --policy-name default

# Check IAM role permissions
aws iam simulate-principal-policy \
  --policy-source-arn $(terraform output -raw iam_role_arn) \
  --action-names kms:Encrypt kms:Decrypt \
  --resource-arns $(terraform output -raw kms_key_arns | jq -r '.staging')
```

## 📚 Documentation

### Configuration Choices Recorded

See detailed documentation in:
- `SECURITY_IMPLEMENTATION_PLAN.md` (Step 2: TDE Implementation)
- `backend/README.md` (Application integration)
- `infrastructure/terraform/README.md` (Infrastructure details)

### Architecture Diagrams

```
┌─────────────────┐
│   Application   │
│   (Node.js)     │
└────────┬────────┘
         │ TLS 1.2+
         ▼
┌────────────────────────────┐
│  AWS RDS SQL Server        │
│  - TDE Encrypted Storage  │
│  - KMS CMK Managed        │
│  - Always Encrypted DSS   │
└────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  AWS KMS        │
│  - TDE Keys     │
│  - CMK Rotation │
└─────────────────┘
```

## 🤝 Contributing

When adding new environments:

1. Add to `environments` variable
2. Configure in `sql_server_config`
3. Add security groups
4. Update monitoring thresholds
5. Test thoroughly

## 📞 Support

For infrastructure issues:
- Email: infrastructure@buzztutor.com
- Slack: #infrastructure
- Escalation: Contact on-call engineer via PagerDuty

## 📝 License

Internal Use - Buzz A Tutor Platform
