/**
 * Audit Transformation Routes
 * Transforms order CloudEvents to Audit Trail format
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
    'x-mediator-urn': 'urn:mediator:smile-audit-transformation',
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
 * Transform CloudEvent to Audit Trail JSON and forward to audit client
 */
router.post('/transform', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();
  const orchestrations: any[] = [];

  try {
    transformLogger.info('Received audit transformation request', {
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

    // Step 2: Transform CloudEvent to Audit Trail JSON
    const transformStartTime = Date.now();
    const transformedData = transformCloudEventToAuditTrail(cloudEvent);

    orchestrations.push({
      name: 'Transform to Audit Trail',
      request: {
        method: 'INTERNAL',
        body: JSON.stringify({
          eventType: cloudEvent.type,
          eventId: cloudEvent.id,
          rule: 'order-to-audit-trail',
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
      ruleName: 'order-to-audit-trail',
    });

    // Step 3: Forward to audit client with credentials
    const forwardStartTime = Date.now();

    try {
      // Extract credentials from environment or request
      // In a real OpenHIM setup, these would come from the channel route configuration
      const auditUsername = process.env.AUDIT_CLIENT_USERNAME || 'audit-user';
      const auditPassword = process.env.AUDIT_CLIENT_PASSWORD || 'audit-secure-pass';

      // Create Basic Auth header
      const credentials = Buffer.from(`${auditUsername}:${auditPassword}`).toString('base64');
      const basicAuthHeader = `Basic ${credentials}`;

      transformLogger.info('Forwarding to audit client with authentication', {
        correlationId,
        endpoint: config.client.endpoint,
        clientName: config.client.name,
        authenticatedAs: auditUsername,
      });

      const response = await axios.post(
        config.client.endpoint,
        transformedData,
        {
          timeout: config.client.timeout,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': basicAuthHeader,
            'X-Event-Id': cloudEvent.id,
            'X-Event-Type': cloudEvent.type,
            'X-Event-Source': cloudEvent.source,
            'X-Correlation-ID': correlationId,
            'X-Authenticated-User': auditUsername,
          },
        }
      );

      transformLogger.info('Successfully forwarded to audit client', {
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
      transformLogger.error('Failed to forward to audit client', {
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
 * Transform CloudEvent order data to Audit Trail format
 */
function transformCloudEventToAuditTrail(cloudEvent: any): any {
  const data = cloudEvent.data || {};

  return {
    orderId: data.orderId,
    statusHistory: [
      {
        status: 'created',
        timestamp: cloudEvent.time,
        actor: 'system',
        reason: 'Order created via CloudEvent',
      },
    ],
    eventTimestamp: cloudEvent.time,
    eventSource: cloudEvent.source,
    eventType: cloudEvent.type,
    correlationId: cloudEvent.id,
    subject: cloudEvent.subject || 'order.created',
    compliance: {
      auditRequired: true,
      dataClassification: 'sensitive',
      retentionDays: 2555, // 7 years
    },
    trail: {
      initiator: data.requestedBy || 'system',
      facility: data.facilityId,
      department: data.departmentId,
      itemCount: Array.isArray(data.items) ? data.items.length : 0,
      createdAt: cloudEvent.time,
    },
  };
}

/**
 * GET /health
 * Health check endpoint
 */
router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'Audit Transformation Mediator',
    version: '1.0.0',
    client: config.client.name,
    timestamp: new Date().toISOString(),
  });
});

export default router;
