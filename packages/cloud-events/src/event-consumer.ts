import { CloudEvent } from 'cloudevents';
import amqp, { Connection, Channel } from 'amqplib';
import { logger } from '@smile/common';

export interface EventConsumerConfig {
  rabbitmqUrl: string;
  exchange: string;
  queue: string;
  routingKey: string;
}

export type EventHandler<T = unknown> = (event: CloudEvent<T>) => Promise<void>;

export class EventConsumer {
  private connection: Connection | null = null;
  private channel: Channel | null = null;

  constructor(private readonly config: EventConsumerConfig) {}

  async connect(): Promise<void> {
    try {
      this.connection = await amqp.connect(this.config.rabbitmqUrl);
      this.channel = await this.connection.createChannel();

      if (!this.channel) {
        throw new Error('Failed to create channel');
      }

      await this.channel.assertExchange(this.config.exchange, 'topic', {
        durable: true,
      });

      await this.channel.assertQueue(this.config.queue, { durable: true });
      await this.channel.bindQueue(
        this.config.queue,
        this.config.exchange,
        this.config.routingKey
      );

      logger.info('EventConsumer connected to RabbitMQ');
    } catch (error) {
      logger.error('Failed to connect EventConsumer to RabbitMQ', { error });
      throw error;
    }
  }

  async consume<T = unknown>(handler: EventHandler<T>): Promise<void> {
    if (!this.channel) {
      throw new Error('EventConsumer not connected');
    }

    try {
      await this.channel.consume(this.config.queue, async (msg) => {
        if (!msg) {
          return;
        }

        try {
          const eventData = JSON.parse(msg.content.toString());
          const cloudEvent = new CloudEvent(eventData);

          await handler(cloudEvent as CloudEvent<T>);

          if (this.channel) {
            this.channel.ack(msg);
          }

          logger.info('Event processed successfully', {
            type: cloudEvent.type,
            id: cloudEvent.id,
            source: cloudEvent.source,
          });
        } catch (error) {
          logger.error('Failed to process event', { error });
          if (this.channel) {
            this.channel.nack(msg, false, false); // Send to DLQ
          }
        }
      });

      logger.info(`EventConsumer started consuming from queue: ${this.config.queue}`);
    } catch (error) {
      logger.error('Failed to start consuming events', { error });
      throw error;
    }
  }

  async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      logger.info('EventConsumer disconnected from RabbitMQ');
    } catch (error) {
      logger.error('Error closing EventConsumer connection', { error });
    }
  }
}