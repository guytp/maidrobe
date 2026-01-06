# Emergency Key Revocation Runbook

**Document Version**: 1.0  
**Last Updated**: January 6, 2026  
**Owner**: Security Team  
**Classification**: CONFIDENTIAL

---

## 1. Purpose and Scope

### 1.1 Purpose
This runbook provides step-by-step procedures for emergency key revocation in response to security incidents involving compromised or exposed encryption keys.

### 1.2 Scope
Applies to all AWS KMS keys and SQL Server column encryption keys (CEKs) used by the Buzz A Tutor platform in both staging and production environments.

### 1.3 When to Use This Runbook

**IMMEDIATE Use Required When:**
- ✓ Key compromise is suspected or confirmed
- ✓ Unauthorized access to encrypted data detected
- ✓ Security breach involving encryption keys
- ✓ Malicious insider activity involving keys
- ✓ Accidental key exposure (public repository, logs, etc.)
- ✓ Lost or stolen credentials with key access

### 1.4 When to Use This Runbook

**IMMEDIATE Use Required When:**
- ✓ Key compromise is suspected or confirmed
- ✓ Unauthorized access to encrypted data detected
- ✓ Security breach involving encryption keys
- ✓ Malicious insider activity involving keys
- ✓ Accidental key exposure (public repository, logs, etc.)
- ✓ Lost or stolen credentials with key access

---

## 2. Prerequisites

### 2.1 Required Access

- **AWS Account**: Access to BuzzTutor AWS account
- **IAM Role**: Permission to assume `BuzzTutorEmergencyKeyAdmin-{env}` role
- **MFA**: Multi-factor authentication enabled and accessible
- **Network**: Access to AWS RDS SQL Server instances

### 2.2 Required Tools

| Tool | Version | Purpose |
|------|---------|---------|
| AWS CLI | v2.x+ | AWS resource management |
| jq | 1.6+ | JSON parsing |
| sqlcmd | 17.x+ | SQL Server access |
| bash | 4.x+ | Script execution |
| curl | 7.x+ | Health checks |

---

## 3. Emergency Revocation Procedure

### Quick Reference

**Emergency Revocation Command:**
```bash
cd /home/kimi/code/backend/src/database/scripts
./emergency_key_revocation.sh \
  "${ENVIRONMENT}" \
  "${KEY_NAME}" \
  "${INCIDENT_ID}" \
  "${REASON}"
```

**Example:**
```bash
./emergency_key_revocation.sh \
  production \
  CEK_User_12345 \
  INCIDENT-2024-001 \
  "Key compromise detected in security scan"
```

### Step 1: Preparation (2-5 minutes)

**Verify incident details:**
```bash
echo "=== EMERGENCY KEY REVOCATION ==="
echo "Environment: ${ENVIRONMENT}"
echo "Key Name: ${KEY_NAME}"
echo "Incident ID: ${INCIDENT_ID}"
echo "Reason: ${REASON}"
echo ""
```

**Check prerequisites:**
```bash
# Verify MFA is enabled
aws sts get-caller-identity --query 'Arn' | grep -q "mfa" || {
  echo "ERROR: MFA not enabled"
  exit 1
}

# Verify AWS access
echo "Testing AWS access..."
aws sts get-caller-identity --query 'Arn' --output text
```

### Step 2: Execute Emergency Revocation (5-10 minutes)

**Run the revocation script:**
```bash
cd /home/kimi/code/backend/src/database/scripts

./emergency_key_revocation.sh \
  "${ENVIRONMENT}" \
  "${KEY_NAME}" \
  "${INCIDENT_ID}" \
  "${REASON}"
```

**What the script does:**
1. ✅ Validates MFA is enabled
2. ✅ Assumes `BuzzTutorEmergencyKeyAdmin-{env}` role
3. ✅ Disables the KMS key
4. ✅ Verifies key is disabled
5. ✅ Logs to SQL Server audit table
6. ✅ Sends alerts to security team
7. ✅ Returns correlation ID for audit trail

**Expected Success Output:**
```
✅ SUCCESS: Emergency role assumed
✅ SUCCESS: KMS key disabled
✅ SUCCESS: Key verified as disabled
✅ SUCCESS: Audit log created
✅ SUCCESS: Security alert sent

╔════════════════════════════════════════════════════════╗
║  EMERGENCY KEY REVOCATION COMPLETE                     ║
╚════════════════════════════════════════════════════════╝

Correlation ID: uuid-1234-5678 (SAVE THIS!)
Incident ID: INCIDENT-2024-001
Key Name: CEK_User_12345
Environment: production

⚠️  IMMEDIATE ACTION REQUIRED
─────────────────────────────────────
1. Rotate to new key immediately
2. Assess impact on applications
3. Monitor for unauthorized access
4. Document incident details
5. Conduct post-incident review

Emergency Procedures: docs/runbooks/emergency-key-revocation.md
```

### Step 3: Verification (2-5 minutes)

**Verify KMS key is disabled:**
```bash
aws kms describe-key \
  --key-id "${KMS_KEY_ARN}" \
  --region "${AWS_REGION}" \
  --query 'KeyMetadata.KeyState'

# Expected output: "Disabled"
```

**Verify SQL Server audit:**
```bash
sqlcmd -S "tcp:${SQL_ENDPOINT},1433" \
  -U "${SQL_USERNAME}" \
  -P "${SQL_PASSWORD}" \
  -Q "SELECT TOP 1 * FROM dbo.KeyManagementAudit WHERE KeyName = '${KEY_NAME}' ORDER BY OperationTime DESC"
```

**Check CloudWatch alarm:**
```bash
aws cloudwatch describe-alarms \
  --alarm-names "buzz-tutor-emergency-key-access-${ENVIRONMENT}" \
  --region "${AWS_REGION}"
```

### Step 4: Post-Revocation Actions

**Immediate (0-60 minutes):**
```bash
# Rotate to new key
./rotate_to_new_key.sh "${ENVIRONMENT}" "${KEY_NAME}"

# Verify application access
./test_application_access.sh "${ENVIRONMENT}"

# Monitor for 60 minutes
./monitor_sql_errors.sh "${ENVIRONMENT}" 60
```

**Short-term (1-24 hours):**
- Monitor error rates
- Check replication status
- Verify all replicas have new key
- Update stakeholders

---

## 4. Emergency Contacts

### On-Call Contacts

| Role | Primary | Secondary | Escalation |
|------|---------|-----------|------------|
| Security Lead | +1-555-0101 | +1-555-0102 | CTO |
| DevOps On-Call | +1-555-0201 | +1-555-0202 | VP Engineering |
| Database Admin | +1-555-0301 | +1-555-0302 | VP Engineering |

---

## 5. Testing

**Quarterly Drill:**
```bash
# Test in staging
cd /home/kimi/code/backend/src/database/scripts
./emergency_key_revocation.sh \
  staging \
  CEK_Test_Drill \
  DRILL-2024-001 \
  "Quarterly emergency revocation drill"
```

---

**End of Runbook**

---

**Classification**: CONFIDENTIAL  
**Review Cycle**: Quarterly or after any emergency revocation event
