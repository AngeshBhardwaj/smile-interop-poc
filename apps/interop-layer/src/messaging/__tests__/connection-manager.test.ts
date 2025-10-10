/**
 * Connection Manager Unit Tests
 *
 * Comprehensive test suite for RabbitMQ connection manager
 */

import * as amqp from 'amqplib';
import { ConnectionManager } from '../connection-manager';
import {
  RabbitMQConfig,
  ConnectionState,
  ConnectionEvent,
  RetryStrategy,
} from '../types';

// Mock amqplib
jest.mock('amqplib');

// Mock logger
jest.mock('@smile/common', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('ConnectionManager', () => {
  let mockConnection: any;
  let mockChannel: any;
  let mockConfirmChannel: any;
  let config: RabbitMQConfig;
  let retryStrategy: RetryStrategy;

  beforeEach(() => {
    // Setup mock connection
    mockConnection = {
      createChannel: jest.fn(),
      createConfirmChannel: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
    };

    // Setup mock channel
    mockChannel = {
      prefetch: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    };

    // Setup mock confirm channel
    mockConfirmChannel = {
      prefetch: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    };

    // Mock amqp.connect to return mockConnection
    (amqp.connect as jest.Mock).mockResolvedValue(mockConnection);
    mockConnection.createChannel.mockResolvedValue(mockChannel);
    mockConnection.createConfirmChannel.mockResolvedValue(mockConfirmChannel);

    // Default config
    config = {
      url: 'amqp://admin:admin123@localhost:5672',
      prefetchCount: 10,
      reconnectDelay: 1000,
      maxReconnectAttempts: 3,
      heartbeat: 60,
    };

    // Fast retry for testing
    retryStrategy = {
      maxAttempts: 3,
      initialDelay: 100,
      maxDelay: 500,
      backoffMultiplier: 2,
      jitter: 0,
    };

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('Constructor', () => {
    it('should initialize with correct configuration', () => {
      const manager = new ConnectionManager(config, retryStrategy);
      expect(manager).toBeDefined();
      expect(manager.isHealthy()).toBe(false);
    });

    it('should start in DISCONNECTED state', () => {
      const manager = new ConnectionManager(config);
      const health = manager.getHealth();
      expect(health.state).toBe(ConnectionState.DISCONNECTED);
      expect(health.isHealthy).toBe(false);
    });
  });

  describe('connect()', () => {
    it('should successfully connect to RabbitMQ', async () => {
      const manager = new ConnectionManager(config, retryStrategy);
      await manager.connect();

      expect(amqp.connect).toHaveBeenCalledWith(
        config.url,
        expect.objectContaining({
          heartbeat: config.heartbeat,
        }),
      );
      expect(manager.isHealthy()).toBe(true);

      const health = manager.getHealth();
      expect(health.state).toBe(ConnectionState.CONNECTED);
      expect(health.reconnectAttempts).toBe(0);
    });

    it('should set up connection event handlers', async () => {
      const manager = new ConnectionManager(config, retryStrategy);
      await manager.connect();

      expect(mockConnection.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockConnection.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockConnection.on).toHaveBeenCalledWith('blocked', expect.any(Function));
      expect(mockConnection.on).toHaveBeenCalledWith('unblocked', expect.any(Function));
    });

    it('should emit CONNECTED event on successful connection', async () => {
      const manager = new ConnectionManager(config, retryStrategy);
      const connectHandler = jest.fn();
      manager.on(ConnectionEvent.CONNECTED, connectHandler);

      await manager.connect();

      expect(connectHandler).toHaveBeenCalledWith(
        ConnectionEvent.CONNECTED,
        expect.objectContaining({
          connectedAt: expect.any(Date),
          attemptNumber: 0,
        }),
      );
    });

    it('should not attempt to connect if already connected', async () => {
      const manager = new ConnectionManager(config, retryStrategy);
      await manager.connect();

      (amqp.connect as jest.Mock).mockClear();
      await manager.connect();

      expect(amqp.connect).not.toHaveBeenCalled();
    });

    it('should not attempt to connect if connection is in progress', async () => {
      const manager = new ConnectionManager(config, retryStrategy);
      const connectPromise1 = manager.connect();
      const connectPromise2 = manager.connect();

      await Promise.all([connectPromise1, connectPromise2]);

      // Should only connect once
      expect(amqp.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('Reconnection Logic', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should retry connection on failure with exponential backoff', async () => {
      (amqp.connect as jest.Mock)
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce(mockConnection);

      const manager = new ConnectionManager(config, retryStrategy);
      const errorHandler = jest.fn();
      const reconnectingHandler = jest.fn();

      manager.on(ConnectionEvent.ERROR, errorHandler);
      manager.on(ConnectionEvent.RECONNECTING, reconnectingHandler);

      const connectPromise = manager.connect();

      // First attempt fails
      await jest.runOnlyPendingTimersAsync();

      expect(errorHandler).toHaveBeenCalledWith(
        ConnectionEvent.ERROR,
        expect.objectContaining({
          error: expect.any(Error),
        }),
      );

      expect(reconnectingHandler).toHaveBeenCalledWith(
        ConnectionEvent.RECONNECTING,
        expect.objectContaining({
          attempt: 1,
          delay: expect.any(Number),
        }),
      );

      // Second attempt succeeds
      await jest.runOnlyPendingTimersAsync();
      await connectPromise;

      expect(manager.isHealthy()).toBe(true);
    });

    it('should stop retrying after max attempts', async () => {
      (amqp.connect as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      const manager = new ConnectionManager(config, retryStrategy);
      const reconnectFailedHandler = jest.fn();
      manager.on(ConnectionEvent.RECONNECT_FAILED, reconnectFailedHandler);

      const connectPromise = manager.connect();

      // Run through all retry attempts
      for (let i = 0; i <= retryStrategy.maxAttempts; i++) {
        await jest.runOnlyPendingTimersAsync();
      }

      await connectPromise;

      expect(reconnectFailedHandler).toHaveBeenCalledWith(
        ConnectionEvent.RECONNECT_FAILED,
        expect.objectContaining({
          attempts: retryStrategy.maxAttempts,
          lastError: expect.any(Error),
        }),
      );

      const health = manager.getHealth();
      expect(health.state).toBe(ConnectionState.ERROR);
    });

    it('should calculate correct backoff delays', async () => {
      (amqp.connect as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      const customRetry: RetryStrategy = {
        maxAttempts: 5,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        jitter: 0,
      };

      const manager = new ConnectionManager(config, customRetry);
      const reconnectingHandler = jest.fn();
      manager.on(ConnectionEvent.RECONNECTING, reconnectingHandler);

      const connectPromise = manager.connect();

      // Attempt 1: 1000ms
      await jest.runOnlyPendingTimersAsync();
      expect(reconnectingHandler).toHaveBeenCalledWith(
        ConnectionEvent.RECONNECTING,
        expect.objectContaining({ delay: 1000 }),
      );

      // Attempt 2: 2000ms
      await jest.runOnlyPendingTimersAsync();
      expect(reconnectingHandler).toHaveBeenCalledWith(
        ConnectionEvent.RECONNECTING,
        expect.objectContaining({ delay: 2000 }),
      );

      // Attempt 3: 4000ms
      await jest.runOnlyPendingTimersAsync();
      expect(reconnectingHandler).toHaveBeenCalledWith(
        ConnectionEvent.RECONNECTING,
        expect.objectContaining({ delay: 4000 }),
      );

      await connectPromise;
    });
  });

  describe('disconnect()', () => {
    it('should gracefully disconnect from RabbitMQ', async () => {
      const manager = new ConnectionManager(config, retryStrategy);
      await manager.connect();

      await manager.disconnect();

      expect(mockConnection.close).toHaveBeenCalled();
      expect(manager.isHealthy()).toBe(false);

      const health = manager.getHealth();
      expect(health.state).toBe(ConnectionState.CLOSED);
    });

    it('should emit DISCONNECTED event with graceful flag', async () => {
      const manager = new ConnectionManager(config, retryStrategy);
      const disconnectHandler = jest.fn();
      manager.on(ConnectionEvent.DISCONNECTED, disconnectHandler);

      await manager.connect();
      await manager.disconnect();

      expect(disconnectHandler).toHaveBeenCalledWith(
        ConnectionEvent.DISCONNECTED,
        expect.objectContaining({ graceful: true }),
      );
    });

    it('should close all active channels before disconnecting', async () => {
      const manager = new ConnectionManager(config, retryStrategy);
      await manager.connect();

      // Create multiple channels
      await manager.getChannel();
      await manager.getChannel();

      await manager.disconnect();

      expect(mockChannel.close).toHaveBeenCalledTimes(2);
    });

    it('should handle disconnect when already disconnected', async () => {
      const manager = new ConnectionManager(config, retryStrategy);
      await manager.disconnect();

      // Should not throw error
      expect(manager.isHealthy()).toBe(false);
    });
  });

  describe('getChannel()', () => {
    it('should create and return a channel', async () => {
      const manager = new ConnectionManager(config, retryStrategy);
      await manager.connect();

      const channel = await manager.getChannel();

      expect(mockConnection.createChannel).toHaveBeenCalled();
      expect(mockChannel.prefetch).toHaveBeenCalledWith(config.prefetchCount);
      expect(channel).toBe(mockChannel);

      const health = manager.getHealth();
      expect(health.activeChannels).toBe(1);
    });

    it('should set up channel event handlers', async () => {
      const manager = new ConnectionManager(config, retryStrategy);
      await manager.connect();

      await manager.getChannel();

      expect(mockChannel.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockChannel.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should emit CHANNEL_CREATED event', async () => {
      const manager = new ConnectionManager(config, retryStrategy);
      const channelCreatedHandler = jest.fn();
      manager.on(ConnectionEvent.CHANNEL_CREATED, channelCreatedHandler);

      await manager.connect();
      await manager.getChannel();

      expect(channelCreatedHandler).toHaveBeenCalledWith(
        ConnectionEvent.CHANNEL_CREATED,
        expect.objectContaining({
          channelId: expect.any(String),
          isConfirm: false,
        }),
      );
    });

    it('should throw error if not connected', async () => {
      const manager = new ConnectionManager(config, retryStrategy);

      await expect(manager.getChannel()).rejects.toThrow('Not connected to RabbitMQ');
    });

    it('should support multiple channels', async () => {
      const manager = new ConnectionManager(config, retryStrategy);
      await manager.connect();

      const channel1 = await manager.getChannel();
      const channel2 = await manager.getChannel();

      expect(channel1).toBeDefined();
      expect(channel2).toBeDefined();

      const health = manager.getHealth();
      expect(health.activeChannels).toBe(2);
    });
  });

  describe('getConfirmChannel()', () => {
    it('should create and return a confirm channel', async () => {
      const manager = new ConnectionManager(config, retryStrategy);
      await manager.connect();

      const channel = await manager.getConfirmChannel();

      expect(mockConnection.createConfirmChannel).toHaveBeenCalled();
      expect(mockConfirmChannel.prefetch).toHaveBeenCalledWith(config.prefetchCount);
      expect(channel).toBe(mockConfirmChannel);
    });

    it('should emit CHANNEL_CREATED event with isConfirm=true', async () => {
      const manager = new ConnectionManager(config, retryStrategy);
      const channelCreatedHandler = jest.fn();
      manager.on(ConnectionEvent.CHANNEL_CREATED, channelCreatedHandler);

      await manager.connect();
      await manager.getConfirmChannel();

      expect(channelCreatedHandler).toHaveBeenCalledWith(
        ConnectionEvent.CHANNEL_CREATED,
        expect.objectContaining({
          channelId: expect.any(String),
          isConfirm: true,
        }),
      );
    });

    it('should throw error if not connected', async () => {
      const manager = new ConnectionManager(config, retryStrategy);

      await expect(manager.getConfirmChannel()).rejects.toThrow(
        'Not connected to RabbitMQ',
      );
    });
  });

  describe('getHealth()', () => {
    it('should return correct health status when disconnected', () => {
      const manager = new ConnectionManager(config, retryStrategy);
      const health = manager.getHealth();

      expect(health).toEqual({
        state: ConnectionState.DISCONNECTED,
        isHealthy: false,
        uptime: 0,
        reconnectAttempts: 0,
        lastError: undefined,
        lastConnectedAt: undefined,
        lastErrorAt: undefined,
        activeChannels: 0,
        activeConsumers: 0,
      });
    });

    it('should return correct health status when connected', async () => {
      const manager = new ConnectionManager(config, retryStrategy);
      await manager.connect();

      const health = manager.getHealth();

      expect(health.state).toBe(ConnectionState.CONNECTED);
      expect(health.isHealthy).toBe(true);
      expect(health.uptime).toBeGreaterThanOrEqual(0);
      expect(health.lastConnectedAt).toBeInstanceOf(Date);
      expect(health.reconnectAttempts).toBe(0);
    });

    it('should track error in health status after connection failure', async () => {
      (amqp.connect as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      const customRetry: RetryStrategy = {
        maxAttempts: 1, // Only one attempt
        initialDelay: 100,
        maxDelay: 500,
        backoffMultiplier: 2,
        jitter: 0,
      };

      const manager = new ConnectionManager(config, customRetry);
      const reconnectFailedHandler = jest.fn();
      manager.on(ConnectionEvent.RECONNECT_FAILED, reconnectFailedHandler);

      await manager.connect();

      // Wait for retry to fail
      await new Promise((resolve) => setTimeout(resolve, 200));

      const health = manager.getHealth();
      expect(health.lastError).toBe('Connection failed');
      expect(health.lastErrorAt).toBeInstanceOf(Date);
      expect(health.isHealthy).toBe(false);
      expect(reconnectFailedHandler).toHaveBeenCalled();
    });
  });

  describe('isHealthy()', () => {
    it('should return false when disconnected', () => {
      const manager = new ConnectionManager(config, retryStrategy);
      expect(manager.isHealthy()).toBe(false);
    });

    it('should return true when connected', async () => {
      const manager = new ConnectionManager(config, retryStrategy);
      await manager.connect();
      expect(manager.isHealthy()).toBe(true);
    });

    it('should return false after disconnect', async () => {
      const manager = new ConnectionManager(config, retryStrategy);
      await manager.connect();
      await manager.disconnect();
      expect(manager.isHealthy()).toBe(false);
    });
  });

  describe('Event Handlers', () => {
    it('should register and call event handlers', async () => {
      const manager = new ConnectionManager(config, retryStrategy);
      const handler = jest.fn();

      manager.on(ConnectionEvent.CONNECTED, handler);
      await manager.connect();

      expect(handler).toHaveBeenCalledWith(
        ConnectionEvent.CONNECTED,
        expect.any(Object),
      );
    });

    it('should unregister event handlers', async () => {
      const manager = new ConnectionManager(config, retryStrategy);
      const handler = jest.fn();

      manager.on(ConnectionEvent.CONNECTED, handler);
      manager.off(ConnectionEvent.CONNECTED, handler);

      await manager.connect();

      expect(handler).not.toHaveBeenCalled();
    });

    it('should support multiple handlers for same event', async () => {
      const manager = new ConnectionManager(config, retryStrategy);
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      manager.on(ConnectionEvent.CONNECTED, handler1);
      manager.on(ConnectionEvent.CONNECTED, handler2);

      await manager.connect();

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should handle errors in event handlers gracefully', async () => {
      const manager = new ConnectionManager(config, retryStrategy);
      const faultyHandler = jest.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });
      const goodHandler = jest.fn();

      manager.on(ConnectionEvent.CONNECTED, faultyHandler);
      manager.on(ConnectionEvent.CONNECTED, goodHandler);

      await manager.connect();

      // Both handlers should be called despite error in first
      expect(faultyHandler).toHaveBeenCalled();
      expect(goodHandler).toHaveBeenCalled();
    });
  });

  describe('URL Sanitization', () => {
    it('should sanitize credentials from logs', async () => {
      const { logger } = require('@smile/common');
      const manager = new ConnectionManager(config, retryStrategy);

      await manager.connect();

      // Check that logged URL doesn't contain password
      expect(logger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          url: expect.not.stringContaining('admin123'),
        }),
      );
    });
  });
});
