# ============================================
# SQL Server Performance Monitoring - CloudWatch
# Terraform Configuration
# Step 7: Track encryption and audit performance impact
# ============================================

# ============================================
# CloudWatch Log Metric Filters - Performance Monitoring
# ============================================

# Metric Filter: High Latency Queries (>100ms)
resource "aws_cloudwatch_log_metric_filter" "high_latency_queries" {
  for_each = var.environments
  
  name           = "buzz-tutor-high-latency-queries-${each.key}"
  log_group_name = aws_cloudwatch_log_group.sql_server_audit[each.key].name
  
  # Parse audit log elapsed_time_ms field
  pattern        = "{ $.elapsed_time_ms > 100000 }"
  
  metric_transformation {
    name          = "HighLatencyQueries"
    namespace     = "BuzzTutor/Performance"
    value         = "1"
    default_value = 0
    unit          = "Count"
  }
  
  depends_on = [aws_cloudwatch_log_group.sql_server_audit]
}

# Metric Filter: Encryption Overhead (Always Encrypted operations)
resource "aws_cloudwatch_log_metric_filter" "encryption_operations" {
  for_each = var.environments
  
  name           = "buzz-tutor-encryption-ops-${each.key}"
  log_group_name = aws_cloudwatch_log_group.sql_server_audit[each.key].name
  
  # Detect Always Encrypted column operations
  pattern        = "[..., statement = /ENCRYPTBYKEY|DECRYPTBYKEY/*|| statement = /Encrypted[Column|Key]/]"
  
  metric_transformation {
    name          = "EncryptionOperations"
    namespace     = "BuzzTutor/Performance"
    value         = "1"
    default_value = 0
    unit          = "Count"
  }
  
  depends_on = [aws_cloudwatch_log_group.sql_server_audit]
}

# Metric Filter: Audit Queue Delays (>1s)
resource "aws_cloudwatch_log_metric_filter" "audit_queue_delays" {
  for_each = var.environments
  
  name           = "buzz-tutor-audit-queue-delay-${each.key}"
  log_group_name = aws_cloudwatch_log_group.sql_server_audit[each.key].name
  
  # Parse audit duration_milliseconds
  pattern        = "[event_time, duration_milliseconds > 1000]"
  
  metric_transformation {
    name          = "AuditQueueDelayOver1s"
    namespace     = "BuzzTutor/Audit"
    value         = "1"
    default_value = 0
    unit          = "Count"
  }
  
  depends_on = [aws_cloudwatch_log_group.sql_server_audit]
}

# Metric Filter: Performance Budget Violations (both CPU and Latency)
resource "aws_cloudwatch_log_metric_filter" "performance_budget_violations" {
  for_each = var.environments
  
  name           = "buzz-tutor-budget-violations-${each.key}"
  log_group_name = aws_cloudwatch_log_group.sql_server_audit[each.key].name
  
  # Both CPU >5% and Latency >100ms (simplified pattern)
  pattern        = "[elapsed_time_ms > 100000]"
  
  metric_transformation {
    name          = "PerformanceBudgetViolations"
    namespace     = "BuzzTutor/Performance"
    value         = "1"
    default_value = 0
    unit          = "Count"
  }
  
  depends_on = [aws_cloudwatch_log_group.sql_server_audit]
}

# Metric Filter: Encryption-Enabled Queries (count tracking)
resource "aws_cloudwatch_log_metric_filter" "encryption_enabled_queries" {
  for_each = var.environments
  
  name           = "buzz-tutor-encryption-count-${each.key}"
  log_group_name = aws_cloudwatch_log_group.sql_server_audit[each.key].name
  
  pattern        = "[encryption_context = /Encryption/]"
  
  metric_transformation {
    name          = "EncryptionEnabledQueries"
    namespace     = "BuzzTutor/Performance"
    value         = "1"
    default_value = 0
    unit          = "Count"
  }
  
  depends_on = [aws_cloudwatch_log_group.sql_server_audit]
}

