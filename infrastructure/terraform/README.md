# Buzz A Tutor - Terraform Configuration

Terraform infrastructure for AWS RDS SQL Server with TDE (Transparent Data Encryption).

## 📋 Resources Created

This Terraform configuration creates:

### 1. KMS Keys (per environment)
- Customer Managed Key (CMK) for TDE
- Key alias for easy reference
- Automatic rotation (annual)
- Multi-account access policies

### 2. IAM Role
- `BuzzTutorRDSRole` for RDS service
- KMS encryption/decrypt permissions
- CloudWatch logs access
- Enhanced monitoring permissions

### 3. RDS SQL Server Instances (per environment)
- Engine: SQL Server Express 2019
- Storage: GP3 (200GB staging, 500GB prod)
- Multi-AZ: Enabled
- Backup retention: 7 days (staging), 30 days (prod)
- TDE: Enabled with KMS CMK
- Encryption: At-rest (TDE), in-transit (TLS)

### 4. CloudWatch Alarms (per environment)
- CPU utilization > 70%
- Read latency > 25ms
- Backup failures

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│      AWS RDS SQL Server                 │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │   Database Encryption            │  │
│  │   - TDE: AES-256                │  │
│  │   - Data files encrypted        │  │
│  │   - Log files encrypted         │  │
│  │   - Backups encrypted           │  │
│  │   - No application changes      │  │
│  └─────────────┬────────────────────┘  │
│                │                        │
│  ┌─────────────▼────────────────────┐  │
│  │   KMS CMK (Customer Managed)     │  │
│  │   - Annual rotation              │  │
│  │   - AWS managed                  │  │
│  └──────────────────────────────────┘  │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│  IAM Role: BuzzTutorRDSRole             │
│  - KMS encrypt/decrypt                  │
│  - CloudWatch logs                      │
│  - Enhanced monitoring                  │
└─────────────────────────────────────────┘
```

## 🚀 Usage

### 1. Configure Variables

Create `terraform.tfvars`:

```hcl
aws_region = "us-east-1"

sql_server_credentials = {
  staging = {
    username = "sqladmin"
    password = "YOUR-STAGING-PASSWORD"
  }
  production = {
    username = "sqladmin"
    password = "YOUR-PRODUCTION-PASSWORD"
  }
}

rds_security_group_ids = {
  staging    = ["sg-xxxxxxxx"]
  production = ["sg-yyyyyyyy"]
}

rds_subnet_group_name = {
  staging    = "buzz-tutor-staging-subnet"
  production = "buzz-tutor-prod-subnet"
}

vpc_id = "vpc-zzzzzzzz"
```

### 2. Initialize

```bash
cd terraform
terraform init
```

### 3. Plan Changes

```bash
terraform plan -var-file="terraform.tfvars"
```

### 4. Apply Infrastructure

```bash
# Deploy everything
terraform apply -var-file="terraform.tfvars"

# Deploy only staging
terraform apply -var-file="terraform.tfvars" \
  -target=aws_kms_key.buzz_tutor_tde["staging"] \
  -target=aws_db_instance.buzz_tutor_sql_server["staging"]

# Deploy only production
terraform apply -var-file="terraform.tfvars" \
  -target=aws_kms_key.buzz_tutor_tde["production"] \
  -target=aws_db_instance.buzz_tutor_sql_server["production"]
```

### 5. View Outputs

```bash
terraform output

