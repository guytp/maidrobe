# ============================================
# Buzz A Tutor - SQL Server TDE Infrastructure
# Terraform Configuration
# ============================================

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Application = "buzz-tutor"
      ManagedBy   = "terraform"
    }
  }
}

# ============================================
# KMS Keys for TDE
# ============================================

resource "aws_kms_key" "buzz_tutor_tde" {
  for_each = var.environments

  description             = "Buzz Tutor SQL Server TDE - ${title(each.key)}"
  deletion_window_in_days = var.kms_deletion_window
  enable_key_rotation     = var.kms_rotation_enabled
  rotation_period_in_days = var.kms_rotation_period
  multi_region            = false

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid = "AllowRDSToUseKey",
        Effect = "Allow",
        Principal = {
          Service = "rds.amazonaws.com"
        },
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ],
        Resource = "*",
        Condition = {
          StringEquals = {
            "kms:ViaService" = "rds.${var.aws_region}.amazonaws.com",
            "kms:CallerAccount" = data.aws_caller_identity.current.account_id
          }
        }
      },
      {
        Sid = "AllowKeyAdministrators",
        Effect = "Allow",
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/BuzzTutorDatabaseAdmin"
        },
        Action = "kms:*",
        Resource = "*"
      },
      {
        Sid = "AllowAuditReadOnly",
        Effect = "Allow",
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/BuzzTutorAuditLogger"
        },
        Action = [
          "kms:DescribeKey",
          "kms:GetKeyPolicy",
          "kms:GetKeyRotationStatus"
        ],
        Resource = "*"
      }
    ]
  })

  tags = {
    Application   = "buzz-tutor"
    Environment   = each.key
    Purpose       = "tde-encryption"
    Compliance    = "gdpr-pci-dss"
  }
}

resource "aws_kms_alias" "buzz_tutor_tde_alias" {
  for_each = var.environments

  name          = "alias/buzz-tutor-${each.key}-tde"
  target_key_id = aws_kms_key.buzz_tutor_tde[each.key].key_id
}

# ============================================
# IAM Role for RDS
# ============================================

resource "aws_iam_role" "buzz_tutor_rds_role" {
  name = "BuzzTutorRDSRole"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = "sts:AssumeRole",
        Effect = "Allow",
        Principal = {
          Service = "rds.amazonaws.com"
        }
      }
    ]
  })

  managed_policy_arns = [
    "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
  ]

  tags = {
    Application = "buzz-tutor"
    Purpose     = "rds-service-role"
  }
}

resource "aws_iam_role_policy" "buzz_tutor_rds_kms_access" {
  name = "BuzzTutorKMSAccess"
  role = aws_iam_role.buzz_tutor_rds_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ],
        Resource = values(aws_kms_key.buzz_tutor_tde)[*].arn
      }
    ]
  })
}

# ============================================
# RDS SQL Server Instances
# ============================================

resource "aws_db_instance" "buzz_tutor_sql_server" {
  for_each = var.environments

  identifier        = "buzz-tutor-sql-server-${each.key}"
  engine            = "sqlserver-ex"
  engine_version    = lookup(var.sql_server_config[each.key], "engine_version", "15.00.4236.7.v1")
  instance_class    = lookup(var.sql_server_config[each.key], "instance_class", "db.r5.large")
  allocated_storage = lookup(var.sql_server_config[each.key], "allocated_storage", 200)

  # Credentials
  username = lookup(var.sql_server_credentials[each.key], "username", "sqladmin")
  password = lookup(var.sql_server_credentials[each.key], "password", null)
  port     = 1433

  # Storage & Encryption
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

  # Logging
  enabled_cloudwatch_logs_exports = ["error", "general"]

  # Performance Insights
  performance_insights_enabled          = true
  performance_insights_kms_key_id       = aws_kms_key.buzz_tutor_tde[each.key].arn
  performance_insights_retention_period = 7

  # Enhanced Monitoring
  monitoring_interval     = 60
  monitoring_role_arn     = aws_iam_role.buzz_tutor_rds_role.arn
  enable_performance_insights = true

  # Network
  vpc_security_group_ids = lookup(var.sql_server_config[each.key], "security_group_ids", [])
  db_subnet_group_name   = lookup(var.sql_server_config[each.key], "subnet_group_name", "")
  publicly_accessible    = false

  # Deletion Protection
  deletion_protection = lookup(var.sql_server_config[each.key], "deletion_protection", each.key == "production")

  # Timeouts
  timeouts {
    create = "40m"
    update = "40m"
    delete = "40m"
  }

  tags = {
    Application   = "buzz-tutor"
    Environment   = each.key
    Purpose       = "sql-server-database"
    Compliance    = "gdpr-pci-dss"
    CostCenter    = each.key == "production" ? "production" : "engineering"
    Criticality   = each.key == "production" ? "high" : "medium"
    DRPlan        = each.key == "production" ? "enabled" : "n/a"
  }

  depends_on = [aws_kms_key.buzz_tutor_tde, aws_iam_role.buzz_tutor_rds_role]
}

# ============================================
# CloudWatch Alarms
# ============================================

resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  for_each = var.environments

  alarm_name          = "buzz-tutor-sql-cpu-high-${each.key}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = var.cpu_threshold
  alarm_description   = "SQL Server CPU utilization is high in ${each.key} environment"
  alarm_actions       = [data.aws_sns_topic.alerts.arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.buzz_tutor_sql_server[each.key].identifier
  }
}

resource "aws_cloudwatch_metric_alarm" "read_latency_high" {
  for_each = var.environments

  alarm_name          = "buzz-tutor-sql-read-latency-high-${each.key}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "ReadLatency"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = var.read_latency_threshold
  alarm_description   = "SQL Server read latency is high in ${each.key} environment"
  alarm_actions       = [data.aws_sns_topic.alerts.arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.buzz_tutor_sql_server[each.key].identifier
  }
}

resource "aws_cloudwatch_metric_alarm" "backup_failed" {
  for_each = var.environments

  alarm_name          = "buzz-tutor-sql-backup-failed-${each.key}"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "BackupFailed"
  namespace           = "AWS/RDS"
  period              = 3600
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "SQL Server automated backup failed in ${each.key} environment"
  alarm_actions       = [data.aws_sns_topic.alerts.arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.buzz_tutor_sql_server[each.key].identifier
  }
}

# ============================================
# SNS Topic for Alerts
# ============================================

data "aws_sns_topic" "alerts" {
  name = var.sns_alert_topic
}

# ============================================
# Data Sources
# ============================================

data "aws_caller_identity" "current" {}

data "aws_vpc" "main" {
  id = var.vpc_id
}

# ============================================
# Outputs
# ============================================

output "rds_instance_endpoints" {
  description = "RDS SQL Server endpoints"
  value = {
    for env, instance in aws_db_instance.buzz_tutor_sql_server :
    env => instance.endpoint
  }
}

output "kms_key_arns" {
  description = "KMS CMK ARNs used for TDE"
  value = {
    for env, key in aws_kms_key.buzz_tutor_tde :
    env => key.arn
  }
}

output "rds_security_groups" {
  description = "Security groups for RDS instances"
  value = {
    for env, instance in aws_db_instance.buzz_tutor_sql_server :
    env => instance.vpc_security_group_ids
  }
}
