/**
 * Performance Middleware
 * Tracks query latency with encryption and audit context
 * Integrates with APM (Sentry/Honeycomb/OpenTelemetry)
 * 
 * @module monitoring/PerformanceMiddleware
 * @requires @opentelemetry/api
 * @requires @opentelemetry/semantic-conventions
 */

import { performance } from 'perf_hooks';
import * as otel from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import * as AWS from 'aws-sdk';

/**
 * Context for query performance tracking
 */
export interface PerformanceContext {
  queryName: string;
  encryptionEnabled: boolean;
  auditEnabled: boolean;
  database: string;
  queryType: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  tableName?: string;
  complianceScope?: 'GDPR' | 'PCI' | 'General';
}

/**
 * Performance Middleware for tracking SQL query execution
 * with encryption and audit context for budget compliance monitoring
 */
export class PerformanceMiddleware {
  private readonly tracer = otel.trace.getTracer('buzz-tutor-sql');
  private readonly cloudwatch = new AWS.CloudWatch({ region: process.env.AWS_REGION || 'us-east-1' });
  
  /**
   * Performance budget thresholds (ms)
   */
  private readonly BUDGETS = {
    LATENCY: 100,      // 100ms per query budget
    CPU_TIME: 50,      // 50ms CPU time budget
    ENCRYPTION: 20,    // 20ms encryption overhead budget
    AUDIT: 5           // 5ms audit overhead budget
  };

  /**
   * Tracks query performance with encryption/audit context
   * 
   * @param context - Performance tracking context
   * @param query - Query execution function
   * @returns Query result
   */
  async trackQueryPerformance<T>(
    context: PerformanceContext,
    query: () => Promise<T>
  ): Promise<T> {
    const span = this.createSpan(context);
    const startTime = performance.now();
    
    try {
      const result = await query();
      const durationMs = performance.now() - startTime;
      
      // Log metrics for aggregation
      await this.recordMetrics(context, durationMs);
      
      // Check performance budgets
      const budgetViolations = this.checkBudgets(context, durationMs);
      
      // Set span attributes based on result
      span.setAttributes({
        'buzz.performance.duration_ms': durationMs,
        'buzz.performance.budget_exceeded': budgetViolations.length > 0,
        'buzz.performance.budget_violations': budgetViolations.join(','),
        'buzz.performance.compliant': budgetViolations.length === 0
      });
      
      // End span successfully
      span.setStatus({ code: otel.SpanStatusCode.OK });
      span.end();
      
      // Report violations if any
      if (budgetViolations.length > 0) {
        await this.reportBudgetViolation(context, durationMs, budgetViolations);
      }
      
      return result;
    } catch (error) {
      // Record failure metrics
      const durationMs = performance.now() - startTime;
      span.setAttributes({
        'buzz.performance.duration_ms': durationMs,
        'buzz.performance.failed': true,
        'error.message': error instanceof Error ? error.message : String(error)
      });
      span.setStatus({ 
        code: otel.SpanStatusCode.ERROR, 
        message: error instanceof Error ? error.message : String(error) 
      });
      span.end();
      
      // Record failure
      await this.recordFailure(context, error);
      
      throw error;
    }
  }

  /**
   * Creates an OpenTelemetry span with appropriate attributes
   */
  private createSpan(context: PerformanceContext): otel.Span {
    const span = this.tracer.startSpan(`db.${context.queryType.toLowerCase()}`, {
      attributes: {
        [SemanticAttributes.DB_SYSTEM]: 'mssql',
        [SemanticAttributes.DB_NAME]: context.database,
        [SemanticAttributes.DB_OPERATION]: context.queryType,
        [SemanticAttributes.DB_USER]: process.env['SQL_USERNAME'] || 'unknown',
        [SemanticAttributes.NET_PEER_NAME]: process.env['RDS_ENDPOINT'] || 'unknown',
        
        // Custom attributes for encryption/audit tracking
        'buzz.feature.encryption': context.encryptionEnabled,
        'buzz.feature.audit': context.auditEnabled,
        'buzz.performance.budget.latency': this.BUDGETS.LATENCY,
        'buzz.performance.budget.cpu': this.BUDGETS.CPU_TIME,
        'buzz.table.name': context.tableName || 'unknown',
        'buzz.compliance.scope': context.complianceScope || 'general',
        
        // Budget compliance (will be updated after execution)
        'buzz.performance.budget_exceeded': false,
        'buzz.performance.compliant': true
      },
    });
    
    return span;
  }

