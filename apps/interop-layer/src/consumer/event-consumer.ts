/**
 * EventConsumer
 *
 * Consumes CloudEvents from RabbitMQ queues with:
 * - Queue and exchange management
 * - CloudEvent validation
 * - Message acknowledgment
 * - Statistics tracking
 * - Deduplication support
 */

import * as amqp from 'amqplib';
import { logger } from '@smile/common';
import {
  QueueConsumerConfig,
  ConsumerOptions,
  ConsumerStats,
  CloudEventHandler,
  MessageContext,
} from '../messaging/types';
import { ConnectionManager } from '../messaging/connection-manager';
import { CloudEventValidator } from './cloud-event-validator';
import { MessageHandler } from './message-handler';

/**
 * EventConsumer
 *
 * Consumes and processes CloudEvents from RabbitMQ
 */
export class EventConsumer {
  private static readonly MS_PER_SECOND = 1000;

  private channel: amqp.Channel | null = null;
  private consumerTag: string | null = null;
  private isActive = false;
  private startedAt: Date | null = null;

  private readonly validator: CloudEventValidator;
  private readonly messageHandler: MessageHandler;

  private stats: ConsumerStats;

  constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly config: QueueConsumerConfig,
    private readonly options: ConsumerOptions,
    private readonly handler: CloudEventHandler,
  ) {
    this.validator = new CloudEventValidator();
    this.messageHandler = new MessageHandler(options);
    this.stats = this.createInitialStats();
  }

  /**
   * Start consuming messages from the queue
   *
   * @throws Error if consumer is already active
   */
  public async start(): Promise<void> {
    if (this.isActive) {
      throw new Error('Consumer is already active');
    }

    try {
      logger.info('Starting consumer with config', { config: this.config });
      // Get channel from connection manager
      this.channel = await this.connectionManager.getChannel();

      // Assert exchange
      await this.channel.assertExchange(this.config.exchange, this.config.exchangeType, {
        durable: this.config.options?.durable ?? true,
        autoDelete: this.config.options?.autoDelete ?? false,
      });

      logger.info('Exchange asserted', {
        exchange: this.config.exchange,
        type: this.config.exchangeType,
      });

      // Assert queue
      await this.channel.assertQueue(this.config.queue, {
        durable: this.config.options?.durable ?? true,
        autoDelete: this.config.options?.autoDelete ?? false,
        messageTtl: this.config.options?.messageTtl,
        maxLength: this.config.options?.maxLength,
        deadLetterExchange: this.config.options?.deadLetterExchange,
        deadLetterRoutingKey: this.config.options?.deadLetterRoutingKey,
      });

      logger.info('Queue asserted', {
        queue: this.config.queue,
      });

      // Bind queue to exchange
      await this.channel.bindQueue(
        this.config.queue,
        this.config.exchange,
        this.config.routingKey,
      );

      logger.info('Queue bound to exchange', {
        queue: this.config.queue,
        exchange: this.config.exchange,
        routingKey: this.config.routingKey,
      });

      // Set prefetch if configured
      if (this.config.prefetch !== undefined) {
        this.channel.prefetch(this.config.prefetch);
        logger.info('Prefetch set', { prefetch: this.config.prefetch });
      }

      // Start consuming
      const consumeResult = await this.channel.consume(
        this.config.queue,
        this.handleMessage.bind(this),
        {
          noAck: this.options.autoAck ?? false,
          consumerTag: this.options.consumerTag,
        },
      );

      this.consumerTag = consumeResult.consumerTag;
      this.isActive = true;
      this.startedAt = new Date();

      logger.info('Consumer started', {
        consumerTag: this.consumerTag,
        queue: this.config.queue,
        name: this.config.name,
      });
    } catch (error) {
      logger.error('Failed to start consumer', {
        error: (error as Error).message,
        name: this.config.name,
      });
      throw error;
    }
  }

  /**
   * Stop consuming messages
   */
  public async stop(): Promise<void> {
    if (!this.isActive || !this.channel || !this.consumerTag) {
      return;
    }

    try {
      await this.channel.cancel(this.consumerTag);

      this.isActive = false;
      this.consumerTag = null;

      logger.info('Consumer stopped', {
        name: this.config.name,
        queue: this.config.queue,
      });
    } catch (error) {
      logger.error('Failed to stop consumer', {
        error: (error as Error).message,
        name: this.config.name,
      });
      // Don't throw - best effort stop
    }
  }

  /**
   * Get consumer statistics
   *
   * @returns Current consumer statistics
   */
  public getStats(): ConsumerStats {
    const uptime = this.startedAt ? Date.now() - this.startedAt.getTime() : 0;
    const messagesPerSecond =
      uptime > 0 ? (this.stats.messagesConsumed / uptime) * EventConsumer.MS_PER_SECOND : 0;

    return {
      ...this.stats,
      uptime,
      messagesPerSecond,
      isActive: this.isActive,
    };
  }

  /**
   * Reset statistics
   */
  public resetStats(): void {
    this.stats = {
      ...this.createInitialStats(),
      startedAt: this.stats.startedAt,
    };
    this.messageHandler.resetStats();

    logger.info('Consumer statistics reset', {
      name: this.config.name,
    });
  }

  /**
   * Handle incoming message
   *
   * @param message - The RabbitMQ message
   */
  private async handleMessage(message: amqp.ConsumeMessage | null): Promise<void> {
    if (!message || !this.channel) {
      return;
    }

    logger.info('Received message', { content: message.content.toString() });

    const startTime = Date.now();

    try {
      this.stats.messagesConsumed++;

      // Parse message
      const parseResult = this.messageHandler.parseMessage(message);
      if (!parseResult.success) {
        logger.warn('Failed to parse message', {
          error: parseResult.error,
          messageId: message.properties.messageId,
        });

        await this.rejectMessage(message);
        return;
      }

      // Validate CloudEvent
      const validationResult = this.validator.validate(parseResult.data);
      if (!validationResult.valid) {
        logger.warn('Invalid CloudEvent', {
          errors: validationResult.errors,
          messageId: message.properties.messageId,
        });

        await this.rejectMessage(message);
        return;
      }

      const event = validationResult.event!;

      // Check for duplicate
      if (this.messageHandler.isDuplicate(event.id)) {
        logger.debug('Duplicate message skipped', {
          eventId: event.id,
        });

        this.messageHandler.recordDuplicate();
        await this.messageHandler.acknowledgeMessage(this.channel, message, true);
        return;
      }

      // Extract context
      const context: MessageContext = {
        ...this.messageHandler.extractContext(
          message,
          this.config.queue,
          this.consumerTag!,
        ),
        channel: this.channel,
      };

      // Call handler
      await this.handler(event, context);

      // Acknowledge success
      await this.messageHandler.acknowledgeMessage(this.channel, message, true);

      const processingTime = Date.now() - startTime;
      this.messageHandler.recordSuccess(processingTime);
      this.stats.messagesProcessed++;

      logger.debug('Message processed successfully', {
        eventId: event.id,
        eventType: event.type,
        processingTime,
      });
    } catch (error) {
      logger.error('Failed to process message', {
        error: (error as Error).message,
        messageId: message.properties.messageId,
      });

      if (this.channel) {
        await this.messageHandler.acknowledgeMessage(this.channel, message, false);
      }

      const processingTime = Date.now() - startTime;
      this.messageHandler.recordFailure(processingTime);
      this.stats.messagesFailed++;
    }
  }

  /**
   * Reject a message and update statistics
   *
   * @param message - The message to reject
   */
  private async rejectMessage(message: amqp.ConsumeMessage): Promise<void> {
    if (this.channel) {
      await this.messageHandler.acknowledgeMessage(this.channel, message, false);
    }
    this.stats.messagesFailed++;
  }

  /**
   * Create initial statistics object
   *
   * @returns Fresh statistics object
   */
  private createInitialStats(): ConsumerStats {
    return {
      messagesConsumed: 0,
      messagesProcessed: 0,
      messagesFailed: 0,
      messagesDLQ: 0,
      startedAt: new Date(),
      uptime: 0,
      messagesPerSecond: 0,
      queueName: this.config.queue,
      isActive: false,
    };
  }
}
