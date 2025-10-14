import axios from 'axios';
import { forwardToWebhook } from '../services/webhook.service';
import { CloudEvent } from '../config/types';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Webhook Service', () => {
  const validCloudEvent: CloudEvent = {
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

  beforeEach(() => {
    jest.clearAllMocks();
    // Set default environment variables
    process.env.WEBHOOK_URL = 'https://webhook.site/test';
    process.env.WEBHOOK_TIMEOUT = '10000';
    process.env.WEBHOOK_RETRY_ATTEMPTS = '3';
  });

  describe('forwardToWebhook', () => {
    it('should successfully forward CloudEvent to webhook', async () => {
      const mockResponse = {
        status: 200,
        data: { success: true },
        headers: { 'content-type': 'application/json' },
        statusText: 'OK',
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      const result = await forwardToWebhook(validCloudEvent);

      expect(result).toEqual({
        status: 200,
        data: { success: true },
        headers: { 'content-type': 'application/json' },
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://webhook.site/test',
        validCloudEvent,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/cloudevents+json',
          }),
          timeout: 10000,
        })
      );
    });

    it('should include CloudEvents headers in request', async () => {
      const mockResponse = {
        status: 200,
        data: {},
        headers: {},
        statusText: 'OK',
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      await forwardToWebhook(validCloudEvent);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/cloudevents+json',
            'ce-specversion': '1.0',
            'ce-type': 'health.patient.registered',
            'ce-source': 'smile.health-service',
            'ce-id': 'test-event-123',
          }),
        })
      );
    });

    it('should handle webhook returning 500 error', async () => {
      const mockError = new Error('Request failed with status code 500');
      (mockError as any).response = {
        status: 500,
        data: { error: 'Internal Server Error' },
        headers: {},
        statusText: 'Internal Server Error',
      };

      mockedAxios.post.mockRejectedValueOnce(mockError);

      await expect(forwardToWebhook(validCloudEvent)).rejects.toThrow('Request failed with status code 500');
    });

    it('should handle network timeout', async () => {
      const mockError = new Error('timeout of 10000ms exceeded');
      (mockError as any).code = 'ECONNABORTED';

      mockedAxios.post.mockRejectedValueOnce(mockError);

      await expect(forwardToWebhook(validCloudEvent)).rejects.toThrow('timeout');
    });

    it('should handle network connection refused', async () => {
      const mockError = new Error('connect ECONNREFUSED 127.0.0.1:3000');
      (mockError as any).code = 'ECONNREFUSED';

      mockedAxios.post.mockRejectedValueOnce(mockError);

      await expect(forwardToWebhook(validCloudEvent)).rejects.toThrow();
    });

    it('should include correlation ID in headers if provided', async () => {
      const mockResponse = {
        status: 200,
        data: {},
        headers: {},
        statusText: 'OK',
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      await forwardToWebhook(validCloudEvent, 'test-correlation-123');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Correlation-ID': 'test-correlation-123',
          }),
        })
      );
    });

    it('should not include correlation ID header if not provided', async () => {
      const mockResponse = {
        status: 200,
        data: {},
        headers: {},
        statusText: 'OK',
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      await forwardToWebhook(validCloudEvent);

      const callArgs = mockedAxios.post.mock.calls[0]?.[2];
      expect(callArgs?.headers).not.toHaveProperty('X-Correlation-ID');
    });

    it('should handle webhook returning 404 error', async () => {
      const mockError = new Error('Request failed with status code 404');
      (mockError as any).response = {
        status: 404,
        data: { error: 'Not Found' },
        headers: {},
        statusText: 'Not Found',
      };

      mockedAxios.post.mockRejectedValueOnce(mockError);

      await expect(forwardToWebhook(validCloudEvent)).rejects.toThrow('Request failed with status code 404');
    });

    it('should preserve all CloudEvent properties in forwarded payload', async () => {
      const mockResponse = {
        status: 200,
        data: {},
        headers: {},
        statusText: 'OK',
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      const eventWithExtensions = {
        ...validCloudEvent,
        subject: 'patient/P-12345',
        customExtension: 'custom-value',
      };

      await forwardToWebhook(eventWithExtensions);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          specversion: '1.0',
          type: 'health.patient.registered',
          source: 'smile.health-service',
          id: 'test-event-123',
          subject: 'patient/P-12345',
          customExtension: 'custom-value',
        }),
        expect.any(Object)
      );
    });
  });

  describe('forwardToWebhookWithRetry', () => {
    const { forwardToWebhookWithRetry } = require('../services/webhook.service');

    beforeEach(() => {
      jest.clearAllMocks();
      process.env.WEBHOOK_URL = 'https://webhook.site/test';
      process.env.WEBHOOK_TIMEOUT = '10000';
      process.env.WEBHOOK_RETRY_ATTEMPTS = '3';
    });

    it('should succeed on first attempt without retry', async () => {
      const mockResponse = {
        status: 200,
        data: { success: true },
        headers: { 'content-type': 'application/json' },
        statusText: 'OK',
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await forwardToWebhookWithRetry(validCloudEvent);

      expect(result).toEqual({
        status: 200,
        data: { success: true },
        headers: { 'content-type': 'application/json' },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const mockError = new Error('Network error');
      const mockSuccess = {
        status: 200,
        data: { success: true },
        headers: {},
        statusText: 'OK',
      };

      // Fail first two attempts, succeed on third
      mockedAxios.post
        .mockRejectedValueOnce(mockError)
        .mockRejectedValueOnce(mockError)
        .mockResolvedValueOnce(mockSuccess);

      const result = await forwardToWebhookWithRetry(validCloudEvent);

      expect(result.status).toBe(200);
      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    });

    it(
      'should throw error after max retry attempts',
      async () => {
        const mockError = new Error('Persistent network error');

        mockedAxios.post.mockRejectedValue(mockError);

        await expect(forwardToWebhookWithRetry(validCloudEvent)).rejects.toThrow('Persistent network error');

        // Should attempt: initial + 3 retries = 4 total attempts
        expect(mockedAxios.post).toHaveBeenCalledTimes(4);
      },
      15000
    ); // 15 second timeout for retry test

    it('should include correlation ID in retry attempts', async () => {
      const mockError = new Error('Network error');
      const mockSuccess = {
        status: 200,
        data: { success: true },
        headers: {},
        statusText: 'OK',
      };

      mockedAxios.post.mockRejectedValueOnce(mockError).mockResolvedValueOnce(mockSuccess);

      await forwardToWebhookWithRetry(validCloudEvent, 'test-correlation-456');

      // Check that correlation ID was passed in all attempts
      const calls = mockedAxios.post.mock.calls;
      expect(calls.length).toBe(2);
      calls.forEach((call) => {
        const headers = call[2]?.headers;
        expect(headers).toHaveProperty('X-Correlation-ID', 'test-correlation-456');
      });
    });

    it(
      'should wait with exponential backoff between retries',
      async () => {
        const mockError = new Error('Network error');
        const startTime = Date.now();

        mockedAxios.post.mockRejectedValue(mockError);

        try {
          await forwardToWebhookWithRetry(validCloudEvent);
        } catch (error) {
          // Expected to fail after retries
        }

        const duration = Date.now() - startTime;

        // Should have delays: ~1s, ~2s, ~4s = ~7s minimum (with jitter up to +3s)
        // We'll check for at least 6 seconds to account for timing variations
        expect(duration).toBeGreaterThanOrEqual(6000);
      },
      15000
    ); // 15 second timeout for backoff test
  });
});
