# ============================================
# KMS Key Management - IAM Roles and Policies
# ============================================
# This module defines IAM roles and policies for centralized key management
# Implements emergency access, key recovery, and operational key management

# ============================================
# Key Management Admin Role
# For routine key operations (rotation, enable/disable, audit)
# ============================================

resource "aws_iam_role" "buzz_tutor_key_management_admin" {
  for_each = var.environments

  name = "BuzzTutorKeyManagementAdmin-${each.key}"

  description = "Role for routine key management operations in ${title(each.key)} environment"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/BuzzTutorDevOps"
        }
        Action = "sts:AssumeRole"
        Condition = {
          StringEquals = {
            "aws:RequestTag/Environment" = each.key
            "aws:RequestTag/Purpose"     = "key_management"
          }
          Bool = {
            "aws:MultiFactorAuthPresent" = "true"
          }
        }
      }
    ]
  })

  tags = {
    Application   = "buzz-tutor"
    Environment   = each.key
    Purpose       = "key-management-admin"
    ManagedBy     = "terraform"
    AccessLevel   = "administrative"
    RequiresMFA   = "true"
  }
}

resource "aws_iam_role_policy" "buzz_tutor_key_management_policy" {
  for_each = var.environments

  name = "BuzzTutorKeyManagementPolicy-${each.key}"
  role = aws_iam_role.buzz_tutor_key_management_admin[each.key].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid = "AllowKeyManagementOperations"
        Effect = "Allow"
        Action = [
          "kms:EnableKey",
          "kms:DisableKey",
          "kms:ScheduleKeyDeletion",
          "kms:CancelKeyDeletion",
          "kms:RotateKeyOnDemand",
          "kms:GetKeyRotationStatus",
          "kms:DescribeKey",
          "kms:GetKeyPolicy"
        ]
        Resource = aws_kms_key.buzz_tutor_tde[each.key].arn
      },
      {
        Sid = "AllowKeyDiscovery"
        Effect = "Allow"
        Action = [
          "kms:ListKeys",
          "kms:ListAliases",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })
}

# ============================================
# Emergency Key Access Role
# For incident response (key revocation, emergency disable)
# Requires MFA and emergency access justification
# ============================================

resource "aws_iam_role" "buzz_tutor_emergency_key_admin" {
  for_each = var.environments

  name = "BuzzTutorEmergencyKeyAdmin-${each.key}"

  description = "EMERGENCY ACCESS: For security incident response in ${title(each.key)} environment"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/BuzzTutorSecurityTeam"
        }
        Action = "sts:AssumeRole"
        Condition = {
          Bool = {
            "aws:MultiFactorAuthPresent" = "true"
          }
          StringEquals = {
            "aws:RequestTag/EmergencyAccess"      = "true"
            "aws:RequestTag/EmergencyJustification" = "incident-response"
          }
        }
      }
    ]
  })

  tags = {
    Application   = "buzz-tutor"
    Environment   = each.key
    Purpose       = "emergency-key-admin"
    ManagedBy     = "terraform"
    AccessLevel   = "emergency"
    RequiresMFA   = "true"
    EmergencyOnly = "true"
  }
}

resource "aws_iam_role_policy" "buzz_tutor_emergency_key_policy" {
  for_each = var.environments

  name = "BuzzTutorEmergencyKeyPolicy-${each.key}"
  role = aws_iam_role.buzz_tutor_emergency_key_admin[each.key].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid = "AllowEmergencyKeyOperations"
        Effect = "Allow"
        Action = [
          "kms:DisableKey",
          "kms:ScheduleKeyDeletion",
          "kms:RevokeGrant",
          "kms:RetireGrant",
          "kms:GetKeyRotationStatus"
        ]
        Resource = aws_kms_key.buzz_tutor_tde[each.key].arn
        Condition = {
          StringEquals = {
            "kms:ViaService" = "rds.${var.aws_region}.amazonaws.com"
          }
        }
      },
      {
        Sid = "AllowEmergencyKeyDiscovery"
        Effect = "Allow"
        Action = [
          "kms:DescribeKey",
          "kms:GetKeyPolicy",
          "kms:ListGrants"
        ]
        Resource = aws_kms_key.buzz_tutor_tde[each.key].arn
      }
    ]
  })
}

# ============================================
# Key Recovery Role
# For key recovery operations (within 7-day window)
# ============================================

