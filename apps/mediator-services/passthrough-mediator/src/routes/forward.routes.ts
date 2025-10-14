import { Router, Request, Response, IRouter } from 'express';
import { v4 as uuidv4 } from 'uuid';
import Joi from 'joi';
import { forwardToWebhookWithRetry } from '../services/webhook.service';
import { CloudEvent, MediatorResponse } from '../config/types';
import { logger } from '../utils/logger';
import { config } from '../config';

export const forwardRouter: IRouter = Router();

/**
 * CloudEvent validation schema
 */
const cloudEventSchema = Joi.object({
  specversion: Joi.string().valid('1.0').required(),
  type: Joi.string().required(),
  source: Joi.string().required(),
  id: Joi.string().required(),
  time: Joi.string().isoDate().optional(),
  datacontenttype: Joi.string().optional(),
  subject: Joi.string().optional(),
  data: Joi.any().optional(),
}).unknown(true); // Allow extension attributes

/**
 * POST /forward - Forward CloudEvent to webhook
 */
forwardRouter.post('/', async (req: Request, res: Response) => {
  const requestStart = Date.now();

  // Extract or generate correlation ID
  const correlationId =
    (req.headers['x-correlation-id'] as string) ||
    (req.headers['x-openhim-transactionid'] as string) ||
    uuidv4();

  const requestLogger = logger.child({
    correlationId,
    endpoint: '/forward',
  });

  try {
    requestLogger.info('Received CloudEvent forward request');

    // Validate CloudEvent
    const { error, value: event } = cloudEventSchema.validate(req.body);

    if (error) {
      requestLogger.warn('Invalid CloudEvent received', {
        validationError: error.message,
      });

      return res.status(400).json({
        error: 'Invalid CloudEvent',
        details: error.details.map((d) => d.message),
      });
    }

    const cloudEvent = event as CloudEvent;

    requestLogger.info('CloudEvent validated successfully', {
      eventId: cloudEvent.id,
      eventType: cloudEvent.type,
      eventSource: cloudEvent.source,
    });

    // Forward to webhook with retry
    const webhookResponse = await forwardToWebhookWithRetry(cloudEvent, correlationId);

    const requestEnd = Date.now();
    const duration = requestEnd - requestStart;

    requestLogger.info('CloudEvent forwarded successfully', {
      eventId: cloudEvent.id,
      webhookStatus: webhookResponse.status,
      duration,
    });

    // Build OpenHIM mediator response
    const mediatorResponse: MediatorResponse = {
      'x-mediator-urn': 'urn:mediator:smile-passthrough',
      status: webhookResponse.status >= 200 && webhookResponse.status < 300 ? 'Successful' : 'Failed',
      response: {
        status: webhookResponse.status,
        headers: webhookResponse.headers,
        body: JSON.stringify(webhookResponse.data),
        timestamp: new Date().toISOString(),
      },
      orchestrations: [
        {
          name: 'Webhook Forward',
          request: {
            method: 'POST',
            url: config.webhook.url,
            headers: {
              'Content-Type': 'application/cloudevents+json',
              'X-Correlation-ID': correlationId,
            },
            body: JSON.stringify(cloudEvent),
            timestamp: new Date(requestStart).toISOString(),
          },
          response: {
            status: webhookResponse.status,
            headers: webhookResponse.headers,
            body: JSON.stringify(webhookResponse.data),
            timestamp: new Date(requestEnd).toISOString(),
          },
        },
      ],
      properties: {
        correlationId,
        eventId: cloudEvent.id,
        eventType: cloudEvent.type,
        eventSource: cloudEvent.source,
        processingDuration: duration,
      },
    };

    return res.status(200).json(mediatorResponse);
  } catch (error: any) {
    const requestEnd = Date.now();
    const duration = requestEnd - requestStart;

    requestLogger.error('Failed to forward CloudEvent', {
      error: error.message,
      stack: error.stack,
      duration,
    });

    // Build error response for OpenHIM
    const errorResponse: any = {
      'x-mediator-urn': 'urn:mediator:smile-passthrough',
      status: 'Failed',
      error: error.message, // Add error at root level for easy access
      response: {
        status: 500,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: error.message }),
        timestamp: new Date().toISOString(),
      },
      properties: {
        correlationId,
        error: error.message,
        processingDuration: duration,
      },
    };

    return res.status(500).json(errorResponse);
  }
});

/**
 * GET /health - Health check endpoint
 */
forwardRouter.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    service: 'passthrough-mediator',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Export router
 */
export default forwardRouter;
