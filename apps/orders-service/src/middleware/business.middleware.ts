/**
 * Business Middleware for Orders Service
 *
 * Provides security, authentication, and business logic middleware
 * for order management operations. Simpler than health service
 * as it doesn't handle PII/PHI data.
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { logger } from '@smile/common';

/**
 * Extended request interface with business context
 */
export interface BusinessRequest extends Request {
  user?: {
    userId: string;
    userName?: string;
    roles: string[];
    facilityId: string;
    departmentId?: string;
  };
  correlationId?: string;
  sessionId?: string;
  requestStartTime?: number;
}

/**
 * Security headers middleware for business operations
 */
export function businessSecurityHeaders(_req: Request, res: Response, next: NextFunction): void {
  // Standard security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // Business-specific headers
  res.setHeader('X-Service-Type', 'orders-service');
  res.setHeader('X-API-Version', '1.0');

  next();
}

/**
 * Request correlation middleware for tracing
 */
export function requestCorrelation(req: BusinessRequest, res: Response, next: NextFunction): void {
  // Generate or extract correlation ID
  req.correlationId = req.headers['x-correlation-id'] as string || uuidv4();
  req.sessionId = req.headers['x-session-id'] as string;
  req.requestStartTime = Date.now();

  // Add correlation ID to response headers
  res.setHeader('X-Correlation-ID', req.correlationId);

  next();
}

/**
 * Business audit logging middleware
 */
export function businessAuditLogging(req: BusinessRequest, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Log incoming request
  logger.info('Incoming order request', {
    method: req.method,
    path: req.path,
    correlationId: req.correlationId,
    sessionId: req.sessionId,
    userAgent: req.headers['user-agent'],
    ip: req.ip
  });

  // Override response.end to log completion
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any): any {
    const duration = Date.now() - startTime;

    logger.info('Order request completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      correlationId: req.correlationId,
      sessionId: req.sessionId,
      userId: req.user?.userId
    });

    return originalEnd.call(this, chunk, encoding);
  };

  next();
}

/**
 * Mock authentication middleware for POC
 * In production, this would integrate with actual authentication service
 */
