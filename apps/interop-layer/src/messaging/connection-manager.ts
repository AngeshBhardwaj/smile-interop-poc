/**
 * RabbitMQ Connection Manager
 *
 * Manages RabbitMQ connections with:
 * - Automatic reconnection with exponential backoff
 * - Channel pooling for efficient resource usage
 * - Graceful shutdown handling
 * - Health monitoring and metrics
 * - Event emission for connection state changes
 */

import * as amqp from 'amqplib';
import { logger } from '@smile/common';
import { v4 as uuidv4 } from 'uuid';
import {
  RabbitMQConfig,
  ConnectionState,
  ConnectionHealth,
  ManagedChannel,
  RetryStrategy,
  ConnectionEvent,
  ConnectionEventHandler,
  IConnectionManager,
} from './types';

/**
 * Default retry strategy for reconnection attempts
 */
const DEFAULT_RETRY_STRATEGY: RetryStrategy = {
  maxAttempts: 10,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: 0.1,
};

/**
 * RabbitMQ Connection Manager
 *
 * Handles connection lifecycle, retry logic, and channel pooling
 */
export class ConnectionManager implements IConnectionManager {
  private connection: any = null;
  private channels: Map<string, ManagedChannel> = new Map();
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectedAt: Date | null = null;
  private lastError: Error | null = null;
  private lastErrorAt: Date | null = null;
  private eventHandlers: Map<ConnectionEvent, Set<ConnectionEventHandler>> = new Map();
  private isShuttingDown = false;

  constructor(
    private readonly config: RabbitMQConfig,
    private readonly retryStrategy: RetryStrategy = DEFAULT_RETRY_STRATEGY,
  ) {
    // Initialize event handler sets
    Object.values(ConnectionEvent).forEach((event) => {
      this.eventHandlers.set(event as ConnectionEvent, new Set());
    });

    logger.info('ConnectionManager initialized', {
      url: this.sanitizeUrl(config.url),
      prefetchCount: config.prefetchCount,
      reconnectDelay: config.reconnectDelay,
      maxReconnectAttempts: config.maxReconnectAttempts,
    });
  }

  /**
   * Connect to RabbitMQ with retry logic
   */
  public async connect(): Promise<void> {
    if (this.state === ConnectionState.CONNECTED) {
      logger.warn('Already connected to RabbitMQ');
      return;
    }

    if (this.state === ConnectionState.CONNECTING) {
      logger.warn('Connection attempt already in progress');
      return;
    }

    this.state = ConnectionState.CONNECTING;
    this.reconnectAttempts = 0;

    logger.info('Connecting to RabbitMQ...', {
      url: this.sanitizeUrl(this.config.url),
    });

    await this.attemptConnection();
  }

  /**
   * Attempt to establish connection with retry logic
   */
  private async attemptConnection(): Promise<void> {
    try {
      // Clear any existing reconnect timer
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      // Create connection
      this.connection = await amqp.connect(this.config.url, {
        heartbeat: this.config.heartbeat || 60,
        ...this.config.socketOptions,
      });

      const connection = this.connection;

      // Set up connection event handlers
      connection.on('error', (err: Error) => {
        logger.error('RabbitMQ connection error', { error: err.message });
        this.handleConnectionError(err);
      });

      connection.on('close', () => {
        logger.warn('RabbitMQ connection closed');
        this.handleConnectionClose();
      });

      connection.on('blocked', (reason: string) => {
        logger.warn('RabbitMQ connection blocked', { reason });
      });

      connection.on('unblocked', () => {
        logger.info('RabbitMQ connection unblocked');
      });

      // Update state
      this.state = ConnectionState.CONNECTED;
      this.connectedAt = new Date();
      this.reconnectAttempts = 0;
      this.lastError = null;

      logger.info('Successfully connected to RabbitMQ', {
        url: this.sanitizeUrl(this.config.url),
        uptime: 0,
      });

      this.emit(ConnectionEvent.CONNECTED, {
        connectedAt: this.connectedAt,
        attemptNumber: this.reconnectAttempts,
      });
    } catch (error) {
      this.lastError = error as Error;
      this.lastErrorAt = new Date();

      logger.error('Failed to connect to RabbitMQ', {
        error: (error as Error).message,
        attempt: this.reconnectAttempts + 1,
        maxAttempts: this.retryStrategy.maxAttempts,
      });

      this.emit(ConnectionEvent.ERROR, { error: this.lastError });

      // Attempt reconnection if not at max attempts
      if (
        this.retryStrategy.maxAttempts === 0 ||
        this.reconnectAttempts < this.retryStrategy.maxAttempts
      ) {
        await this.scheduleReconnect();
      } else {
        logger.error('Max reconnection attempts reached, giving up', {
          attempts: this.reconnectAttempts,
        });
        this.state = ConnectionState.ERROR;
        this.emit(ConnectionEvent.RECONNECT_FAILED, {
          attempts: this.reconnectAttempts,
          lastError: this.lastError,
        });
      }
    }
  }

