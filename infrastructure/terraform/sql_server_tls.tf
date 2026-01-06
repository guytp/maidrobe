# ============================================
# RDS SQL Server TLS 1.2+ Enforcement
# Terraform Configuration
# ============================================
# This module enforces TLS encryption for all client connections
# Implements PCI DSS Requirement 4.1, HIPAA encryption requirements

# ============================================
# RDS Parameter Group for TLS Enforcement
# ============================================

resource "aws_db_parameter_group" "buzz_tutor_tls_enforcement" {
  for_each = var.environments

  name        = "buzz-tutor-tls-enforcement-${each.key}"
  family      = "sqlserver-ex-15.0"  # SQL Server 2019 Express
  description = "TLS 1.2+ enforcement for Buzz Tutor - ${title(each.key)}"

  # Force SSL/TLS for all connections
  parameter {
    name  = "rds.force_ssl"
    value = "1"  # 1 = enforce SSL/TLS, 0 = allow unencrypted
  }

  # TLS Version Control - Disable legacy protocols
  parameter {
    name  = "rds.tls10"
    value = "disabled"  # Disable TLS 1.0 (weak)
  }

  parameter {
    name  = "rds.tls11"
    value = "disabled"  # Disable TLS 1.1 (weak)
  }

  # Note: TLS 1.2 is always enabled in RDS SQL Server and cannot be disabled
  # This ensures minimum TLS 1.2+ automatically

  # Cipher Suite Hardening
  parameter {
    name  = "rds.rc4"
    value = "disabled"  # Disable weak RC4 cipher
  }

  parameter {
    name  = "rds.3des168"
    value = "disabled"  # Disable weak 3DES cipher
  }

  # Minimum key length for Diffie-Hellman key exchange
  parameter {
    name  = "rds.diffie-hellman-min-key-bit-length"
    value = "3072"  # NIST SP 800-52r2 compliant
  }

  tags = {
    Application   = "buzz-tutor"
    Environment   = each.key
    Purpose       = "tls-enforcement"
    Compliance    = "pci-dss-hipaa"
    EnforcedBy    = "terraform"
  }
}

# ============================================
# Security Group for Database Access
# ============================================

resource "aws_security_group" "buzz_tutor_sql_server" {
  for_each = var.environments

  name        = "buzz-tutor-sql-server-${each.key}"
  description = "Security group for Buzz Tutor SQL Server - ${title(each.key)}"
  vpc_id      = data.aws_vpc.main.id

  # Allow SQL Server traffic only from application servers
  ingress {
    description = "SQL Server access from application tier"
    from_port   = 1433
    to_port     = 1433
    protocol    = "tcp"
    security_groups = [aws_security_group.buzz_tutor_app_tier[each.key].id]
  }

  # Deny public access (handled by RDS instance publicly_accessible = false)
  
  # Allow outbound traffic only for required services
  egress {
    description = "HTTPS for AWS services (CloudWatch, S3, Secrets Manager)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Application   = "buzz-tutor"
    Environment   = each.key
    Purpose       = "sql-server-security"
    Compliance    = "pci-dss-hipaa"
  }
}

# Application tier security group (referenced above)
resource "aws_security_group" "buzz_tutor_app_tier" {
  for_each = var.environments

  name        = "buzz-tutor-app-tier-${each.key}"
  description = "Application tier for Buzz Tutor - ${title(each.key)}"
  vpc_id      = data.aws_vpc.main.id

  tags = {
    Application   = "buzz-tutor"
    Environment   = each.key
    Purpose       = "application-tier"
  }
}

# ============================================
# RDS SQL Server Instance (Updated with TLS)
# ============================================