export function businessAuthentication(req: BusinessRequest, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'] as string;

    // Allow API key authentication
    if (apiKey) {
      // Mock API key validation
      if (apiKey === 'orders-api-key-dev') {
        req.user = {
          userId: 'api-user-001',
          userName: 'API User',
          roles: ['order-manager', 'approver'],
          facilityId: 'facility-001'
        };
        return next();
      } else {
        res.status(401).json({
          error: 'Invalid API key',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        });
        return;
      }
    }

    // JWT authentication
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'Bearer token or API key required',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
      return;
    }

    const token = authHeader.substring(7);

    // Mock JWT validation for POC
    if (token === 'mock-jwt-token') {
      req.user = {
        userId: 'user-001',
        userName: 'John Manager',
        roles: ['order-manager', 'approver'],
        facilityId: 'facility-001',
        departmentId: 'purchasing'
      };
      return next();
    }

    // In production, verify actual JWT
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as any;
      req.user = {
        userId: decoded.userId,
        userName: decoded.userName,
        roles: decoded.roles || [],
        facilityId: decoded.facilityId,
        departmentId: decoded.departmentId
      };
      next();
    } catch (jwtError) {
      res.status(401).json({
        error: 'Invalid token',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
      return;
    }

  } catch (error: any) {
    logger.error('Authentication error', { error, correlationId: req.correlationId });
    res.status(500).json({
      error: 'Authentication service error',
      correlationId: req.correlationId,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Business authorization middleware for order operations
 */
export function businessAuthorization(req: BusinessRequest, res: Response, next: NextFunction): void {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'User not authenticated',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
      return;
    }

    const { method, path } = req;
    const userRoles = req.user.roles;

    // Define permission matrix for business operations
    const permissions: Record<string, string[]> = {
      'GET:/api/v1/orders': ['order-viewer', 'order-manager', 'approver'],
      'GET:/api/v1/orders/:id': ['order-viewer', 'order-manager', 'approver'],
      'POST:/api/v1/orders': ['order-creator', 'order-manager'],
      'PUT:/api/v1/orders/:id': ['order-manager'],
      'DELETE:/api/v1/orders/:id': ['order-manager'],
      'POST:/api/v1/orders/:id/submit': ['order-creator', 'order-manager'],
      'POST:/api/v1/orders/:id/approve': ['approver'],
      'POST:/api/v1/orders/:id/reject': ['approver'],
      'POST:/api/v1/orders/:id/pack': ['fulfillment-staff', 'order-manager'],
      'POST:/api/v1/orders/:id/ship': ['fulfillment-staff', 'order-manager'],
      'POST:/api/v1/orders/:id/receive': ['receiving-staff', 'order-manager'],
      'POST:/api/v1/orders/:id/fulfill': ['order-manager'],
      'POST:/api/v1/orders/:id/return': ['order-manager', 'receiving-staff'],
      'POST:/api/v1/orders/:id/complete-return': ['order-manager']
    };

    // Normalize path for permission checking
    const normalizedPath = path.replace(/\/[0-9a-f-]{36}/g, '/:id');
    const permissionKey = `${method}:${normalizedPath}`;
    const requiredRoles = permissions[permissionKey];

    if (!requiredRoles) {
      // Allow if no specific permission defined
      return next();
    }

    // Check if user has any of the required roles
    const hasPermission = userRoles.some(role => requiredRoles.includes(role));

    if (!hasPermission) {
      logger.warn('Authorization denied', {
        userId: req.user.userId,
        userRoles,
        requiredRoles,
        method,
        path,
        correlationId: req.correlationId
      });

      res.status(403).json({
        error: 'Insufficient permissions',
        message: `Required roles: ${requiredRoles.join(', ')}`,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
      return;
    }

    next();

  } catch (error: any) {
    logger.error('Authorization error', { error, correlationId: req.correlationId });
    res.status(500).json({
      error: 'Authorization service error',
      correlationId: req.correlationId,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Content type validation middleware
 */
export function validateContentType(allowedTypes: string[] = ['application/json']) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Only validate content-type if the request has a body with content
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const contentLength = req.headers['content-length'];
      const hasBody = contentLength && parseInt(contentLength) > 0;

      // Only check Content-Type if there's actually a body
      if (hasBody) {
        const contentType = req.headers['content-type'];

        if (!contentType || !allowedTypes.some(type => contentType.includes(type))) {
          res.status(415).json({
            error: 'Unsupported Media Type',
            message: `Content-Type must be one of: ${allowedTypes.join(', ')}`,
            timestamp: new Date().toISOString()
          });
          return;
        }
      }
    }
    next();
  };
}

/**
 * Rate limiting headers middleware
 */
export function rateLimitHeaders(_req: Request, res: Response, next: NextFunction): void {
  // Mock rate limiting headers
  res.setHeader('X-RateLimit-Limit', '1000');
  res.setHeader('X-RateLimit-Remaining', '999');
  res.setHeader('X-RateLimit-Reset', Math.floor(Date.now() / 1000) + 900); // 15 minutes

  next();
}

/**
 * Error handling middleware for business operations
 */
export function businessErrorHandler(
  error: any,
  req: BusinessRequest,
  res: Response,
  _next: NextFunction
): void {
  logger.error('Business operation error', {
    error: error.message,
    stack: error.stack,
    correlationId: req.correlationId,
    sessionId: req.sessionId,
    userId: req.user?.userId,
    method: req.method,
    path: req.path
  });

  // Handle specific error types
  if (error.name === 'ValidationError') {
    res.status(400).json({
      error: 'Validation Error',
      message: error.message,
      correlationId: req.correlationId,
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (error.name === 'OrderError') {
    res.status(error.statusCode || 400).json({
      error: error.code || 'Order Error',
      message: error.message,
      correlationId: req.correlationId,
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (error.name === 'OrderNotFoundError') {
    res.status(404).json({
      error: 'Order Not Found',
      message: error.message,
      correlationId: req.correlationId,
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (error.name === 'InvalidStateTransitionError' || error.name === 'OrderNotEditableError') {
    res.status(422).json({
      error: 'Business Rule Violation',
      message: error.message,
      correlationId: req.correlationId,
      timestamp: new Date().toISOString()
    });
    return;
  }

  // Generic error response
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
    correlationId: req.correlationId,
    timestamp: new Date().toISOString()
  });
}

/**
 * Request timeout middleware
 */
export function requestTimeout(timeoutMs: number = 30000) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({
          error: 'Request Timeout',
          message: `Request timed out after ${timeoutMs}ms`,
          timestamp: new Date().toISOString()
        });
      }
    }, timeoutMs);

    res.on('finish', () => {
      clearTimeout(timeout);
    });

    res.on('close', () => {
      clearTimeout(timeout);
    });

    next();
  };
}