# Specific outputs
terraform output -json rds_instance_details
terraform output -json kms_key_arns
terraform output connection_strings
```

## 🔧 Module Details

### Variables

See `variables.tf` for complete list. Key variables:

- `environments`: Set of environments (staging, production)
- `sql_server_config`: Per-environment instance configuration
- `sql_server_credentials`: Admin credentials
- `vpc_id`: VPC for RDS instances
- `rds_security_group_ids`: Security groups for access control
- `cpu_threshold`: CloudWatch alarm threshold
- `kms_rotation_period`: Key rotation frequency (days)

### Outputs

- `rds_instance_details`: Database connection details
- `kms_key_arns`: KMS CMK ARNs for audit
- `iam_role_details`: IAM role information
- `cloudwatch_alarms`: Alarm names for monitoring
- `connection_strings`: Formatted connection strings
- `next_steps`: Post-deployment instructions

## 🌍 Environment-Specific Configuration

### Staging

```hcl
instance_class: db.r5.large (2 vCPU, 16GB)
allocated_storage: 200 GB
backup_retention: 7 days
deletion_protection: false
cost: ~$350/month
```

### Production

```hcl
instance_class: db.r5.xlarge (4 vCPU, 32GB)
allocated_storage: 500 GB
backup_retention: 30 days
deletion_protection: true
cost: ~$850/month
```

## 🔐 Security Features

### Encryption

- **At Rest**: TDE via KMS CMK
- **In Transit**: TLS 1.2+ enforced
- **Backups**: Automatically encrypted
- **Performance Insights**: Encrypted

### Access Control

- **KMS Key Policy**: Restricts to RDS service and specific IAM roles
- **Security Groups**: Network-level access control
- **IAM Role**: Least privilege for RDS service

### Monitoring

- **CloudWatch**: CPU, latency, backup alarms
- **Enhanced Monitoring**: 60-second metrics
- **Performance Insights**: Query performance analysis

## 🚨 Emergency Procedures

### Rotate KMS Key

```bash
# Emergency key rotation (requires approval)
../scripts/rotate-keys.sh production "Security incident - key compromise"
```

### Restore from Backup

```bash
# Find latest snapshot
aws rds describe-db-snapshots \
  --db-instance-identifier buzz-tutor-sql-server-production \
  --snapshot-type automated \
  --query 'DBSnapshots[0].DBSnapshotIdentifier'

# Restore to new instance
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier buzz-tutor-sql-server-restored \
  --db-snapshot-identifier <snapshot-id>
```

### Disable Encryption

**⚠️ Not recommended - encryption cannot be disabled once enabled**

To migrate to unencrypted:
1. Create snapshot
2. Copy snapshot with encryption disabled
3. Restore new instance
4. Update application

## 📊 Monitoring

### CloudWatch Metrics

```bash
# View metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name CPUUtilization \
  --dimensions Name=DBInstanceIdentifier,Value=buzz-tutor-sql-server-staging \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Average,Maximum
```

### Alarms

Three alarms per environment:
- **CPU High**: >70% for 15 minutes
- **Read Latency High**: >25ms average
- **Backup Failed**: Any automated backup failure

## 🛠️ Maintenance

### Key Rotation

Automatic:
```hcl
kms_rotation_enabled = true
kms_rotation_period  = 365
```

Manual (emergency only):
```bash
../scripts/rotate-keys.sh production
```

### Backup Management

Automated backups:
- Daily during maintenance window
- Encrypted with same KMS key
- Retention: 7 days (staging) / 30 days (production)

Manual snapshots:
```bash
aws rds create-db-snapshot \
  --db-instance-identifier buzz-tutor-sql-server-staging \
  --db-snapshot-identifier manual-backup-$(date +%Y%m%d)
```

## 💰 Cost Optimization

### Staging

- Use `db.r5.large` (sufficient for testing)
- 200GB storage (can scale up)
- 7-day backup retention
- Enable during business hours only

### Production

- Use `db.r5.xlarge` minimum
- 500GB storage (scale as needed)
- 30-day backup retention (compliance)
- Reserved instances for savings

**Total Monthly Estimate:**
- Staging: ~$350
- Production: ~$850

## 🧪 Testing

### Verify TDE

```bash
# Run verification script
../scripts/verify-tde.sh staging

# Expected output:
# ✅ Storage encryption enabled
# ✅ KMS key configured
# ✅ Backups encrypted
# ✅ TDE active
```

### SQL Server Verification

```sql
-- Check encryption status
SELECT 
    db.name,
    db.is_encrypted,
    dek.encryption_state,
    dek.key_algorithm
FROM sys.databases db
LEFT JOIN sys.dm_database_encryption_keys dek ON db.database_id = dek.database_id;
```

### Application Test

```typescript
// No code changes required
const config = {
  server: terraformOutput.endpoint,
  database: 'BuzzTutorStaging',
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

// Connection works transparently
```

## 📚 Documentation

- [SECURITY_IMPLEMENTATION_PLAN.md](../../SECURITY_IMPLEMENTATION_PLAN.md) - Step 2 details
- [backend/README.md](../../backend/README.md) - Application integration
- [infrastructure/README.md](../../infrastructure/README.md) - Infrastructure overview

## 🤝 Contributing

When modifying Terraform:

1. Update variables documentation
2. Test with `terraform plan`
3. Validate with `terraform validate`
4. Format with `terraform fmt`
5. Document changes in CHANGELOG.md

## 📞 Support

For infrastructure issues:
- Slack: #infrastructure
- Email: infrastructure@buzztutor.com
- Escalation: On-call via PagerDuty

## 📝 License

Internal Use - Buzz A Tutor Platform
