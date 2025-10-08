import request from 'supertest';
import { createApp } from '../index';
import { HealthEventService } from '../services/health-event.service';

// Mock the health event service completely
jest.mock('../services/health-event.service');

const MockHealthEventService = HealthEventService as jest.MockedClass<typeof HealthEventService>;

describe('Health Service Integration', () => {
  let app: any;
  let mockService: jest.Mocked<HealthEventService>;

  beforeAll(() => {
    // Create mock service instance
    mockService = {
      initialize: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      emitPatientRegistration: jest.fn().mockResolvedValue(undefined),
      emitAppointmentScheduled: jest.fn().mockResolvedValue(undefined),
      emitVitalSignsRecorded: jest.fn().mockResolvedValue(undefined),
      emitClinicalNotification: jest.fn().mockResolvedValue(undefined),
      emitLabResultAvailable: jest.fn().mockResolvedValue(undefined),
      emitMedicationPrescribed: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Mock the constructor
    MockHealthEventService.mockImplementation(() => mockService);

    // Create the app
    app = createApp();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Health Check Endpoint', () => {
    it('should return health status on /health', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('service', 'health-service');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return health status on /api/v1/health', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
    });
  });

  describe('Security Headers', () => {
    it('should set security headers on all responses', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
      expect(response.headers['cache-control']).toBe('no-store, no-cache, must-revalidate, private');
      expect(response.headers['server']).toBe('SMILE-Health-Service');
    });

    it('should add correlation ID to responses', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['x-correlation-id']).toBeDefined();
      expect(response.headers['x-correlation-id']).toMatch(/^req-\\d+-[a-z0-9]+$/);
    });

    it('should add rate limit headers', async () => {
      const response = await request(app).get('/health');

      expect(response.headers['x-ratelimit-limit']).toBe('1000');
      expect(response.headers['x-ratelimit-window']).toBe('3600');
      expect(response.headers['x-ratelimit-remaining']).toBe('999');
    });
  });

  describe('Authentication', () => {
    it('should reject requests to protected endpoints without auth', async () => {
      const response = await request(app)
        .post('/api/v1/patients')
        .send({})
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication required');
      expect(response.body).toHaveProperty('correlationId');
    });

    it('should allow requests with Authorization header', async () => {
      const response = await request(app)
        .post('/api/v1/patients')
        .set('Authorization', 'Bearer test-token')
        .send({
          patientId: 'TEST-001',
          firstName: 'Test',
          lastName: 'User',
          dateOfBirth: '1990-01-01',
          gender: 'male',
          registrationDate: '2024-01-01T00:00:00Z',
          facilityId: 'test-facility',
          registeredBy: 'test-user',
          status: 'active'
        });

      // Should get past auth but may fail validation - that's ok for this test
      expect(response.status).not.toBe(401);
    });

    it('should allow requests with API key', async () => {
      const response = await request(app)
        .post('/api/v1/patients')
        .set('X-API-Key', 'test-api-key')
        .send({
          patientId: 'TEST-001',
          firstName: 'Test',
          lastName: 'User',
          dateOfBirth: '1990-01-01',
          gender: 'male',
          registrationDate: '2024-01-01T00:00:00Z',
          facilityId: 'test-facility',
          registeredBy: 'test-user',
          status: 'active'
        });

      // Should get past auth but may fail validation - that's ok for this test
      expect(response.status).not.toBe(401);
    });
  });

  describe('Content Type Validation', () => {
    it('should reject non-JSON content types for POST requests', async () => {
      const response = await request(app)
        .post('/api/v1/patients')
        .set('Authorization', 'Bearer test-token')
        .set('Content-Type', 'text/plain')
        .send('invalid data')
        .expect(415);

      expect(response.body).toHaveProperty('error', 'Unsupported Media Type');
    });

    it('should accept JSON content type for POST requests', async () => {
      const response = await request(app)
        .post('/api/v1/patients')
        .set('Authorization', 'Bearer test-token')
        .set('Content-Type', 'application/json')
        .send({
          patientId: 'TEST-001',
          firstName: 'Test',
          lastName: 'User',
          dateOfBirth: '1990-01-01',
          gender: 'male',
          registrationDate: '2024-01-01T00:00:00Z',
          facilityId: 'test-facility',
          registeredBy: 'test-user',
          status: 'active'
        });

      // Should get past content type validation
      expect(response.status).not.toBe(415);
    });
  });

  describe('API Documentation', () => {
    it('should serve Swagger UI', async () => {
      const response = await request(app)
        .get('/api/docs/')
        .expect(200);

      expect(response.text).toContain('Swagger UI');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown endpoints', async () => {
      const response = await request(app)
        .get('/api/v1/unknown')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Not Found');
      expect(response.body).toHaveProperty('path', '/api/v1/unknown');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should handle errors with correlation ID', async () => {
      const response = await request(app)
        .get('/api/v1/unknown')
        .set('X-Correlation-ID', 'test-correlation-123');

      expect(response.body.correlationId).toBeUndefined(); // 404 handler doesn't include correlation ID
      expect(response.headers['x-correlation-id']).toBe('test-correlation-123');
    });
  });

  describe('Service Integration', () => {
    it('should initialize health event service', () => {
      expect(MockHealthEventService).toHaveBeenCalledWith(
        expect.objectContaining({
          facilityId: expect.any(String),
          facilityName: expect.any(String),
          exchange: expect.any(String),
          rabbitmqUrl: expect.any(String),
        })
      );
    });
  });
});