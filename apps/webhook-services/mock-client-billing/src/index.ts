/**
 * Mock Billing Client Service
 * Represents an external billing system submitting billing info via OpenHIM
 */

import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 4202;
const SERVICE_NAME = process.env.SERVICE_NAME || 'Billing';

// Swagger Configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: `Mock ${SERVICE_NAME} API`,
      version: '1.0.0',
      description: `Mock ${SERVICE_NAME.toLowerCase()} system for testing downstream integration with OpenHIM`,
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
        name: 'Billing',
        description: 'Billing information management endpoints',
      },
      {
        name: 'System',
        description: 'System health and statistics',
      },
    ],
  },
  apis: ['./src/index.ts', './dist/index.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: `${SERVICE_NAME} Client API`,
  customCss: '.swagger-ui .topbar { display: none }',
}));

// Request counter and storage
let requestCounter = 0;
const submittedBillings: any[] = [];

/**
 * @swagger
 * /orders:
 *   post:
 *     tags: [Billing]
 *     summary: Submit billing information
 *     description: |
 *       Submit billing/cost information for an order in billing format to be processed by OpenHIM.
 *       The billing information is forwarded to OpenHIM's /orders-inbound channel with billing-system credentials.
 *       The adapter-mediator transforms the billing format to Orders Service update format.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action, order_id, cost, currency, invoice_number, payment_status]
 *             properties:
 *               action:
 *                 type: string
 *                 example: "update_billing"
 *                 description: Action to perform (currently only update_billing is supported)
 *               order_id:
 *                 type: string
 *                 example: "ORD-12345"
 *                 description: Reference to the Orders Service order ID
 *               cost:
 *                 type: number
 *                 example: 1500.50
 *                 description: Total cost of the order
 *               currency:
 *                 type: string
 *                 example: "USD"
 *                 description: Currency code for the cost
 *               invoice_number:
 *                 type: string
 *                 example: "INV-2025-001"
 *                 description: Unique invoice identifier
 *               payment_status:
 *                 type: string
 *                 example: "pending"
 *                 enum: [pending, partial, paid, overdue, cancelled]
 *                 description: Current payment status
 *     responses:
 *       200:
 *         description: Billing information submitted and forwarded to OpenHIM successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Billing information submitted successfully"
 *                 system:
 *                   type: string
 *                   example: "Billing Management System"
 *                 submittedAt:
 *                   type: string
 *                   format: date-time
 *                 requestNumber:
 *                   type: integer
 *                 order_id:
 *                   type: string
 *                 status:
 *                   type: string
 *                   example: "submitted"
 *                 billing_status:
 *                   type: string
 *                   example: "recorded"
 *                 invoice_number:
 *                   type: string
 *                 openHIMResponse:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: integer
 *                       example: 200
 *                     message:
 *                       type: string
 *                       example: "Billing information forwarded to OpenHIM successfully"
 */
