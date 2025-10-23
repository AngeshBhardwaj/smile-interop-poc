/**
 * Mock Warehouse Client Service
 * Simulates a warehouse management system receiving custom JSON format
 */

import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const app = express();
const PORT = process.env.PORT || 3203;
const SERVICE_NAME = process.env.SERVICE_NAME || 'Client';

// Swagger Configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: `Mock ${SERVICE_NAME} API`,
      version: '1.0.0',
      description: `Mock ${SERVICE_NAME.toLowerCase()} system for testing multi-client fan-out with custom JSON format`,
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
const receivedOrders: any[] = [];

/**
 * @swagger
 * /orders:
 *   post:
 *     tags: [Orders]
 *     summary: Receive warehouse order
 *     description: Receive and store a warehouse order in custom JSON format from the transformation mediator
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               shipmentId:
 *                 type: string
 *                 example: "ORD-2025-001"
 *               orderType:
 *                 type: string
 *                 example: "medicines"
 *               fulfillmentStatus:
 *                 type: string
 *                 example: "SUBMITTED"
 *               priority:
 *                 type: string
 *                 example: "urgent"
 *               destination:
 *                 type: object
 *                 properties:
 *                   facilityCode:
 *                     type: string
 *                   facilityName:
 *                     type: string
 *     responses:
 *       200:
 *         description: Order received successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 system:
 *                   type: string
 *                 receivedAt:
 *                   type: string
 *                 requestNumber:
 *                   type: integer
 */
app.post('/orders', (req: Request, res: Response) => {
  requestCounter++;
  const receivedAt = new Date().toISOString();

  // Store the received order
  const orderRecord = {
    requestNumber: requestCounter,
    receivedAt,
    headers: req.headers,
    body: req.body,
  };
  receivedOrders.push(orderRecord);

  console.log('========================================');
  console.log(`[${receivedAt}] Warehouse Order Received #${requestCounter}`);
  console.log('========================================');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('\nWarehouse Order Data:');
  console.log(JSON.stringify(req.body, null, 2));
  console.log('========================================\n');

  // Extract key information from warehouse order
  const warehouseOrder = req.body;
  const summary = {
    requestNumber: requestCounter,
    receivedAt,
    shipmentId: warehouseOrder.shipmentId,
    orderType: warehouseOrder.orderType,
    fulfillmentStatus: warehouseOrder.fulfillmentStatus,
    priority: warehouseOrder.priority,
    destinationFacility: warehouseOrder.destination?.facilityCode,
    totalLineItems: warehouseOrder.lineItems?.length || 0,
    totalQuantity: warehouseOrder.summary?.totalQuantity,
    totalValue: warehouseOrder.summary?.totalValue,
    totalWeight: warehouseOrder.summary?.totalWeight,
    estimatedPackages: warehouseOrder.summary?.estimatedPackages,
  };

  console.log('📊 Summary:', JSON.stringify(summary, null, 2));

  // Display line items in a table format
  if (warehouseOrder.lineItems && warehouseOrder.lineItems.length > 0) {
    console.log('\n📦 Line Items:');
    console.log('Line | SKU | Description | Qty | UOM | Price | Total');
    console.log('-----|-----|-------------|-----|-----|-------|------');
    warehouseOrder.lineItems.forEach((item: any) => {
      console.log(`${item.lineNumber || ''} | ${item.sku || ''} | ${item.itemDescription || ''} | ${item.quantityOrdered || 0} | ${item.unitOfMeasure || ''} | $${item.unitPrice || 0} | $${item.totalPrice || 0}`);
    });
  }

  console.log('\n');

  // Send success response
  res.status(200).json({
    message: 'Warehouse order received successfully',
    system: 'Warehouse Management System',
    receivedAt,
    requestNumber: requestCounter,
    shipmentId: warehouseOrder.shipmentId,
    status: 'accepted',
    warehouseStatus: 'pending-fulfillment',
    estimatedProcessingTime: '2-4 hours',
    assignedTo: {
      warehouseZone: 'ZONE-A',
      pickingBatch: `BATCH-${Date.now()}`,
    },
  });
});

/**
 * @swagger
 * /health:
 *   get:
 *     tags: [System]
 *     summary: Health check
 *     description: Check if the warehouse client service is running
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
 *                 requestsReceived:
 *                   type: integer
 */
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'mock-client-warehouse',
    system: 'Warehouse Management System',
    version: '1.0.0',
    port: PORT,
    requestsReceived: requestCounter,
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /stats:
 *   get:
 *     tags: [System]
 *     summary: Service statistics
 *     description: Get warehouse client service statistics
 *     responses:
 *       200:
 *         description: Service statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 service:
 *                   type: string
 *                 statistics:
 *                   type: object
 *                   properties:
 *                     totalRequestsReceived:
 *                       type: integer
 *                     uptime:
 *                       type: number
 */
app.get('/stats', (req: Request, res: Response) => {
  res.status(200).json({
    service: 'mock-client-warehouse',
    system: 'Warehouse Management System',
    statistics: {
      totalRequestsReceived: requestCounter,
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
 *     summary: Get all received orders
 *     description: Retrieve all orders that have been received by this warehouse client
 *     responses:
 *       200:
 *         description: List of all received orders
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
 *                   items:
 *                     type: object
 */
app.get('/orders', (req: Request, res: Response) => {
  res.status(200).json({
    service: 'mock-client-warehouse',
    system: 'Warehouse Management System',
    totalOrders: receivedOrders.length,
    orders: receivedOrders,
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /orders/latest:
 *   get:
 *     tags: [Orders]
 *     summary: Get latest order
 *     description: Retrieve the most recently received order
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
 *         description: No orders received yet
 */
app.get('/orders/latest', (req: Request, res: Response) => {
  if (receivedOrders.length === 0) {
    return res.status(404).json({
      message: 'No orders received yet',
      service: 'mock-client-warehouse',
      timestamp: new Date().toISOString(),
    });
  }

  const latestOrder = receivedOrders[receivedOrders.length - 1];
  res.status(200).json({
    service: 'mock-client-warehouse',
    system: 'Warehouse Management System',
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
 *     description: Delete all received orders (for testing purposes)
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
  const clearedCount = receivedOrders.length;
  receivedOrders.length = 0;
  requestCounter = 0;

  res.status(200).json({
    message: 'All orders cleared',
    clearedCount,
    service: 'mock-client-warehouse',
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(PORT, () => {
  console.log('========================================');
  console.log('📦 Mock Warehouse Client Service Started');
  console.log('========================================');
  console.log(`System: Warehouse Management System`);
  console.log(`Port: ${PORT}`);
  console.log(`Format: Custom JSON`);
  console.log('');
  console.log('Endpoints:');
  console.log(`  POST   /orders          - Receive order`);
  console.log(`  GET    /orders          - Get all received orders`);
  console.log(`  GET    /orders/latest   - Get latest order`);
  console.log(`  DELETE /orders          - Clear all orders`);
  console.log(`  GET    /health          - Health check`);
  console.log(`  GET    /stats           - Statistics`);
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