# Metric Filter: Audit-Enabled Queries (count tracking)
resource "aws_cloudwatch_log_metric_filter" "audit_enabled_queries" {
  for_each = var.environments
  
  name           = "buzz-tutor-audit-count-${each.key}"
  log_group_name = aws_cloudwatch_log_group.sql_server_audit[each.key].name
  
  pattern        = "[audit_context = /Audit/]"
  
  metric_transformation {
    name          = "AuditEnabledQueries"
    namespace     = "BuzzTutor/Audit"
    value         = "1"
    default_value = 0
    unit          = "Count"
  }
  
  depends_on = [aws_cloudwatch_log_group.sql_server_audit]
}

# ============================================
# CloudWatch Alarms for Performance Budgets
# ============================================

# Alarm: High Latency Queries > 100ms (per-query budget)
resource "aws_cloudwatch_metric_alarm" "latency_budget_exceeded" {
  for_each = var.environments
  
  alarm_name          = "buzz-tutor-latency-budget-exceeded-${each.key}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HighLatencyQueries"
  namespace           = "BuzzTutor/Performance"
  period              = 300
  statistic           = "Sum"
  threshold           = 5  # Alert if >5 high latency queries in 5 minutes
  
  alarm_description   = "Query latency exceeds 100ms budget in ${each.key}. Encryption or audit may be causing degradation."
  alarm_actions       = [data.aws_sns_topic.alerts.arn]
  
  tags = {
    Application = "buzz-tutor"
    Environment = each.key
    Purpose     = "performance-budget-monitoring"
    AlertType   = "performance"
    Severity    = "high"
    Resource    = "sql-server"
    Feature     = "encryption-audit"
  }
}

# Alarm: Encryption Operations Spike (>50/minute)
resource "aws_cloudwatch_metric_alarm" "encryption_spike" {
  for_each = var.environments
  
  alarm_name          = "buzz-tutor-encryption-spike-${each.key}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "EncryptionOperations"
  namespace           = "BuzzTutor/Performance"
  period              = 60
  statistic           = "Sum"
  threshold           = 50  # Alert if >50 encryption ops per minute
  
  alarm_description   = "Unusual spike in encryption operations in ${each.key}. Possible performance issue."
  alarm_actions       = [data.aws_sns_topic.alerts.arn]
  
  tags = {
    Application = "buzz-tutor"
    Environment = each.key
    Purpose     = "encryption-performance-monitoring"
    Severity    = "medium"
    AlertType   = "performance"
    Resource    = "sql-server"
    Feature     = "always-encrypted"
  }
}

# Alarm: Audit Queue Delay Budget (>1s delays)
resource "aws_cloudwatch_metric_alarm" "audit_queue_budget" {
  for_each = var.environments
  
  alarm_name          = "buzz-tutor-audit-queue-budget-${each.key}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "AuditQueueDelayOver1s"
  namespace           = "BuzzTutor/Audit"
  period              = 300
  statistic           = "Sum"
  threshold           = 10  # Alert if >10 queue delays in 5 minutes
  
  alarm_description   = "Audit queue delay exceeds 1s budget in ${each.key}. Review audit configuration."
  alarm_actions       = [data.aws_sns_topic.alerts.arn]
  
  tags = {
    Application = "buzz-tutor"
    Environment = each.key
    Purpose     = "audit-performance-monitoring"
    Severity    = "high"
    AlertType   = "performance"
    Resource    = "sql-server"
    Feature     = "sql-audit"
  }
}

# Alarm: Combined Performance Budget Violation
resource "aws_cloudwatch_metric_alarm" "combined_budget_violation" {
  for_each = var.environments
  
  alarm_name          = "buzz-tutor-combined-budget-${each.key}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "PerformanceBudgetViolations"
  namespace           = "BuzzTutor/Performance"
  period              = 600  # 10 minutes
  statistic           = "Sum"
  threshold           = 5  # Alert if >5 violations in 10 minutes
  
  alarm_description   = "Combined performance budget violated in ${each.key}. Encryption or audit causing degradation. Consider configuration tuning."
  alarm_actions       = [data.aws_sns_topic.alerts.arn]
  
  tags = {
    Application = "buzz-tutor"
    Environment = each.key
    Purpose     = "combined-performance-budget"
    Severity    = "critical"
    AlertType   = "performance"
    Resource    = "sql-server"
    Feature     = "encryption-audit-combined"
  }
}

