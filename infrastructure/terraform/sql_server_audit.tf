# ============================================
# SQL Server Audit Policies - CloudWatch/SIEM Integration
# Terraform Configuration
# Implements Step 6: Comprehensive audit logging for GDPR/PCI DSS compliance
# ============================================

# ============================================
# CloudWatch Log Groups for SQL Server Audit Logs
# ============================================

resource "aws_cloudwatch_log_group" "sql_server_audit" {
  for_each = var.environments
  
  name              = "/aws/rds/instance/buzz-tutor-sql-server-tls-${each.key}/audit"
  retention_in_days = 365  # PCI DSS requirement (1 year minimum)
  
  # Encrypt logs at rest (GDPR requirement for personal data)
  kms_key_id = aws_kms_key.buzz_tutor_tde[each.key].arn
  
  tags = {
    Application   = "buzz-tutor"
    Environment   = each.key
    Purpose       = "sql-server-audit-logs"
    Compliance    = "gdpr-pci-dss"
    Retention     = "365-days"
    SIEM          = "enabled"
  }
}

resource "aws_cloudwatch_log_group" "sql_server_audit_siem" {
  for_each = var.environments
  
  name              = "/aws/rds/instance/buzz-tutor-sql-server-tls-${each.key}/audit-siem"
  retention_in_days = 90  # Shorter retention for SIEM (processed logs)
  
  kms_key_id = aws_kms_key.buzz_tutor_tde[each.key].arn
  
  tags = {
    Application   = "buzz-tutor"
    Environment   = each.key
    Purpose       = "sql-server-audit-siem"
    Compliance    = "gdpr-pci-dss"
    Retention     = "90-days"
    Processed     = "siem-ready"
  }
}

resource "aws_cloudwatch_log_group" "splunk_firehose" {
  for_each = var.environments
  
  name              = "/aws/firehose/buzz-tutor-sql-audit-to-splunk-${each.key}"
  retention_in_days = 30  # Short retention for monitoring logs
  
  tags = {
    Application   = "buzz-tutor"
    Environment   = each.key
    Purpose       = "splunk-integration-monitoring"
    Service       = "kinesis-firehose"
  }
}

# ============================================
# CloudWatch Metrics for Audit Monitoring
# ============================================

resource "aws_cloudwatch_metric_alarm" "audit_log_generation" {
  for_each = var.environments
  
  alarm_name          = "buzz-tutor-audit-log-generation-${each.key}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "IncomingLogEvents"
  namespace           = "AWS/Logs"
  period              = 300
  statistic           = "Sum"
  threshold           = 100000  # Alert if >100k audit events in 5 minutes (potential breach)
  alarm_description   = "Unusual audit log generation spike - possible data breach in ${each.key}"
  alarm_actions       = [data.aws_sns_topic.alerts.arn]
  
  dimensions = {
    LogGroupName = aws_cloudwatch_log_group.sql_server_audit[each.key].name
  }
  
  tags = {
    Application = "buzz-tutor"
    Environment = each.key
    Purpose     = "audit-generation-monitoring"
    Severity    = "critical"
    AlertType   = "security"
  }
}

resource "aws_cloudwatch_metric_alarm" "unauthorized_access_attempt" {
  for_each = var.environments
  
  alarm_name          = "buzz-tutor-unauthorized-access-${each.key}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FilterCount"
  namespace           = "AWS/Logs"
  period              = 300
  statistic           = "Sum"
  threshold           = 10  # Alert if >10 unauthorized attempts in 5 minutes
  alarm_description   = "Multiple unauthorized access attempts detected in ${each.key}"
  alarm_actions       = [data.aws_sns_topic.alerts.arn]
  
  dimensions = {
    LogGroupName = aws_cloudwatch_log_group.sql_server_audit[each.key].name
  }
  
  tags = {
    Application = "buzz-tutor"
    Environment = each.key
    Purpose     = "unauthorized-access-detection"
    Severity    = "high"
    AlertType   = "security"
  }
}

# ============================================
# CloudWatch Alarms for SIEM Integration
# ============================================

resource "aws_cloudwatch_metric_alarm" "splunk_delivery_failure" {
  for_each = var.environments
  
  alarm_name          = "buzz-tutor-splunk-delivery-failure-${each.key}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DeliveryToSplunk.RecordsFailed"
  namespace           = "AWS/Firehose"
  period              = 300
  statistic           = "Sum"
  threshold           = 5  # Alert if >5 records fail to deliver in 5 minutes
  alarm_description   = "Failed Splunk log delivery detected in ${each.key} - backup to S3 activated"
  alarm_actions       = [data.aws_sns_topic.alerts.arn]
  
  dimensions = {
    DeliveryStreamName = aws_kinesis_firehose_delivery_stream.sql_audit_to_splunk[each.key].name
  }
  
  tags = {
    Application = "buzz-tutor"
    Environment = each.key
    Purpose     = "splunk-delivery-monitoring"
    Severity    = "high"
    AlertType   = "siem"
  }
}

