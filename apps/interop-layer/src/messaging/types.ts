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

/**
 * Consumer statistics
 */
export interface ConsumerStats {
  /** Total messages consumed */
  messagesConsumed: number;

  /** Messages successfully processed */
  messagesProcessed: number;

  /** Messages failed */
  messagesFailed: number;

  /** Messages sent to DLQ */
  messagesDLQ: number;

  /** Consumer start time */
  startedAt: Date;

  /** Consumer uptime in milliseconds */
  uptime: number;

  /** Messages per second (average) */
  messagesPerSecond: number;

  /** Current queue name */
  queueName: string;

  /** Whether consumer is active */
  isActive: boolean;
}

/**
 * CloudEvent validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;

  /** Validation errors if any */
  errors?: string[];

  /** CloudEvent if valid */
  event?: any;
}

/**
 * Event handler for CloudEvents
 */
export type CloudEventHandler<T = any> = (
  event: T,
  context: MessageContext,
) => Promise<void>;

/**
 * Consumer options
 */
export interface ConsumerOptions {
  /** Auto-acknowledge messages (not recommended) */
  autoAck?: boolean;

  /** Acknowledge on success only */
  ackOnSuccess?: boolean;

  /** Requeue failed messages */
  requeueOnFailure?: boolean;

  /** Enable message deduplication */
  enableDeduplication?: boolean;

  /** Deduplication window in milliseconds */
  deduplicationWindow?: number;

  /** Consumer tag */
  consumerTag?: string;

  /** Enable parallel processing */
  parallel?: boolean;

  /** Max parallel messages */
  maxParallel?: number;
}

/**
 * Routing configuration metadata
 */
export interface RoutingMetadata {
  /** Configuration version */
  version: string;

  /** Last update timestamp */
  lastUpdated: string;

  /** Configuration description */
  description: string;
}

/**
 * Routing system settings
 */
export interface RoutingSettings {
  /** Fallback behavior when no route matches */
  fallbackBehavior: 'route-to-fallback-queue' | 'drop' | 'error';

  /** Validate routing rules on load */
  validateOnLoad: boolean;

  /** Enable dynamic route reloading */
  dynamicReload: boolean;

  /** Reload interval in milliseconds */
  reloadInterval: number;

  /** Enable route metrics tracking */
  enableMetrics: boolean;
}

/**
 * Route condition for content-based routing
 */
export interface RouteCondition {
  /** JSONPath expression for field to evaluate */
  field: string;

  /** Comparison operator */
  operator: 'equals' | 'notEquals' | 'contains' | 'greaterThan' | 'lessThan' | 'regex';

  /** Value to compare against */
  value: any;
}

/**
 * Route destination configuration
 */
export interface RouteDestination {
  /** Destination type */
  type: 'http' | 'queue' | 'topic' | 'openhim' | 'webhook';

  /** HTTP method (for HTTP destinations) */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

  /** Destination endpoint URL */
  endpoint?: string;

  /** Request timeout in milliseconds */
  timeout?: number;

  /** HTTP headers */
  headers?: Record<string, string>;

  /** Exchange name (for queue/topic destinations) */
  exchange?: string;

  /** Queue name */
  queue?: string;

  /** Routing key */
  routingKey?: string;
}

/**
 * Transformation configuration
 */
export interface TransformConfig {
  /** Whether transformation is enabled */
  enabled: boolean;

  /** Transformation type */
  type?: string;

  /** Additional transformation configuration */
  config?: Record<string, any>;
}

/**
 * Retry configuration for routes
 */
export interface RouteRetryConfig {
  /** Whether retry is enabled */
  enabled: boolean;

  /** Maximum retry attempts */
  maxAttempts?: number;

  /** Backoff delay in milliseconds */
  backoffMs?: number;
}

/**
 * Route definition
 */
export interface RouteDefinition {
  /** Route name (unique identifier) */
  name: string;

  /** Route description */
  description?: string;

  /** Whether route is enabled */
  enabled: boolean;

  /** Source pattern (supports wildcards) */
  source: string;

  /** Event type pattern (supports wildcards) */
  type: string;

  /** Routing strategy */
  strategy: 'type' | 'source' | 'content' | 'hybrid' | 'default' | 'fallback';

  /** Route priority (0-10, higher = higher priority) */
  priority: number;

  /** Content-based routing condition */
  condition?: RouteCondition;

  /** Destination configuration */
  destination: RouteDestination;

  /** Transformation configuration */
  transform?: TransformConfig;

  /** Retry configuration */
  retry?: RouteRetryConfig;
}

/**
 * Complete routing configuration
 */
export interface RoutingConfig {
  /** Configuration metadata */
  metadata: RoutingMetadata;

  /** Routing settings */
  settings: RoutingSettings;

  /** Route definitions */
  routes: RouteDefinition[];
}

/**
 * Route match result
 */
export interface RouteMatchResult {
  /** Whether a route was matched */
  matched: boolean;

  /** Matched route (if any) */
  route?: RouteDefinition;

  /** Reason for no match (if not matched) */
  reason?: string;
}

/**
 * Routing result
 */
export interface RoutingResult {
  /** Whether routing was successful */
  success: boolean;

  /** Route that was used */
  route: RouteDefinition;

  /** Destination that was routed to */
  destination: RouteDestination;

  /** Error if routing failed */
  error?: Error;

  /** Response from destination (if applicable) */
  response?: any;

  /** Routing latency in milliseconds */
  latencyMs: number;
}