  /**
   * Schedule reconnection attempt with exponential backoff
   */
  private async scheduleReconnect(): Promise<void> {
    this.state = ConnectionState.RECONNECTING;
    this.reconnectAttempts++;

    const delay = this.calculateBackoffDelay(this.reconnectAttempts);

    logger.info('Scheduling reconnection attempt', {
      attempt: this.reconnectAttempts,
      delayMs: delay,
    });

    this.emit(ConnectionEvent.RECONNECTING, {
      attempt: this.reconnectAttempts,
      delay,
    });

    this.reconnectTimer = setTimeout(() => {
      this.attemptConnection();
    }, delay);
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private calculateBackoffDelay(attemptNumber: number): number {
    const { initialDelay, maxDelay, backoffMultiplier, jitter = 0 } = this.retryStrategy;

    // Calculate exponential backoff
    const exponentialDelay = Math.min(
      initialDelay * Math.pow(backoffMultiplier, attemptNumber - 1),
      maxDelay,
    );

    // Add jitter to prevent thundering herd
    if (jitter > 0) {
      const jitterAmount = exponentialDelay * jitter;
      const randomJitter = Math.random() * jitterAmount * 2 - jitterAmount;
      return Math.max(0, exponentialDelay + randomJitter);
    }

    return exponentialDelay;
  }

  /**
   * Handle connection errors
   */
  private handleConnectionError(error: Error): void {
    this.lastError = error;
    this.lastErrorAt = new Date();

    if (!this.isShuttingDown && this.state === ConnectionState.CONNECTED) {
      logger.error('Connection error occurred, will attempt to reconnect', {
        error: error.message,
      });
      this.emit(ConnectionEvent.ERROR, { error });
      this.scheduleReconnect();
    }
  }

  /**
   * Handle connection close
   */
  private handleConnectionClose(): void {
    if (this.state === ConnectionState.CLOSING || this.isShuttingDown) {
      this.state = ConnectionState.CLOSED;
      this.emit(ConnectionEvent.DISCONNECTED, { graceful: true });
      return;
    }

    logger.warn('Connection closed unexpectedly, will attempt to reconnect');
    this.state = ConnectionState.DISCONNECTED;
    this.connection = null;

    // Close all channels
    this.closeAllChannels();

    this.emit(ConnectionEvent.DISCONNECTED, { graceful: false });

    // Attempt reconnection
    this.scheduleReconnect();
  }

  /**
   * Disconnect from RabbitMQ gracefully
   */
  public async disconnect(): Promise<void> {
    if (this.state === ConnectionState.DISCONNECTED || this.state === ConnectionState.CLOSED) {
      logger.info('Already disconnected from RabbitMQ');
      return;
    }

    this.isShuttingDown = true;
    this.state = ConnectionState.CLOSING;

    logger.info('Disconnecting from RabbitMQ...', {
      activeChannels: this.channels.size,
    });

    // Clear reconnect timer if any
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Close all channels
    await this.closeAllChannels();

    // Close connection
    if (this.connection) {
      try {
        await this.connection.close();
        logger.info('Successfully disconnected from RabbitMQ');
      } catch (error) {
        logger.error('Error while disconnecting from RabbitMQ', {
          error: (error as Error).message,
        });
      }
      this.connection = null;
    }

    this.state = ConnectionState.CLOSED;
    this.connectedAt = null;
    this.emit(ConnectionEvent.DISCONNECTED, { graceful: true });
  }

  /**
   * Get a channel from the pool or create a new one
   */
  public async getChannel(): Promise<amqp.Channel> {
    if (!this.connection || this.state !== ConnectionState.CONNECTED) {
      throw new Error('Not connected to RabbitMQ');
    }

    try {
      const channel = await this.connection.createChannel();
      await channel.prefetch(this.config.prefetchCount);

      const channelId = uuidv4();
      const managedChannel: ManagedChannel = {
        channel,
        id: channelId,
        isConfirm: false,
        createdAt: new Date(),
        consumerCount: 0,
        inUse: true,
      };

      this.channels.set(channelId, managedChannel);

      // Set up channel error handlers
      channel.on('error', (err: Error) => {
        logger.error('Channel error', {
          channelId,
          error: err.message,
        });
        this.channels.delete(channelId);
      });

      channel.on('close', () => {
        logger.debug('Channel closed', { channelId });
        this.channels.delete(channelId);
        this.emit(ConnectionEvent.CHANNEL_CLOSED, { channelId });
      });

      logger.debug('Channel created', {
        channelId,
        prefetch: this.config.prefetchCount,
      });

      this.emit(ConnectionEvent.CHANNEL_CREATED, { channelId, isConfirm: false });

      return channel;
    } catch (error) {
      logger.error('Failed to create channel', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Get a confirm channel from the pool or create a new one
   */
  public async getConfirmChannel(): Promise<amqp.ConfirmChannel> {
    if (!this.connection || this.state !== ConnectionState.CONNECTED) {
      throw new Error('Not connected to RabbitMQ');
    }

    try {
      const channel = await this.connection.createConfirmChannel();
      await channel.prefetch(this.config.prefetchCount);

      const channelId = uuidv4();
      const managedChannel: ManagedChannel = {
        channel,
        id: channelId,
        isConfirm: true,
        createdAt: new Date(),
        consumerCount: 0,
        inUse: true,
      };

      this.channels.set(channelId, managedChannel);

      // Set up channel error handlers
      channel.on('error', (err: Error) => {
        logger.error('Confirm channel error', {
          channelId,
          error: err.message,
        });
        this.channels.delete(channelId);
      });

      channel.on('close', () => {
        logger.debug('Confirm channel closed', { channelId });
        this.channels.delete(channelId);
        this.emit(ConnectionEvent.CHANNEL_CLOSED, { channelId });
      });

      logger.debug('Confirm channel created', {
        channelId,
        prefetch: this.config.prefetchCount,
      });

      this.emit(ConnectionEvent.CHANNEL_CREATED, { channelId, isConfirm: true });

      return channel;
    } catch (error) {
      logger.error('Failed to create confirm channel', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Release a channel (mark as not in use)
   */
  public releaseChannel(channelId: string): void {
    const managedChannel = this.channels.get(channelId);
    if (managedChannel) {
      managedChannel.inUse = false;
      logger.debug('Channel released', { channelId });
    }
  }

  /**
   * Close all channels
   */
  private async closeAllChannels(): Promise<void> {
    const channelIds = Array.from(this.channels.keys());

    logger.debug('Closing all channels', { count: channelIds.length });

    for (const channelId of channelIds) {
      const managedChannel = this.channels.get(channelId);
      if (managedChannel) {
        try {
          await managedChannel.channel.close();
        } catch (error) {
          logger.error('Error closing channel', {
            channelId,
            error: (error as Error).message,
          });
        }
      }
    }

    this.channels.clear();
  }

  /**
   * Get connection health status
   */
  public getHealth(): ConnectionHealth {
    const uptime = this.connectedAt ? Date.now() - this.connectedAt.getTime() : 0;

    const health: ConnectionHealth = {
      state: this.state,
      isHealthy: this.isHealthy(),
      uptime,
      reconnectAttempts: this.reconnectAttempts,
      activeChannels: this.channels.size,
      activeConsumers: this.getActiveConsumerCount(),
    };

    // Add optional properties only if they exist
    if (this.lastError) {
      health.lastError = this.lastError.message;
    }
    if (this.connectedAt) {
      health.lastConnectedAt = this.connectedAt;
    }
    if (this.lastErrorAt) {
      health.lastErrorAt = this.lastErrorAt;
    }

    return health;
  }

  /**
   * Check if connection is healthy
   */
  public isHealthy(): boolean {
    return this.state === ConnectionState.CONNECTED && this.connection !== null;
  }

  /**
   * Get count of active consumers across all channels
   */
  private getActiveConsumerCount(): number {
    let count = 0;
    for (const managedChannel of this.channels.values()) {
      count += managedChannel.consumerCount;
    }
    return count;
  }

  /**
   * Register event handler
   */
  public on(event: ConnectionEvent, handler: ConnectionEventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.add(handler);
      logger.debug('Event handler registered', { event });
    }
  }

  /**
   * Unregister event handler
   */
  public off(event: ConnectionEvent, handler: ConnectionEventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      logger.debug('Event handler unregistered', { event });
    }
  }

  /**
   * Emit event to all registered handlers
   */
  private emit(event: ConnectionEvent, data?: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(event, data);
        } catch (error) {
          logger.error('Error in event handler', {
            event,
            error: (error as Error).message,
          });
        }
      });
    }
  }

  /**
   * Sanitize connection URL for logging (hide credentials)
   */
  private sanitizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      if (urlObj.password) {
        urlObj.password = '****';
      }
      if (urlObj.username) {
        urlObj.username = '****';
      }
      return urlObj.toString();
    } catch {
      return 'invalid-url';
    }
  }
}
