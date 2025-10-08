import { CloudEvent, CloudEventV1 } from 'cloudevents';
import * as amqp from 'amqplib';
import { logger } from '@smile/common';

export interface EventEmitterConfig {
  rabbitmqUrl: string;
  exchange: string;
  routingKey?: string;
}

export class EventEmitter {
  private connection: any = null;
  private channel: any = null;

  constructor(private readonly config: EventEmitterConfig) {}

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

      logger.info('EventEmitter connected to RabbitMQ');
    } catch (error) {
      logger.error('Failed to connect EventEmitter to RabbitMQ', { error });
      throw error;
    }
  }

  async emit(event: CloudEventV1<unknown>): Promise<void> {
    if (!this.channel) {
      throw new Error('EventEmitter not connected');
    }

    try {
      const cloudEvent = new CloudEvent(event);
      const message = Buffer.from(JSON.stringify(cloudEvent.toJSON()));

      const published = this.channel.publish(
        this.config.exchange,
        this.config.routingKey ?? event.type,
        message,
        {
          persistent: true,
          contentType: 'application/json',
          headers: {
            'ce-specversion': event.specversion,
            'ce-type': event.type,
            'ce-source': event.source,
            'ce-id': event.id,
          },
        },
      );

      if (!published) {
        throw new Error('Failed to publish event');
      }

      logger.info('Event emitted successfully', {
        type: event.type,
        id: event.id,
        source: event.source,
      });
    } catch (error) {
      logger.error('Failed to emit event', { error, event });
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
      logger.info('EventEmitter disconnected from RabbitMQ');
    } catch (error) {
      logger.error('Error closing EventEmitter connection', { error });
    }
  }
}