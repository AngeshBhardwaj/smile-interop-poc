const amqp = require('amqplib');
const { CloudEvent } = require('cloudevents');

async function publishEvent() {
  try {
    const connection = await amqp.connect('amqp://admin:admin123@localhost:5672');
    const channel = await connection.createChannel();

    const exchange = 'orders.events';
    const routingKey = 'order.created';

    await channel.assertExchange(exchange, 'topic', { durable: true });

    const event = new CloudEvent({
      specversion: '1.0',
      type: 'order.created',
      source: 'test-script',
      data: { message: 'hello' },
    });

    const message = Buffer.from(JSON.stringify(event));

    channel.publish(exchange, routingKey, message, {
      persistent: true,
      contentType: 'application/json',
    });

    console.log('Event published successfully');

    await channel.close();
    await connection.close();
  } catch (error) {
    console.error('Failed to publish event', error);
  }
}

publishEvent();
