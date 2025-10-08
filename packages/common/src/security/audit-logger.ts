import { logger } from '../logger';
import { generateCorrelationId } from '../telemetry';

/**
 * Audit event types for compliance tracking
 */
export enum AuditEventType {
  // Data access events
  DATA_ACCESS = 'data.access',
  DATA_EXPORT = 'data.export',
  DATA_MODIFICATION = 'data.modification',
  DATA_DELETION = 'data.deletion',

  // Authentication events
  USER_LOGIN = 'auth.login',
  USER_LOGOUT = 'auth.logout',
  AUTH_FAILURE = 'auth.failure',

  // API events
  API_REQUEST = 'api.request',
  API_RESPONSE = 'api.response',
  API_ERROR = 'api.error',

  // Compliance events
  PHI_ACCESS = 'compliance.phi.access',
  PII_PROCESSING = 'compliance.pii.processing',
  CONSENT_GRANTED = 'compliance.consent.granted',
  CONSENT_REVOKED = 'compliance.consent.revoked',

  // Security events
  ENCRYPTION_PERFORMED = 'security.encryption.performed',
  DECRYPTION_PERFORMED = 'security.decryption.performed',
  MASKING_APPLIED = 'security.masking.applied',
  UNAUTHORIZED_ACCESS = 'security.unauthorized.access',
}

/**
 * Audit event severity levels
 */
export enum AuditSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

/**
 * Core audit event structure
 */
export interface AuditEvent {
  // Event identification
  eventId: string;
  eventType: AuditEventType;
  timestamp: string;
  severity: AuditSeverity;

  // Context information
  userId?: string;
  sessionId?: string;
  correlationId?: string;
  sourceIp?: string;
  userAgent?: string;

  // Resource information
  resourceType?: string;
  resourceId?: string;
  action?: string;

  // Event details
  description: string;
  details?: Record<string, unknown>;

  // Compliance fields
  dataClassification?: 'public' | 'internal' | 'confidential' | 'restricted';
  retentionPeriod?: string;
  legalBasis?: string;

  // Technical fields
  service: string;
  version: string;
  environment: string;
}

/**
 * Audit context for tracking session/request information
 */
export interface AuditContext {
  userId?: string;
  sessionId?: string;
  correlationId?: string;
  sourceIp?: string;
  userAgent?: string;
  service: string;
}

/**
 * HIPAA-compliant audit logger
 */
export class AuditLogger {
  private static instance: AuditLogger;
  private readonly service: string;
  private readonly version: string;
  private readonly environment: string;

  private constructor() {
    this.service = process.env.SERVICE_NAME || 'unknown-service';
    this.version = process.env.SERVICE_VERSION || '1.0.0';
    this.environment = process.env.NODE_ENV || 'development';
  }

  public static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  /**
   * Log an audit event
   */
  public logEvent(
    eventType: AuditEventType,
    description: string,
    context: Partial<AuditContext> = {},
    options: {
      severity?: AuditSeverity;
      resourceType?: string;
      resourceId?: string;
      action?: string;
      details?: Record<string, unknown>;
      dataClassification?: 'public' | 'internal' | 'confidential' | 'restricted';
      retentionPeriod?: string;
      legalBasis?: string;
    } = {},
  ): void {
    const auditEvent: AuditEvent = {
      eventId: generateCorrelationId(),
      eventType,
      timestamp: new Date().toISOString(),
      severity: options.severity || AuditSeverity.INFO,

      // Context
      ...(context.userId && { userId: context.userId }),
      ...(context.sessionId && { sessionId: context.sessionId }),
      correlationId: context.correlationId || generateCorrelationId(),
      ...(context.sourceIp && { sourceIp: context.sourceIp }),
      ...(context.userAgent && { userAgent: context.userAgent }),

      // Resource
      ...(options.resourceType && { resourceType: options.resourceType }),
      ...(options.resourceId && { resourceId: options.resourceId }),
      ...(options.action && { action: options.action }),

      // Event details
      description,
      ...(options.details && { details: options.details }),

      // Compliance
      ...(options.dataClassification && { dataClassification: options.dataClassification }),
      ...(options.retentionPeriod && { retentionPeriod: options.retentionPeriod }),
      ...(options.legalBasis && { legalBasis: options.legalBasis }),

      // Technical
      service: context.service || this.service,
      version: this.version,
      environment: this.environment,
    };

    // Log the audit event with appropriate severity
    this.logAuditEvent(auditEvent);
  }

