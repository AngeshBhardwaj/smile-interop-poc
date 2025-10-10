/**
 * EventConsumer Unit Tests
 *
 * TDD approach: Write tests first, then implement consumer
 */

import * as amqp from 'amqplib';
import { EventConsumer } from '../event-consumer';
import { ConnectionManager } from '../../messaging/connection-manager';
import { QueueConsumerConfig, ConsumerOptions, CloudEventHandler } from '../../messaging/types';

// Mock logger
jest.mock('@smile/common', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('EventConsumer', () => {
  let consumer: EventConsumer;
  let mockConnectionManager: jest.Mocked<ConnectionManager>;
  let mockChannel: any;
  let mockHandler: jest.MockedFunction<CloudEventHandler>;
  let consumerConfig: QueueConsumerConfig;
  let consumerOptions: ConsumerOptions;

  beforeEach(() => {
    // Setup mock channel
    mockChannel = {
      assertExchange: jest.fn().mockResolvedValue({}),
      assertQueue: jest.fn().mockResolvedValue({ queue: 'test-queue' }),
      bindQueue: jest.fn().mockResolvedValue({}),
      consume: jest.fn().mockResolvedValue({ consumerTag: 'consumer-tag-1' }),
      cancel: jest.fn().mockResolvedValue({}),
      prefetch: jest.fn(),
      ack: jest.fn(),
      nack: jest.fn(),
    };

    // Setup mock connection manager
    mockConnectionManager = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      getChannel: jest.fn().mockResolvedValue(mockChannel),
      getConfirmChannel: jest.fn().mockResolvedValue(mockChannel),
      releaseChannel: jest.fn(),
      getHealth: jest.fn(),
      isHealthy: jest.fn().mockReturnValue(true),
      on: jest.fn(),
      off: jest.fn(),
    } as any;

    // Setup consumer configuration
    consumerConfig = {
      name: 'test-consumer',
      queue: 'test-queue',
      exchange: 'test-exchange',
      exchangeType: 'topic',
      routingKey: 'test.event.*',
      enabled: true,
      options: {
        durable: true,
        autoDelete: false,
      },
    };

    // Setup consumer options
    consumerOptions = {
      autoAck: false,
      ackOnSuccess: true,
      requeueOnFailure: false,
      enableDeduplication: false,
    };

    // Setup mock handler
    mockHandler = jest.fn().mockResolvedValue(undefined);

    consumer = new EventConsumer(
      mockConnectionManager,
      consumerConfig,
      consumerOptions,
      mockHandler,
    );

    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create consumer instance with proper configuration', () => {
      expect(consumer).toBeInstanceOf(EventConsumer);
    });

    it('should initialize with inactive state', () => {
      const stats = consumer.getStats();

      expect(stats.isActive).toBe(false);
      expect(stats.messagesConsumed).toBe(0);
    });

    it('should use provided consumer options', () => {
      const customOptions: ConsumerOptions = {
        autoAck: true,
        enableDeduplication: true,
        deduplicationWindow: 30000,
      };

      const customConsumer = new EventConsumer(
        mockConnectionManager,
        consumerConfig,
        customOptions,
        mockHandler,
      );

      expect(customConsumer).toBeInstanceOf(EventConsumer);
    });
  });

  describe('start()', () => {
    it('should assert exchange and queue on start', async () => {
      await consumer.start();

      expect(mockChannel.assertExchange).toHaveBeenCalledWith(
        'test-exchange',
        'topic',
        expect.objectContaining({ durable: true }),
      );

      expect(mockChannel.assertQueue).toHaveBeenCalledWith(
        'test-queue',
        expect.objectContaining({ durable: true }),
      );
    });

    it('should bind queue to exchange with routing key', async () => {
      await consumer.start();

      expect(mockChannel.bindQueue).toHaveBeenCalledWith(
        'test-queue',
        'test-exchange',
        'test.event.*',
      );
    });

    it('should start consuming messages', async () => {
      await consumer.start();

      expect(mockChannel.consume).toHaveBeenCalledWith(
        'test-queue',
        expect.any(Function),
        expect.any(Object),
      );
    });

    it('should set prefetch if specified in config', async () => {
      const configWithPrefetch: QueueConsumerConfig = {
        ...consumerConfig,
        prefetch: 10,
      };

      const consumerWithPrefetch = new EventConsumer(
        mockConnectionManager,
        configWithPrefetch,
        consumerOptions,
        mockHandler,
      );

      await consumerWithPrefetch.start();

      expect(mockChannel.prefetch).toHaveBeenCalledWith(10);
    });

    it('should update stats when started', async () => {
      await consumer.start();

      const stats = consumer.getStats();
      expect(stats.isActive).toBe(true);
      expect(stats.startedAt).toBeInstanceOf(Date);
    });

    it('should throw error if already started', async () => {
      await consumer.start();

      await expect(consumer.start()).rejects.toThrow('Consumer is already active');
    });

    it('should handle connection manager errors', async () => {
      mockConnectionManager.getChannel.mockRejectedValue(new Error('Connection failed'));

      await expect(consumer.start()).rejects.toThrow('Connection failed');
    });
  });

  describe('stop()', () => {
    beforeEach(async () => {
      await consumer.start();
    });

    it('should cancel consumer on stop', async () => {
      await consumer.stop();

      expect(mockChannel.cancel).toHaveBeenCalledWith('consumer-tag-1');
    });

    it('should update stats when stopped', async () => {
      await consumer.stop();

      const stats = consumer.getStats();
      expect(stats.isActive).toBe(false);
    });

    it('should do nothing if not started', async () => {
      const freshConsumer = new EventConsumer(
        mockConnectionManager,
        consumerConfig,
        consumerOptions,
        mockHandler,
      );

      await expect(freshConsumer.stop()).resolves.not.toThrow();
    });

    it('should handle channel errors gracefully', async () => {
      mockChannel.cancel.mockRejectedValue(new Error('Channel closed'));

      await expect(consumer.stop()).resolves.not.toThrow();
    });
  });

  describe('message handling', () => {
    let messageCallback: (msg: amqp.ConsumeMessage | null) => Promise<void>;

    beforeEach(async () => {
      await consumer.start();

      // Capture the consume callback
      const consumeCall = mockChannel.consume.mock.calls[0];
      messageCallback = consumeCall[1];
    });

    it('should process valid CloudEvent message', async () => {
      const mockMessage: amqp.ConsumeMessage = {
        content: Buffer.from(JSON.stringify({
          specversion: '1.0',
          type: 'test.event',
          source: 'test',
          id: 'msg-123',
          data: { test: 'data' },
        })),
        fields: {
          deliveryTag: 1,
          redelivered: false,
          exchange: 'test-exchange',
          routingKey: 'test.event.created',
        },
        properties: {
          contentType: 'application/json',
          messageId: 'msg-123',
          timestamp: Date.now(),
          headers: {},
        },
      } as any;

      await messageCallback(mockMessage);

      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          specversion: '1.0',
          type: 'test.event',
          source: 'test',
          id: 'msg-123',
        }),
        expect.objectContaining({
          message: mockMessage,
          queue: 'test-queue',
        }),
      );

      expect(mockChannel.ack).toHaveBeenCalledWith(mockMessage);
    });

    it('should reject invalid JSON messages', async () => {
      const mockMessage: amqp.ConsumeMessage = {
        content: Buffer.from('invalid json'),
        fields: {
          deliveryTag: 1,
          redelivered: false,
          exchange: 'test-exchange',
          routingKey: 'test.key',
        },
        properties: {
          messageId: 'msg-456',
          headers: {},
        },
      } as any;

      await messageCallback(mockMessage);

      expect(mockHandler).not.toHaveBeenCalled();
      expect(mockChannel.nack).toHaveBeenCalledWith(mockMessage, false, false);
    });

    it('should reject invalid CloudEvent messages', async () => {
      const mockMessage: amqp.ConsumeMessage = {
        content: Buffer.from(JSON.stringify({
          // Missing required CloudEvent fields
          data: { test: 'data' },
        })),
        fields: {
          deliveryTag: 1,
          redelivered: false,
          exchange: 'test-exchange',
          routingKey: 'test.key',
        },
        properties: {
          messageId: 'msg-789',
          headers: {},
        },
      } as any;

      await messageCallback(mockMessage);

      expect(mockHandler).not.toHaveBeenCalled();
      expect(mockChannel.nack).toHaveBeenCalledWith(mockMessage, false, false);
    });

    it('should handle null messages', async () => {
      await expect(messageCallback(null)).resolves.not.toThrow();
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should track message statistics on success', async () => {
      const mockMessage: amqp.ConsumeMessage = {
        content: Buffer.from(JSON.stringify({
          specversion: '1.0',
          type: 'test.event',
          source: 'test',
          id: 'msg-stats',
        })),
        fields: { deliveryTag: 1, redelivered: false, exchange: 'test-exchange', routingKey: 'test.key' },
        properties: { messageId: 'msg-stats', headers: {} },
      } as any;

      await messageCallback(mockMessage);

      const stats = consumer.getStats();
      expect(stats.messagesConsumed).toBe(1);
      expect(stats.messagesProcessed).toBe(1);
      expect(stats.messagesFailed).toBe(0);
    });

    it('should track failed messages', async () => {
      mockHandler.mockRejectedValue(new Error('Handler error'));

      const mockMessage: amqp.ConsumeMessage = {
        content: Buffer.from(JSON.stringify({
          specversion: '1.0',
          type: 'test.event',
          source: 'test',
          id: 'msg-fail',
        })),
        fields: { deliveryTag: 1, redelivered: false, exchange: 'test-exchange', routingKey: 'test.key' },
        properties: { messageId: 'msg-fail', headers: {} },
      } as any;

      await messageCallback(mockMessage);

      const stats = consumer.getStats();
      expect(stats.messagesConsumed).toBe(1);
      expect(stats.messagesFailed).toBe(1);
      expect(mockChannel.nack).toHaveBeenCalledWith(mockMessage, false, false);
    });

    it('should skip duplicate messages when deduplication enabled', async () => {
      const dedupConsumer = new EventConsumer(
        mockConnectionManager,
        consumerConfig,
        { ...consumerOptions, enableDeduplication: true },
        mockHandler,
      );

      await dedupConsumer.start();
      const dedupCallback = mockChannel.consume.mock.calls[1][1];

      const mockMessage: amqp.ConsumeMessage = {
        content: Buffer.from(JSON.stringify({
          specversion: '1.0',
          type: 'test.event',
          source: 'test',
          id: 'msg-dupe',
        })),
        fields: { deliveryTag: 1, redelivered: false, exchange: 'test-exchange', routingKey: 'test.key' },
        properties: { messageId: 'msg-dupe', headers: {} },
      } as any;

      // Process first time
      await dedupCallback(mockMessage);
      expect(mockHandler).toHaveBeenCalledTimes(1);

      // Process duplicate
      await dedupCallback(mockMessage);
      expect(mockHandler).toHaveBeenCalledTimes(1); // Should not call handler again
    });
  });

  describe('getStats()', () => {
    it('should return consumer statistics', () => {
      const stats = consumer.getStats();

      expect(stats).toEqual(
        expect.objectContaining({
          messagesConsumed: 0,
          messagesProcessed: 0,
          messagesFailed: 0,
          messagesDLQ: 0,
          queueName: 'test-queue',
          isActive: false,
        }),
      );
    });

    it('should calculate uptime correctly', async () => {
      await consumer.start();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      const stats = consumer.getStats();
      expect(stats.uptime).toBeGreaterThan(0);
    });

    it('should calculate messages per second', async () => {
      await consumer.start();

      const messageCallback = mockChannel.consume.mock.calls[0][1];

      // Process multiple messages
      for (let i = 0; i < 5; i++) {
        const mockMessage: amqp.ConsumeMessage = {
          content: Buffer.from(JSON.stringify({
            specversion: '1.0',
            type: 'test.event',
            source: 'test',
            id: `msg-${i}`,
          })),
          fields: { deliveryTag: i, redelivered: false, exchange: 'test-exchange', routingKey: 'test.key' },
          properties: { messageId: `msg-${i}`, headers: {} },
        } as any;

        await messageCallback(mockMessage);
      }

      const stats = consumer.getStats();
      expect(stats.messagesPerSecond).toBeGreaterThan(0);
    });
  });

  describe('resetStats()', () => {
    it('should reset statistics', async () => {
      await consumer.start();

      const messageCallback = mockChannel.consume.mock.calls[0][1];
      const mockMessage: amqp.ConsumeMessage = {
        content: Buffer.from(JSON.stringify({
          specversion: '1.0',
          type: 'test.event',
          source: 'test',
          id: 'msg-reset',
        })),
        fields: { deliveryTag: 1, redelivered: false, exchange: 'test-exchange', routingKey: 'test.key' },
        properties: { messageId: 'msg-reset', headers: {} },
      } as any;

      await messageCallback(mockMessage);

      consumer.resetStats();

      const stats = consumer.getStats();
      expect(stats.messagesConsumed).toBe(0);
      expect(stats.messagesProcessed).toBe(0);
    });
  });
});
