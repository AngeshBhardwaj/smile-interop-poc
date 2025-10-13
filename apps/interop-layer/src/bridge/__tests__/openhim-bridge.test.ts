/**
 * OpenHIM Bridge Unit Tests
 *
 * TDD approach: Write tests first, then implement bridge
 *
 * The OpenHIM Bridge is a simple protocol converter that:
 * 1. Takes CloudEvents from RabbitMQ
 * 2. Determines OpenHIM endpoint based on event.source
 * 3. Converts CloudEvent to HTTP POST request
 * 4. Sends to OpenHIM with authentication
 * 5. Returns HTTP response
 */

import { OpenHIMBridge } from '../openhim-bridge';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OpenHIMBridge', () => {
  let bridge: OpenHIMBridge;

  const mockConfig = {
    healthEndpoint: 'http://localhost:5001/health',
    ordersEndpoint: 'http://localhost:5001/orders',
    defaultEndpoint: 'http://localhost:5001/events',
    username: 'test@openhim.org',
    password: 'password',
    timeout: 10000,
    retryAttempts: 3,
    retryDelay: 1000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    bridge = new OpenHIMBridge(mockConfig);
  });

  describe('constructor', () => {
    it('should create bridge with valid configuration', () => {
      expect(bridge).toBeInstanceOf(OpenHIMBridge);
    });

    it('should throw error if healthEndpoint is missing', () => {
      const invalidConfig = { ...mockConfig, healthEndpoint: '' };

      expect(() => new OpenHIMBridge(invalidConfig as any)).toThrow(
        'healthEndpoint is required',
      );
    });

    it('should throw error if ordersEndpoint is missing', () => {
      const invalidConfig = { ...mockConfig, ordersEndpoint: '' };

      expect(() => new OpenHIMBridge(invalidConfig as any)).toThrow(
        'ordersEndpoint is required',
      );
    });

    it('should throw error if defaultEndpoint is missing', () => {
      const invalidConfig = { ...mockConfig, defaultEndpoint: '' };

      expect(() => new OpenHIMBridge(invalidConfig as any)).toThrow(
        'defaultEndpoint is required',
      );
    });

    it('should throw error if username is missing', () => {
      const invalidConfig = { ...mockConfig, username: '' };

      expect(() => new OpenHIMBridge(invalidConfig as any)).toThrow('username is required');
    });

    it('should throw error if password is missing', () => {
      const invalidConfig = { ...mockConfig, password: '' };

      expect(() => new OpenHIMBridge(invalidConfig as any)).toThrow('password is required');
    });
  });

  describe('getEndpointForSource()', () => {
    it('should return healthEndpoint for smile.health-service', () => {
      const endpoint = bridge.getEndpointForSource('smile.health-service');

      expect(endpoint).toBe(mockConfig.healthEndpoint);
    });

    it('should return ordersEndpoint for smile.orders-service', () => {
      const endpoint = bridge.getEndpointForSource('smile.orders-service');

      expect(endpoint).toBe(mockConfig.ordersEndpoint);
    });

    it('should return defaultEndpoint for unknown source', () => {
      const endpoint = bridge.getEndpointForSource('unknown.service');

      expect(endpoint).toBe(mockConfig.defaultEndpoint);
    });

    it('should return defaultEndpoint for empty source', () => {
      const endpoint = bridge.getEndpointForSource('');

      expect(endpoint).toBe(mockConfig.defaultEndpoint);
    });
  });

  describe('sendToOpenHIM()', () => {
    const validCloudEvent = {
      specversion: '1.0',
      type: 'health.patient.registered',
      source: 'smile.health-service',
      id: 'test-123',
      time: '2025-10-13T10:00:00Z',
      datacontenttype: 'application/json',
      data: {
        patientId: 'P12345',
        name: 'John Doe',
      },
    };

    it('should successfully send CloudEvent to OpenHIM', async () => {
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        data: { success: true, transactionId: 'tx-123' },
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      const result = await bridge.sendToOpenHIM(validCloudEvent, 'test-correlation-123');

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.data).toEqual(mockResponse.data);
    });

    it('should send request to correct endpoint based on source', async () => {
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {},
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      await bridge.sendToOpenHIM(validCloudEvent, 'correlation-123');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        mockConfig.healthEndpoint,
        validCloudEvent,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/cloudevents+json',
            'X-Correlation-ID': 'correlation-123',
          }),
          timeout: mockConfig.timeout,
        }),
      );
    });

    it('should include Basic authentication header', async () => {
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {},
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      await bridge.sendToOpenHIM(validCloudEvent, 'correlation-123');

      const expectedAuth = Buffer.from(`${mockConfig.username}:${mockConfig.password}`).toString(
        'base64',
      );

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Basic ${expectedAuth}`,
          }),
        }),
      );
    });

    it('should handle HTTP 4xx errors', async () => {
      const mockError = {
        response: {
          status: 400,
          statusText: 'Bad Request',
          data: { error: 'Invalid CloudEvent' },
        },
        isAxiosError: true,
      };

      mockedAxios.post.mockRejectedValue(mockError);

      const result = await bridge.sendToOpenHIM(validCloudEvent, 'correlation-123');

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(result.error).toContain('Bad Request');
    });

    it('should handle HTTP 5xx errors', async () => {
      const mockError = {
        response: {
          status: 500,
          statusText: 'Internal Server Error',
          data: { error: 'OpenHIM error' },
        },
        isAxiosError: true,
      };

      mockedAxios.post.mockRejectedValue(mockError);

      const result = await bridge.sendToOpenHIM(validCloudEvent, 'correlation-123');

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(500);
      expect(result.error).toContain('Internal Server Error');
    });

    it('should handle network errors', async () => {
      const mockError = {
        message: 'Network Error',
        code: 'ECONNREFUSED',
        isAxiosError: true,
      };

      mockedAxios.post.mockRejectedValue(mockError);

      const result = await bridge.sendToOpenHIM(validCloudEvent, 'correlation-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network Error');
    });

    it('should handle timeout errors', async () => {
      const mockError = {
        message: 'timeout of 10000ms exceeded',
        code: 'ECONNABORTED',
        isAxiosError: true,
      };

      mockedAxios.post.mockRejectedValue(mockError);

      const result = await bridge.sendToOpenHIM(validCloudEvent, 'correlation-123');

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });
  });

  describe('getStats()', () => {
    it('should return initial stats', () => {
      const stats = bridge.getStats();

      expect(stats.totalRequests).toBe(0);
      expect(stats.successfulRequests).toBe(0);
      expect(stats.failedRequests).toBe(0);
      expect(stats.averageResponseTimeMs).toBe(0);
    });

    it('should track successful requests', async () => {
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {},
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      const event = {
        specversion: '1.0',
        type: 'test.event',
        source: 'smile.health-service',
        id: 'test-1',
      };

      await bridge.sendToOpenHIM(event, 'correlation-1');
      await bridge.sendToOpenHIM(event, 'correlation-2');

      const stats = bridge.getStats();

      expect(stats.totalRequests).toBe(2);
      expect(stats.successfulRequests).toBe(2);
      expect(stats.failedRequests).toBe(0);
    });

    it('should track failed requests', async () => {
      const mockError = {
        response: {
          status: 500,
          statusText: 'Internal Server Error',
          data: {},
        },
        isAxiosError: true,
      };

      mockedAxios.post.mockRejectedValue(mockError);

      const event = {
        specversion: '1.0',
        type: 'test.event',
        source: 'smile.health-service',
        id: 'test-1',
      };

      await bridge.sendToOpenHIM(event, 'correlation-1');

      const stats = bridge.getStats();

      expect(stats.totalRequests).toBe(1);
      expect(stats.successfulRequests).toBe(0);
      expect(stats.failedRequests).toBe(1);
    });

    it('should calculate average response time', async () => {
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {},
      };

      mockedAxios.post.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(mockResponse), 100);
          }),
      );

      const event = {
        specversion: '1.0',
        type: 'test.event',
        source: 'smile.health-service',
        id: 'test-1',
      };

      await bridge.sendToOpenHIM(event, 'correlation-1');

      const stats = bridge.getStats();

      expect(stats.totalRequests).toBe(1);
      expect(stats.averageResponseTimeMs).toBeGreaterThan(0);
    });
  });

  describe('resetStats()', () => {
    it('should reset all statistics to zero', async () => {
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {},
      };

      mockedAxios.post.mockResolvedValue(mockResponse);

      const event = {
        specversion: '1.0',
        type: 'test.event',
        source: 'smile.health-service',
        id: 'test-1',
      };

      await bridge.sendToOpenHIM(event, 'correlation-1');
      await bridge.sendToOpenHIM(event, 'correlation-2');

      const statsBefore = bridge.getStats();
      expect(statsBefore.totalRequests).toBe(2);

      bridge.resetStats();

      const statsAfter = bridge.getStats();
      expect(statsAfter.totalRequests).toBe(0);
      expect(statsAfter.successfulRequests).toBe(0);
      expect(statsAfter.failedRequests).toBe(0);
      expect(statsAfter.averageResponseTimeMs).toBe(0);
    });
  });
});
