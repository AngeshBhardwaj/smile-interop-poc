import request from 'supertest';
import express, { Application } from 'express';
import bodyParser from 'body-parser';
import { forwardRouter } from '../routes/forward.routes';
import * as webhookService from '../services/webhook.service';

// Mock the webhook service
jest.mock('../services/webhook.service');

describe('Forward Routes', () => {
  let app: Application;

  beforeEach(() => {
    // Create fresh Express app for each test
    app = express();
    app.use(bodyParser.json());
    app.use('/forward', forwardRouter);

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('POST /forward', () => {
    const validCloudEvent = {
      specversion: '1.0',
      type: 'health.patient.registered',
      source: 'smile.health-service',
      id: 'test-event-123',
      time: '2025-10-14T10:00:00Z',
      datacontenttype: 'application/json',
      data: {
        patientId: 'P-12345',
        name: 'John Doe',
      },
    };

    it('should forward valid CloudEvent and return mediator response', async () => {
      const mockWebhookResponse = {
        status: 200,
        data: { success: true },
        headers: { 'content-type': 'application/json' },
      };

      (webhookService.forwardToWebhook as jest.Mock).mockResolvedValue(mockWebhookResponse);

      const response = await request(app).post('/forward').send(validCloudEvent).expect(200);

      expect(response.body).toHaveProperty('x-mediator-urn', 'urn:mediator:smile-passthrough');
      expect(response.body).toHaveProperty('status', 'Successful');
      expect(response.body).toHaveProperty('response');
      expect(response.body.response).toHaveProperty('status', 200);
      expect(response.body).toHaveProperty('orchestrations');
      expect(response.body.orchestrations).toHaveLength(1);

      expect(webhookService.forwardToWebhook).toHaveBeenCalledWith(validCloudEvent);
    });

    it('should handle webhook forward failure with 500 status', async () => {
      (webhookService.forwardToWebhook as jest.Mock).mockRejectedValue(
        new Error('Webhook connection failed')
      );

      const response = await request(app).post('/forward').send(validCloudEvent).expect(500);

      expect(response.body).toHaveProperty('x-mediator-urn', 'urn:mediator:smile-passthrough');
      expect(response.body).toHaveProperty('status', 'Failed');
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Webhook connection failed');
    });

    it('should validate CloudEvent has required specversion field', async () => {
      const invalidEvent = { ...validCloudEvent };
      delete (invalidEvent as any).specversion;

      const response = await request(app).post('/invalid').send(invalidEvent).expect(404);

      expect(webhookService.forwardToWebhook).not.toHaveBeenCalled();
    });

    it('should validate CloudEvent has required type field', async () => {
      const invalidEvent = { ...validCloudEvent };
      delete (invalidEvent as any).type;

      const response = await request(app).post('/forward').send(invalidEvent).expect(400);

      expect(response.body).toHaveProperty('error');
      expect(webhookService.forwardToWebhook).not.toHaveBeenCalled();
    });

    it('should validate CloudEvent has required source field', async () => {
      const invalidEvent = { ...validCloudEvent };
      delete (invalidEvent as any).source;

      const response = await request(app).post('/forward').send(invalidEvent).expect(400);

      expect(response.body).toHaveProperty('error');
      expect(webhookService.forwardToWebhook).not.toHaveBeenCalled();
    });

    it('should validate CloudEvent has required id field', async () => {
      const invalidEvent = { ...validCloudEvent };
      delete (invalidEvent as any).id;

      const response = await request(app).post('/forward').send(invalidEvent).expect(400);

      expect(response.body).toHaveProperty('error');
      expect(webhookService.forwardToWebhook).not.toHaveBeenCalled();
    });

    it('should accept CloudEvent without optional time field', async () => {
      const eventWithoutTime = { ...validCloudEvent };
      delete eventWithoutTime.time;

      const mockWebhookResponse = {
        status: 200,
        data: { success: true },
        headers: { 'content-type': 'application/json' },
      };

      (webhookService.forwardToWebhook as jest.Mock).mockResolvedValue(mockWebhookResponse);

      const response = await request(app).post('/forward').send(eventWithoutTime).expect(200);

      expect(response.body.status).toBe('Successful');
      expect(webhookService.forwardToWebhook).toHaveBeenCalledWith(eventWithoutTime);
    });

    it('should include correlation ID in orchestration logs', async () => {
      const mockWebhookResponse = {
        status: 200,
        data: { success: true },
        headers: { 'content-type': 'application/json' },
      };

      (webhookService.forwardToWebhook as jest.Mock).mockResolvedValue(mockWebhookResponse);

      const response = await request(app)
        .post('/forward')
        .set('X-Correlation-ID', 'test-correlation-123')
        .send(validCloudEvent)
        .expect(200);

      expect(response.body.properties).toHaveProperty('correlationId', 'test-correlation-123');
    });

    it('should generate correlation ID if not provided in headers', async () => {
      const mockWebhookResponse = {
        status: 200,
        data: { success: true },
        headers: { 'content-type': 'application/json' },
      };

      (webhookService.forwardToWebhook as jest.Mock).mockResolvedValue(mockWebhookResponse);

      const response = await request(app).post('/forward').send(validCloudEvent).expect(200);

      expect(response.body.properties).toHaveProperty('correlationId');
      expect(response.body.properties.correlationId).toMatch(/^[a-f0-9-]{36}$/);
    });

    it('should include event metadata in orchestration', async () => {
      const mockWebhookResponse = {
        status: 200,
        data: { success: true },
        headers: { 'content-type': 'application/json' },
      };

      (webhookService.forwardToWebhook as jest.Mock).mockResolvedValue(mockWebhookResponse);

      const response = await request(app).post('/forward').send(validCloudEvent).expect(200);

      const orchestration = response.body.orchestrations[0];
      expect(orchestration).toHaveProperty('name', 'Webhook Forward');
      expect(orchestration.request).toHaveProperty('method', 'POST');
      expect(orchestration.request).toHaveProperty('timestamp');
      expect(orchestration.response).toHaveProperty('timestamp');
    });

    it('should return 400 for non-JSON request body', async () => {
      const response = await request(app)
        .post('/forward')
        .set('Content-Type', 'text/plain')
        .send('invalid json')
        .expect(400);

      expect(webhookService.forwardToWebhook).not.toHaveBeenCalled();
    });

    it('should handle empty request body', async () => {
      const response = await request(app).post('/forward').send({}).expect(400);

      expect(response.body).toHaveProperty('error');
      expect(webhookService.forwardToWebhook).not.toHaveBeenCalled();
    });
  });

  describe('GET /forward/health', () => {
    it('should return health check status', async () => {
      const response = await request(app).get('/forward/health').expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('service', 'passthrough-mediator');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});
