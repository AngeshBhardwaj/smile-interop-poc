/**
 * Finance Transformation Routes
 * Transforms order CloudEvents to Finance Details format
 */

import { Router, Request, Response } from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { config } from '../config';

const router: Router = Router();
const transformLogger = logger.child({ context: 'transform-routes' });

/**
 * OpenHIM mediator response builder
 */
function buildMediatorResponse(
  status: 'Successful' | 'Failed',
  statusCode: number,
  message: string,
  orchestrations: any[] = []
) {
  return {
    'x-mediator-urn': 'urn:mediator:smile-finance-transformation',
    status,
    response: {
      status: statusCode,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ message, timestamp: new Date().toISOString() }),
      timestamp: new Date().toISOString(),
    },
    orchestrations,
  };
}

/**
 * POST /transform
 * Transform CloudEvent to Finance Details JSON and forward to finance client
 */
router.post('/transform', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();
  const orchestrations: any[] = [];

  try {
    transformLogger.info('Received finance transformation request', {
      correlationId,
      contentType: req.headers['content-type'],
      method: req.method,
      url: req.url,
    });

    transformLogger.debug('Request received', {
      correlationId,
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length'],
      'x-event-id': req.headers['x-event-id'],
      'x-event-type': req.headers['x-event-type'],
    });

    // Step 1: Validate CloudEvent basic structure
    const cloudEvent = req.body;

    // Basic CloudEvent validation
    if (!cloudEvent.id || !cloudEvent.type || !cloudEvent.source) {
      transformLogger.warn('CloudEvent validation failed', {
        correlationId,
        errors: ['Missing required CloudEvent fields: id, type, or source'],
        receivedBody: JSON.stringify(cloudEvent).substring(0, 500),
      });

      const response = buildMediatorResponse(
        'Failed',
        400,
        'Invalid CloudEvent: Missing required fields (id, type, source)',
        orchestrations
      );

      return res.status(400).json(response);
    }

    transformLogger.debug('CloudEvent validated successfully', {
      correlationId,
      eventId: cloudEvent.id,
      eventType: cloudEvent.type,
    });

    // Step 2: Transform CloudEvent to Finance Details JSON
    const transformStartTime = Date.now();
    const transformedData = transformCloudEventToFinanceDetails(cloudEvent);

    orchestrations.push({
      name: 'Transform to Finance Details',
      request: {
        method: 'INTERNAL',
        body: JSON.stringify({
          eventType: cloudEvent.type,
          eventId: cloudEvent.id,
          rule: 'order-to-finance-details',
        }),
        timestamp: new Date(transformStartTime).toISOString(),
      },
      response: {
        status: 200,
        body: JSON.stringify({
          success: true,
          errors: [],
        }),
        timestamp: new Date().toISOString(),
      },
    });

    transformLogger.info('Transformation completed successfully', {
      correlationId,
      eventId: cloudEvent.id,
      ruleName: 'order-to-finance-details',
    });

    // Step 3: Forward to finance client
    const forwardStartTime = Date.now();

    try {
      transformLogger.info('Forwarding to finance client', {
        correlationId,
        endpoint: config.client.endpoint,
        clientName: config.client.name,
      });

      const response = await axios.post(
        config.client.endpoint,
        transformedData,
        {
          timeout: config.client.timeout,
          headers: {
            'Content-Type': 'application/json',
            'X-Event-Id': cloudEvent.id,
            'X-Event-Type': cloudEvent.type,
            'X-Event-Source': cloudEvent.source,
            'X-Correlation-ID': correlationId,
          },
        }
      );

      transformLogger.info('Successfully forwarded to finance client', {
        correlationId,
        statusCode: response.status,
        duration: Date.now() - forwardStartTime,
      });

      orchestrations.push({
        name: `Forward to ${config.client.name}`,
        request: {
          method: 'POST',
          url: config.client.endpoint,
          headers: {
            'Content-Type': 'application/json',
            'X-Event-Id': cloudEvent.id,
          },
          body: JSON.stringify(transformedData),
          timestamp: new Date(forwardStartTime).toISOString(),
        },
        response: {
          status: response.status,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(response.data || { status: 'received' }),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      transformLogger.error('Failed to forward to finance client', {
        correlationId,
        error: error.message,
        statusCode: error.response?.status,
      });

      orchestrations.push({
        name: `Forward to ${config.client.name}`,
        request: {
          method: 'POST',
          url: config.client.endpoint,
          timestamp: new Date(forwardStartTime).toISOString(),
        },
        response: {
          status: error.response?.status || 500,
          body: JSON.stringify({ error: error.message }),
          timestamp: new Date().toISOString(),
        },
      });

      const response = buildMediatorResponse(
        'Failed',
        502,
        `Forward failed: ${error.message}`,
        orchestrations
      );

      return res.status(502).json(response);
    }

    // Step 4: Build success response
    const totalDuration = Date.now() - startTime;

    transformLogger.info('Request completed successfully', {
      correlationId,
      eventId: cloudEvent.id,
      totalDuration,
      orchestrations: orchestrations.length,
    });

    const successResponse = buildMediatorResponse(
      'Successful',
      200,
      `CloudEvent transformed and forwarded to ${config.client.name}`,
      orchestrations
    );

    successResponse.response.body = JSON.stringify({
      message: `CloudEvent transformed and forwarded to ${config.client.name}`,
      eventId: cloudEvent.id,
      eventType: cloudEvent.type,
      client: config.client.name,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json(successResponse);
  } catch (error: any) {
    transformLogger.error('Unexpected error in transformation endpoint', {
      correlationId,
      error: error.message,
      stack: error.stack,
    });

    const response = buildMediatorResponse(
      'Failed',
      500,
      `Internal server error: ${error.message}`,
      orchestrations
    );

    return res.status(500).json(response);
  }
});

/**
 * Transform CloudEvent order data to Finance Details format
 */
function transformCloudEventToFinanceDetails(cloudEvent: any): any {
  const data = cloudEvent.data || {};

  // Calculate totals from items
  const items = Array.isArray(data.items) ? data.items : [];
  const subtotal = items.reduce((sum: number, item: any) => {
    const itemTotal = (item.unitPrice || 0) * (item.quantityOrdered || 0);
    return sum + itemTotal;
  }, 0);

  // Calculate tax (assumed 8% tax rate)
  const taxRate = 0.08;
  const tax = parseFloat((subtotal * taxRate).toFixed(2));
  const total = parseFloat((subtotal + tax).toFixed(2));

  return {
    orderId: data.orderId,
    items: items.map((item: any) => ({
      itemId: item.itemId,
      name: item.name,
      unitPrice: item.unitPrice,
      quantity: item.quantityOrdered,
      subtotal: parseFloat(((item.unitPrice || 0) * (item.quantityOrdered || 0)).toFixed(2)),
    })),
    subtotal,
    tax,
    taxRate: `${(taxRate * 100).toFixed(1)}%`,
    total,
    paymentStatus: 'pending',
    paymentMethod: data.paymentMethod || 'credit-card',
    currency: 'USD',
    externalOrderRef: cloudEvent.id,
    createdAt: cloudEvent.time,
    sourceSystem: cloudEvent.source,
  };
}

/**
 * GET /health
 * Health check endpoint
 */
router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'Finance Transformation Mediator',
    version: '1.0.0',
    client: config.client.name,
    timestamp: new Date().toISOString(),
  });
});

export default router;
