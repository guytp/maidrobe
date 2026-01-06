# Key Recovery Runbook

**Document Version**: 1.0  
**Last Updated**: January 6, 2026  
**Owner**: DevOps Team  
**Classification**: INTERNAL

---

## 1. Purpose and Scope

### 1.1 Purpose
This runbook provides step-by-step procedures for recovering a revoked encryption key within the 7-day recovery window.

### 1.2 Scope
Applies to all AWS KMS keys and SQL Server column encryption keys (CEKs) used by the Buzz A Tutor platform in both staging and production environments.

### 1.3 When to Use This Runbook

**Use When:**
- ✓ Key was revoked in error
- ✓ Key was disabled during troubleshooting
- ✓ False alarm (no actual compromise)
- ✓ Business-critical impact from key revocation
- ✓ Within 7-day recovery window

**Do NOT Use This Runbook For:**
- Keys revoked more than 7 days ago (permanently deleted)
- Security breaches (follow incident response)
- Routine operations (use standard procedures)

---

## 2. Prerequisites

### 2.1 Required Approvals

**Before proceeding, you MUST have:**
- [ ] Approval from **Security Team Lead** (or designated alternate)
- [ ] Approval from **DevOps Manager** (or designated alternate)
- [ ] Change approval ID (e.g., `CHANGE-2024-001`)
- [ ] Documented business justification

### 2.2 Required Access

- **AWS Account**: DevOps or Database Admin role
- **IAM Role**: Permission to assume `BuzzTutorKeyRecoveryAdmin-{env}` role
- **MFA**: Multi-factor authentication enabled
- **Network**: Access to AWS RDS SQL Server instances

### 2.3 Required Information

- [ ] Key name (e.g., `CEK_User_12345`)
- [ ] Environment (staging or production)
- [ ] Change approval ID
- [ ] Business justification
- [ ] Date/time of original revocation
- [ ] Correlation ID from revocation (if available)

---

## 3. Recovery Window Verification

### 3.1 Check Recovery Eligibility

**Query SQL Server:**
```bash
sqlcmd -S "tcp:${SQL_ENDPOINT},1433" \
  -U "${SQL_USERNAME}" \
  -P "${SQL_PASSWORD}" \
  -Q "SELECT CanBeRecoveredUntil FROM dbo.KeyStatus WHERE KeyName = '${KEY_NAME}'"
```

**If result is NULL or past current date:**
- ❌ Key is NOT recoverable (window expired)
- ❌ Permanent deletion - contact AWS support
- ❌ Follow Disaster Recovery procedures

**If result is future date:**
- ✓ Key is recoverable
- ✓ Proceed to recovery steps

---

## 4. Step-by-Step Recovery

### 4.1 Pre-Recovery Verification (5-10 minutes)

**Verify approval chain:**
```bash
echo "=== KEY RECOVERY VERIFICATION ==="
echo "Approvals required:"
echo "1. Security Team Lead: [Name]"
echo "2. DevOps Manager: [Name]"
echo "Change ID: ${CHANGE_ID}"
echo ""
read -p "Confirm approvals obtained? (y/N): " -n 1 -r
echo ""
```

**Verify key status:**
```bash
cd /home/kimi/code/backend/src/database/scripts
./verify_key_status.sh "${ENVIRONMENT}" "${KEY_NAME}"
```

**Verify backup integrity:**
```bash
./verify_backup_integrity.sh "${ENVIRONMENT}"
```

**Verification Checklist:**
- [ ] Approvals documented
- [ ] Key is recoverable
- [ ] Recovery window open
- [ ] Backup integrity verified
- [ ] Business impact assessed

### 4.2 Execute Recovery (5-10 minutes)

**Set approval details:**
```bash
export APPROVAL_GRANTED_BY="${SECURITY_LEAD_NAME}"
```

**Execute recovery:**
```bash
cd /home/kimi/code/backend/src/database/scripts

./recover_key.sh \
  "${ENVIRONMENT}" \
  "${KEY_NAME}" \
  "${CHANGE_ID}" \
  "${BUSINESS_JUSTIFICATION}"
```

**What the script does:**
1. ✅ Validates recovery window
2. ✅ Verifies backup integrity
3. ✅ Confirms approvals
4. ✅ Assumes recovery IAM role
5. ✅ Enables KMS key
6. ✅ Updates SQL Server audit
7. ✅ Tests application access
8. ✅ Returns correlation ID

**Expected Success Output:**
```
✅ Key verified as recoverable (within 7-day window)
✅ Backup integrity verified
✅ Recovery role assumed successfully
✅ KMS key enabled
✅ Key status updated in SQL Server
✅ Recovery logged to audit table
✅ Application access test passed

╔════════════════════════════════════════════════════════╗
║  KEY RECOVERY COMPLETE                                 ║
╚════════════════════════════════════════════════════════╝

Correlation ID: uuid-1234-5678 (SAVE THIS!)
Key Name: CEK_User_12345
Environment: production
Approved By: Security Lead
Change ID: CHANGE-2024-001

✅ POST-RECOVERY TASKS
──────────────────────
1. Monitor application logs for 24 hours
2. Verify all dependent systems operational
3. Document recovery in incident log
4. Schedule key rotation if needed
5. Review and update procedures

Recovery Procedures: docs/runbooks/key-recovery.md
```

