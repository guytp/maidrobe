# ============================================
# Outputs - Buzz A Tutor SQL Server TDE
# ============================================

output "rds_instance_details" {
  description = "RDS SQL Server instance details"
  value = {
    for env, instance in aws_db_instance.buzz_tutor_sql_server :
    env => {
      identifier          = instance.identifier
      endpoint            = instance.endpoint
      port                = instance.port
      engine              = instance.engine
      engine_version      = instance.engine_version
      instance_class      = instance.instance_class
      storage_encrypted   = instance.storage_encrypted
      kms_key_id          = instance.kms_key_id
      multi_az            = instance.multi_az
      backup_retention    = instance.backup_retention_period
      deletion_protection = instance.deletion_protection
      monitoring_interval = instance.monitoring_interval
      security_groups     = instance.vpc_security_group_ids
    }
  }
}

output "kms_key_details" {
  description = "KMS CMK details for TDE"
  value = {
    for env, key in aws_kms_key.buzz_tutor_tde :
    env => {
      key_id          = key.key_id
      arn             = key.arn
      alias           = aws_kms_alias.buzz_tutor_tde_alias[env].name
      rotation_enabled = key.enable_key_rotation
      rotation_period  = key.rotation_period_in_days
      deletion_window  = key.deletion_window_in_days
    }
  }
}

output "iam_role_details" {
  description = "IAM role for RDS"
  value = {
    role_name   = aws_iam_role.buzz_tutor_rds_role.name
    role_arn    = aws_iam_role.buzz_tutor_rds_role.arn
    policy_name = aws_iam_role_policy.buzz_tutor_rds_kms_access.name
  }
}

output "cloudwatch_alarms" {
  description = "CloudWatch alarm names"
  value = {
    cpu_high = {
      for env, alarm in aws_cloudwatch_metric_alarm.cpu_high :
      env => alarm.alarm_name
    },
    read_latency_high = {
      for env, alarm in aws_cloudwatch_metric_alarm.read_latency_high :
      env => alarm.alarm_name
    },
    backup_failed = {
      for env, alarm in aws_cloudwatch_metric_alarm.backup_failed :
      env => alarm.alarm_name
    }
  }
}

output "connection_strings" {
  description = "Database connection strings"
  value = {
    for env, instance in aws_db_instance.buzz_tutor_sql_server :
    env => "Server=${instance.endpoint},${instance.port};Database=BuzzTutor${title(env)};Encrypt=true;TrustServerCertificate=false;"
  }
  sensitive = true
}

output "terraform_state_s3_bucket" {
  description = "S3 bucket for Terraform state (create separately)"
  value       = var.terraform_state_bucket
}

output "next_steps" {
  description = "Next steps after deployment"
  value = <<EOT

✅ TDE Infrastructure Created Successfully!

Next Steps:
1. Run database migrations to create schema
2. Configure Always Encrypted (Column-level)
3. Update application connection strings
4. Test encrypted connections
5. Verify backup encryption
6. Set up additional monitoring dashboards

Important Notes:
- Storage encryption is now enabled at rest
- All automated backups are encrypted
- KMS keys are configured for annual rotation
- Performance Insights are encrypted
- Enhanced monitoring is enabled

EOT
}
