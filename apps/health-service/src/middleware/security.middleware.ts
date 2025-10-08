import { Request, Response, NextFunction } from 'express';
import { auditLogger, AuditEventType, logger } from '@smile/common';

/**
 * Enhanced request interface with audit context
 */
export interface AuditRequest extends Request {
  auditContext?: {
    userId?: string;
    sessionId?: string;
    correlationId?: string;
    startTime?: number;
  };
  sessionID?: string;
}

/**
 * Security headers middleware for HIPAA compliance
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  // Set security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // Remove server information
  res.removeHeader('X-Powered-By');
  res.setHeader('Server', 'SMILE-Health-Service');

  // HIPAA compliance headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  next();
}

/**
 * Request correlation and timing middleware
 */
export function requestCorrelation(req: AuditRequest, res: Response, next: NextFunction): void {
  const correlationId = req.headers['x-correlation-id'] as string ||
                       `req-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

  const sessionId = req.headers['x-session-id'] as string ||
                   req.sessionID;

  const userId = req.headers['x-user-id'] as string ||
                (req as any).user?.id;

  // Add correlation ID to response headers
  res.setHeader('X-Correlation-ID', correlationId);

  // Initialize audit context
  req.auditContext = {
    userId,
    ...(sessionId && { sessionId }),
    correlationId,
    startTime: Date.now(),
  };

  next();
}

/**
 * Request/Response audit logging middleware
 */
export function auditLogging(req: AuditRequest, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Log the incoming request
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    userAgent: req.headers['user-agent'],
    sourceIp: req.ip,
    correlationId: req.auditContext?.correlationId,
    userId: req.auditContext?.userId,
  });

  // Override res.end to capture response details
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any): Response {
    const duration = Date.now() - startTime;

    // Create audit context from request
    const auditContext = auditLogger.createContextFromRequest(req);

    // Log API request for audit trail
    auditLogger.logAPIRequest(
      req.method,
      req.path,
      res.statusCode,
      auditContext,
      duration,
      {
        userAgent: req.headers['user-agent'],
        contentLength: res.getHeader('content-length'),
        responseTime: duration,
      },
    );

    // Log response details
    logger.info('Outgoing response', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      correlationId: req.auditContext?.correlationId,
      userId: req.auditContext?.userId,
    });

    return originalEnd.call(this, chunk, encoding);
  };

  next();
}

/**
 * Authentication middleware (mock implementation for POC)
 */
export function authentication(req: AuditRequest, res: Response, next: NextFunction): void {
  // In a real implementation, this would validate JWT tokens, API keys, etc.

  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'] as string;

  // Mock authentication - in production, implement proper auth
  if (!authHeader && !apiKey) {
    const auditContext = auditLogger.createContextFromRequest(req);

    auditLogger.logAuthentication(
      AuditEventType.AUTH_FAILURE,
      'anonymous',
      auditContext,
      {
        reason: 'missing-credentials',
        path: req.path,
        method: req.method,
      },
    );

    res.status(401).json({
      error: 'Authentication required',
      message: 'Please provide valid authentication credentials',
      correlationId: req.auditContext?.correlationId,
    });
    return;
  }

  // Mock user extraction - in production, validate and extract from JWT
  const mockUserId = req.headers['x-user-id'] as string || 'mock-user-123';

  // Add user to request
  (req as any).user = {
    id: mockUserId,
    role: 'healthcare-provider',
    facilityId: 'facility-001',
  };

  // Update audit context
  if (req.auditContext) {
    req.auditContext.userId = mockUserId;
  }

  // Log successful authentication
  const auditContext = auditLogger.createContextFromRequest(req);
  auditLogger.logAuthentication(
    AuditEventType.USER_LOGIN,
    mockUserId,
    auditContext,
    {
      method: 'api-key',
      path: req.path,
    },
  );

  next();
}

/**
 * Authorization middleware for health data access
 */
export function healthDataAuthorization(req: AuditRequest, res: Response, next: NextFunction): void {
  const user = (req as any).user;

  if (!user) {
    res.status(401).json({
      error: 'Authentication required',
      correlationId: req.auditContext?.correlationId,
    });
    return;
  }

  // Mock authorization - in production, implement proper RBAC
  const allowedRoles = ['healthcare-provider', 'physician', 'nurse', 'admin'];

  if (!allowedRoles.includes(user.role)) {
    const auditContext = auditLogger.createContextFromRequest(req);

    auditLogger.logSecurityEvent(
      AuditEventType.UNAUTHORIZED_ACCESS,
      `Unauthorized access attempt to health data endpoint: ${req.path}`,
      auditContext,
      undefined,
      {
        userRole: user.role,
        requiredRoles: allowedRoles,
        path: req.path,
        method: req.method,
      },
    );

    res.status(403).json({
      error: 'Insufficient permissions',
      message: 'Access to health data requires appropriate healthcare role',
      correlationId: req.auditContext?.correlationId,
    });
    return;
  }

  next();
}

/**
 * Error handling middleware with audit logging
 */
export function errorHandler(
  error: Error,
  req: AuditRequest,
  res: Response,
  _next: NextFunction,
): void {
  const correlationId = req.auditContext?.correlationId || 'unknown';

  // Log the error
  logger.error('Request processing error', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    correlationId,
    userId: req.auditContext?.userId,
  });

  // Audit the error
  const auditContext = auditLogger.createContextFromRequest(req);
  auditLogger.logSecurityEvent(
    AuditEventType.API_ERROR,
    `Request processing error: ${error.message}`,
    auditContext,
    undefined,
    {
      errorType: error.constructor.name,
      path: req.path,
      method: req.method,
    },
  );

  // Send error response (avoid exposing internal details)
  res.status(500).json({
    error: 'Internal server error',
    message: 'An error occurred while processing your request',
    correlationId,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Request validation middleware
 */
export function validateContentType(allowedTypes: string[] = ['application/json']) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentType = req.headers['content-type'];

    if (req.method !== 'GET' && req.method !== 'DELETE') {
      if (!contentType || !allowedTypes.some(type => contentType.includes(type))) {
        res.status(415).json({
          error: 'Unsupported Media Type',
          message: `Content-Type must be one of: ${allowedTypes.join(', ')}`,
          correlationId: (req as AuditRequest).auditContext?.correlationId,
        });
        return;
      }
    }

    next();
  };
}

/**
 * Rate limiting information middleware
 */
export function rateLimitHeaders(_req: Request, res: Response, next: NextFunction): void {
  // Add rate limiting headers for API consumers
  res.setHeader('X-RateLimit-Limit', '1000');
  res.setHeader('X-RateLimit-Window', '3600');
  res.setHeader('X-RateLimit-Remaining', '999'); // Mock remaining

  next();
}