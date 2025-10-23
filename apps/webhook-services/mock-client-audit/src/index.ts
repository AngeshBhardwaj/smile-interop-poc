/**
 * Mock Audit Client Service with Authentication
 * Simulates an audit/compliance system requiring Basic Authentication
 * Demonstrates credential handling through OpenHIM routes
 */

import express, { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const app = express();
const PORT = process.env.PORT || 3201;
const CLIENT_NAME = process.env.CLIENT_NAME || 'Audit Compliance Client';

// Authentication credentials
const EXPECTED_USERNAME = process.env.AUDIT_USERNAME || 'audit-user';
const EXPECTED_PASSWORD = process.env.AUDIT_PASSWORD || 'audit-secure-pass';

// Swagger Configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Mock Audit Client API',
      version: '1.0.0',
      description: 'Mock audit/compliance system requiring Basic Authentication',
      contact: {
        name: 'SMILE POC',
      },
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Local development server',
      },
    ],
    tags: [
      {
        name: 'Orders',
        description: 'Audit trail management endpoints',
      },
      {
        name: 'System',
        description: 'System health and statistics',
      },
    ],
    securityDefinitions: {
      basicAuth: {
        type: 'basic',
      },
    },
  },
  apis: ['./src/index.ts', './dist/index.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Audit Client API',
  customCss: '.swagger-ui .topbar { display: none }',
}));

// Request counter and storage
let requestCounter = 0;
const receivedAuditTrails: any[] = [];

/**
 * Basic Authentication Middleware
 * Validates credentials for protected endpoints
 */
function authenticateRequest(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];

  // Skip auth for health endpoint
  if (req.path === '/health' || req.path === '/api-docs' || req.path.startsWith('/api-docs')) {
    return next();
  }

  if (!authHeader) {
    console.log('[AUTH] Missing authorization header');
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing Authorization header. Expected: Authorization: Basic <base64(username:password)>',
      timestamp: new Date().toISOString(),
    });
  }

  // Parse Basic Auth
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'basic') {
    console.log('[AUTH] Invalid authorization format:', parts[0]);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid Authorization header format. Expected: Basic <base64>',
      timestamp: new Date().toISOString(),
    });
  }

  // Decode credentials
  const credentials = Buffer.from(parts[1], 'base64').toString('utf-8');
  const [username, password] = credentials.split(':');

  // Validate credentials
  if (username !== EXPECTED_USERNAME || password !== EXPECTED_PASSWORD) {
    console.log(`[AUTH] Authentication failed for user: ${username}`);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid credentials',
      timestamp: new Date().toISOString(),
    });
  }

  // Store auth info in request for logging
  (req as any).authenticatedUser = username;
  console.log(`[AUTH] Successfully authenticated user: ${username}`);
  next();
}

// Apply authentication to all endpoints except health
app.use(authenticateRequest);

/**
 * @swagger
 * /orders:
 *   post:
 *     tags: [Orders]
 *     summary: Receive audit trail
 *     description: Receive and store an audit trail entry (requires Basic Auth)
 *     security:
 *       - basicAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               orderId:
 *                 type: string
 *               statusHistory:
 *                 type: array
 *               compliance:
 *                 type: object
 */
app.post('/orders', (req: Request, res: Response) => {
  requestCounter++;
  const receivedAt = new Date().toISOString();
  const authenticatedUser = (req as any).authenticatedUser || 'system';

  // Store the received audit trail
  const auditRecord = {
    requestNumber: requestCounter,
    receivedAt,
    authenticatedUser,
    headers: req.headers,
    body: req.body,
  };
  receivedAuditTrails.push(auditRecord);

  console.log('========================================');
  console.log(`[${receivedAt}] Audit Trail Received #${requestCounter}`);
  console.log(`[AUTH] Authenticated User: ${authenticatedUser}`);
  console.log('========================================');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('\nAudit Trail Data:');
  console.log(JSON.stringify(req.body, null, 2));
  console.log('========================================\n');

  // Extract key information from audit trail
  const auditTrail = req.body;
  const summary = {
    requestNumber: requestCounter,
    receivedAt,
    authenticatedUser,
    orderId: auditTrail.orderId,
    statusHistory: auditTrail.statusHistory?.length || 0,
    compliance: {
      auditRequired: auditTrail.compliance?.auditRequired,
      dataClassification: auditTrail.compliance?.dataClassification,
      retentionDays: auditTrail.compliance?.retentionDays,
    },
  };

  console.log('📊 Summary:', JSON.stringify(summary, null, 2));

  // Display status history
  if (auditTrail.statusHistory && auditTrail.statusHistory.length > 0) {
    console.log('\n📋 Status History:');
    auditTrail.statusHistory.forEach((status: any, index: number) => {
      console.log(`  ${index + 1}. [${status.timestamp}] ${status.status} - ${status.reason} (${status.actor})`);
    });
  }

  console.log('\n');

  // Send success response
  res.status(200).json({
    message: 'Audit trail received and logged successfully',
    system: CLIENT_NAME,
    receivedAt,
    requestNumber: requestCounter,
    orderId: auditTrail.orderId,
    status: 'logged',
    auditId: `AUDIT-${Date.now()}`,
    authenticatedUser,
    complianceStatus: 'verified',
  });
});

