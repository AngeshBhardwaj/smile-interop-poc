/**
 * Mock FHIR R4 Client Service
 * Simulates a hospital system receiving FHIR R4 ServiceRequest resources
 */

import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';

const app = express();
const PORT = process.env.PORT || 3201;

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));

// Request counter and storage
let requestCounter = 0;
const receivedOrders: any[] = [];

/**
 * POST /orders
 * Receive FHIR R4 ServiceRequest
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
  console.log(`[${receivedAt}] FHIR R4 Order Received #${requestCounter}`);
  console.log('========================================');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('\nFHIR ServiceRequest:');
  console.log(JSON.stringify(req.body, null, 2));
  console.log('========================================\n');

  // Extract key information from FHIR ServiceRequest
  const serviceRequest = req.body;
  const summary = {
    requestNumber: requestCounter,
    receivedAt,
    resourceType: serviceRequest.resourceType,
    id: serviceRequest.id,
    status: serviceRequest.status,
    intent: serviceRequest.intent,
    priority: serviceRequest.priority,
    code: serviceRequest.code?.text,
    subject: serviceRequest.subject?.display,
    authoredOn: serviceRequest.authoredOn,
    requester: serviceRequest.requester?.display,
    containedResources: serviceRequest.contained?.length || 0,
  };

  console.log('📊 Summary:', JSON.stringify(summary, null, 2));
  console.log('\n');

  // Send success response
  res.status(200).json({
    message: 'FHIR R4 ServiceRequest received successfully',
    system: 'Hospital FHIR R4 System',
    receivedAt,
    requestNumber: requestCounter,
    serviceRequestId: serviceRequest.id,
    status: 'accepted',
    processingStatus: 'queued',
  });
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'mock-client-fhir',
    system: 'Hospital FHIR R4 System',
    version: '1.0.0',
    port: PORT,
    requestsReceived: requestCounter,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /stats
 * Statistics endpoint
 */
app.get('/stats', (req: Request, res: Response) => {
  res.status(200).json({
    service: 'mock-client-fhir',
    system: 'Hospital FHIR R4 System',
    statistics: {
      totalRequestsReceived: requestCounter,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /orders
 * Retrieve all received orders
 */
app.get('/orders', (req: Request, res: Response) => {
  res.status(200).json({
    service: 'mock-client-fhir',
    system: 'Hospital FHIR R4 System',
    totalOrders: receivedOrders.length,
    orders: receivedOrders,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /orders/latest
 * Retrieve the most recent order
 */
app.get('/orders/latest', (req: Request, res: Response) => {
  if (receivedOrders.length === 0) {
    return res.status(404).json({
      message: 'No orders received yet',
      service: 'mock-client-fhir',
      timestamp: new Date().toISOString(),
    });
  }

  const latestOrder = receivedOrders[receivedOrders.length - 1];
  res.status(200).json({
    service: 'mock-client-fhir',
    system: 'Hospital FHIR R4 System',
    order: latestOrder,
    timestamp: new Date().toISOString(),
  });
});

/**
 * DELETE /orders
 * Clear all received orders (for testing)
 */
app.delete('/orders', (req: Request, res: Response) => {
  const clearedCount = receivedOrders.length;
  receivedOrders.length = 0;
  requestCounter = 0;

  res.status(200).json({
    message: 'All orders cleared',
    clearedCount,
    service: 'mock-client-fhir',
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(PORT, () => {
  console.log('========================================');
  console.log('🏥 Mock FHIR R4 Client Service Started');
  console.log('========================================');
  console.log(`System: Hospital FHIR R4 System`);
  console.log(`Port: ${PORT}`);
  console.log(`Format: FHIR R4 ServiceRequest`);
  console.log('');
  console.log('Endpoints:');
  console.log(`  POST   /orders          - Receive order`);
  console.log(`  GET    /orders          - Get all received orders`);
  console.log(`  GET    /orders/latest   - Get latest order`);
  console.log(`  DELETE /orders          - Clear all orders`);
  console.log(`  GET    /health          - Health check`);
  console.log(`  GET    /stats           - Statistics`);
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