  /**
   * Checks query against performance budgets
   */
  private checkBudgets(context: PerformanceContext, durationMs: number): string[] {
    const violations: string[] = [];
    
    // Check latency budget
    if (durationMs > this.BUDGETS.LATENCY) {
      violations.push(`Latency: ${durationMs.toFixed(2)}ms > ${this.BUDGETS.LATENCY}ms`);
    }
    
    // Estimate encryption overhead
    if (context.encryptionEnabled && durationMs > this.BUDGETS.LATENCY + this.BUDGETS.ENCRYPTION) {
      violations.push(`Encryption overhead suspected`);
    }
    
    // Estimate audit overhead (smaller impact)
    if (context.auditEnabled && durationMs > this.BUDGETS.LATENCY + this.BUDGETS.AUDIT) {
      violations.push(`Audit overhead suspected`);
    }
    
    return violations;
  }

  /**
   * Records metrics to CloudWatch
   */
  private async recordMetrics(context: PerformanceContext, durationMs: number): Promise<void> {
    const metricData: AWS.CloudWatch.PutMetricDataInput = {
      Namespace: 'BuzzTutor/Application',
      MetricData: [
        {
          MetricName: 'QueryExecutionTime',
          Value: durationMs,
          Unit: 'Milliseconds',
          Timestamp: new Date(),
          Dimensions: [
            { Name: 'QueryName', Value: context.queryName },
            { Name: 'QueryType', Value: context.queryType },
            { Name: 'EncryptionEnabled', Value: context.encryptionEnabled.toString() },
            { Name: 'AuditEnabled', Value: context.auditEnabled.toString() },
            { Name: 'Environment', Value: process.env['NODE_ENV'] || 'development' },
            { Name: 'ComplianceScope', Value: context.complianceScope || 'general' }
          ]
        },
        {
          MetricName: 'BudgetCompliance',
          Value: durationMs <= this.BUDGETS.LATENCY ? 1 : 0,
          Unit: 'Count',
          Timestamp: new Date(),
          Dimensions: [
            { Name: 'QueryName', Value: context.queryName },
            { Name: 'Compliant', Value: (durationMs <= this.BUDGETS.LATENCY).toString() }
          ]
        }
      ]
    };
    
    // Only emit encryption overhead metric if encryption is enabled
    if (context.encryptionEnabled) {
      metricData.MetricData!.push({
        MetricName: 'EncryptionEnabledQuery',
        Value: 1,
        Unit: 'Count',
        Timestamp: new Date()
      });
    }
    
    // Only emit audit overhead metric if audit is enabled
    if (context.auditEnabled) {
      metricData.MetricData!.push({
        MetricName: 'AuditEnabledQuery',
        Value: 1,
        Unit: 'Count',
        Timestamp: new Date()
      });
    }
    
    try {
      await this.cloudwatch.putMetricData(metricData).promise();
    } catch (error) {
      console.error('Failed to emit CloudWatch metric:', error);
    }
  }

  /**
   * Reports budget violations to APM and logging systems
   */
  private async reportBudgetViolation(
    context: PerformanceContext, 
    durationMs: number, 
    violations: string[]
  ): Promise<void> {
    const message = `Query exceeded performance budget: ${context.queryName} (${durationMs.toFixed(2)}ms)`;
    const violationDetails = violations.join('; ');
    
    // Log to CloudWatch Logs for alerting
    console.warn(JSON.stringify({
      event_type: 'performance_budget_violation',
      timestamp: new Date().toISOString(),
      query_name: context.queryName,
      duration_ms: durationMs,
      budget_ms: this.BUDGETS.LATENCY,
      encryption_enabled: context.encryptionEnabled,
      audit_enabled: context.auditEnabled,
      violations: violationDetails,
      compliance_scope: context.complianceScope
    }));
    
    // Send to APM if configured
    await this.reportToAPM(context, durationMs, violations);
  }

