/**
 * Mock Pharmacy Client Service
 * Represents an external pharmacy system submitting orders via OpenHIM
 */

import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 4201;
const SERVICE_NAME = process.env.SERVICE_NAME || 'Pharmacy';

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
        name: 'Orders',
        description: 'Order management endpoints',
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
const submittedOrders: any[] = [];

/**
 * @swagger
 * /orders:
 *   post:
 *     tags: [Orders]
 *     summary: Submit pharmacy order
 *     description: |
 *       Submit an order in pharmacy format to be processed by OpenHIM.
 *       The order is forwarded to OpenHIM's /orders-inbound channel with pharmacy-system credentials.
 *       The adapter-mediator transforms the pharmacy format to Orders Service format.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pharmacy_order_id, action, items, facility, requested_by]
 *             properties:
 *               pharmacy_order_id:
 *                 type: string
 *                 example: "PHARM-2025-001"
 *                 description: Unique identifier for the pharmacy order
 *               action:
 *                 type: string
 *                 example: "create_order"
 *                 description: Action to perform (currently only create_order is supported)
 *               items:
 *                 type: array
 *                 description: List of medicine items. Can be simple strings or structured objects.
 *                 examples:
 *                   - ["Aspirin 500mg", "Ibuprofen 200mg"]
 *                   - [{"medicineId": "MED-001", "name": "Aspirin", "quantity": 100}]
 *                 items:
 *                   oneOf:
 *                     - type: string
 *                       example: "Aspirin 500mg"
 *                     - type: object
 *                       properties:
 *                         medicineId:
 *                           type: string
 *                           example: "MED-001"
 *                         name:
 *                           type: string
 *                           example: "Aspirin"
 *                         category:
 *                           type: string
 *                           example: "medicine-supplies"
 *                         quantity:
 *                           type: number
 *                           example: 100
 *               facility:
 *                 type: string
 *                 example: "Central Hospital"
 *                 description: Facility/hospital where the order is submitted
 *               requested_by:
 *                 type: string
 *                 example: "Dr. Smith"
 *                 description: Name of the person requesting the order
 *               priority:
 *                 type: string
 *                 example: "normal"
 *                 description: Order priority (optional, defaults to normal)
 *               requiredDate:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-10-31T10:31:21.095Z"
 *                 description: When the order is required by (optional)
 *               deliveryAddress:
 *                 type: object
 *                 description: Delivery address details (optional)
 *                 properties:
 *                   street:
 *                     type: string
 *                   city:
 *                     type: string
 *                   state:
 *                     type: string
 *                   zipCode:
 *                     type: string
 *                   country:
 *                     type: string
 *     responses:
 *       200:
 *         description: Order submitted and forwarded to OpenHIM successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Pharmacy order submitted successfully"
 *                 system:
 *                   type: string
 *                   example: "Pharmacy Order Management"
 *                 submittedAt:
 *                   type: string
 *                   format: date-time
 *                   example: "2025-10-24T10:31:20.992Z"
 *                 requestNumber:
 *                   type: integer
 *                   example: 1
 *                 pharmacy_order_id:
 *                   type: string
 *                 status:
 *                   type: string
 *                   example: "submitted"
 *                 orders_service_status:
 *                   type: string
 *                   example: "pending_processing"
 *                 openHIMResponse:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: integer
 *                       example: 200
 *                     message:
 *                       type: string
 *                       example: "Order forwarded to OpenHIM successfully"
 */