app.post('/orders', async (req: Request, res: Response) => {
  requestCounter++;
  const submittedAt = new Date().toISOString();

  // Store the submitted billing
  const billingRecord = {
    requestNumber: requestCounter,
    submittedAt,
    headers: req.headers,
    body: req.body,
  };
  submittedBillings.push(billingRecord);

  console.log('========================================');
  console.log(`[${submittedAt}] Billing Info Submitted #${requestCounter}`);
  console.log('========================================');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('\nBilling Information (Billing Format):');
  console.log(JSON.stringify(req.body, null, 2));
  console.log('========================================\n');

  // Extract billing details
  const billingInfo = req.body;
  const summary = {
    requestNumber: requestCounter,
    submittedAt,
    action: billingInfo.action,
    order_id: billingInfo.order_id,
    cost: billingInfo.cost,
    currency: billingInfo.currency,
    invoice_number: billingInfo.invoice_number,
    payment_status: billingInfo.payment_status,
  };

  console.log('💰 Summary:', JSON.stringify(summary, null, 2));
  console.log('\n');

  // Forward billing information to OpenHIM channel with billing-system credentials
  const openhimUrl = process.env.OPENHIM_ENDPOINT || 'http://openhim-core:5001/orders-inbound';
  const openhimUsername = 'billing-system';
  const openhimPassword = 'password';

  // Create basic auth header
  const credentials = Buffer.from(`${openhimUsername}:${openhimPassword}`).toString('base64');

  console.log(`📤 Forwarding to OpenHIM: ${openhimUrl}`);

  try {
    const openhimResponse = await axios.post(openhimUrl, billingInfo, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`,
      },
      timeout: 10000,
    });

    console.log('✅ Successfully forwarded to OpenHIM');
    console.log('OpenHIM Response:', JSON.stringify(openhimResponse.data, null, 2));

    // Send success response to client
    res.status(200).json({
      message: 'Billing information submitted successfully',
      system: 'Billing Management System',
      submittedAt,
      requestNumber: requestCounter,
      order_id: billingInfo.order_id,
      status: 'submitted',
      billing_status: 'recorded',
      invoice_number: billingInfo.invoice_number,
      openHIMResponse: {
        status: openhimResponse.status,
        message: 'Billing information forwarded to OpenHIM successfully',
      },
    });
  } catch (error: any) {
    console.error('❌ Failed to forward to OpenHIM');
    console.error('Error:', error.message);

    // Still return success to billing client but log the OpenHIM error
    res.status(200).json({
      message: 'Billing information received locally but failed to forward to OpenHIM',
      system: 'Billing Management System',
      submittedAt,
      requestNumber: requestCounter,
      order_id: billingInfo.order_id,
      status: 'submitted',
      billing_status: 'recorded',
      invoice_number: billingInfo.invoice_number,
      openHIMError: error.message,
    });
  }
});

/**
 * @swagger
 * /health:
 *   get:
 *     tags: [System]
 *     summary: Health check
 *     description: Check if the billing client service is running
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 service:
 *                   type: string
 *                 system:
 *                   type: string
 */
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'mock-client-billing',
    system: 'Billing Management System',
    version: '1.0.0',
    port: PORT,
    requestsSubmitted: requestCounter,
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /orders:
 *   get:
 *     tags: [Billing]
 *     summary: Get all submitted billing records
 *     description: Retrieve all billing information submitted by this billing client
 *     responses:
 *       200:
 *         description: List of all submitted billing records
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 service:
 *                   type: string
 *                 totalBillings:
 *                   type: integer
 *                 billings:
 *                   type: array
 */
app.get('/orders', (req: Request, res: Response) => {
  res.status(200).json({
    service: 'mock-client-billing',
    system: 'Billing Management System',
    totalBillings: submittedBillings.length,
    billings: submittedBillings,
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /orders/latest:
 *   get:
 *     tags: [Billing]
 *     summary: Get latest submitted billing record
 *     description: Retrieve the most recently submitted billing information
 *     responses:
 *       200:
 *         description: Latest billing record details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 service:
 *                   type: string
 *                 billing:
 *                   type: object
 *       404:
 *         description: No billing records submitted yet
 */
app.get('/orders/latest', (req: Request, res: Response) => {
  if (submittedBillings.length === 0) {
    return res.status(404).json({
      message: 'No billing records submitted yet',
      service: 'mock-client-billing',
      timestamp: new Date().toISOString(),
    });
  }

  const latestBilling = submittedBillings[submittedBillings.length - 1];
  res.status(200).json({
    service: 'mock-client-billing',
    system: 'Billing Management System',
    billing: latestBilling,
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /orders:
 *   delete:
 *     tags: [Billing]
 *     summary: Clear all billing records
 *     description: Delete all submitted billing records (for testing purposes)
 *     responses:
 *       200:
 *         description: Billing records cleared successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 clearedCount:
 *                   type: integer
 */
app.delete('/orders', (req: Request, res: Response) => {
  const clearedCount = submittedBillings.length;
  submittedBillings.length = 0;
  requestCounter = 0;

  res.status(200).json({
    message: 'All billing records cleared',
    clearedCount,
    service: 'mock-client-billing',
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(PORT, () => {
  console.log('========================================');
  console.log('💰 Mock Billing Client Service Started');
  console.log('========================================');
  console.log(`System: ${SERVICE_NAME} Management System`);
  console.log(`Port: ${PORT}`);
  console.log(`Format: Billing-specific JSON`);
  console.log('');
  console.log('Endpoints:');
  console.log(`  POST   /orders          - Submit billing info`);
  console.log(`  GET    /orders          - Get all submitted billings`);
  console.log(`  GET    /orders/latest   - Get latest billing record`);
  console.log(`  DELETE /orders          - Clear all billing records`);
  console.log(`  GET    /health          - Health check`);
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