resource "aws_iam_role" "buzz_tutor_key_recovery_admin" {
  for_each = var.environments

  name = "BuzzTutorKeyRecoveryAdmin-${each.key}"

  description = "Role for key recovery operations in ${title(each.key)} environment (requires approval)"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/BuzzTutorDevOps"
        }
        Action = "sts:AssumeRole"
        Condition = {
          StringEquals = {
            "aws:RequestTag/OperationType" = "key_recovery"
            "aws:RequestTag/HasApproval"   = "true"
          }
          Bool = {
            "aws:MultiFactorAuthPresent" = "true"
          }
        }
      }
    ]
  })

  tags = {
    Application   = "buzz-tutor"
    Environment   = each.key
    Purpose       = "key-recovery-admin"
    ManagedBy     = "terraform"
    AccessLevel   = "recovery"
    RequiresMFA   = "true"
    RequiresApproval = "true"
  }
}

resource "aws_iam_role_policy" "buzz_tutor_key_recovery_policy" {
  for_each = var.environments

  name = "BuzzTutorKeyRecoveryPolicy-${each.key}"
  role = aws_iam_role.buzz_tutor_key_recovery_admin[each.key].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid = "AllowKeyRecovery"
        Effect = "Allow"
        Action = [
          "kms:EnableKey",
          "kms:CancelKeyDeletion"
        ]
        Resource = aws_kms_key.buzz_tutor_tde[each.key].arn
        Condition = {
          NumericLessThanEquals = {
            "kms:KeyDeletionWindowDays" = "7"
          }
        }
      },
      {
        Sid = "AllowBackupVerification"
        Effect = "Allow"
        Action = [
          "rds:DescribeDBInstances",
          "rds:DescribeDBSnapshots"
        ]
        Resource = "*"
      }
    ]
  })
}

# ============================================
# Key Management Monitoring
# CloudWatch Alarms for key operations
# ============================================

resource "aws_cloudwatch_metric_alarm" "key_rotation_failure" {
  for_each = var.environments

  alarm_name          = "buzz-tutor-key-rotation-failure-${each.key}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "KMSKeyRotationFailures"
  namespace           = "AWS/KMS"
  period              = 3600
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "KMS key rotation failed in ${each.key} environment. Immediate investigation required."
  alarm_actions       = [data.aws_sns_topic.alerts.arn]
  ok_actions          = [data.aws_sns_topic.alerts.arn]

  tags = {
    Application = "buzz-tutor"
    Environment = each.key
    AlertType   = "key-rotation-failure"
    Severity    = "high"
  }
}

resource "aws_cloudwatch_metric_alarm" "unauthorized_key_access" {
  for_each = var.environments

  alarm_name          = "buzz-tutor-unauthorized-key-access-${each.key}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "KMSUnauthorizedKeyAccess"
  namespace           = "AWS/KMS"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Unauthorized KMS key access detected in ${each.key}. Possible security breach."
  alarm_actions       = [data.aws_sns_topic.alerts.arn]

  tags = {
    Application = "buzz-tutor"
    Environment = each.key
    AlertType   = "unauthorized-access"
    Severity    = "critical"
  }
}

resource "aws_cloudwatch_metric_alarm" "emergency_key_access" {
  for_each = var.environments

  alarm_name          = "buzz-tutor-emergency-key-access-${each.key}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "EmergencyKeyAccessed"
  namespace           = "BuzzTutor/Security"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "EMERGENCY: Emergency key access used in ${each.key}. Verify incident response activation."
  alarm_actions       = [data.aws_sns_topic.alerts.arn]

  tags = {
    Application = "buzz-tutor"
    Environment = each.key
    AlertType   = "emergency-access"
    Severity    = "critical"
  }
}

# ============================================
# Key Management Secrets and Configuration
# Emergency procedures and access information
# ============================================

resource "aws_secretsmanager_secret" "buzz_tutor_key_management_config" {
  for_each = var.environments

  name                    = "buzz-tutor/key-management-config-${each.key}"
  recovery_window_in_days = 30
  kms_key_id              = aws_kms_key.buzz_tutor_tde[each.key].arn

  tags = {
    Application = "buzz-tutor"
    Environment = each.key
    Purpose     = "key-management-configuration"
    Confidential = "true"
    ManagedBy   = "terraform"
  }
}