### 4.3 Post-Recovery Validation (10-15 minutes)

**Verify KMS key enabled:**
```bash
# Check KMS key state
aws kms describe-key \
  --key-id "${KMS_KEY_ARN}" \
  --region "${AWS_REGION}" \
  --query 'KeyMetadata.KeyState'

# Expected: "Enabled"
```

**Verify SQL Server:**
```bash
# Check key status
sqlcmd -S "tcp:${SQL_ENDPOINT},1433" \
  -U "${SQL_USERNAME}" \
  -P "${SQL_PASSWORD}" \
  -Q "SELECT IsEnabled, IsRevoked FROM dbo.KeyStatus WHERE KeyName = '${KEY_NAME}'"

# Expected: IsEnabled=1, IsRevoked=0
```

**Test application access:**
```bash
# Test encrypted connection
./test_application_access.sh "${ENVIRONMENT}"

# Check replication
./check_replication_status.sh "${ENVIRONMENT}"

# Verify all replicas
for replica in ${REPLICA_ENDPOINTS[@]}; do
  sqlcmd -S "tcp:${replica},1433" \
    -Q "SELECT encrypt_option FROM sys.dm_exec_connections" \
    -h -1
done
```

**Validation Checklist:**
- [ ] KMS key state is "Enabled"
- [ ] SQL Server shows key active
- [ ] Application connects successfully
- [ ] All replicas synchronized
- [ ] Backup processes resumed
- [ ] Error rate acceptable (<5/hour)

---

## 5. Post-Recovery Actions

### 5.1 Immediate (0-60 minutes)

**Monitor:**
```bash
# Monitor for 60 minutes
./monitor_sql_errors.sh "${ENVIRONMENT}" 60

# Check application health
./check_application_health.sh "${ENVIRONMENT}"

# Verify all users can access data
sqlcmd -S "tcp:${SQL_ENDPOINT},1433" \
  -U "${SQL_USERNAME}" \
  -P "${SQL_PASSWORD}" \
  -Q "SELECT COUNT(*) as active_users FROM dbo.ActiveUsers"
```

**Document:**
- [ ] Record recovery in incident log
- [ ] Update key status documentation
- [ ] Note any anomalies observed

### 5.2 Short-term (1-24 hours)

**Extended Monitoring:**
- [ ] 24-hour monitoring activated
- [ ] Backup processes verified
- [ ] Replication checked
- [ ] No customer impact reported

### 5.3 Long-term (1-7 days)

**Assess and Improve:**
- Review why key was revoked originally
- Assess prevention opportunities
- Update procedures if needed
- Conduct training if gaps identified

---

## 6. Troubleshooting

### 6.1 Common Issues

**"Key not in recoverable state"**
- **Cause:** Recovery window expired (>7 days)
- **Solution:** Contact AWS support, follow DR plan

**"Role assumption failed"**
- **Cause:** MFA not enabled or expired session
- **Solution:** Re-authenticate, verify MFA

**"Backup verification failed"**
- **Cause:** Backup during revocation or corruption
- **Solution:** Use next most recent backup

---

## 7. Emergency Contacts

**If Recovery Fails:**
- Database Admin On-Call: +1-555-0301
- Escalate: DevOps Manager
- Emergency: VP Engineering

**If Key Not Recoverable:**
- Contact: Security Lead
- Escalate: CTO
- Emergency: Disaster Recovery Team

---

## 8. Testing

**Quarterly Drill:**
```bash
cd /home/kimi/code/backend/src/database/scripts
export DRILL_MODE=true

# Test revocation
./emergency_key_revocation.sh \
  staging \
  CEK_Test_Drill \
  DRILL-2024-001 \
  "Drill - quarterly test"

# Test recovery within 1 hour
./recover_key.sh \
  staging \
  CEK_Test_Drill \
  DRILL-CHANGE-001 \
  "Recovery after drill"

# Validate within 24 hours
./validate_key_recovery.sh \
  staging \
  CEK_Test_Drill \
  ${CORRELATION_ID}
```

**Drill Objectives:**
- [ ] Execute recovery in <30 min
- [ ] All documentation accessible
- [ ] Obtain approvals quickly
- [ ] Automated scripts work
- [ ] Emergency contacts reachable

---

## 9. References

### Related Documents
- [Emergency Key Revocation Runbook](./emergency-key-revocation.md)
- [Key Rotation Runbook](./key-rotation.md)
- [Disaster Recovery Plan](../../disaster-recovery/README.md)

### External References
- [AWS KMS Key Recovery](https://docs.aws.amazon.com/kms/latest/developerguide/deleting-keys.html)
- [PCI DSS Key Management](https://www.pcisecuritystandards.org/document_library)

---

**End of Runbook**

---

**Classification**: INTERNAL  
**Review Cycle**: Quarterly or after any key recovery event
