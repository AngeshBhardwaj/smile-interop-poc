const amqp = require('amqplib');
const { CloudEvent } = require('cloudevents');

async function publishEvent() {
  try {
    const connection = await amqp.connect('amqp://admin:admin123@localhost:5672');
    const channel = await connection.createChannel();

    const exchange = 'orders.events';
    const routingKey = 'orders.created'; // match 'orders.#' binding in interop-layer

    await channel.assertExchange(exchange, 'topic', { durable: true });

    const event = new CloudEvent({
      specversion: '1.0',
      type: 'orders.created',
      source: 'smile.orders-service',
      id: `evt-${Date.now()}`,
      data: { message: 'hello from publish-test-event-2' },
    });

  // Ensure we serialize the CloudEvent to a plain object (use toJSON()) so JSON contains the event fields
  const message = Buffer.from(JSON.stringify(event.toJSON ? event.toJSON() : event));

    channel.publish(exchange, routingKey, message, {
      persistent: true,
      contentType: 'application/json',
    });

    console.log('Event published successfully (orders.created)');

    await channel.close();
    await connection.close();
  } catch (error) {
    console.error('Failed to publish event', error);
  }
}

publishEvent();