  /**
   * Reports to APM systems (Sentry, Honeycomb)
   */
  private async reportToAPM(
    context: PerformanceContext, 
    durationMs: number, 
    violations: string[]
  ): Promise<void> {
    // Sentry integration
    if (process.env['SENTRY_DSN']) {
      const Sentry = await import('@sentry/node');
      
      Sentry.captureMessage(
        `Performance budget exceeded: ${context.queryName}`,
        {
          level: 'warning',
          tags: {
            'performance.budget_exceeded': 'true',
            'query.name': context.queryName,
            'query.duration': durationMs.toString(),
            'encryption.enabled': context.encryptionEnabled.toString(),
            'audit.enabled': context.auditEnabled.toString(),
            'compliance.scope': context.complianceScope || 'none'
          },
          contexts: {
            performance: {
              query_name: context.queryName,
              duration_ms: durationMs,
              budget_ms: this.BUDGETS.LATENCY,
              violations: violations.join(', '),
              encryption_enabled: context.encryptionEnabled,
              audit_enabled: context.auditEnabled
            }
          }
        }
      );
      
      // Sentry custom metrics
      Sentry.metrics.distribution('query.execution.time', durationMs, {
        unit: 'millisecond',
        tags: {
          query_type: context.queryType,
          encryption_enabled: context.encryptionEnabled,
          audit_enabled: context.auditEnabled,
          exceeds_budget: durationMs > this.BUDGETS.LATENCY
        }
      });
    }
    
    // Honeycomb integration
    if (process.env['HONEYCOMB_API_KEY']) {
      const beeline = await import('honeycomb-beeline');
      
      beeline.addContext({
        'app.query.name': context.queryName,
        'app.query.duration_ms': durationMs,
        'app.query.budget_exceeded': durationMs > this.BUDGETS.LATENCY,
        'app.query.encryption_enabled': context.encryptionEnabled,
        'app.query.audit_enabled': context.auditEnabled,
        'app.query.violations': violations.join(', '),
        'app.performance.budget_ms': this.BUDGETS.LATENCY
      });
    }
    
    // OpenTelemetry metrics
    const meter = otel.metrics.getMeter('buzz-tutor-performance');
    const budgetViolationCounter = meter.createCounter('performance.budget_violations');
    budgetViolationCounter.add(1, {
      'query.name': context.queryName,
      'query.type': context.queryType,
      'encryption.enabled': context.encryptionEnabled,
      'audit.enabled': context.auditEnabled,
      'compliance.scope': context.complianceScope
    });
  }

  /**
   * Records query failure metrics
   */
  private async recordFailure(context: PerformanceContext, error: Error): Promise<void> {
    if (process.env['SENTRY_DSN']) {
      const Sentry = await import('@sentry/node');
      
      Sentry.captureException(error, {
        tags: {
          'query.name': context.queryName,
          'query.type': context.queryType,
          'encryption.enabled': context.encryptionEnabled.toString(),
          'audit.enabled': context.auditEnabled.toString()
        }
      });
    }
    
    // CloudWatch error metric
    try {
      await this.cloudwatch.putMetricData({
        Namespace: 'BuzzTutor/Application',
        MetricData: [{
          MetricName: 'QueryExecutionErrors',
          Value: 1,
          Unit: 'Count',
          Timestamp: new Date(),
          Dimensions: [
            { Name: 'QueryName', Value: context.queryName },
            { Name: 'QueryType', Value: context.queryType }
          ]
        }]
      }).promise();
    } catch (error) {
      console.error('Failed to emit error metric:', error);
    }
  }

  /**
   * Generates a performance report
   */
  async generateReport(daysBack: number = 7): Promise<string> {
    // This would query RDS via a stored procedure
    // For now, return a placeholder
    return `Performance report for last ${daysBack} days will be generated from RDS metrics.`;
  }
}

// Export singleton instance
export const performanceMiddleware = new PerformanceMiddleware();

// Express.js middleware wrapper
export const performanceTrackingMiddleware = () => {
  return async (req: any, res: any, next: any) => {
    const startTime = performance.now();
    
    // Store tracking info on request
    req.performanceContext = {
      queryName: `${req.method} ${req.path}`,
      encryptionEnabled: true,
      auditEnabled: true,
      database: 'buzz_tutor',
      queryType: req.method === 'GET' ? 'SELECT' : req.method === 'POST' ? 'INSERT' : 'UPDATE',
      tableName: req.path.split('/')[2],  // /api/users -> users
      complianceScope: req.path.includes('user') ? 'GDPR' : req.path.includes('payment') ? 'PCI' : 'General'
    };
    
    // Track response time
    res.on('finish', async () => {
      const durationMs = performance.now() - startTime;
      
      // Log performance metric
      console.log(JSON.stringify({
        event_type: 'api_request_performance',
        timestamp: new Date().toISOString(),
        request_path: req.path,
        duration_ms: durationMs,
        status_code: res.statusCode,
        budget_exceeded: durationMs > 100
      }));
      
      // Emit to CloudWatch if budget exceeded
      if (durationMs > 100) {
        await performanceMiddleware.recordMetrics(req.performanceContext, durationMs);
      }
    });
    
    next();
  };
};

// Correct import style for backend
// import { performanceMiddleware } from './monitoring/PerformanceMiddleware';
// 
// const result = await performanceMiddleware.trackQueryPerformance(
//   {
//     queryName: 'GetUserByEmail',
//     encryptionEnabled: true,
//     auditEnabled: true,
//     database: 'buzz_tutor',
//     queryType: 'SELECT',
//     tableName: 'Users',
//     complianceScope: 'GDPR'
//   },
//   async () => {
//     return await db.query('SELECT * FROM Users WHERE Email = @email', { email });
//   }
// );