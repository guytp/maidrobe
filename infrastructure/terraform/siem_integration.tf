# ============================================
# SIEM Integration - Splunk/Kinesis
# Terraform Configuration
# Step 6: Real-time audit log streaming for security monitoring
# ============================================

# ============================================
# AWS Secrets Manager for Splunk Credentials
# ============================================

resource "aws_secretsmanager_secret" "splunk_credentials" {
  for_each = var.environments
  
  name                    = "buzz-tutor/splunk-hec-${each.key}"
  recovery_window_in_days = 30
  kms_key_id              = aws_kms_key.buzz_tutor_tde[each.key].arn
  
  tags = {
    Application = "buzz-tutor"
    Environment = each.key
    Purpose     = "splunk-hec-token"
    Compliance  = "gdpr-pci-dss"
  }
}

resource "aws_secretsmanager_secret_version" "splunk_credentials" {
  for_each = var.environments
  
  secret_id = aws_secretsmanager_secret.splunk_credentials[each.key].id
  secret_string = jsonencode({
    splunk_host      = var.splunk_host
    hec_token        = var.splunk_hec_token
    hec_port         = "8088"
    splunk_index     = var.splunk_index
    source_type      = "aws:rds:sqlserver:audit"
    enable_ssl       = true
    enable_compression = true
  })
  
  lifecycle {
    ignore_changes = [
      secret_string  # Token managed outside Terraform for security
    ]
  }
}

# ============================================
# Kinesis Data Firehose for Splunk Integration
# ============================================

resource "aws_kinesis_firehose_delivery_stream" "sql_audit_to_splunk" {
  for_each = var.environments
  
  count = var.siem_enabled ? 1 : 0
  
  name        = "buzz-tutor-sql-audit-to-splunk-${each.key}"
  destination = "splunk"
  
  # Source: CloudWatch Logs (via subscription)
  # Format: AWS RDS SQL Server audit logs
  
  splunk_configuration {
    hec_endpoint = var.splunk_host
    hec_token    = var.splunk_hec_token
    
    hec_endpoint_type           = "Event"  # Raw events, not aggregated
    hec_acknowledgment_timeout = 180      # Wait up to 180 seconds for Splunk ACK
    
    # Retry configuration for reliability
    retry_duration = 300  # Retry for up to 5 minutes before failing
    
    # Buffer configuration (balance latency vs. cost)
    # Small buffer for low latency SIEM alerting
    buffer_size     = 5    # MB (flush when buffer reaches 5MB)
    buffer_interval = 60   # seconds (flush at least every 60 seconds)
    
    # CloudWatch logging for Firehose monitoring
    cloudwatch_logging_options {
      enabled         = true
      log_group_name  = aws_cloudwatch_log_group.splunk_firehose[each.key].name
      log_stream_name = "splunk-delivery-${each.key}"
    }
    
    # Processing configuration (optional lambda for enrichment)
    processing_configuration {
      enabled = false  # Enable if you need to enrich/transform logs
      
      # Optional: Lambda for log parsing/enrichment
      # processors {
      #   type = "Lambda"
      #   parameters {
      #     parameter_name  = "LambdaArn"
      #     parameter_value = "${aws_lambda_function.log_enrichment[each.key].arn}"
      #   }
      # }
    }
    
    # Compression for efficiency
    s3_backup_mode  = "FailedEventsOnly"  # Backup failed deliveries only
    compression_format = "GZIP"  # Reduce data transfer costs
  }
  
  # CloudWatch backup for failed deliveries (critical for compliance)
  s3_configuration {
    role_arn   = aws_iam_role.firehose_splunk_role[each.key].arn
    bucket_arn = aws_s3_bucket.splunk_backup[each.key].arn
    
    # Storage structure for failed deliveries
    prefix              = "failed-splunk/${each.key}/"
    error_output_prefix = "failed-splunk-errors/${each.key}/!{firehose:error-output-type}/"
    
    # Compression for failed events
    compression_format = "GZIP"
    
    # Buffer configuration for backup
    buffer_size = 5    # MB
    buffer_interval = 300  # 5 minutes
  }
  
  # Tags for cost allocation
  tags = {
    Application   = "buzz-tutor"
    Environment   = each.key
    Purpose       = "sql-audit-to-splunk"
    SIEM          = "enabled"
    CostCenter    = each.key == "production" ? "compliance" : "engineering"
  }
  
  # Add dependency to ensure log group exists first
  depends_on = [
    aws_cloudwatch_log_group.splunk_firehose,
    aws_iam_role.firehose_splunk_role
  ]
}

# ============================================
# CloudWatch Logs Subscription Filter
# Streams audit logs to Splunk via Firehose
# ============================================

