import 'dotenv/config';
import express, { Express } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { ServiceConfig, logger } from '@smile/common';
import { InteropService } from './services/interop-service';
import { swaggerSpec } from './config/swagger';

// Service configuration
const config: ServiceConfig = {
  name: 'interop-layer',
  version: '1.0.0',
  port: parseInt(process.env.INTEROP_LAYER_PORT ?? '3002', 10),
  environment: (process.env.NODE_ENV as 'development' | 'production' | 'test') ?? 'development',
};

// InteropService configuration
const interopConfig = {
  rabbitmq: {
    url: process.env.RABBITMQ_URL ?? 'amqp://admin:admin123@localhost:5672',
    prefetchCount: parseInt(process.env.RABBITMQ_PREFETCH_COUNT ?? '10', 10),
    reconnectDelay: parseInt(process.env.RABBITMQ_RECONNECT_DELAY ?? '5000', 10),
    maxReconnectAttempts: parseInt(process.env.RABBITMQ_MAX_RECONNECT_ATTEMPTS ?? '10', 10),
  },
  openhim: {
    healthEndpoint:
      process.env.OPENHIM_HEALTH_ENDPOINT ?? 'http://localhost:5001/health',
    ordersEndpoint:
      process.env.OPENHIM_ORDERS_ENDPOINT ?? 'http://localhost:5001/orders',
    defaultEndpoint:
      process.env.OPENHIM_DEFAULT_ENDPOINT ?? 'http://localhost:5001/events',
    username: process.env.OPENHIM_USERNAME ?? 'interop@openhim.org',
    password: process.env.OPENHIM_PASSWORD ?? 'interop-password',
    timeout: parseInt(process.env.OPENHIM_TIMEOUT ?? '10000', 10),
    retryAttempts: parseInt(process.env.HTTP_RETRY_ATTEMPTS ?? '3', 10),
    retryDelay: parseInt(process.env.HTTP_RETRY_DELAY ?? '1000', 10),
  },
  consumers: [
    {
      name: 'health-consumer',
      queue: process.env.CONSUMER_HEALTH_QUEUE ?? 'interop.health.queue',
      exchange: process.env.CONSUMER_HEALTH_EXCHANGE ?? 'health.events',
      exchangeType: 'topic' as const,
      routingKey: process.env.CONSUMER_HEALTH_ROUTING_KEY ?? 'health.#',
      enabled: true,
    },
    {
      name: 'orders-consumer',
      queue: process.env.CONSUMER_ORDERS_QUEUE ?? 'interop.orders.queue',
      exchange: process.env.CONSUMER_ORDERS_EXCHANGE ?? 'orders.events',
      exchangeType: 'topic' as const,
      routingKey: process.env.CONSUMER_ORDERS_ROUTING_KEY ?? 'orders.#',
      enabled: true,
    },
  ],
  consumerOptions: {
    enableDeduplication: true,
    deduplicationWindow: parseInt(
      process.env.MESSAGE_DEDUPLICATION_WINDOW ?? '60000',
      10,
    ),
  },
};

// Create InteropService instance
const interopService = new InteropService(interopConfig);

// Create Express app
const app: Express = express();

app.use(cors());
app.use(express.json());

// Swagger UI
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    service: config.name,
    version: config.version,
    message: 'SMILE Interop Layer - CloudEvents to OpenHIM Bridge',
    status: interopService.isServiceRunning() ? 'running' : 'stopped',
  });
});

// Health check endpoint
app.get('/health', (_req, res) => {
  const serviceHealth = interopService.getHealth();

  // Return comprehensive health information (not constrained by basic HealthCheck type)
  const health = {
    // Basic health check fields
    status: serviceHealth.status, // 'healthy' | 'unhealthy' | 'degraded'
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: config.version,

    // Detailed service information
    service: {
      name: config.name,
      running: interopService.isServiceRunning(),
    },

    // RabbitMQ connection details
    rabbitmq: {
      connected: serviceHealth.rabbitmq.isHealthy,
      state: serviceHealth.rabbitmq.state,
      uptime: serviceHealth.rabbitmq.uptime,
      reconnectAttempts: serviceHealth.rabbitmq.reconnectAttempts,
      activeChannels: serviceHealth.rabbitmq.activeChannels,
    },

    // Consumer details
    consumers: {
      active: serviceHealth.activeConsumers,
      total: serviceHealth.totalConsumers,
    },
  };

  const statusCode = serviceHealth.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Statistics endpoint
app.get('/stats', (_req, res) => {
  const stats = interopService.getStats();
  res.json(stats);
});

// Graceful shutdown handler
async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  try {
    // Stop InteropService
    await interopService.stop();
    logger.info('InteropService stopped successfully');

    // Close HTTP server if it's running
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', {
      error: (error as Error).message,
    });
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start the service
if (require.main === module) {
  (async () => {
    try {
      logger.info('Starting Interop Layer...', {
        environment: config.environment,
        port: config.port,
      });

      // Start InteropService
      await interopService.start();

      // Start HTTP server
      app.listen(config.port, () => {
        logger.info('HTTP server started', {
          service: config.name,
          port: config.port,
          version: config.version,
        });
      });
    } catch (error) {
      logger.error('Failed to start Interop Layer', {
        error: (error as Error).message,
      });
      process.exit(1);
    }
  })();
}

export default app;
export { interopService };