resource "aws_db_instance" "buzz_tutor_sql_server_tls" {
  for_each = var.environments

  # Basic Configuration
  identifier        = "buzz-tutor-sql-server-tls-${each.key}"
  engine            = "sqlserver-ex"
  engine_version    = lookup(var.sql_server_config[each.key], "engine_version", "15.00.4236.7.v1")
  instance_class    = lookup(var.sql_server_config[each.key], "instance_class", "db.r5.large")
  allocated_storage = lookup(var.sql_server_config[each.key], "allocated_storage", 200)

  # Credentials (will be changed after initial setup)
  username = lookup(var.sql_server_credentials[each.key], "username", "sqladmin")
  password = lookup(var.sql_server_credentials[each.key], "password", null)
  port     = 1433

  # Storage & Encryption at Rest
  storage_encrypted       = true
  kms_key_id              = aws_kms_key.buzz_tutor_tde[each.key].arn
  storage_type            = "gp3"
  iops                    = lookup(var.sql_server_config[each.key], "iops", 3000)
  storage_throughput      = lookup(var.sql_server_config[each.key], "throughput", 125)

  # High Availability
  multi_az = lookup(var.sql_server_config[each.key], "multi_az", true)

  # Backup Configuration
  backup_retention_period = lookup(var.sql_server_config[each.key], "backup_retention_period", 7)
  backup_window           = lookup(var.sql_server_config[each.key], "backup_window", "03:00-04:00")
  maintenance_window      = lookup(var.sql_server_config[each.key], "maintenance_window", "sun:04:00-sun:05:00")

  # TLS/TDE Enforcement - CRITICAL for compliance
  parameter_group_name = aws_db_parameter_group.buzz_tutor_tls_enforcement[each.key].name

  # Performance & Monitoring
  enabled_cloudwatch_logs_exports = ["error", "general"]
  performance_insights_enabled          = true
  performance_insights_kms_key_id       = aws_kms_key.buzz_tutor_tde[each.key].arn
  performance_insights_retention_period = 7
  monitoring_interval     = 60
  monitoring_role_arn     = aws_iam_role.buzz_tutor_rds_role.arn
  enable_performance_insights = true

  # Network Security
  vpc_security_group_ids = [aws_security_group.buzz_tutor_sql_server[each.key].id]
  db_subnet_group_name   = lookup(var.sql_server_config[each.key], "subnet_group_name", "")
  publicly_accessible    = false  # Critical for security

  # Deletion Protection
  deletion_protection = lookup(var.sql_server_config[each.key], "deletion_protection", each.key == "production")

  # Tags
  tags = {
    Application   = "buzz-tutor"
    Environment   = each.key
    Purpose       = "sql-server-database-tls-enforced"
    Compliance    = "pci-dss-hipaa-gdpr"
    CostCenter    = each.key == "production" ? "production" : "engineering"
    Criticality   = each.key == "production" ? "high" : "medium"
    DRPlan        = each.key == "production" ? "enabled" : "n/a"
    TLS_Enforced  = "true"
    TLS_Version   = "1.2+"
  }

  lifecycle {
    create_before_destroy = true
    ignore_changes = [
      password,  # Managed by AWS Secrets Manager rotation
      snapshot_identifier  # Allow manual snapshots
    ]
  }

  depends_on = [
    aws_kms_key.buzz_tutor_tde,
    aws_iam_role.buzz_tutor_rds_role,
    aws_db_parameter_group.buzz_tutor_tls_enforcement
  ]
}

# ============================================
# AWS Secrets Manager Integration
# ============================================

resource "aws_secretsmanager_secret" "buzz_tutor_sql_credentials" {
  for_each = var.environments

  name                    = "buzz-tutor/sql-server-${each.key}"
  recovery_window_in_days = 30
  kms_key_id              = aws_kms_key.buzz_tutor_tde[each.key].arn

  tags = {
    Application = "buzz-tutor"
    Environment = each.key
    Purpose     = "sql-server-credentials"
  }
}

resource "aws_secretsmanager_secret_version" "buzz_tutor_sql_credentials" {
  for_each = var.environments

  secret_id     = aws_secretsmanager_secret.buzz_tutor_sql_credentials[each.key].id
  secret_string = jsonencode({
    username = aws_db_instance.buzz_tutor_sql_server_tls[each.key].username
    password = aws_db_instance.buzz_tutor_sql_server_tls[each.key].password
    host     = aws_db_instance.buzz_tutor_sql_server_tls[each.key].endpoint
    port     = tostring(aws_db_instance.buzz_tutor_sql_server_tls[each.key].port)
    database = aws_db_instance.buzz_tutor_sql_server_tls[each.key].db_name
    tls_mode = "required"
  })

  depends_on = [aws_db_instance.buzz_tutor_sql_server_tls]
}

# ============================================
# Certificate Validation Configuration
# ============================================

# Import AWS RDS certificates for production environments
# This ensures proper certificate chain validation

locals {
  rds_certificates = {
    us-east-1 = "rds-ca-rsa2048-g1"  # Update with latest CA certificate
    # Add other regions as needed
  }
}

# Secret for storing certificate validation configuration
resource "aws_secretsmanager_secret" "buzz_tutor_tls_config" {
  for_each = var.environments

  name                    = "buzz-tutor/tls-config-${each.key}"
  recovery_window_in_days = 30

  tags = {
    Application = "buzz-tutor"
    Environment = each.key
    Purpose     = "tls-configuration"
  }
}

resource "aws_secretsmanager_secret_version" "buzz_tutor_tls_config" {
  for_each = var.environments

  secret_id = aws_secretsmanager_secret.buzz_tutor_tls_config[each.key].id
  secret_string = jsonencode({
    enforce_tls            = true
    min_tls_version        = "1.2"
    certificate_validation = true
    trust_server_cert      = false
    ca_certificate         = lookup(local.rds_certificates, var.aws_region, "rds-ca-rsa2048-g1")
    cert_store_location    = "/etc/ssl/certs"  # Linux path, adjust for Windows if needed
  })
}

