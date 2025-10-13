/**
 * Message Handler
 *
 * Handles RabbitMQ message processing including:
 * - Message parsing and deserialization
 * - Acknowledgment strategies
 * - Deduplication
 * - Context extraction
 * - Statistics tracking
 */

import * as amqp from 'amqplib';
import { logger } from '@smile/common';
import { ConsumerOptions, MessageContext } from '../messaging/types';

/**
 * Parse result for message parsing
 */
export interface ParseResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Message processing statistics
 */
export interface MessageStats {
  messagesProcessed: number;
  messagesFailed: number;
  messagesDuplicate: number;
  totalProcessingTime: number;
  averageProcessingTime: number;
}

/**
 * Message Handler
 *
 * Provides message parsing, acknowledgment, and tracking functionality
 */
export class MessageHandler {
  private static readonly DEFAULT_DEDUPLICATION_WINDOW = 60000; // 1 minute in milliseconds

  private deduplicationCache: Map<string, number> = new Map();
  private stats: MessageStats;

  constructor(private readonly options: ConsumerOptions) {
    this.stats = this.createInitialStats();

    // Start cleanup interval for deduplication cache if enabled
    if (options.enableDeduplication) {
      this.startDeduplicationCleanup();
    }
  }

  /**
   * Parse message content as JSON
   *
   * @param message - The RabbitMQ message
   * @returns Parse result with data or error
   */
  public parseMessage(message: amqp.ConsumeMessage): ParseResult {
    try {
      const content = message.content.toString();
      logger.info('Received message content', { content });

      if (!content || content.trim() === '') {
        return {
          success: false,
          error: 'Message content is empty',
        };
      }

  const data = JSON.parse(content);
  logger.info('Received message data', { eventData: data });

      logger.debug('Message parsed successfully', {
        messageId: message.properties.messageId,
        contentLength: content.length,
      });

      return {
        success: true,
        data,
      };
    } catch (error) {
      logger.error('Failed to parse message', {
        error: (error as Error).message,
        messageId: message.properties.messageId,
      });

      return {
        success: false,
        error: `Failed to parse JSON: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Acknowledge or reject a message based on processing result
   *
   * @param channel - The RabbitMQ channel
   * @param message - The message to acknowledge
   * @param success - Whether processing was successful
   */
  public async acknowledgeMessage(
    channel: amqp.Channel,
    message: amqp.ConsumeMessage,
    success: boolean,
  ): Promise<void> {
    // Skip if autoAck is enabled
    if (this.options.autoAck) {
      return;
    }

    try {
      if (success) {
        // Acknowledge successful processing
        channel.ack(message);

        logger.debug('Message acknowledged', {
          deliveryTag: message.fields.deliveryTag,
          messageId: message.properties.messageId,
        });
      } else {
        // Reject and optionally requeue failed message
        const requeue = this.options.requeueOnFailure || false;

        channel.nack(message, false, requeue);

        logger.debug('Message rejected', {
          deliveryTag: message.fields.deliveryTag,
          messageId: message.properties.messageId,
          requeued: requeue,
        });
      }
    } catch (error) {
      logger.error('Failed to acknowledge message', {
        error: (error as Error).message,
        deliveryTag: message.fields.deliveryTag,
      });
    }
  }

  /**
   * Extract message context for handler
   *
   * @param message - The RabbitMQ message
   * @param queue - The queue name
   * @param consumerTag - The consumer tag
   * @returns Message context
   */
  public extractContext(
    message: amqp.ConsumeMessage,
    queue: string,
    consumerTag: string,
  ): Omit<MessageContext, 'channel'> {
    // Extract correlation ID from multiple sources
    const correlationId =
      message.properties.correlationId ||
      message.properties.messageId ||
      message.fields.deliveryTag.toString();

    return {
      message,
      queue,
      consumerTag,
      correlationId,
      receivedAt: new Date(),
    } as Omit<MessageContext, 'channel'>;
  }

  /**
   * Check if message is a duplicate
   *
   * @param messageId - The message ID to check
   * @returns Whether message is a duplicate
   */
  public isDuplicate(messageId: string): boolean {
    if (!this.options.enableDeduplication) {
      return false;
    }

    const now = Date.now();
    const lastSeen = this.deduplicationCache.get(messageId);

    if (lastSeen !== undefined) {
      // Check if within deduplication window
      const window = this.getDeduplicationWindow();

      if (now - lastSeen < window) {
        logger.debug('Duplicate message detected', {
          messageId,
          lastSeen: new Date(lastSeen),
        });
        return true;
      }
    }

    // Store current timestamp
    this.deduplicationCache.set(messageId, now);
    return false;
  }

  /**
   * Record successful message processing
   *
   * @param processingTimeMs - Processing time in milliseconds
   */
  public recordSuccess(processingTimeMs: number): void {
    this.stats.messagesProcessed++;
    this.stats.totalProcessingTime += processingTimeMs;
    this.updateAverageProcessingTime();

    logger.debug('Message processing recorded', {
      processingTime: processingTimeMs,
      totalProcessed: this.stats.messagesProcessed,
    });
  }

  /**
   * Record failed message processing
   *
   * @param processingTimeMs - Processing time in milliseconds
   */
  public recordFailure(processingTimeMs: number): void {
    this.stats.messagesFailed++;
    this.stats.totalProcessingTime += processingTimeMs;

    logger.debug('Message failure recorded', {
      processingTime: processingTimeMs,
      totalFailed: this.stats.messagesFailed,
    });
  }

  /**
   * Record duplicate message
   */
  public recordDuplicate(): void {
    this.stats.messagesDuplicate++;

    logger.debug('Duplicate message recorded', {
      totalDuplicates: this.stats.messagesDuplicate,
    });
  }

  /**
   * Get current statistics
   *
   * @returns Current message processing statistics
   */
  public getStats(): MessageStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  public resetStats(): void {
    this.stats = this.createInitialStats();
    logger.info('Message handler statistics reset');
  }

  /**
   * Update average processing time
   */
  private updateAverageProcessingTime(): void {
    if (this.stats.messagesProcessed > 0) {
      this.stats.averageProcessingTime =
        this.stats.totalProcessingTime / this.stats.messagesProcessed;
    } else {
      this.stats.averageProcessingTime = 0;
    }
  }

  /**
   * Start periodic cleanup of deduplication cache
   */
  private startDeduplicationCleanup(): void {
    const cleanupInterval = this.getDeduplicationWindow();

    setInterval(() => {
      const now = Date.now();
      const window = this.getDeduplicationWindow();
      let removed = 0;

      for (const [messageId, timestamp] of this.deduplicationCache.entries()) {
        if (now - timestamp > window) {
          this.deduplicationCache.delete(messageId);
          removed++;
        }
      }

      if (removed > 0) {
        logger.debug('Cleaned up deduplication cache', {
          removed,
          remaining: this.deduplicationCache.size,
        });
      }
    }, cleanupInterval);
  }

  /**
   * Get the deduplication window in milliseconds
   *
   * @returns Deduplication window from options or default
   */
  private getDeduplicationWindow(): number {
    return this.options.deduplicationWindow || MessageHandler.DEFAULT_DEDUPLICATION_WINDOW;
  }

  /**
   * Create initial statistics object
   *
   * @returns Fresh statistics object with zero values
   */
  private createInitialStats(): MessageStats {
    return {
      messagesProcessed: 0,
      messagesFailed: 0,
      messagesDuplicate: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0,
    };
  }
}