# ============================================
# IAM Role for Kinesis Firehose
# ============================================

resource "aws_iam_role" "firehose_splunk_role" {
  for_each = var.environments
  
  name = "BuzzTutorFirehoseSplunkRole-${each.key}"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "firehose.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
  
  tags = {
    Application = "buzz-tutor"
    Environment = each.key
    Purpose = "firehose-splunk-integration"
  }
}

resource "aws_iam_role_policy" "firehose_splunk_access" {
  for_each = var.environments
  
  name = "BuzzTutorFirehoseSplunkAccess-${each.key}"
  role = aws_iam_role.firehose_splunk_role[each.key].id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:AbortMultipartUpload",
          "s3:GetBucketLocation",
          "s3:GetObject",
          "s3:ListBucket",
          "s3:ListBucketMultipartUploads",
          "s3:PutObject"
        ]
        Resource = [
          "${aws_s3_bucket.splunk_backup[each.key].arn}",
          "${aws_s3_bucket.splunk_backup[each.key].arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:PutLogEvents",
          "logs:CreateLogStream",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams"
        ]
        Resource = "${aws_cloudwatch_log_group.splunk_firehose[each.key].arn}"
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = aws_kms_key.buzz_tutor_tde[each.key].arn
        Condition = {
          StringEquals = {
            "kms:ViaService" = "s3.${var.aws_region}.amazonaws.com"
          }
        }
      }
    ]
  })
}

# ============================================
# S3 Bucket for Failed Splunk Delivery Backup
# ============================================

resource "aws_s3_bucket" "splunk_backup" {
  for_each = var.environments
  
  bucket = "buzz-tutor-audit-backup-${each.key}-${data.aws_caller_identity.current.account_id}"
  
  tags = {
    Application = "buzz-tutor"
    Environment = each.key
    Purpose     = "splunk-failed-delivery-backup"
    Compliance  = "gdpr-pci-dss"
    Retention   = "7-years"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "splunk_backup" {
  for_each = aws_s3_bucket.splunk_backup
  
  bucket = each.key
  
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.buzz_tutor_tde[each.value.environment].arn
    }
  }
}

resource "aws_s3_bucket_versioning" "splunk_backup" {
  for_each = aws_s3_bucket.splunk_backup
  
  bucket = each.key
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "splunk_backup" {
  for_each = aws_s3_bucket.splunk_backup
  
  bucket = each.key
  
  rule {
    id     = "transition-to-glacier"
    status = "Enabled"
    
    filter {
      prefix = "failed-splunk/"
    }
    
    transition {
      days          = 90
      storage_class = "GLACIER"
    }
    
    expiration {
      days = 2555  # 7 years (GDPR maximum retention)
    }
  }
}

# ============================================
# Data Sources
# ============================================

data "aws_sns_topic" "alerts" {
  name = var.sns_alert_topic
}

data "aws_caller_identity" "current" {}

# ============================================
# Outputs for Audit Configuration
# ============================================

output "audit_log_group_names" {
  description = "CloudWatch Log Group names for SQL Server audit logs"
  value = {
    for env, log_group in aws_cloudwatch_log_group.sql_server_audit :
    env => log_group.name
  }
}

output "audit_retention_days" {
  description = "Audit log retention configuration"
  value = {
    primary_audit = 365  # PCI DSS requirement
    siem_audit    = 90   # Processed logs
    splunk_monitor = 30  # Firehose monitoring
  }
}

output "splunk_backup_buckets" {
  description = "S3 buckets for failed Splunk delivery backup"
  value = {
    for env, bucket in aws_s3_bucket.splunk_backup :
    env => bucket.bucket
  }
}

output "audit_alarms_configured" {
  description = "CloudWatch alarms for audit monitoring"
  value = {
    for env in keys(var.environments) :
    env => {
      audit_generation   = aws_cloudwatch_metric_alarm.audit_log_generation[env].alarm_name
      unauthorized_access = aws_cloudwatch_metric_alarm.unauthorized_access_attempt[env].alarm_name
      splunk_delivery    = aws_cloudwatch_metric_alarm.splunk_delivery_failure[env].alarm_name
    }
  }
}
