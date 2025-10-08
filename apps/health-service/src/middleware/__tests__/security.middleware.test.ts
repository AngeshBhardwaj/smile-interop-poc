import { Request, Response, NextFunction } from 'express';
import {
  securityHeaders,
  requestCorrelation,
  auditLogging,
  authentication,
  healthDataAuthorization,
  errorHandler,
  validateContentType,
  rateLimitHeaders,
  AuditRequest,
} from '../security.middleware';
import { auditLogger, AuditEventType } from '@smile/common';

// Mock dependencies
jest.mock('@smile/common', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
  auditLogger: {
    createContextFromRequest: jest.fn(),
    logAPIRequest: jest.fn(),
    logAuthentication: jest.fn(),
    logSecurityEvent: jest.fn(),
  },
  AuditEventType: {
    AUTH_FAILURE: 'auth.failure',
    USER_LOGIN: 'auth.login',
    UNAUTHORIZED_ACCESS: 'security.unauthorized.access',
    API_ERROR: 'api.error',
  },
}));

describe('Security Middleware', () => {
  let mockReq: Partial<AuditRequest>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {},
      path: '/test',
      method: 'GET',
      ip: '127.0.0.1',
    };

    mockRes = {
      setHeader: jest.fn(),
      removeHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      end: jest.fn(),
      getHeader: jest.fn(),
    };

    mockNext = jest.fn();

    jest.clearAllMocks();
  });

  describe('securityHeaders', () => {
    it('should set required security headers', () => {
      securityHeaders(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
      expect(mockRes.removeHeader).toHaveBeenCalledWith('X-Powered-By');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Server', 'SMILE-Health-Service');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should set HIPAA compliance headers', () => {
      securityHeaders(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Expires', '0');
    });
  });

  describe('requestCorrelation', () => {
    it('should generate correlation ID when not provided', () => {
      requestCorrelation(mockReq as AuditRequest, mockRes as Response, mockNext);

      expect(mockReq.auditContext?.correlationId).toMatch(/^req-\d+-[a-z0-9]+$/);
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Correlation-ID', mockReq.auditContext?.correlationId);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should use provided correlation ID', () => {
      mockReq.headers = { 'x-correlation-id': 'custom-correlation-id' };

      requestCorrelation(mockReq as AuditRequest, mockRes as Response, mockNext);

      expect(mockReq.auditContext?.correlationId).toBe('custom-correlation-id');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Correlation-ID', 'custom-correlation-id');
    });

    it('should extract session ID from headers', () => {
      mockReq.headers = { 'x-session-id': 'session-123' };

      requestCorrelation(mockReq as AuditRequest, mockRes as Response, mockNext);

      expect(mockReq.auditContext?.sessionId).toBe('session-123');
    });

    it('should extract user ID from headers', () => {
      mockReq.headers = { 'x-user-id': 'user-123' };

      requestCorrelation(mockReq as AuditRequest, mockRes as Response, mockNext);

      expect(mockReq.auditContext?.userId).toBe('user-123');
    });

    it('should set start time', () => {
      const startTime = Date.now();
      requestCorrelation(mockReq as AuditRequest, mockRes as Response, mockNext);

      expect(mockReq.auditContext?.startTime).toBeGreaterThanOrEqual(startTime);
    });
  });

  describe('auditLogging', () => {
    beforeEach(() => {
      mockReq.auditContext = {
        correlationId: 'test-correlation',
        userId: 'test-user',
      };
      (auditLogger.createContextFromRequest as jest.Mock).mockReturnValue({
        userId: 'test-user',
        correlationId: 'test-correlation',
        service: 'health-service',
      });
    });

    it('should log incoming request', () => {
      auditLogging(mockReq as AuditRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should override res.end to log response', () => {
      auditLogging(mockReq as AuditRequest, mockRes as Response, mockNext);

      // Call the overridden end method
      const originalEnd = mockRes.end as jest.Mock;
      originalEnd('response data');

      expect(auditLogger.logAPIRequest).toHaveBeenCalledWith(
        'GET',
        '/test',
        undefined, // status code not set in mock
        expect.objectContaining({
          userId: 'test-user',
          correlationId: 'test-correlation',
          service: 'health-service',
        }),
        expect.any(Number), // duration
        expect.objectContaining({
          userAgent: undefined,
          contentLength: undefined,
          responseTime: expect.any(Number),
        })
      );
    });
  });

  describe('authentication', () => {
    beforeEach(() => {
      mockReq.auditContext = { correlationId: 'test-correlation' };
      (auditLogger.createContextFromRequest as jest.Mock).mockReturnValue({
        correlationId: 'test-correlation',
        service: 'health-service',
      });
    });

    it('should authenticate with Bearer token', () => {
      mockReq.headers = { authorization: 'Bearer token123' };

      authentication(mockReq as AuditRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).user).toEqual({
        id: 'mock-user-123',
        role: 'healthcare-provider',
        facilityId: 'facility-001',
      });
    });

    it('should authenticate with API key', () => {
      mockReq.headers = { 'x-api-key': 'api-key-123' };

      authentication(mockReq as AuditRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).user).toBeDefined();
    });

    it('should reject requests without credentials', () => {
      authentication(mockReq as AuditRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        message: 'Please provide valid authentication credentials',
        correlationId: 'test-correlation',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should log authentication failure', () => {
      authentication(mockReq as AuditRequest, mockRes as Response, mockNext);

      expect(auditLogger.logAuthentication).toHaveBeenCalledWith(
        AuditEventType.AUTH_FAILURE,
        'anonymous',
        expect.any(Object),
        {
          reason: 'missing-credentials',
          path: '/test',
          method: 'GET',
        }
      );
    });

    it('should log successful authentication', () => {
      mockReq.headers = { authorization: 'Bearer token123' };

      authentication(mockReq as AuditRequest, mockRes as Response, mockNext);

      expect(auditLogger.logAuthentication).toHaveBeenCalledWith(
        AuditEventType.USER_LOGIN,
        'mock-user-123',
        expect.any(Object),
        {
          method: 'api-key',
          path: '/test',
        }
      );
    });
  });

  describe('healthDataAuthorization', () => {
    beforeEach(() => {
      mockReq.auditContext = { correlationId: 'test-correlation' };
      (auditLogger.createContextFromRequest as jest.Mock).mockReturnValue({
        correlationId: 'test-correlation',
        service: 'health-service',
      });
    });

    it('should authorize healthcare provider', () => {
      (mockReq as any).user = { id: 'user-123', role: 'healthcare-provider' };

      healthDataAuthorization(mockReq as AuditRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should authorize physician', () => {
      (mockReq as any).user = { id: 'user-123', role: 'physician' };

      healthDataAuthorization(mockReq as AuditRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject unauthenticated requests', () => {
      healthDataAuthorization(mockReq as AuditRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        correlationId: 'test-correlation',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject unauthorized roles', () => {
      (mockReq as any).user = { id: 'user-123', role: 'patient' };

      healthDataAuthorization(mockReq as AuditRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Insufficient permissions',
        message: 'Access to health data requires appropriate healthcare role',
        correlationId: 'test-correlation',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should log unauthorized access attempts', () => {
      (mockReq as any).user = { id: 'user-123', role: 'patient' };

      healthDataAuthorization(mockReq as AuditRequest, mockRes as Response, mockNext);

      expect(auditLogger.logSecurityEvent).toHaveBeenCalledWith(
        AuditEventType.UNAUTHORIZED_ACCESS,
        'Unauthorized access attempt to health data endpoint: /test',
        expect.any(Object),
        undefined,
        {
          userRole: 'patient',
          requiredRoles: ['healthcare-provider', 'physician', 'nurse', 'admin'],
          path: '/test',
          method: 'GET',
        }
      );
    });
  });

  describe('errorHandler', () => {
    const testError = new Error('Test error');

    beforeEach(() => {
      mockReq.auditContext = {
        correlationId: 'test-correlation',
        userId: 'test-user',
      };
      (auditLogger.createContextFromRequest as jest.Mock).mockReturnValue({
        correlationId: 'test-correlation',
        service: 'health-service',
      });
    });

    it('should handle errors and return 500', () => {
      errorHandler(testError, mockReq as AuditRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'An error occurred while processing your request',
        correlationId: 'test-correlation',
        timestamp: expect.any(String),
      });
    });

    it('should log security event for errors', () => {
      errorHandler(testError, mockReq as AuditRequest, mockRes as Response, mockNext);

      expect(auditLogger.logSecurityEvent).toHaveBeenCalledWith(
        AuditEventType.API_ERROR,
        'Request processing error: Test error',
        expect.any(Object),
        undefined,
        {
          errorType: 'Error',
          path: '/test',
          method: 'GET',
        }
      );
    });

    it('should handle missing correlation ID', () => {
      delete mockReq.auditContext;

      errorHandler(testError, mockReq as AuditRequest, mockRes as Response, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: 'unknown',
        })
      );
    });
  });

  describe('validateContentType', () => {
    it('should allow valid content type for POST requests', () => {
      mockReq.method = 'POST';
      mockReq.headers = { 'content-type': 'application/json' };

      const middleware = validateContentType(['application/json']);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject invalid content type for POST requests', () => {
      mockReq.method = 'POST';
      mockReq.headers = { 'content-type': 'text/plain' };
      mockReq.auditContext = { correlationId: 'test-correlation' };

      const middleware = validateContentType(['application/json']);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(415);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Unsupported Media Type',
        message: 'Content-Type must be one of: application/json',
        correlationId: 'test-correlation',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow GET requests without content type validation', () => {
      mockReq.method = 'GET';

      const middleware = validateContentType(['application/json']);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow DELETE requests without content type validation', () => {
      mockReq.method = 'DELETE';

      const middleware = validateContentType(['application/json']);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('rateLimitHeaders', () => {
    it('should add rate limit headers', () => {
      rateLimitHeaders(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '1000');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Window', '3600');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '999');
      expect(mockNext).toHaveBeenCalled();
    });
  });
});