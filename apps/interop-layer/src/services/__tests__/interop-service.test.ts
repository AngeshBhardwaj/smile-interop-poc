/**
 * InteropService Integration Tests
 *
 * TDD approach: Tests for the integration layer that connects
 * EventConsumer with OpenHIM Bridge
 */

import { InteropService } from '../interop-service';
import { ConnectionManager } from '../../messaging/connection-manager';
import { OpenHIMBridge } from '../../bridge/openhim-bridge';
import { EventConsumer } from '../../consumer/event-consumer';

// Mock dependencies
jest.mock('../../messaging/connection-manager');
jest.mock('../../bridge/openhim-bridge');
jest.mock('../../consumer/event-consumer');

describe('InteropService', () => {
  let service: InteropService;
  let mockConnectionManager: jest.Mocked<ConnectionManager>;
  let mockBridge: jest.Mocked<OpenHIMBridge>;

  const mockConfig = {
    rabbitmq: {
      url: 'amqp://localhost:5672',
      prefetchCount: 10,
      reconnectDelay: 5000,
      maxReconnectAttempts: 10,
    },
    openhim: {
      healthEndpoint: 'http://localhost:5001/health',
      ordersEndpoint: 'http://localhost:5001/orders',
      defaultEndpoint: 'http://localhost:5001/events',
      username: 'test@openhim.org',
      password: 'test-password',
      timeout: 10000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    consumers: [
      {
        name: 'health-consumer',
        queue: 'interop.health.queue',
        exchange: 'health.events',
        exchangeType: 'topic' as const,
        routingKey: 'health.#',
        enabled: true,
      },
      {
        name: 'orders-consumer',
        queue: 'interop.orders.queue',
        exchange: 'orders.events',
        exchangeType: 'topic' as const,
        routingKey: 'orders.#',
        enabled: true,
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock ConnectionManager
    mockConnectionManager = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      getHealth: jest.fn().mockReturnValue({ isHealthy: true }),
    } as any;

    // Mock OpenHIMBridge
    mockBridge = {
      sendToOpenHIM: jest.fn().mockResolvedValue({ success: true, statusCode: 200 }),
      getStats: jest.fn().mockReturnValue({
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTimeMs: 0,
      }),
    } as any;

    (ConnectionManager as jest.MockedClass<typeof ConnectionManager>).mockImplementation(
      () => mockConnectionManager,
    );

    (OpenHIMBridge as jest.MockedClass<typeof OpenHIMBridge>).mockImplementation(
      () => mockBridge,
    );

    service = new InteropService(mockConfig);
  });

  describe('constructor', () => {
    it('should create service with valid configuration', () => {
      expect(service).toBeInstanceOf(InteropService);
    });

    it('should create ConnectionManager', () => {
      expect(ConnectionManager).toHaveBeenCalledWith(mockConfig.rabbitmq);
    });

    it('should create OpenHIMBridge', () => {
      expect(OpenHIMBridge).toHaveBeenCalledWith(mockConfig.openhim);
    });

    it('should create EventConsumers for each enabled consumer config', () => {
      expect(EventConsumer).toHaveBeenCalledTimes(2);
    });
  });

  describe('start()', () => {
    it('should connect to RabbitMQ', async () => {
      await service.start();

      expect(mockConnectionManager.connect).toHaveBeenCalledTimes(1);
    });

    it('should start all consumers', async () => {
      const mockConsumerStart = jest.fn().mockResolvedValue(undefined);
      (EventConsumer as jest.MockedClass<typeof EventConsumer>).mockImplementation(
        () =>
          ({
            start: mockConsumerStart,
            stop: jest.fn(),
            getStats: jest.fn(),
          }) as any,
      );

      const newService = new InteropService(mockConfig);
      await newService.start();

      expect(mockConsumerStart).toHaveBeenCalledTimes(2);
    });

    it('should throw error if already started', async () => {
      await service.start();

      await expect(service.start()).rejects.toThrow('Service is already running');
    });

    it('should handle connection errors', async () => {
      mockConnectionManager.connect.mockRejectedValue(new Error('Connection failed'));

      await expect(service.start()).rejects.toThrow('Connection failed');
    });
  });

  describe('stop()', () => {
    it('should stop all consumers', async () => {
      const mockConsumerStop = jest.fn().mockResolvedValue(undefined);
      (EventConsumer as jest.MockedClass<typeof EventConsumer>).mockImplementation(
        () =>
          ({
            start: jest.fn(),
            stop: mockConsumerStop,
            getStats: jest.fn(),
          }) as any,
      );

      const newService = new InteropService(mockConfig);
      await newService.start();
      await newService.stop();

      expect(mockConsumerStop).toHaveBeenCalledTimes(2);
    });

    it('should disconnect from RabbitMQ', async () => {
      await service.start();
      await service.stop();

      expect(mockConnectionManager.disconnect).toHaveBeenCalledTimes(1);
    });

    it('should not throw if not started', async () => {
      await expect(service.stop()).resolves.not.toThrow();
    });
  });

  describe('handleCloudEvent()', () => {
    it('should send CloudEvent to OpenHIM via bridge', async () => {
      const event = {
        specversion: '1.0',
        type: 'health.patient.registered',
        source: 'smile.health-service',
        id: 'test-123',
      };

      const context = {
        correlationId: 'correlation-123',
      } as any;

      await service.start();

      // Get the handler that was passed to EventConsumer
      const eventConsumerCalls = (EventConsumer as jest.MockedClass<typeof EventConsumer>).mock
        .calls;
      const handler = eventConsumerCalls[0]?.[3]; // Fourth parameter is the handler

      expect(handler).toBeDefined();

      // Call the handler
      await handler!(event, context);

      expect(mockBridge.sendToOpenHIM).toHaveBeenCalledWith(event, 'correlation-123');
    });

    it('should use event.id as correlation ID if not in context', async () => {
      const event = {
        specversion: '1.0',
        type: 'health.patient.registered',
        source: 'smile.health-service',
        id: 'test-456',
      };

      const context = {} as any;

      await service.start();

      const eventConsumerCalls = (EventConsumer as jest.MockedClass<typeof EventConsumer>).mock
        .calls;
      const handler = eventConsumerCalls[0]?.[3];

      await handler!(event, context);

      expect(mockBridge.sendToOpenHIM).toHaveBeenCalledWith(event, 'test-456');
    });

    it('should throw error if OpenHIM bridge fails', async () => {
      mockBridge.sendToOpenHIM.mockResolvedValue({
        success: false,
        error: 'OpenHIM error',
        timestamp: new Date().toISOString(),
      });

      const event = {
        specversion: '1.0',
        type: 'health.patient.registered',
        source: 'smile.health-service',
        id: 'test-789',
      };

      const context = {
        correlationId: 'correlation-789',
      } as any;

      await service.start();

      const eventConsumerCalls = (EventConsumer as jest.MockedClass<typeof EventConsumer>).mock
        .calls;
      const handler = eventConsumerCalls[0]?.[3];

      await expect(handler!(event, context)).rejects.toThrow('OpenHIM error');
    });
  });

  describe('getStats()', () => {
    it('should return combined statistics', async () => {
      const mockConsumerStats = {
        messagesConsumed: 10,
        messagesProcessed: 9,
        messagesFailed: 1,
        messagesDLQ: 0,
        startedAt: new Date(),
        uptime: 60000,
        messagesPerSecond: 0.15,
        queueName: 'test.queue',
        isActive: true,
      };

      (EventConsumer as jest.MockedClass<typeof EventConsumer>).mockImplementation(
        () =>
          ({
            start: jest.fn(),
            stop: jest.fn(),
            getStats: jest.fn().mockReturnValue(mockConsumerStats),
          }) as any,
      );

      mockBridge.getStats.mockReturnValue({
        totalRequests: 9,
        successfulRequests: 8,
        failedRequests: 1,
        averageResponseTimeMs: 250,
      });

      const newService = new InteropService(mockConfig);
      await newService.start();

      const stats = newService.getStats();

      expect(stats.consumers).toHaveLength(2);
      expect(stats.consumers[0]).toEqual(mockConsumerStats);
      expect(stats.bridge).toEqual({
        totalRequests: 9,
        successfulRequests: 8,
        failedRequests: 1,
        averageResponseTimeMs: 250,
      });
      expect(stats.rabbitmq.isHealthy).toBe(true);
    });
  });

  describe('getHealth()', () => {
    it('should return healthy status when all components are healthy', async () => {
      await service.start();

      const health = service.getHealth();

      expect(health.status).toBe('healthy');
      expect(health.rabbitmq.isHealthy).toBe(true);
    });

    it('should return unhealthy status when RabbitMQ is unhealthy', async () => {
      mockConnectionManager.getHealth.mockReturnValue({
        isHealthy: false,
        state: 'DISCONNECTED' as any,
      } as any);

      await service.start();

      const health = service.getHealth();

      expect(health.status).toBe('unhealthy');
      expect(health.rabbitmq.isHealthy).toBe(false);
    });

    it('should return degraded status before service is started', () => {
      const health = service.getHealth();

      expect(health.status).toBe('degraded');
    });
  });
});