  /**
   * Log PHI/PII access for HIPAA compliance
   */
  public logPHIAccess(
    action: string,
    resourceId: string,
    context: AuditContext,
    details?: Record<string, unknown>,
  ): void {
    this.logEvent(
      AuditEventType.PHI_ACCESS,
      `PHI access: ${action}`,
      context,
      {
        severity: AuditSeverity.INFO,
        resourceType: 'phi',
        resourceId,
        action,
        ...(details && { details }),
        dataClassification: 'restricted',
        retentionPeriod: '6-years',
        legalBasis: 'HIPAA-treatment',
      },
    );
  }

  /**
   * Log data processing for GDPR compliance
   */
  public logPIIProcessing(
    action: string,
    dataSubject: string,
    context: AuditContext,
    legalBasis: string,
    details?: Record<string, unknown>,
  ): void {
    this.logEvent(
      AuditEventType.PII_PROCESSING,
      `PII processing: ${action}`,
      context,
      {
        severity: AuditSeverity.INFO,
        resourceType: 'pii',
        resourceId: dataSubject,
        action,
        ...(details && { details }),
        dataClassification: 'confidential',
        retentionPeriod: 'as-per-policy',
        legalBasis,
      },
    );
  }

  /**
   * Log authentication events
   */
  public logAuthentication(
    eventType: AuditEventType.USER_LOGIN | AuditEventType.USER_LOGOUT | AuditEventType.AUTH_FAILURE,
    userId: string,
    context: Partial<AuditContext>,
    details?: Record<string, unknown>,
  ): void {
    const severity = eventType === AuditEventType.AUTH_FAILURE
      ? AuditSeverity.WARNING
      : AuditSeverity.INFO;

    this.logEvent(
      eventType,
      `Authentication event: ${eventType}`,
      { ...context, userId },
      {
        severity,
        resourceType: 'user',
        resourceId: userId,
        action: eventType,
        ...(details && { details }),
        dataClassification: 'internal',
      },
    );
  }

  /**
   * Log security events
   */
  public logSecurityEvent(
    eventType: AuditEventType,
    description: string,
    context: AuditContext,
    severity: AuditSeverity = AuditSeverity.WARNING,
    details?: Record<string, unknown>,
  ): void {
    this.logEvent(
      eventType,
      description,
      context,
      {
        severity,
        resourceType: 'security',
        action: eventType,
        ...(details && { details }),
        dataClassification: 'confidential',
      },
    );
  }

  /**
   * Log API requests for audit trail
   */
  public logAPIRequest(
    method: string,
    path: string,
    statusCode: number,
    context: AuditContext,
    duration?: number,
    details?: Record<string, unknown>,
  ): void {
    const eventType = statusCode >= 400
      ? AuditEventType.API_ERROR
      : AuditEventType.API_REQUEST;

    const severity = statusCode >= 500
      ? AuditSeverity.ERROR
      : statusCode >= 400
        ? AuditSeverity.WARNING
        : AuditSeverity.INFO;

    this.logEvent(
      eventType,
      `API ${method} ${path} - ${statusCode}`,
      context,
      {
        severity,
        resourceType: 'api',
        resourceId: `${method}:${path}`,
        action: method,
        details: {
          ...details,
          statusCode,
          duration,
        },
        dataClassification: 'internal',
      },
    );
  }

  /**
   * Create audit context from request
   */
  public createContextFromRequest(req: any): AuditContext {
    return {
      userId: req.user?.id || req.headers['x-user-id'],
      sessionId: req.sessionID || req.headers['x-session-id'],
      correlationId: req.headers['x-correlation-id'] || generateCorrelationId(),
      sourceIp: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      service: this.service,
    };
  }

  /**
   * Log the actual audit event to appropriate destinations
   */
  private logAuditEvent(auditEvent: AuditEvent): void {
    // Log to structured logger
    logger.info('AUDIT_EVENT', auditEvent);

    // In production, you might also want to:
    // 1. Send to dedicated audit log storage (immutable)
    // 2. Send to SIEM system
    // 3. Send to compliance monitoring tools
    // 4. Store in tamper-proof audit database

    // For critical events, consider immediate alerting
    if (auditEvent.severity === AuditSeverity.CRITICAL) {
      this.sendCriticalAlert(auditEvent);
    }
  }

  /**
   * Handle critical audit events that require immediate attention
   */
  private sendCriticalAlert(auditEvent: AuditEvent): void {
    // In production, implement:
    // 1. Send to alerting system (PagerDuty, etc.)
    // 2. Send to security team
    // 3. Trigger automated response procedures

    logger.error('CRITICAL_AUDIT_EVENT', {
      eventId: auditEvent.eventId,
      eventType: auditEvent.eventType,
      description: auditEvent.description,
      userId: auditEvent.userId,
      timestamp: auditEvent.timestamp,
    });
  }
}

/**
 * Convenience function to get the default audit logger instance
 */
export const auditLogger = AuditLogger.getInstance();