app.post('/orders', async (req: Request, res: Response) => {
  requestCounter++;
  const submittedAt = new Date().toISOString();

  // Store the submitted order
  const orderRecord = {
    requestNumber: requestCounter,
    submittedAt,
    headers: req.headers,
    body: req.body,
  };
  submittedOrders.push(orderRecord);

  console.log('========================================');
  console.log(`[${submittedAt}] Pharmacy Order Submitted #${requestCounter}`);
  console.log('========================================');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('\nPharmacy Order Data (Pharmacy Format):');
  console.log(JSON.stringify(req.body, null, 2));
  console.log('========================================\n');

  // Extract pharmacy order details
  const pharmacyOrder = req.body;
  const summary = {
    requestNumber: requestCounter,
    submittedAt,
    pharmacy_order_id: pharmacyOrder.pharmacy_order_id,
    action: pharmacyOrder.action,
    facility: pharmacyOrder.facility,
    requested_by: pharmacyOrder.requested_by,
    item_count: pharmacyOrder.items?.length || 0,
  };

  console.log('📋 Summary:', JSON.stringify(summary, null, 2));

  // Display items
  if (pharmacyOrder.items && pharmacyOrder.items.length > 0) {
    console.log('\n💊 Items:');
    pharmacyOrder.items.forEach((item: any, idx: number) => {
      console.log(`  ${idx + 1}. ${item}`);
    });
  }

  console.log('\n');

  // Forward order to OpenHIM channel with pharmacy-system credentials
  const openhimUrl = process.env.OPENHIM_ENDPOINT || 'http://openhim-core:5001/orders-inbound';
  const openhimUsername = 'pharmacy-system';
  const openhimPassword = 'password';

  // Create basic auth header
  const credentials = Buffer.from(`${openhimUsername}:${openhimPassword}`).toString('base64');

  console.log(`📤 Forwarding to OpenHIM: ${openhimUrl}`);

  try {
    const openhimResponse = await axios.post(openhimUrl, pharmacyOrder, {
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
      message: 'Pharmacy order submitted successfully',
      system: 'Pharmacy Order Management',
      submittedAt,
      requestNumber: requestCounter,
      pharmacy_order_id: pharmacyOrder.pharmacy_order_id,
      status: 'submitted',
      orders_service_status: 'pending_processing',
      openHIMResponse: {
        status: openhimResponse.status,
        message: 'Order forwarded to OpenHIM successfully',
      },
    });
  } catch (error: any) {
    console.error('❌ Failed to forward to OpenHIM');
    console.error('Error:', error.message);

    // Still return success to pharmacy client but log the OpenHIM error
    res.status(200).json({
      message: 'Pharmacy order received locally but failed to forward to OpenHIM',
      system: 'Pharmacy Order Management',
      submittedAt,
      requestNumber: requestCounter,
      pharmacy_order_id: pharmacyOrder.pharmacy_order_id,
      status: 'submitted',
      orders_service_status: 'pending_processing',
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
 *     description: Check if the pharmacy client service is running
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
    service: 'mock-client-pharmacy',
    system: 'Pharmacy Order Management',
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
 *     tags: [Orders]
 *     summary: Get all submitted orders
 *     description: Retrieve all orders submitted by this pharmacy client
 *     responses:
 *       200:
 *         description: List of all submitted orders
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 service:
 *                   type: string
 *                 totalOrders:
 *                   type: integer
 *                 orders:
 *                   type: array
 */
app.get('/orders', (req: Request, res: Response) => {
  res.status(200).json({
    service: 'mock-client-pharmacy',
    system: 'Pharmacy Order Management',
    totalOrders: submittedOrders.length,
    orders: submittedOrders,
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /orders/latest:
 *   get:
 *     tags: [Orders]
 *     summary: Get latest submitted order
 *     description: Retrieve the most recently submitted order
 *     responses:
 *       200:
 *         description: Latest order details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 service:
 *                   type: string
 *                 order:
 *                   type: object
 *       404:
 *         description: No orders submitted yet
 */
app.get('/orders/latest', (req: Request, res: Response) => {
  if (submittedOrders.length === 0) {
    return res.status(404).json({
      message: 'No orders submitted yet',
      service: 'mock-client-pharmacy',
      timestamp: new Date().toISOString(),
    });
  }

  const latestOrder = submittedOrders[submittedOrders.length - 1];
  res.status(200).json({
    service: 'mock-client-pharmacy',
    system: 'Pharmacy Order Management',
    order: latestOrder,
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /orders:
 *   delete:
 *     tags: [Orders]
 *     summary: Clear all orders
 *     description: Delete all submitted orders (for testing purposes)
 *     responses:
 *       200:
 *         description: Orders cleared successfully
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
  const clearedCount = submittedOrders.length;
  submittedOrders.length = 0;
  requestCounter = 0;

  res.status(200).json({
    message: 'All orders cleared',
    clearedCount,
    service: 'mock-client-pharmacy',
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(PORT, () => {
  console.log('========================================');
  console.log('💊 Mock Pharmacy Client Service Started');
  console.log('========================================');
  console.log(`System: ${SERVICE_NAME} Order Management`);
  console.log(`Port: ${PORT}`);
  console.log(`Format: Pharmacy-specific JSON`);
  console.log('');
  console.log('Endpoints:');
  console.log(`  POST   /orders          - Submit order`);
  console.log(`  GET    /orders          - Get all submitted orders`);
  console.log(`  GET    /orders/latest   - Get latest order`);
  console.log(`  DELETE /orders          - Clear all orders`);
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
