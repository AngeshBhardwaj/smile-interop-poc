/**
 * RabbitMQ Messaging Types
 *
 * Type definitions for RabbitMQ connection management,
 * channel pooling, and message handling.
 */

import * as amqp from 'amqplib';

/**
 * RabbitMQ connection configuration
 */
export interface RabbitMQConfig {
  /** RabbitMQ connection URL (amqp://user:pass@host:port) */
  url: string;

  /** Number of messages to prefetch per consumer */
  prefetchCount: number;

  /** Delay in milliseconds before attempting to reconnect */
  reconnectDelay: number;

  /** Maximum number of reconnection attempts (0 = infinite) */
  maxReconnectAttempts: number;

  /** Heartbeat interval in seconds */
  heartbeat?: number;

  /** Socket options */
  socketOptions?: {
    timeout?: number;
    keepAlive?: boolean;
    noDelay?: boolean;
  };
}

/**
 * Queue consumer configuration
 */
export interface QueueConsumerConfig {
  /** Unique name for this consumer */
  name: string;

  /** Queue name to consume from */
  queue: string;

  /** Exchange name to bind to */
  exchange: string;

  /** Exchange type (topic, direct, fanout, headers) */
  exchangeType: 'topic' | 'direct' | 'fanout' | 'headers';

  /** Routing key pattern (supports wildcards for topic exchanges) */
  routingKey: string;

  /** Whether this consumer is enabled */
  enabled: boolean;

  /** Prefetch count override (optional, uses global if not set) */
  prefetch?: number;

  /** Queue options */
  options?: {
    durable?: boolean;
    autoDelete?: boolean;
    exclusive?: boolean;
    messageTtl?: number;
    maxLength?: number;
    deadLetterExchange?: string;
    deadLetterRoutingKey?: string;
  };
}

/**
 * Dead Letter Queue configuration
 */
export interface DLQConfig {
  /** DLQ queue name */
  queue: string;

  /** DLQ exchange name */
  exchange: string;

  /** DLQ routing key */
  routingKey: string;

  /** Message TTL in DLQ (milliseconds) */
  ttl?: number;

  /** Maximum messages in DLQ */
  maxLength?: number;
}

/**
 * Connection state enumeration
 */
export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  RECONNECTING = 'RECONNECTING',
  CLOSING = 'CLOSING',
  CLOSED = 'CLOSED',
  ERROR = 'ERROR',
}

/**
 * Connection health status
 */
export interface ConnectionHealth {
  /** Current connection state */
  state: ConnectionState;

  /** Whether connection is healthy */
  isHealthy: boolean;

  /** Connection uptime in milliseconds */
  uptime: number;

  /** Number of reconnection attempts made */
  reconnectAttempts: number;

  /** Last error message (if any) */
  lastError?: string;

  /** Timestamp of last successful connection */
  lastConnectedAt?: Date;

  /** Timestamp of last error */
  lastErrorAt?: Date;

  /** Active channels count */
  activeChannels: number;

  /** Active consumers count */
  activeConsumers: number;
}

/**
 * Channel wrapper with metadata
 */
export interface ManagedChannel {
  /** The underlying amqplib channel */
  channel: amqp.Channel | amqp.ConfirmChannel;

  /** Unique ID for this channel */
  id: string;

  /** Whether this is a confirm channel */
  isConfirm: boolean;

  /** Timestamp when channel was created */
  createdAt: Date;

  /** Number of active consumers on this channel */
  consumerCount: number;

  /** Whether channel is in use */
  inUse: boolean;
}

/**
 * Retry strategy configuration
 */
export interface RetryStrategy {
  /** Maximum number of retry attempts */
  maxAttempts: number;

  /** Initial delay in milliseconds */
  initialDelay: number;

  /** Maximum delay in milliseconds */
  maxDelay: number;

  /** Backoff multiplier for exponential backoff */
  backoffMultiplier: number;

  /** Jitter factor (0-1) to add randomness to delays */
  jitter?: number;
}

/**
 * Connection manager events
 */
export enum ConnectionEvent {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  RECONNECTING = 'reconnecting',
  RECONNECT_FAILED = 'reconnect_failed',
  ERROR = 'error',
  CHANNEL_CREATED = 'channel_created',
  CHANNEL_CLOSED = 'channel_closed',
}

/**
 * Event handler type for connection events
 */
export type ConnectionEventHandler = (event: ConnectionEvent, data?: any) => void;

/**
 * Connection manager interface
 */
export interface IConnectionManager {
  /** Connect to RabbitMQ */
  connect(): Promise<void>;

  /** Disconnect from RabbitMQ */
  disconnect(): Promise<void>;

  /** Get a channel from the pool */
  getChannel(): Promise<amqp.Channel>;

  /** Get a confirm channel from the pool */
  getConfirmChannel(): Promise<amqp.ConfirmChannel>;

  /** Release a channel back to the pool */
  releaseChannel(channelId: string): void;

  /** Get connection health status */
  getHealth(): ConnectionHealth;

  /** Check if connection is healthy */
  isHealthy(): boolean;

  /** Register event handler */
  on(event: ConnectionEvent, handler: ConnectionEventHandler): void;

  /** Unregister event handler */
  off(event: ConnectionEvent, handler: ConnectionEventHandler): void;
}

/**
 * Message acknowledgment result
 */
export interface AckResult {
  /** Whether the message was acknowledged */
  acknowledged: boolean;

  /** Error if acknowledgment failed */
  error?: Error;

  /** Whether message was requeued */
  requeued?: boolean;
}

/**
 * Message processing context
 */
export interface MessageContext {
  /** Original RabbitMQ message */
  message: amqp.ConsumeMessage;

  /** The channel the message was received on */
  channel: amqp.Channel;

  /** Consumer tag */
  consumerTag: string;

  /** Queue name */
  queue: string;

  /** Correlation ID from message properties */
  correlationId?: string;

  /** Timestamp when message was received */
  receivedAt: Date;
}