resource "aws_secretsmanager_secret_version" "buzz_tutor_key_management_config" {
  for_each = var.environments

  secret_id = aws_secretsmanager_secret.buzz_tutor_key_management_config[each.key].id
  secret_string = jsonencode({
    key_management_procedures = {
      standard_rotation = {
        frequency_days = 90
        notification_days_before = 7
        procedure = "Automated via AWS KMS. No manual intervention required for standard rotation."
      }
      emergency_revocation = {
        who_can_invoke = ["Security Team", "DevOps On-Call"]
        required_conditions = ["MFA enabled", "Emergency role assumed", "Incident response activated"]
        max_duration_minutes = 60
        procedure = {
          steps = [
            "Enable MFA",
            "Assume emergency role with incident ID",
            "Execute emergency_revocation.sh script",
            "Verify key disabled",
            "Log incident details",
            "Notify security team",
            "Activate incident response team"
          ]
          verification = "Check CloudWatch alarm and SQL Server audit log"
        }
      }
      key_recovery = {
        window_days = 7
        who_can_invoke = ["DevOps Team", "Database Admin"]
        required_approvals = ["Security Team Lead", "DevOps Manager"]
        procedure = {
          steps = [
            "Obtain approval from Security Lead and DevOps Manager",
            "Assume key recovery role",
            "Verify backup integrity",
            "Execute recover_key.sh script",
            "Enable key",
            "Test application access",
            "Monitor for errors"
          ]
          verification = "Run test queries and monitor CloudWatch metrics"
        }
      }
    }
    emergency_contacts = {
      security_team = "security-team@buzztutor.com"
      devops_oncall = "devops-oncall@buzztutor.com"
      database_admin = "db-admin@buzztutor.com"
      incident_response = "incident-response@buzztutor.com"
    }
    key_identifiers = {
      tde_key_arn = aws_kms_key.buzz_tutor_tde[each.key].arn
      tde_key_alias = aws_kms_alias.buzz_tutor_tde_alias[each.key].name
      user_data_key_arn = lookup(var.additional_kms_keys, "user_data", aws_kms_key.buzz_tutor_tde[each.key]).arn
      payment_data_key_arn = lookup(var.additional_kms_keys, "payment_data", aws_kms_key.buzz_tutor_tde[each.key]).arn
    }
    verification_commands = {
      check_key_status = "aws kms describe-key --key-id KEY_ARN --region REGION"
      check_rotation_status = "aws kms get-key-rotation-status --key-id KEY_ARN --region REGION"
      list_key_policies = "aws kms get-key-policy --key-id KEY_ARN --policy-name default --region REGION"
      check_sql_encryption = "SELECT encrypt_option, auth_scheme FROM sys.dm_exec_connections"
    }
  })

  depends_on = [aws_kms_key.buzz_tutor_tde, aws_kms_alias.buzz_tutor_tde_alias]
}

# ============================================
# Data Sources
# ============================================

data "aws_sns_topic" "alerts" {
  name = var.sns_alert_topic
}

data "aws_caller_identity" "current" {}

# ============================================
# Advanced Key Management Variables
# ============================================

variable "additional_kms_keys" {
  description = "Additional KMS keys for specific data types"
  type        = map(object({
    arn   = string
    alias = string
  }))
  default = {}
}

locals {
  key_management_roles = {
    for env in var.environments : env => {
      key_management_admin = aws_iam_role.buzz_tutor_key_management_admin[env].arn
      emergency_key_admin  = aws_iam_role.buzz_tutor_emergency_key_admin[env].arn
      key_recovery_admin   = aws_iam_role.buzz_tutor_key_recovery_admin[env].arn
    }
  }
}

# ============================================
# Outputs - Key Management
# ============================================
output "key_management_roles" {
  description = "IAM roles for key management operations"
  value       = local.key_management_roles
}

output "key_management_alarms" {
  description = "CloudWatch alarms for key management operations"
  value = {
    for env in var.environments : env => {
      rotation_failure        = aws_cloudwatch_metric_alarm.key_rotation_failure[env].arn
      unauthorized_access     = aws_cloudwatch_metric_alarm.unauthorized_key_access[env].arn
      emergency_access        = aws_cloudwatch_metric_alarm.emergency_key_access[env].arn
    }
  }
}

output "key_management_secrets" {
  description = "Secrets Manager entries for key management config"
  value = {
    for env in var.environments : env => {
      config_secret = aws_secretsmanager_secret.buzz_tutor_key_management_config[env].arn
    }
  }
}