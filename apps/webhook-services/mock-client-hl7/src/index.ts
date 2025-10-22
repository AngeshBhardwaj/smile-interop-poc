/**
 * Mock HL7 v2 Client Service
 * Simulates a pharmacy system receiving HL7 v2.5.1 ORM^O01 messages
 */

import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';

const app = express();
const PORT = process.env.PORT || 3202;

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.text({ type: 'text/plain', limit: '10mb' }));

// Request counter and storage
let requestCounter = 0;
const receivedOrders: any[] = [];

/**
 * Parse HL7 v2 message segments
 */
function parseHL7Message(hl7Message: string) {
  const segments = hl7Message.split('\r').filter(s => s.length > 0);
  const parsed: any = {};

  segments.forEach(segment => {
    const fields = segment.split('|');
    const segmentType = fields[0];

    if (segmentType === 'MSH') {
      parsed.MSH = {
        sendingApplication: fields[2],
        sendingFacility: fields[3],
        receivingApplication: fields[4],
        receivingFacility: fields[5],
        messageDateTime: fields[6],
        messageType: fields[8],
        messageControlId: fields[9],
        processingId: fields[10],
        versionId: fields[11],
      };
    } else if (segmentType === 'PID') {
      parsed.PID = {
        patientId: fields[3],
        patientName: fields[5],
        accountNumber: fields[18],
      };
    } else if (segmentType === 'ORC') {
      parsed.ORC = {
        orderControl: fields[1],
        placerOrderNumber: fields[2],
        fillerOrderNumber: fields[3],
        orderStatus: fields[5],
        transactionDateTime: fields[9],
        orderingProvider: fields[12],
        orderEffectiveDateTime: fields[15],
        facilityName: fields[21],
      };
    } else if (segmentType === 'RXO') {
      parsed.RXO = {
        requestedGiveCode: fields[1],
        requestedGiveAmount: fields[2],
        requestedGiveUnits: fields[4],
        allowSubstitutions: fields[9],
        requestedDispenseAmount: fields[21],
        requestedDispenseUnits: fields[22],
      };
    } else if (segmentType === 'NTE') {
      parsed.NTE = {
        setId: fields[1],
        sourceOfComment: fields[2],
        comment: fields[3],
      };
    }
  });

  return parsed;
}

/**
 * POST /orders
 * Receive HL7 v2 ORM^O01 message
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
  console.log(`[${receivedAt}] HL7 v2 Order Received #${requestCounter}`);
  console.log('========================================');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('\nHL7 v2 ORM Message:');

  let parsedHL7: any = null;

  // Check if body is HL7 delimited string or JSON
  if (typeof req.body === 'string' && req.body.startsWith('MSH')) {
    console.log('Raw HL7:');
    console.log(req.body);
    parsedHL7 = parseHL7Message(req.body);
    console.log('\nParsed HL7 Segments:');
    console.log(JSON.stringify(parsedHL7, null, 2));
  } else {
    console.log('JSON Format:');
    console.log(JSON.stringify(req.body, null, 2));
    parsedHL7 = req.body;
  }

  console.log('========================================\n');

  // Extract key information
  const summary = {
    requestNumber: requestCounter,
    receivedAt,
    messageType: parsedHL7?.MSH?.messageType || parsedHL7?.messageType,
    messageControlId: parsedHL7?.MSH?.messageControlId || parsedHL7?.messageControlId,
    orderControl: parsedHL7?.ORC?.orderControl || parsedHL7?.orderControl,
    placerOrderNumber: parsedHL7?.ORC?.placerOrderNumber || parsedHL7?.placerOrderNumber,
    orderStatus: parsedHL7?.ORC?.orderStatus || parsedHL7?.orderStatus,
  };

  console.log('📊 Summary:', JSON.stringify(summary, null, 2));
  console.log('\n');

  // Send HL7 ACK response
  const ackMessage = `MSH|^~\\&|PHARMACY-SYSTEM|PHARMACY-B|SMILE-POC|${parsedHL7?.MSH?.sendingFacility || 'SMILE'}|${new Date().toISOString().replace(/[-:]/g, '').slice(0, 14)}||ACK^O01^ACK|${Date.now()}|P|2.5.1
MSA|AA|${parsedHL7?.MSH?.messageControlId || requestCounter}|Order accepted successfully`;

  res.status(200).json({
    message: 'HL7 v2 ORM message received successfully',
    system: 'Pharmacy HL7 v2 System',
    receivedAt,
    requestNumber: requestCounter,
    messageControlId: parsedHL7?.MSH?.messageControlId,
    acknowledgment: 'AA', // Application Accept
    hl7Acknowledgment: ackMessage,
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
    service: 'mock-client-hl7',
    system: 'Pharmacy HL7 v2 System',
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
    service: 'mock-client-hl7',
    system: 'Pharmacy HL7 v2 System',
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
    service: 'mock-client-hl7',
    system: 'Pharmacy HL7 v2 System',
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
      service: 'mock-client-hl7',
      timestamp: new Date().toISOString(),
    });
  }

  const latestOrder = receivedOrders[receivedOrders.length - 1];
  res.status(200).json({
    service: 'mock-client-hl7',
    system: 'Pharmacy HL7 v2 System',
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
    service: 'mock-client-hl7',
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(PORT, () => {
  console.log('========================================');
  console.log('💊 Mock HL7 v2 Client Service Started');
  console.log('========================================');
  console.log(`System: Pharmacy HL7 v2 System`);
  console.log(`Port: ${PORT}`);
  console.log(`Format: HL7 v2.5.1 ORM^O01`);
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
