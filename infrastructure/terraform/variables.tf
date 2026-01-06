# ============================================
# Variables - Buzz A Tutor SQL Server TDE
# ============================================

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "environments" {
  description = "Environments to deploy (staging, production)"
  type        = set(string)
  default     = ["staging", "production"]
}

# ============================================
# SQL Server Configuration
# ============================================

variable "sql_server_config" {
  description = "SQL Server configuration per environment"
  type        = map(map(any))

  default = {
    staging = {
      engine_version         = "15.00.4236.7.v1"
      instance_class         = "db.r5.large"
      allocated_storage      = 200
      iops                   = 3000
      throughput             = 125
      multi_az               = true
      backup_retention_period = 7
      backup_window          = "03:00-04:00"
      maintenance_window     = "sun:04:00-sun:05:00"
      deletion_protection    = false
    }
    production = {
      engine_version         = "15.00.4236.7.v1"
      instance_class         = "db.r5.xlarge"
      allocated_storage      = 500
      iops                   = 6000
      throughput             = 500
      multi_az               = true
      backup_retention_period = 30
      backup_window          = "02:00-03:00"
      maintenance_window     = "sun:02:00-sun:03:00"
      deletion_protection    = true
    }
  }
}

variable "sql_server_credentials" {
  description = "SQL Server admin credentials per environment"
  type        = map(map(string))
  sensitive   = true

  default = {
    staging = {
      username = "sqladmin"
      password = null  # Set via TF_VAR_sql_server_credentials_staging_password
    }
    production = {
      username = "sqladmin"
      password = null  # Set via TF_VAR_sql_server_credentials_production_password
    }
  }
}

# ============================================
# Network Configuration
# ============================================

variable "vpc_id" {
  description = "VPC ID for RDS instances"
  type        = string
}

variable "rds_security_group_ids" {
  description = "Security group IDs for RDS instances"
  type        = map(list(string))
  
  default = {
    staging    = []
    production = []
  }
}

variable "rds_subnet_group_name" {
  description = "DB subnet group name"
  type        = map(string)
  
  default = {
    staging    = "buzz-tutor-staging-subnet"
    production = "buzz-tutor-prod-subnet"
  }
}

# ============================================
# KMS Configuration
# ============================================

variable "kms_deletion_window" {
  description = "KMS key deletion window in days"
  type        = number
  default     = 7
}

variable "kms_rotation_enabled" {
  description = "Enable automatic KMS key rotation"
  type        = bool
  default     = true
}

variable "kms_rotation_period" {
  description = "KMS key rotation period in days (90 days for compliance with PCI DSS and security best practices)"
  type        = number
  default     = 90
}

# ============================================
# Monitoring & Alerts
# ============================================

variable "cpu_threshold" {
  description = "CPU utilization alarm threshold (percent)"
  type        = number
  default     = 70
}

variable "read_latency_threshold" {
  description = "Read latency alarm threshold (seconds)"
  type        = number
  default     = 0.025
}

variable "sns_alert_topic" {
  description = "SNS topic name for alerts"
  type        = string
  default     = "buzz-tutor-alerts"
}

# ============================================
# Performance Tuning
# ============================================

variable "parameter_group_family" {
  description = "RDS parameter group family"
  type        = string
  default     = "sqlserver-ex-15.0"
}

variable "monitoring_interval" {
  description = "Enhanced monitoring interval (seconds)"
  type        = number
  default     = 60
}

# ============================================
# Feature Flags
# ============================================

variable "enable_performance_insights" {
  description = "Enable Performance Insights"
  type        = bool
  default     = true
}

variable "enable_cloudwatch_logs" {
  description = "Enable CloudWatch logs export"
  type        = bool
  default     = true
}

variable "enable_enhanced_monitoring" {
  description = "Enable Enhanced Monitoring"
  type        = bool
  default     = true
}

# ============================================
# SIEM Integration Configuration
# ============================================

variable "splunk_host" {
  description = "Splunk HTTP Event Collector (HEC) host endpoint"
  type        = string
  default     = "https://your-splunk-hec-endpoint.splunkcloud.com:8088"
  sensitive   = true
}

variable "splunk_hec_token" {
  description = "Splunk HTTP Event Collector token (store in Secrets Manager)"
  type        = string
  sensitive   = true
  default     = ""  # Override with actual token
}

variable "splunk_index" {
  description = "Splunk index for Buzz Tutor audit logs"
  type        = string
  default     = "aws_buzz_tutor_audit"
}

variable "siem_enabled" {
  description = "Enable/disable SIEM integration"
  type        = bool
  default     = true
}
