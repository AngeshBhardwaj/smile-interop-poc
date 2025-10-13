/**
 * InteropService
 *
 * Main service that orchestrates the integration between:
 * - RabbitMQ Event Consumers
 * - OpenHIM HTTP Bridge
 *
 * This service manages the complete lifecycle:
 * 1. Connects to RabbitMQ
 * 2. Starts consuming CloudEvents from multiple queues
 * 3. Routes each CloudEvent to OpenHIM via HTTP bridge
 * 4. Tracks statistics and health
 */

import { logger } from '@smile/common';
import { ConnectionManager } from '../messaging/connection-manager';
import { OpenHIMBridge, OpenHIMConfig } from '../bridge/openhim-bridge';
import { EventConsumer } from '../consumer/event-consumer';
import {
  RabbitMQConfig,
  QueueConsumerConfig,
  ConsumerOptions,
  CloudEventHandler,
  MessageContext,
  ConsumerStats,
  ConnectionHealth,
} from '../messaging/types';
import { BridgeStats } from '../bridge/openhim-bridge';

/**
 * InteropService configuration
 */
export interface InteropServiceConfig {
  /** RabbitMQ connection configuration */
  rabbitmq: RabbitMQConfig;

  /** OpenHIM bridge configuration */
  openhim: OpenHIMConfig;

  /** Consumer configurations */
  consumers: QueueConsumerConfig[];

  /** Optional consumer options */
  consumerOptions?: ConsumerOptions;
}

/**
 * Service statistics
 */
export interface ServiceStats {
  /** Consumer statistics for each consumer */
  consumers: ConsumerStats[];

  /** Bridge statistics */
  bridge: BridgeStats;

  /** RabbitMQ connection health */
  rabbitmq: ConnectionHealth;
}

/**
 * Service health status
 */
export interface ServiceHealth {
  /** Overall service status */
  status: 'healthy' | 'unhealthy' | 'degraded';

  /** RabbitMQ connection health */
  rabbitmq: ConnectionHealth;

  /** Active consumers count */
  activeConsumers: number;

  /** Total consumers count */
  totalConsumers: number;
}

/**
 * InteropService implementation
 */
export class InteropService {
  private readonly connectionManager: ConnectionManager;
  private readonly openHIMBridge: OpenHIMBridge;
  private readonly consumers: EventConsumer[] = [];
  private readonly config: InteropServiceConfig;

  private isRunning = false;

  constructor(config: InteropServiceConfig) {
    this.config = config;

    // Create ConnectionManager
    this.connectionManager = new ConnectionManager(config.rabbitmq);

    // Create OpenHIM Bridge
    this.openHIMBridge = new OpenHIMBridge(config.openhim);

    // Create consumers
    this.createConsumers();

    logger.info('InteropService initialized', {
      consumersCount: this.consumers.length,
      rabbitmqUrl: config.rabbitmq.url,
      openhimEndpoints: {
        health: config.openhim.healthEndpoint,
        orders: config.openhim.ordersEndpoint,
        default: config.openhim.defaultEndpoint,
      },
    });
  }

  /**
   * Create EventConsumers from configuration
   */
  private createConsumers(): void {
    for (const consumerConfig of this.config.consumers) {
      if (!consumerConfig.enabled) {
        logger.info('Skipping disabled consumer', {
          name: consumerConfig.name,
        });
        continue;
      }

      const consumer = new EventConsumer(
        this.connectionManager,
        consumerConfig,
        this.config.consumerOptions || {},
        this.createEventHandler(),
      );

      this.consumers.push(consumer);

      logger.info('Consumer created', {
        name: consumerConfig.name,
        queue: consumerConfig.queue,
        exchange: consumerConfig.exchange,
      });
    }
  }

  /**
   * Create the CloudEvent handler that uses OpenHIM Bridge
   *
   * @returns CloudEvent handler function
   */
  private createEventHandler(): CloudEventHandler {
    return async (event: any, context: MessageContext): Promise<void> => {
      // Extract correlation ID (fallback to event.id)
      const correlationId = context.correlationId || event.id;

      logger.info('Processing CloudEvent', {
        eventId: event.id,
        eventType: event.type,
        eventSource: event.source,
        correlationId,
        queue: context.queue,
      });

      try {
        // Send to OpenHIM via bridge
        const result = await this.openHIMBridge.sendToOpenHIM(event, correlationId);

        if (!result.success) {
          throw new Error(result.error || 'Unknown OpenHIM error');
        }

        logger.info('CloudEvent successfully forwarded to OpenHIM', {
          eventId: event.id,
          correlationId,
          statusCode: result.statusCode,
        });
      } catch (error) {
        logger.error('Failed to forward CloudEvent to OpenHIM', {
          eventId: event.id,
          correlationId,
          error: (error as Error).message,
        });

        // Re-throw to let EventConsumer handle (will NACK the message)
        throw error;
      }
    };
  }

  /**
   * Start the service
   *
   * - Connects to RabbitMQ
   * - Starts all consumers
   *
   * @throws Error if service is already running
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Service is already running');
    }

    try {
      logger.info('Starting InteropService...');

      // Connect to RabbitMQ
      await this.connectionManager.connect();
      logger.info('Connected to RabbitMQ');

      // Start all consumers
      for (const consumer of this.consumers) {
        await consumer.start();
      }

      this.isRunning = true;

      logger.info('InteropService started successfully', {
        consumersRunning: this.consumers.length,
      });
    } catch (error) {
      logger.error('Failed to start InteropService', {
        error: (error as Error).message,
      });

      // Cleanup on failure
      await this.stop();

      throw error;
    }
  }

  /**
   * Stop the service
   *
   * - Stops all consumers
   * - Disconnects from RabbitMQ
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.info('Service is not running, nothing to stop');
      return;
    }

    try {
      logger.info('Stopping InteropService...');

      // Stop all consumers
      for (const consumer of this.consumers) {
        try {
          await consumer.stop();
        } catch (error) {
          logger.error('Failed to stop consumer', {
            error: (error as Error).message,
          });
          // Continue stopping other consumers
        }
      }

      // Disconnect from RabbitMQ
      await this.connectionManager.disconnect();

      this.isRunning = false;

      logger.info('InteropService stopped successfully');
    } catch (error) {
      logger.error('Error during service shutdown', {
        error: (error as Error).message,
      });
      // Don't throw - best effort stop
    }
  }

  /**
   * Get service statistics
   *
   * @returns Combined statistics from all components
   */
  public getStats(): ServiceStats {
    return {
      consumers: this.consumers.map((consumer) => consumer.getStats()),
      bridge: this.openHIMBridge.getStats(),
      rabbitmq: this.connectionManager.getHealth(),
    };
  }

  /**
   * Get service health status
   *
   * @returns Service health information
   */
  public getHealth(): ServiceHealth {
    const rabbitmqHealth = this.connectionManager.getHealth();
    const activeConsumers = this.consumers.filter((c) => c.getStats().isActive).length;

    let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';

    if (!this.isRunning) {
      status = 'degraded';
    } else if (!rabbitmqHealth.isHealthy) {
      status = 'unhealthy';
    } else if (activeConsumers === 0) {
      status = 'unhealthy';
    } else if (activeConsumers < this.consumers.length) {
      status = 'degraded';
    }

    return {
      status,
      rabbitmq: rabbitmqHealth,
      activeConsumers,
      totalConsumers: this.consumers.length,
    };
  }

  /**
   * Check if service is running
   *
   * @returns True if service is running
   */
  public isServiceRunning(): boolean {
    return this.isRunning;
  }
}