# Alarm: Encryption Overhead Alert (high encryption operation volume)
resource "aws_cloudwatch_metric_alarm" "encryption_overhead_high" {
  for_each = var.environments
  
  alarm_name          = "buzz-tutor-encryption-overhead-${each.key}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "EncryptionEnabledQueries"
  namespace           = "BuzzTutor/Performance" 
  period              = 300
  statistic           = "Sum"
  threshold           = 20  # >20 encryption queries per 5 minutes
  
  alarm_description   = "High encryption operation volume in ${each.key}. May indicate performance issue."
  alarm_actions       = [data.aws_sns_topic.alerts.arn]
  
  tags = {
    Application = "buzz-tutor"
    Environment = each.key
    Purpose     = "encryption-volume-monitoring"
    Severity    = "medium"
    AlertType   = "performance"
    Resource    = "sql-server"
    Feature     = "always-encrypted"
  }
}

# Alarm: Performance Degradation Trend
resource "aws_cloudwatch_metric_alarm" "performance_degradation" {
  for_each = var.environments
  
  alarm_name          = "buzz-tutor-performance-degradation-${each.key}"
  comparison_operator = "GreaterThanUpperThreshold"
  evaluation_periods  = 3
  metric_name         = "HighLatencyQueries"
  namespace           = "BuzzTutor/Performance"
  period              = 300
  statistic           = "Sum"
  threshold           = 3  # Alert if trending upward
  treat_missing_data  = "notBreaching"
  
  alarm_description   = "Performance degradation detected in ${each.key}. Queries trending toward budget limits."
  alarm_actions       = [data.aws_sns_topic.alerts.arn]
  
  tags = {
    Application = "buzz-tutor"
    Environment = each.key
    Purpose     = "performance-trend-monitoring"
    Severity    = "warning"
    AlertType   = "performance"
    Resource    = "sql-server"
    Feature     = "trend-analysis"
  }
}

# ============================================
# CloudWatch Dashboard for Performance Monitoring
# ============================================

