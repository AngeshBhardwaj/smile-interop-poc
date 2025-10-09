import 'dotenv/config';
import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { logger } from '@smile/common';
import { HealthEventService, HealthEventServiceConfig } from './services/health-event.service';
import { HealthController } from './controllers/health.controller';
import {
  securityHeaders,
  requestCorrelation,
  auditLogging,
  authentication,
  healthDataAuthorization,
  errorHandler,
  validateContentType,
  rateLimitHeaders,
} from './middleware/security.middleware';

/**
 * SMILE Health Service - HIPAA Compliant Health Events API
 *
 * This service provides REST endpoints for health domain events with:
 * - PII/PHI compliant data handling
 * - HIPAA audit logging
 * - CloudEvent emission
 * - Comprehensive security controls
 */

// Environment configuration
const config = {
  port: parseInt(process.env.HEALTH_SERVICE_PORT || '3003', 10),
  rabbitmqUrl: process.env.RABBITMQ_URL || 'amqp://admin:admin123@localhost:5672',
  exchange: process.env.HEALTH_EVENTS_EXCHANGE || 'health.events',
  routingKeyPrefix: process.env.HEALTH_ROUTING_PREFIX || 'health',
  facilityId: process.env.FACILITY_ID || 'facility-001',
  facilityName: process.env.FACILITY_NAME || 'SMILE Health Center',
  departmentId: process.env.DEPARTMENT_ID || 'general',
  departmentName: process.env.DEPARTMENT_NAME || 'General Health Services',
  nodeEnv: process.env.NODE_ENV || 'development',
};

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SMILE Health Service API',
      version: '1.0.0',
      description: `
        HIPAA-compliant Health Events API for clinical data management.

        ## Security & Compliance
        - All endpoints require authentication
        - PII/PHI data is automatically masked in responses
        - Complete audit logging for HIPAA compliance
        - Rate limiting and security headers applied

        ## Event Types Supported
        - Patient Registration
        - Appointment Scheduling
        - Vital Signs Recording
        - Clinical Notifications
        - Lab Results Reporting
        - Medication Prescriptions
      `,
      contact: {
        name: 'SMILE Health Team',
        email: 'health-team@smile.example.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            correlationId: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        HealthResponse: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            service: { type: 'string' },
            version: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
            uptime: { type: 'number' },
            correlationId: { type: 'string' },
          },
        },
      },
    },
    security: [
      { BearerAuth: [] },
      { ApiKeyAuth: [] },
    ],
  },
  apis: ['src/controllers/*.ts', 'src/index.ts'],
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);

// Rate limiting configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      userAgent: req.headers['user-agent'],
    });
    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: '15 minutes',
      timestamp: new Date().toISOString(),
    });
  },
});

/**
 * Create and configure the Express application
 */
function createApp(): Express {
  const app: Express = express();

  // Trust proxy for accurate IP addresses
  app.set('trust proxy', 1);

  // Basic middleware
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true,
    optionsSuccessStatus: 200,
  }));

  // Security middleware stack
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }));

  app.use(securityHeaders);
  app.use(rateLimitHeaders);
  app.use(limiter);
  app.use(requestCorrelation);
  app.use(auditLogging);

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(validateContentType(['application/json']));

  return app;
}

/**
 * Configure API routes
 */
function configureRoutes(app: Express, healthController: HealthController): void {
  // API Documentation
  app.get('/api/docs/swagger.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(swaggerDocs);
  });

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs, {
    explorer: true,
    customSiteTitle: 'SMILE Health Service API',
    customfavIcon: '/favicon.ico',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerUrl: '/api/docs/swagger.json',
  }));

  // Public health check (no auth required)
  app.get('/health', healthController.healthCheck);
  app.get('/api/v1/health', healthController.healthCheck);

  // Protected API routes (require authentication and authorization)
  const apiRouter = express.Router();
  apiRouter.use(authentication);
  apiRouter.use(healthDataAuthorization);

  // Health event endpoints
  apiRouter.post('/patients', healthController.registerPatient);
  apiRouter.post('/appointments', healthController.scheduleAppointment);
  apiRouter.post('/vitals', healthController.recordVitalSigns);
  apiRouter.post('/notifications', healthController.sendNotification);
  apiRouter.post('/lab-results', healthController.reportLabResults);
  apiRouter.post('/medications', healthController.prescribeMedication);

  // Mount API router
  app.use('/api/v1', apiRouter);

  // 404 handler
  app.use('*', (req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: 'The requested resource was not found',
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    });
  });

  // Global error handler
  app.use(errorHandler);
}

/**
 * Initialize and start the health service
 */
async function startServer(): Promise<void> {
  try {
    // Create Express app
    const app = createApp();

    // Initialize health event service
    const healthEventServiceConfig: HealthEventServiceConfig = {
      rabbitmqUrl: config.rabbitmqUrl,
      exchange: config.exchange,
      routingKeyPrefix: config.routingKeyPrefix,
      facilityId: config.facilityId,
      facilityName: config.facilityName,
      departmentId: config.departmentId,
      departmentName: config.departmentName,
    };

    const healthEventService = new HealthEventService(healthEventServiceConfig);
    await healthEventService.initialize();

    // Initialize controller
    const healthController = new HealthController(healthEventService);

    // Configure routes
    configureRoutes(app, healthController);

    // Start HTTP server
    const server = app.listen(config.port, () => {
      logger.info('🏥 SMILE Health Service started successfully', {
        port: config.port,
        environment: config.nodeEnv,
        facilityId: config.facilityId,
        exchange: config.exchange,
        apiDocs: `http://localhost:${config.port}/api/docs`,
      });
    });

    // Graceful shutdown handling
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      // Close HTTP server
      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          // Close health event service connections
          await healthEventService.close();
          logger.info('Health event service closed');

          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during graceful shutdown', { error });
          process.exit(1);
        }
      });

      // Force exit if graceful shutdown takes too long
      setTimeout(() => {
        logger.error('Forceful shutdown due to timeout');
        process.exit(1);
      }, 10000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error });
      gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', { reason, promise });
      gracefulShutdown('unhandledRejection');
    });

  } catch (error) {
    logger.error('Failed to start health service', { error });
    process.exit(1);
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  startServer().catch((error) => {
    logger.error('Failed to start server', { error });
    process.exit(1);
  });
}

export { createApp, startServer };
export default createApp;