resource "aws_cloudwatch_log_subscription_filter" "sql_audit_to_splunk" {
  for_each = var.environments
  
  name            = "buzz-tutor-sql-audit-to-splunk-${each.key}"
  log_group_name  = aws_cloudwatch_log_group.sql_server_audit[each.key].name
  filter_pattern  = "[event_time, server_principal_name, object_name, statement, client_ip]"  # Forward all audit logs
  
  destination_arn = aws_kinesis_firehose_delivery_stream.sql_audit_to_splunk[each.key].arn
  
  # Distribution across availability zones (if using Kinesis stream)
  # distribution = "ByLogStream"
  
  depends_on = [
    aws_kinesis_firehose_delivery_stream.sql_audit_to_splunk,
    aws_cloudwatch_log_group.sql_server_audit,
    aws_iam_role.firehose_splunk_role
  ]
}

# ============================================
# CloudWatch Metric Filters for SIEM Alerting
# ============================================

# Metric Filter: Unauthorized Access Attempts
resource "aws_cloudwatch_log_metric_filter" "unauthorized_access" {
  for_each = var.environments
  
  name           = "buzz-tutor-unauthorized-access-${each.key}"
  log_group_name = aws_cloudwatch_log_group.sql_server_audit[each.key].name
  pattern        = "{ $.success = 0 || $.response_code = 401 || $.response_code = 403 }"
  
  metric_transformation {
    name          = "UnauthorizedAccessAttempts"
    namespace     = "BuzzTutor/Audit"
    value         = "1"
    default_value = 0
    unit          = "Count"
  }
}

# Metric Filter: Bulk Data Export (GDPR/PCI DSS risk)
resource "aws_cloudwatch_log_metric_filter" "bulk_data_export" {
  for_each = var.environments
  
  name           = "buzz-tutor-bulk-export-${each.key}"
  log_group_name = aws_cloudwatch_log_group.sql_server_audit[each.key].name
  pattern        = "[..., statement = \"*SELECT **%\", affected_rows > 1000]"
  
  metric_transformation {
    name          = "BulkDataExport"
    namespace     = "BuzzTutor/Audit"
    value         = "1"
    default_value = 0
    unit          = "Count"
  }
}

# Metric Filter: Sensitive Table Access
resource "aws_cloudwatch_log_metric_filter" "sensitive_table_access" {
  for_each = var.environments
  
  name           = "buzz-tutor-sensitive-table-${each.key}"
  log_group_name = aws_cloudwatch_log_group.sql_server_audit[each.key].name
  pattern        = "[object_name = \"Users\" || object_name = \"UserProfiles\" || object_name = \"Payments\" || object_name = \"PaymentMethods\" || object_name = \"ChatLogs\"]"
  
  metric_transformation {
    name          = "SensitiveTableAccess"
    namespace     = "BuzzTutor/Audit"
    value         = "1"
    default_value = 0
    unit          = "Count"
  }
}

# ============================================
# CloudWatch Alarms for Real-Time Monitoring
# ============================================

# Alarm: Unauthorized Access Spike
resource "aws_cloudwatch_metric_alarm" "siem_unauthorized_spike" {
  for_each = var.environments
  
  alarm_name          = "buzz-tutor-siem-unauthorized-spike-${each.key}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "UnauthorizedAccessAttempts"
  namespace           = "BuzzTutor/Audit"
  period              = 300
  statistic           = "Sum"
  threshold           = 10  # 10+ unauthorized attempts in 5 minutes
  alarm_description   = "Multiple unauthorized access attempts detected in ${each.key}"
  alarm_actions       = [data.aws_sns_topic.alerts.arn]
  
  tags = {
    Application = "buzz-tutor"
    Environment = each.key
    Purpose     = "siem-unauthorized-detection"
    Severity    = "high"
    AlertType   = "security"
  }
}

# Alarm: Bulk Data Export
resource "aws_cloudwatch_metric_alarm" "siem_bulk_export_alert" {
  for_each = var.environments
  
  alarm_name          = "buzz-tutor-siem-bulk-export-${each.key}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "BulkDataExport"
  namespace           = "BuzzTutor/Audit"
  period              = 600
  statistic           = "Sum"
  threshold           = 1  # Alert on ANY bulk export
  alarm_description   = "Bulk data export detected - possible data breach in ${each.key}"
  alarm_actions       = [data.aws_sns_topic.alerts.arn]
  
  tags = {
    Application = "buzz-tutor"
    Environment = each.key
    Purpose     = "siem-bulk-export-detection"
    Severity    = "critical"
    AlertType   = "data-breach"
  }
}

