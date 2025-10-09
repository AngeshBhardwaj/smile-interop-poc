/**
 * Business Middleware Unit Tests
 *
 * Tests for security, authentication, and business logic middleware
 */

import { Request, Response, NextFunction } from 'express';
import {
  BusinessRequest,
  businessSecurityHeaders,
  requestCorrelation,
  businessAuditLogging,
  businessAuthentication,
  businessAuthorization,
  validateContentType,
  rateLimitHeaders,
  businessErrorHandler,
  requestTimeout,
} from '../business.middleware';
import { logger } from '@smile/common';

// Mock logger
jest.mock('@smile/common', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Business Middleware', () => {
  let mockRequest: Partial<BusinessRequest>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;
  let setHeaderMock: jest.Mock;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;

  beforeEach(() => {
    setHeaderMock = jest.fn();
    statusMock = jest.fn().mockReturnThis();
    jsonMock = jest.fn();

    mockRequest = {
      headers: {},
      method: 'GET',
      path: '/api/v1/orders',
      ip: '127.0.0.1',
    };

    mockResponse = {
      setHeader: setHeaderMock,
      status: statusMock,
      json: jsonMock,
      headersSent: false,
      on: jest.fn(),
      end: jest.fn(),
    };

    nextFunction = jest.fn();
    jest.clearAllMocks();
  });

  describe('businessSecurityHeaders', () => {
    it('should set all security headers', () => {
      businessSecurityHeaders(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(setHeaderMock).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(setHeaderMock).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(setHeaderMock).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(setHeaderMock).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
      expect(setHeaderMock).toHaveBeenCalledWith('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
      expect(setHeaderMock).toHaveBeenCalledWith('X-Service-Type', 'orders-service');
      expect(setHeaderMock).toHaveBeenCalledWith('X-API-Version', '1.0');
      expect(nextFunction).toHaveBeenCalled();
    });
  });

  describe('requestCorrelation', () => {
    it('should generate correlation ID if not provided', () => {
      requestCorrelation(mockRequest as BusinessRequest, mockResponse as Response, nextFunction);

      expect(mockRequest.correlationId).toBeDefined();
      expect(typeof mockRequest.correlationId).toBe('string');
      expect(setHeaderMock).toHaveBeenCalledWith('X-Correlation-ID', mockRequest.correlationId);
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should use existing correlation ID from headers', () => {
      mockRequest.headers = { 'x-correlation-id': 'existing-corr-123' };

      requestCorrelation(mockRequest as BusinessRequest, mockResponse as Response, nextFunction);

      expect(mockRequest.correlationId).toBe('existing-corr-123');
      expect(setHeaderMock).toHaveBeenCalledWith('X-Correlation-ID', 'existing-corr-123');
    });

    it('should extract session ID from headers', () => {
      mockRequest.headers = { 'x-session-id': 'session-456' };

      requestCorrelation(mockRequest as BusinessRequest, mockResponse as Response, nextFunction);

      expect(mockRequest.sessionId).toBe('session-456');
    });

    it('should set request start time', () => {
      const beforeTime = Date.now();
      requestCorrelation(mockRequest as BusinessRequest, mockResponse as Response, nextFunction);
      const afterTime = Date.now();

      expect(mockRequest.requestStartTime).toBeGreaterThanOrEqual(beforeTime);
      expect(mockRequest.requestStartTime).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('businessAuditLogging', () => {
    it('should log incoming request', () => {
      mockRequest.correlationId = 'corr-123';
      mockRequest.headers = { 'user-agent': 'test-agent' };

      businessAuditLogging(mockRequest as BusinessRequest, mockResponse as Response, nextFunction);

      expect(logger.info).toHaveBeenCalledWith('Incoming order request', expect.objectContaining({
        method: 'GET',
        path: '/api/v1/orders',
        correlationId: 'corr-123',
        userAgent: 'test-agent',
        ip: '127.0.0.1',
      }));
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should log request completion when response ends', () => {
      mockRequest.correlationId = 'corr-123';
      mockRequest.user = { userId: 'user-123', roles: [], facilityId: 'fac-001' };

      const mockEnd = jest.fn();
      (mockResponse as any).end = mockEnd;

      businessAuditLogging(mockRequest as BusinessRequest, mockResponse as Response, nextFunction);

      // Response.end should be replaced
      expect(mockResponse.end).not.toBe(mockEnd);

      // Call the replaced end function
      (mockResponse.end as any)();

      expect(logger.info).toHaveBeenCalledWith('Order request completed', expect.objectContaining({
        method: 'GET',
        path: '/api/v1/orders',
        correlationId: 'corr-123',
        userId: 'user-123',
      }));
    });
  });

  describe('businessAuthentication', () => {
    it('should authenticate with valid API key', () => {
      mockRequest.headers = { 'x-api-key': 'orders-api-key-dev' };
      mockRequest.correlationId = 'corr-123';

      businessAuthentication(mockRequest as BusinessRequest, mockResponse as Response, nextFunction);

      expect(mockRequest.user).toEqual({
        userId: 'api-user-001',
        userName: 'API User',
        roles: ['order-manager', 'approver'],
        facilityId: 'facility-001',
      });
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should reject invalid API key', () => {
      mockRequest.headers = { 'x-api-key': 'invalid-key' };
      mockRequest.correlationId = 'corr-123';

      businessAuthentication(mockRequest as BusinessRequest, mockResponse as Response, nextFunction);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Invalid API key',
      }));
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should authenticate with mock JWT token', () => {
      mockRequest.headers = { authorization: 'Bearer mock-jwt-token' };
      mockRequest.correlationId = 'corr-123';

      businessAuthentication(mockRequest as BusinessRequest, mockResponse as Response, nextFunction);

      expect(mockRequest.user).toEqual({
        userId: 'user-001',
        userName: 'John Manager',
        roles: ['order-manager', 'approver'],
        facilityId: 'facility-001',
        departmentId: 'purchasing',
      });
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should reject missing authentication', () => {
      mockRequest.correlationId = 'corr-123';

      businessAuthentication(mockRequest as BusinessRequest, mockResponse as Response, nextFunction);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Authentication required',
        message: 'Bearer token or API key required',
      }));
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject malformed authorization header', () => {
      mockRequest.headers = { authorization: 'InvalidFormat token' };
      mockRequest.correlationId = 'corr-123';

      businessAuthentication(mockRequest as BusinessRequest, mockResponse as Response, nextFunction);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe('businessAuthorization', () => {
    beforeEach(() => {
      mockRequest.user = {
        userId: 'user-123',
        roles: ['order-viewer'],
        facilityId: 'facility-001',
      };
      mockRequest.correlationId = 'corr-123';
    });

    it('should allow user with correct role to view orders', () => {
      mockRequest.method = 'GET';
      (mockRequest as any).path = '/api/v1/orders';

      businessAuthorization(mockRequest as BusinessRequest, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should deny user without correct role', () => {
      mockRequest.method = 'POST';
      (mockRequest as any).path = '/api/v1/orders';
      // order-viewer doesn't have order-creator or order-manager role

      businessAuthorization(mockRequest as BusinessRequest, mockResponse as Response, nextFunction);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Insufficient permissions',
      }));
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should allow approver to approve orders', () => {
      mockRequest.user!.roles = ['approver'];
      mockRequest.method = 'POST';
      (mockRequest as any).path = '/api/v1/orders/550e8400-e29b-41d4-a716-446655440000/approve';

      businessAuthorization(mockRequest as BusinessRequest, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });

    it('should normalize UUID paths for permission checking', () => {
      mockRequest.user!.roles = ['order-manager'];
      mockRequest.method = 'PUT';
      (mockRequest as any).path = '/api/v1/orders/550e8400-e29b-41d4-a716-446655440000';

      businessAuthorization(mockRequest as BusinessRequest, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });

    it('should allow access to routes without specific permissions', () => {
      mockRequest.method = 'GET';
      (mockRequest as any).path = '/api/v1/health';

      businessAuthorization(mockRequest as BusinessRequest, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });

    it('should return 401 if user not authenticated', () => {
      delete mockRequest.user;

      businessAuthorization(mockRequest as BusinessRequest, mockResponse as Response, nextFunction);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: 'User not authenticated',
      }));
    });
  });

  describe('validateContentType', () => {
    it('should allow POST with application/json and body', () => {
      mockRequest.method = 'POST';
      mockRequest.headers = { 'content-type': 'application/json', 'content-length': '100' };

      const middleware = validateContentType(['application/json']);
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should reject POST with wrong content type and body', () => {
      mockRequest.method = 'POST';
      mockRequest.headers = { 'content-type': 'text/plain', 'content-length': '100' };

      const middleware = validateContentType(['application/json']);
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(statusMock).toHaveBeenCalledWith(415);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Unsupported Media Type',
      }));
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should reject POST with body but no content type', () => {
      mockRequest.method = 'POST';
      mockRequest.headers = { 'content-length': '100' };

      const middleware = validateContentType(['application/json']);
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(statusMock).toHaveBeenCalledWith(415);
    });

    it('should allow POST without body (no content-length)', () => {
      mockRequest.method = 'POST';
      mockRequest.headers = {};

      const middleware = validateContentType(['application/json']);
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should allow POST with content-length of 0', () => {
      mockRequest.method = 'POST';
      mockRequest.headers = { 'content-length': '0' };

      const middleware = validateContentType(['application/json']);
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should allow GET without content type check', () => {
      mockRequest.method = 'GET';
      mockRequest.headers = {};

      const middleware = validateContentType(['application/json']);
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });
  });

  describe('rateLimitHeaders', () => {
    it('should set rate limit headers', () => {
      rateLimitHeaders(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Limit', '1000');
      expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Remaining', '999');
      expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
      expect(nextFunction).toHaveBeenCalled();
    });
  });

  describe('businessErrorHandler', () => {
    beforeEach(() => {
      mockRequest.correlationId = 'corr-123';
      mockRequest.user = { userId: 'user-123', roles: [], facilityId: 'fac-001' };
    });

    it('should handle ValidationError with 400', () => {
      const error: any = new Error('Validation failed');
      error.name = 'ValidationError';

      businessErrorHandler(error, mockRequest as BusinessRequest, mockResponse as Response, nextFunction);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Validation Error',
        message: 'Validation failed',
      }));
    });

    it('should handle OrderNotFoundError with 404', () => {
      const error: any = new Error('Order not found');
      error.name = 'OrderNotFoundError';

      businessErrorHandler(error, mockRequest as BusinessRequest, mockResponse as Response, nextFunction);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Order Not Found',
      }));
    });

    it('should handle InvalidStateTransitionError with 422', () => {
      const error: any = new Error('Invalid transition');
      error.name = 'InvalidStateTransitionError';

      businessErrorHandler(error, mockRequest as BusinessRequest, mockResponse as Response, nextFunction);

      expect(statusMock).toHaveBeenCalledWith(422);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Business Rule Violation',
      }));
    });

    it('should handle OrderNotEditableError with 422', () => {
      const error: any = new Error('Cannot edit order');
      error.name = 'OrderNotEditableError';

      businessErrorHandler(error, mockRequest as BusinessRequest, mockResponse as Response, nextFunction);

      expect(statusMock).toHaveBeenCalledWith(422);
    });

    it('should handle OrderError with custom status code', () => {
      const error: any = new Error('Order error');
      error.name = 'OrderError';
      error.statusCode = 409;
      error.code = 'ORDER_CONFLICT';

      businessErrorHandler(error, mockRequest as BusinessRequest, mockResponse as Response, nextFunction);

      expect(statusMock).toHaveBeenCalledWith(409);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: 'ORDER_CONFLICT',
      }));
    });

    it('should handle generic errors with 500', () => {
      const error = new Error('Unexpected error');

      businessErrorHandler(error, mockRequest as BusinessRequest, mockResponse as Response, nextFunction);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
      }));
    });

    it('should log all errors', () => {
      const error = new Error('Test error');

      businessErrorHandler(error, mockRequest as BusinessRequest, mockResponse as Response, nextFunction);

      expect(logger.error).toHaveBeenCalledWith('Business operation error', expect.objectContaining({
        error: 'Test error',
        correlationId: 'corr-123',
        userId: 'user-123',
      }));
    });
  });

  describe('requestTimeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should timeout request after specified duration', () => {
      mockResponse.headersSent = false;
      const onMock = jest.fn();
      mockResponse.on = onMock;

      const middleware = requestTimeout(1000);
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();

      // Fast-forward time
      jest.advanceTimersByTime(1000);

      expect(statusMock).toHaveBeenCalledWith(408);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Request Timeout',
        message: 'Request timed out after 1000ms',
      }));
    });

    it('should not timeout if response already sent', () => {
      mockResponse.headersSent = true;
      const onMock = jest.fn();
      mockResponse.on = onMock;

      const middleware = requestTimeout(1000);
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      jest.advanceTimersByTime(1000);

      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should clear timeout on response finish', () => {
      const onMock = jest.fn();
      mockResponse.on = onMock;

      const middleware = requestTimeout(1000);
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      // Simulate finish event
      const finishCallback = onMock.mock.calls.find(call => call[0] === 'finish')?.[1];
      if (finishCallback) {
        finishCallback();
      }

      jest.advanceTimersByTime(1000);

      // Should not timeout since finish was called
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should clear timeout on response close', () => {
      const onMock = jest.fn();
      mockResponse.on = onMock;

      const middleware = requestTimeout(1000);
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      // Simulate close event
      const closeCallback = onMock.mock.calls.find(call => call[0] === 'close')?.[1];
      if (closeCallback) {
        closeCallback();
      }

      jest.advanceTimersByTime(1000);

      // Should not timeout since close was called
      expect(statusMock).not.toHaveBeenCalled();
    });
  });
});