resource "aws_cloudwatch_dashboard" "performance_monitoring" {
  for_each = var.environments
  
  dashboard_name = "buzz-tutor-performance-monitoring-${each.key}"
  
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
            ["AWS/RDS", "CPUUtilization", { "label": "RDS CPU %", "stat": "Average" }],
            [".", "DatabaseConnections", { "label": "DB Connections", "stat": "Average", "yAxis": "right" }],
            ["BuzzTutor/Performance", "HighLatencyQueries", { "label": "High Latency Queries", "stat": "Sum" }],
            ["BuzzTutor/Audit", "AuditQueueDelayOver1s", { "label": "Audit Delays", "stat": "Sum" }]
          ]
          view = "timeSeries"
          stacked = false
          region = var.aws_region
          title = "Performance Metrics - ${title(each.key)}"
          period = 300
          stat = "Average"
          yAxis = {
            left = {
              label = "Percentage/Count"
              showUnits = false
            }
            right = {
              label = "Connections"
              showUnits = false
            }
          }
        }
      },
      {
        type = "metric"
        x = 12
        y = 0
        width = 12
        height = 6
        properties = {
          metrics = [
            ["BuzzTutor/Performance", "PerformanceBudgetViolations", { "label": "Budget Violations", "stat": "Sum" }],
            [".", "EncryptionOperations", { "label": "Encryption Ops", "stat": "Sum" }],
            ["BuzzTutor/Audit", "AuditEnabledQueries", { "label": "Audit Queries", "stat": "Sum" }]
          ]
          view = "timeSeries"
          stacked = false
          region = var.aws_region
          title = "Budget Compliance & Feature Usage - ${title(each.key)}"
          period = 300
          stat = "Sum"
        }
      },
      {
        type = "log"
        x = 0
        y = 6
        width = 24
        height = 6
        properties = {
          query = "SOURCE '${aws_cloudwatch_log_group.sql_server_audit[each.key].name}' | fields @timestamp, elapsed_time_ms, cpu_time_ms, encryption_context | filter elapsed_time_ms > 100000 | sort @timestamp desc | limit 50"
          region = var.aws_region
          title = "Slow Queries (Over 100ms) - ${title(each.key)}"
        }
      },
      {
        type = "metric"
        x = 0
        y = 12
        width = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/RDS", "ReadLatency", { "label": "Read Latency (ms)", "stat": "Average" }],
            [".", "WriteLatency", { "label": "Write Latency (ms)", "stat": "Average" }],
            [{ "expression": "AVG([ReadLatency, WriteLatency])", "label": "Avg Latency", "id": "e1", "stat": "Average" }]
          ]
          view = "timeSeries"
          stacked = false
          region = var.aws_region
          title = "RDS Latency Metrics - ${title(each.key)}"
          period = 300
          stat = "Average"
          yAxis = {
            left = {
              label = "Milliseconds"
              showUnits = false
            }
          }
          annotations = {
            horizontal = [
              {
                label = "100ms Budget"
                value = 100
                color = "#ff0000"
              }
            ]
          }
        }
      },
      {
        type = "metric"
        x = 12
        y = 12
        width = 12
        height = 6
        properties = {
          metrics = [
            ["BuzzTutor/Performance", "EncryptionEnabledQueries", { "label": "Encryption Queries", "stat": "Sum" }],
            ["BuzzTutor/Audit", "AuditEnabledQueries", { "label": "Audit Queries", "stat": "Sum" }],
            [{ "expression": "SUM([EncryptionEnabledQueries, AuditEnabledQueries])", "label": "Total Feature Queries", "id": "e1", "stat": "Sum" }]
          ]
          view = "timeSeries"
          stacked = true
          region = var.aws_region
          title = "Feature-Enabled Query Volume - ${title(each.key)}"
          period = 300
          stat = "Sum"
        }
      }
    ]
  })
  
  tags = {
    Application = "buzz-tutor"
    Environment = each.key
    Purpose     = "performance-monitoring-dashboard"
    Dashboard   = "encryption-audit-performance"
    CostCenter  = each.key == "production" ? "compliance" : "engineering"
  }
}

# ============================================
# Outputs for Performance Monitoring
# ============================================

output "performance_monitoring_dashboard_url" {
  description = "URL for performance monitoring dashboard"
  
  value = {
    for env, dashboard in aws_cloudwatch_dashboard.performance_monitoring :
    env => "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${dashboard.dashboard_name}"
  }
}

output "performance_alarms_configured" {
  description = "CloudWatch performance alarms configured"
  
  value = {
    for env in keys(var.environments) :
    env => {
      latency_budget       = aws_cloudwatch_metric_alarm.latency_budget_exceeded[env].alarm_name
      encryption_spike     = aws_cloudwatch_metric_alarm.encryption_spike[env].alarm_name
      audit_queue_budget   = aws_cloudwatch_metric_alarm.audit_queue_budget[env].alarm_name
      combined_budget      = aws_cloudwatch_metric_alarm.combined_budget_violation[env].alarm_name
      encryption_overhead  = aws_cloudwatch_metric_alarm.encryption_overhead_high[env].alarm_name
      degradation_trend    = aws_cloudwatch_metric_alarm.performance_degradation[env].alarm_name
    }
  }
}

output "performance_metric_filters" {
  description = "CloudWatch metric filters for performance tracking"
  
  value = {
    for env in keys(var.environments) :
    env => {
      high_latency         = aws_cloudwatch_log_metric_filter.high_latency_queries[env].name
      encryption_ops       = aws_cloudwatch_log_metric_filter.encryption_operations[env].name
      audit_delays         = aws_cloudwatch_log_metric_filter.audit_queue_delays[env].name
      budget_violations    = aws_cloudwatch_log_metric_filter.performance_budget_violations[env].name
      encryption_queries   = aws_cloudwatch_log_metric_filter.encryption_enabled_queries[env].name
      audit_queries        = aws_cloudwatch_log_metric_filter.audit_enabled_queries[env].name
    }
  }
}
