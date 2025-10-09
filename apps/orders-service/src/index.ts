import 'dotenv/config';
import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { logger } from '@smile/common';
import { OrderEventService, OrderEventServiceConfig } from './services/order-event.service';
import { OrderService } from './services/order.service';
import { OrderController } from './controllers/order.controller';
import {
  businessSecurityHeaders,
  requestCorrelation,
  businessAuditLogging,
  businessAuthentication,
  businessAuthorization,
  businessErrorHandler,
  validateContentType,
  rateLimitHeaders,
  requestTimeout
} from './middleware/business.middleware';

/**
 * SMILE Orders Service - Business Order Lifecycle Management
 *
 * This service provides REST endpoints for order management with:
 * - Complete CRUD operations for orders
 * - State-driven workflow management
 * - CloudEvent emission for business events
 * - Business-focused security (no PII/PHI concerns)
 */

// Environment configuration
const config = {
  port: parseInt(process.env.ORDERS_SERVICE_PORT || '3004', 10),
  rabbitmqUrl: process.env.RABBITMQ_URL || 'amqp://admin:admin123@localhost:5672',
  exchange: process.env.ORDERS_EVENTS_EXCHANGE || 'orders.events',
  routingKeyPrefix: process.env.ORDERS_ROUTING_PREFIX || 'orders',
  facilityId: process.env.FACILITY_ID || 'facility-001',
  facilityName: process.env.FACILITY_NAME || 'SMILE Medical Center',
  departmentId: process.env.DEPARTMENT_ID || 'purchasing',
  departmentName: process.env.DEPARTMENT_NAME || 'Purchasing Department',
  nodeEnv: process.env.NODE_ENV || 'development',
};

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SMILE Orders Service API',
      version: '1.0.0',
      description: `
        Business-focused Order Lifecycle Management API for hospital materials and supplies.

        ## Order Workflow States
        \`\`\`
        DRAFT → SUBMITTED → APPROVED → PACKED → SHIPPED → RECEIVED → FULFILLED
          ↑                  ↓                              ↓
          ← ← ← ← ← ← ← ← REJECTED                      RETURNED → RETURN_COMPLETE
                      (If not approved)            (If not received properly)
        \`\`\`

        ## Features
        - Complete order lifecycle management
        - State-driven workflow with validation
        - Role-based access control
        - CloudEvent emission for integrations
        - Comprehensive audit trails
        - Support for medicines, equipment, supplies, and vaccines

        ## Order Types Supported
        - **Medicines**: Pharmaceuticals, prescriptions, controlled substances
        - **Equipment**: Medical devices, diagnostic equipment, furniture
        - **Supplies**: Surgical supplies, general consumables, protective equipment
        - **Vaccines**: Immunizations, biological products

        ## Security
        - Bearer token authentication
        - API key support for service-to-service calls
        - Role-based authorization
        - Request correlation and audit logging
        - Rate limiting and security headers
      `,
      contact: {
        name: 'SMILE Orders Team',
        email: 'orders-team@smile.example.com',
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
        OrderStatus: {
          type: 'string',
          enum: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PACKED', 'SHIPPED', 'RECEIVED', 'FULFILLED', 'RETURNED', 'RETURN_COMPLETE']
        },
        OrderType: {
          type: 'string',
          enum: ['medicine', 'equipment', 'supplies', 'vaccines']
        },
        OrderPriority: {
          type: 'string',
          enum: ['low', 'normal', 'high', 'urgent']
        }
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
  max: 2000, // higher limit for business operations
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

  app.use(businessSecurityHeaders);
  app.use(rateLimitHeaders);
  app.use(limiter);
  app.use(requestTimeout(30000)); // 30 second timeout
  app.use(requestCorrelation);
  app.use(businessAuditLogging);

  // Body parsing middleware
  app.use(express.json({ limit: '5mb' })); // Smaller limit for business data
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));
  app.use(validateContentType(['application/json']));

  return app;
}

/**
 * Configure API routes
 */
function configureRoutes(app: Express, orderController: OrderController): void {
  // API Documentation
  app.get('/api/docs/swagger.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(swaggerDocs);
  });

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs, {
    explorer: true,
    customSiteTitle: 'SMILE Orders Service API',
    customfavIcon: '/favicon.ico',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerUrl: '/api/docs/swagger.json',
  }));

  // Public health check (no auth required)
  app.get('/health', orderController.healthCheck);
  app.get('/api/v1/health', orderController.healthCheck);

  // Protected API routes (require authentication and authorization)
  const apiRouter = express.Router();
  apiRouter.use(businessAuthentication);
  apiRouter.use(businessAuthorization);

  // Core CRUD endpoints
  apiRouter.get('/orders', orderController.listOrders);
  apiRouter.get('/orders/:orderId', orderController.getOrder);
  apiRouter.post('/orders', orderController.createOrder);
  apiRouter.put('/orders/:orderId', orderController.updateOrder);
  apiRouter.delete('/orders/:orderId', orderController.deleteOrder);

  // State transition endpoints
  apiRouter.post('/orders/:orderId/submit', orderController.submitOrder);
  apiRouter.post('/orders/:orderId/approve', orderController.approveOrder);
  apiRouter.post('/orders/:orderId/reject', orderController.rejectOrder);

  // Fulfillment endpoints
  apiRouter.post('/orders/:orderId/pack', orderController.packOrder);
  apiRouter.post('/orders/:orderId/ship', orderController.shipOrder);
  apiRouter.post('/orders/:orderId/receive', orderController.receiveOrder);
  apiRouter.post('/orders/:orderId/fulfill', orderController.fulfillOrder);

  // Return endpoints
  apiRouter.post('/orders/:orderId/return', orderController.returnOrder);
  apiRouter.post('/orders/:orderId/complete-return', orderController.completeReturn);

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
  app.use(businessErrorHandler);
}

/**
 * Initialize and start the orders service
 */
async function startServer(): Promise<void> {
  try {
    // Create Express app
    const app = createApp();

    // Initialize order event service
    const orderEventServiceConfig: OrderEventServiceConfig = {
      rabbitmqUrl: config.rabbitmqUrl,
      exchange: config.exchange,
      facilityId: config.facilityId,
      facilityName: config.facilityName,
      departmentId: config.departmentId,
      departmentName: config.departmentName,
    };

    const orderEventService = new OrderEventService(orderEventServiceConfig);
    await orderEventService.initialize();

    // Initialize services
    const orderService = new OrderService(orderEventService);

    // Initialize controller
    const orderController = new OrderController(orderService);

    // Configure routes
    configureRoutes(app, orderController);

    // Start HTTP server
    const server = app.listen(config.port, () => {
      logger.info('🏢 SMILE Orders Service started successfully', {
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
          // Close order event service connections
          await orderEventService.close();
          logger.info('Order event service closed');

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
    logger.error('Failed to start orders service', { error });
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