# Alarm: High Volume Sensitive Table Access
resource "aws_cloudwatch_metric_alarm" "siem_sensitive_table_spike" {
  for_each = var.environments
  
  alarm_name          = "buzz-tutor-sensitive-table-spike-${each.key}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "SensitiveTableAccess"
  namespace           = "BuzzTutor/Audit"
  period              = 300
  statistic           = "Sum"
  threshold           = 1000  # 1000+ accesses in 5 minutes
  alarm_description   = "High volume access to sensitive tables in ${each.key}"
  alarm_actions       = [data.aws_sns_topic.alerts.arn]
  
  tags = {
    Application = "buzz-tutor"
    Environment = each.key
    Purpose     = "siem-sensitive-table-monitoring"
    Severity    = "high"
    AlertType   = "suspicious-activity"
  }
}

# ============================================
# CloudWatch Dashboard for Audit Monitoring
# ============================================

resource "aws_cloudwatch_dashboard" "audit_dashboard" {
  for_each = var.environments
  
  dashboard_name = "buzz-tutor-audit-monitoring-${each.key}"
  
  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        x = 0
        y = 0
        width = 12
        height = 6
        properties = {
          metrics = [
            ["BuzzTutor/Audit", "UnauthorizedAccessAttempts", { "label": "Unauthorized Access", "stat": "Sum" }],
            [".", "SensitiveTableAccess", { "label": "Sensitive Table Access", "stat": "Sum" }],
            ["AWS/Firehose", "DeliveryToSplunk.RecordsFailed", { "label": "Splunk Failures", "stat": "Sum" }]
          ]
          view = "timeSeries"
          stacked = false
          region = var.aws_region
          title = "Audit Events - ${title(each.key)}"
          period = 300
        }
      },
      {
        type = "log"
        x = 12
        y = 0
        width = 12
        height = 6
        properties = {
          query = "SOURCE '${aws_cloudwatch_log_group.sql_server_audit[each.key].name}' | fields @timestamp, server_principal_name, object_name, statement | filter object_name like /Users|UserProfiles|Payments|PaymentMethods/ | sort @timestamp desc | limit 20"
          region = var.aws_region
          title = "Recent Sensitive Data Access"
        }
      },
      {
        type = "metric"
        x = 0
        y = 6
        width = 12
        height = 6
        properties = {
          metrics = [
            [{ "expression": "m1+m2+m3+m4", "label": "Total Audit Events", "id": "e1" }],
            ["BuzzTutor/Audit", "GDPR_PII_Access", { "id": "m1", "visible": false }],
            [".", "PCI_CardholderData", { "id": "m2", "visible": false }],
            [".", "HighRiskOperations", { "id": "m3", "visible": false }],
            [".", "SensitiveTableAccess", { "id": "m4", "visible": false }]
          ]
          view = "timeSeries"
          stacked = true
          region = var.aws_region
          stat = "Sum"
          period = 3600
          title = "Compliance Scope Breakdown"
        }
      }
    ]
  })
  
  tags = {
    Application = "buzz-tutor"
    Environment = each.key
    Purpose     = "audit-monitoring-dashboard"
    Dashboard   = "siem"
  }
}

# ============================================
# Data Sources
# ============================================

data "aws_sns_topic" "alerts" {
  name = var.sns_alert_topic
}

# ============================================
# Outputs for SIEM Integration
# ============================================

output "splunk_integration_status" {
  description = "SIEM integration configuration"
  value = {
    for env, firehose in aws_kinesis_firehose_delivery_stream.sql_audit_to_splunk :
    env => {
      enabled               = true
      firehose_name         = firehose.name
      delivery_stream_arn   = firehose.arn
      splunk_host           = var.splunk_host
      splunk_index          = var.splunk_index
      backup_bucket         = aws_s3_bucket.splunk_backup[env].bucket
      backup_bucket_arn     = aws_s3_bucket.splunk_backup[env].arn
      dashboard_url         = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${aws_cloudwatch_dashboard.audit_dashboard[env].dashboard_name}"
      secret_arn            = aws_secretsmanager_secret.splunk_credentials[env].arn
    }
  }
}

output "alerting_configured" {
  description = "CloudWatch alerts configured for audit monitoring"
  value = {
    for env in keys(var.environments) :
    env => {
      unauthorized_spike      = aws_cloudwatch_metric_alarm.siem_unauthorized_spike[env].alarm_name
      bulk_export            = aws_cloudwatch_metric_alarm.siem_bulk_export_alert[env].alarm_name
      sensitive_table_spike  = aws_cloudwatch_metric_alarm.siem_sensitive_table_spike[env].alarm_name
      splunk_delivery_failure = aws_cloudwatch_metric_alarm.splunk_delivery_failure[env].alarm_name
    }
  }
}

output "metric_filters_created" {
  description = "CloudWatch metric filters for custom audit metrics"
  value = {
    for env in keys(var.environments) :
    env => {
      unauthorized_access   = aws_cloudwatch_log_metric_filter.unauthorized_access[env].name
      bulk_data_export      = aws_cloudwatch_log_metric_filter.bulk_data_export[env].name
      sensitive_table_access = aws_cloudwatch_log_metric_filter.sensitive_table_access[env].name
    }
  }
}
