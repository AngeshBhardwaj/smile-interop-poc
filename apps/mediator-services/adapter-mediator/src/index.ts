/**
 * Adapter Mediator - Main Entry Point
 *
 * OpenHIM mediator that transforms downstream requests (Pharmacy/Billing)
 * to Orders Service format
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import { config, validateConfig } from './config';
import { logger } from './utils/logger';
import { registerWithOpenHIM, unregisterFromOpenHIM } from './utils/registration';
import transformRoutes from './routes/transform.routes';

/**
 * Create Express application
 */
function createApp(): Application {
  const app = express();

  // Middleware
  // Configure body parser to handle both application/json and application/cloudevents+json
  app.use(bodyParser.json({
    limit: '10mb',
    type: ['application/json', 'application/cloudevents+json']
  }));
  app.use(bodyParser.urlencoded({ extended: true }));

  // Request logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const correlationId = req.headers['x-correlation-id'] || req.headers['x-openhim-transactionid'];

    logger.info('Incoming request', {
      method: req.method,
      path: req.path,
      correlationId,
    });

    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info('Request completed', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        correlationId,
      });
    });

    next();
  });

  // Routes
  app.use('/', transformRoutes);

  // Root health check
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({
      status: 'healthy',
      service: 'adapter-mediator',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      path: req.path,
      method: req.method,
    });
  });

  // Global error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('Unhandled error', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: config.env === 'development' ? err.message : 'An error occurred',
    });
  });

  return app;
}

/**
 * Start server
 */
async function startServer() {
  try {
    // Validate configuration
    validateConfig();

    logger.info('Starting Adapter Mediator', {
      env: config.env,
      port: config.port,
      logLevel: config.logLevel,
    });

    // Create Express app
    const app = createApp();

    // Start HTTP server
    const server = app.listen(config.port, () => {
      logger.info('HTTP server started', {
        port: config.port,
        env: config.env,
      });
    });

    // Register with OpenHIM
    try {
      await registerWithOpenHIM();
      logger.info('OpenHIM registration successful');
    } catch (error: any) {
      logger.error('OpenHIM registration failed', {
        error: error.message,
        stack: error.stack,
      });
      // Don't exit - mediator can still function without OpenHIM registration
    }

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info('Received shutdown signal', { signal });

      // Unregister from OpenHIM
      unregisterFromOpenHIM();

      // Close HTTP server
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });

      // Force shutdown after timeout
      setTimeout(() => {
        logger.error('Forcefully shutting down after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      logger.fatal('Uncaught exception', {
        error: error.message,
        stack: error.stack,
      });
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any) => {
      logger.fatal('Unhandled promise rejection', {
        reason: reason?.message || reason,
        stack: reason?.stack,
      });
      process.exit(1);
    });

    logger.info('Adapter Mediator started successfully');
  } catch (error: any) {
    logger.fatal('Failed to start server', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

// Start server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

// Export for testing
export { createApp, startServer };
