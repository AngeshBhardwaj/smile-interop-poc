/**
 * Transformation Mediator - Main Entry Point
 *
 * OpenHIM mediator that transforms CloudEvents to various formats:
 * - Custom JSON with JSONPath-based field mapping
 * - HL7 v2 messages (placeholder)
 * - FHIR R4 resources (placeholder)
 */

import express, { Express } from 'express';
import bodyParser from 'body-parser';
import { config } from './config';
import { getLogger } from './utils/logger';
import { registerWithOpenHIM, unregisterFromOpenHIM } from './utils/registration';
import { loadRules } from './rules/rule-loader';
import transformRoutes from './routes/transform.routes';

const logger = getLogger('main');

/**
 * Initialize Express application
 */
function createApp(): Express {
  const app = express();

  // Body parser middleware
  // Parse application/json and application/cloudevents+json
  app.use(bodyParser.json({
    limit: '10mb',
    type: ['application/json', 'application/cloudevents+json']
  }));
  app.use(bodyParser.urlencoded({ extended: true }));

  // Request logging middleware
  app.use((req, res, next) => {
    const startTime = Date.now();
    const correlationId = (req.headers['x-correlation-id'] as string) || `req-${Date.now()}`;

    // Add correlation ID to request for downstream use
    (req as any).correlationId = correlationId;

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      logger.info({
        msg: 'Request completed',
        method: req.method,
        url: req.url,
        status: res.statusCode,
        duration,
        correlationId,
      });
    });

    next();
  });

  // Mount routes
  app.use('/', transformRoutes);

  // 404 handler
  app.use((req, res) => {
    logger.warn({
      msg: 'Route not found',
      method: req.method,
      url: req.url,
    });

    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.method} ${req.url} not found`,
      timestamp: new Date().toISOString(),
    });
  });

  // Error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error({
      msg: 'Unhandled error',
      error: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: err.message || 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}

/**
 * Start the server
 */
async function start(): Promise<void> {
  try {
    logger.info({
      msg: 'Starting Transformation Mediator',
      version: '1.0.0',
      env: config.service.env,
      port: config.service.port,
    });

    // Step 1: Load transformation rules
    logger.info({ msg: 'Loading transformation rules' });
    const rulesResult = await loadRules();

    if (!rulesResult.success || !rulesResult.rules || rulesResult.rules.length === 0) {
      logger.error({
        msg: 'Failed to load transformation rules',
        errors: rulesResult.errors,
      });
      throw new Error('Cannot start without transformation rules');
    }

    logger.info({
      msg: 'Transformation rules loaded successfully',
      count: rulesResult.rules.length,
      rules: rulesResult.rules.map((r) => ({
        name: r.name,
        eventType: r.eventType,
        targetFormat: r.targetFormat,
      })),
    });

    // Step 2: Create Express app
    const app = createApp();

    // Step 3: Start HTTP server
    const server = app.listen(config.service.port, () => {
      logger.info({
        msg: 'Transformation Mediator HTTP server started',
        port: config.service.port,
        endpoints: [
          `POST http://localhost:${config.service.port}/transform`,
          `GET http://localhost:${config.service.port}/health`,
        ],
      });
    });

    // Step 4: Register with OpenHIM
    try {
      await registerWithOpenHIM();
      logger.info({ msg: 'OpenHIM registration completed successfully' });
    } catch (error: any) {
      logger.error({
        msg: 'Failed to register with OpenHIM',
        error: error.message,
      });
      // Don't exit - mediator can still work without OpenHIM registration
    }

    logger.info({
      msg: 'Transformation Mediator is ready',
      port: config.service.port,
      rulesLoaded: rulesResult.rules.length,
    });

    // Graceful shutdown handlers
    const shutdown = async (signal: string) => {
      logger.info({
        msg: 'Received shutdown signal',
        signal,
      });

      // Close HTTP server
      server.close(() => {
        logger.info({ msg: 'HTTP server closed' });
      });

      // Unregister from OpenHIM
      unregisterFromOpenHIM();

      // Give some time for cleanup
      setTimeout(() => {
        logger.info({ msg: 'Shutdown complete' });
        process.exit(0);
      }, 1000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Uncaught exception handler
    process.on('uncaughtException', (error) => {
      logger.fatal({
        msg: 'Uncaught exception',
        error: error.message,
        stack: error.stack,
      });
      process.exit(1);
    });

    // Unhandled rejection handler
    process.on('unhandledRejection', (reason: any) => {
      logger.fatal({
        msg: 'Unhandled promise rejection',
        reason: reason?.message || reason,
        stack: reason?.stack,
      });
      process.exit(1);
    });
  } catch (error: any) {
    logger.fatal({
      msg: 'Failed to start Transformation Mediator',
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

// Start the server
start();