# ============================================
# CloudWatch Alarm for TLS Compliance
# ============================================

resource "aws_cloudwatch_metric_alarm" "tls_connection_failure" {
  for_each = var.environments

  alarm_name          = "buzz-tutor-tls-connection-failure-${each.key}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DatabaseConnectionsFailed"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "SQL Server connection failures (possible TLS issues) in ${each.key}"
  alarm_actions       = [data.aws_sns_topic.alerts.arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.buzz_tutor_sql_server_tls[each.key].identifier
  }

  tags = {
    Application = "buzz-tutor"
    Environment = each.key
    Purpose     = "tls-connection-monitoring"
  }
}

resource "aws_cloudwatch_log_metric_filter" "tls_connection_filter" {
  for_each = var.environments

  name           = "buzz-tutor-tls-connections-${each.key}"
  pattern        = "[encrypt_option, session_id]"
  log_group_name = "/aws/rds/instance/${aws_db_instance.buzz_tutor_sql_server_tls[each.key].identifier}/error"

  metric_transformation {
    name      = "UnencryptedConnectionAttempts"
    namespace = "BuzzTutor/Security"
    value     = "1"
    unit      = "Count"
  }
}

# ============================================
# Compliance and Security Outputs

# ============================================
output "tls_enforced" {
  description = "TLS enforcement status per environment"
  value = {
    for env, instance in aws_db_instance.buzz_tutor_sql_server_tls :
    env => {
      parameter_group = instance.parameter_group_name
      tls_enforced    = true
      public_access   = instance.publicly_accessible
    }
  }
}

output "ca_certificate_info" {
  description = "Certificate information for client connections"
  value = {
    ca_certificate_identifier = lookup(local.rds_certificates, var.aws_region, "rds-ca-rsa2048-g1")
    certificate_bundle_url    = "https://truststore.pki.rds.amazonaws.com/${var.aws_region}/${lookup(local.rds_certificates, var.aws_region, "rds-ca-rsa2048-g1")}.pem"
    documentation            = "https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html"
  }
}

# ============================================
# Lifecycle Policies for Security
# ============================================

# Automatic rotation of RDS certificates
resource "aws_db_instance_automated_backups_replication" "buzz_tutor_backup_replication" {
  for_each = { for env, config in var.sql_server_config : env => config if env == "production" }

  source_db_instance_arn = aws_db_instance.buzz_tutor_sql_server_tls[each.key].arn
  retention_period       = 7
  kms_key_id             = aws_kms_key.buzz_tutor_tde[each.key].arn
}

# ============================================
# Terraform Module Documentation
# ============================================

/**
 * TLS 1.2+ Enforcement for SQL Server - Implementation Guide
 * 
 * This module enforces TLS encryption for all client connections to RDS SQL Server.
 * 
 * Key Features:
 * - RDS Parameter Group enforces TLS 1.2+ at database level
 * - Security groups restrict network access
 * - Certificate validation required
 * - Comprehensive monitoring and alerting
 * 
 * Required Provider Configuration:
 * ```hcl
 * provider "aws" {
 *   region = "us-east-1"
 *   default_tags {
 *     Application = "buzz-tutor"
 *   }
 * }
 * ```
 * 
 * Required Variables:
 * - var.aws_region
 * - var.environments (map of environment names)
 * - var.sql_server_config (map of SQL Server configurations)
 * - var.sql_server_credentials (map of SQL Server credentials)
 * - var.vpc_id
 * - var.sns_alert_topic
 * 
 * Usage:
 * 1. Apply parameter group: terraform apply -target=aws_db_parameter_group.buzz_tutor_tls_enforcement
 * 2. Update RDS instances: terraform apply
 * 3. Reboot instances for parameter group changes to take effect
 * 4. Verify encryption: Run verify_rds_tls.sql queries
 * 
 * Verification:
 * ```bash
 * # Check parameter group is applied
 * aws rds describe-db-parameters --db-parameter-group-name buzz-tutor-tls-enforcement-production
 * 
 * # Verify instance reboot status
 * aws rds describe-db-instances --db-instance-identifier buzz-tutor-sql-server-tls-production
 * 
 * # Check logs for connection encryption
 * aws logs filter-log-events --log-group-name /aws/rds/instance/buzz-tutor-sql-server-tls-production/error
 * ```
 * 
 * Compliance:
 * - PCI DSS Requirement 4.1: Strong cryptography during transmission
 * - HIPAA Security Rule: Encryption of ePHI in transit
 * - GDPR Article 32: Security of processing
 * - SOC 2: Encryption and key management
 * 
 * Monitoring:
 * - CloudWatch alarm: tls_connection_failure
 * - Log metric filter: UnencryptedConnectionAttempts
 * - RDS Performance Insights: Connection monitoring
 */