/**
 * @swagger
 * /health:
 *   get:
 *     tags: [System]
 *     summary: Health check
 *     description: Check if the audit client service is running (no auth required)
 *     responses:
 *       200:
 *         description: Service is healthy
 */
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'mock-client-audit',
    system: CLIENT_NAME,
    version: '1.0.0',
    port: PORT,
    requestsReceived: requestCounter,
    authenticationRequired: true,
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /stats:
 *   get:
 *     tags: [System]
 *     summary: Service statistics
 *     description: Get audit client service statistics (requires Basic Auth)
 *     security:
 *       - basicAuth: []
 */
app.get('/stats', (req: Request, res: Response) => {
  const authenticatedUser = (req as any).authenticatedUser || 'system';

  res.status(200).json({
    service: 'mock-client-audit',
    system: CLIENT_NAME,
    authenticatedUser,
    statistics: {
      totalAuditTrailsReceived: requestCounter,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /orders:
 *   get:
 *     tags: [Orders]
 *     summary: Get all received audit trails
 *     description: Retrieve all audit trails logged by this service (requires Basic Auth)
 *     security:
 *       - basicAuth: []
 */
app.get('/orders', (req: Request, res: Response) => {
  const authenticatedUser = (req as any).authenticatedUser || 'system';

  res.status(200).json({
    service: 'mock-client-audit',
    system: CLIENT_NAME,
    authenticatedUser,
    totalAuditTrails: receivedAuditTrails.length,
    auditTrails: receivedAuditTrails,
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /orders/latest:
 *   get:
 *     tags: [Orders]
 *     summary: Get latest audit trail
 *     description: Retrieve the most recently received audit trail (requires Basic Auth)
 *     security:
 *       - basicAuth: []
 */
app.get('/orders/latest', (req: Request, res: Response) => {
  const authenticatedUser = (req as any).authenticatedUser || 'system';

  if (receivedAuditTrails.length === 0) {
    return res.status(404).json({
      message: 'No audit trails received yet',
      service: 'mock-client-audit',
      authenticatedUser,
      timestamp: new Date().toISOString(),
    });
  }

  const latestTrail = receivedAuditTrails[receivedAuditTrails.length - 1];
  return res.status(200).json({
    service: 'mock-client-audit',
    system: CLIENT_NAME,
    authenticatedUser,
    auditTrail: latestTrail,
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /orders:
 *   delete:
 *     tags: [Orders]
 *     summary: Clear all audit trails
 *     description: Delete all audit trails (requires Basic Auth - for testing only)
 *     security:
 *       - basicAuth: []
 */
app.delete('/orders', (req: Request, res: Response) => {
  const authenticatedUser = (req as any).authenticatedUser || 'system';
  const clearedCount = receivedAuditTrails.length;
  receivedAuditTrails.length = 0;
  requestCounter = 0;

  res.status(200).json({
    message: 'All audit trails cleared',
    clearedCount,
    service: 'mock-client-audit',
    authenticatedUser,
    timestamp: new Date().toISOString(),
  });
});

// Error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(PORT, () => {
  console.log('========================================');
  console.log('📋 Mock Audit Client Service Started');
  console.log('========================================');
  console.log(`System: ${CLIENT_NAME}`);
  console.log(`Port: ${PORT}`);
  console.log(`Authentication: Basic Auth`);
  console.log(`Default Credentials:`);
  console.log(`  Username: ${EXPECTED_USERNAME}`);
  console.log(`  Password: ${EXPECTED_PASSWORD}`);
  console.log('');
  console.log('Endpoints:');
  console.log(`  POST   /orders          - Receive audit trail (requires auth)`);
  console.log(`  GET    /orders          - Get all audit trails (requires auth)`);
  console.log(`  GET    /orders/latest   - Get latest audit trail (requires auth)`);
  console.log(`  DELETE /orders          - Clear all audit trails (requires auth)`);
  console.log(`  GET    /health          - Health check (no auth required)`);
  console.log(`  GET    /stats           - Statistics (requires auth)`);
  console.log('');
  console.log('📚 Swagger UI:');
  console.log(`  http://localhost:${PORT}/api-docs`);
  console.log('========================================\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\nSIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received, shutting down gracefully...');
  process.exit(0);
});
