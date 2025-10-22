/**
 * Custom Transformation Routes
 */

import { Router, Request, Response } from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { transformToCustomJSON } from '../services/custom-transformer';
import { validateCloudEvent } from '../validators/cloudevents.validator';
import { loadRuleByName } from '../rules/rule-loader';
import { getLogger } from '../utils/logger';
import { config } from '../config';
import { CloudEvent } from '../config/types';

const router: Router = Router();
const logger = getLogger('transform-routes');

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
    'x-mediator-urn': config.openhim.mediatorUrn,
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
 * Transform CloudEvent to Custom JSON and forward to warehouse client
 */
router.post('/transform', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();
  const orchestrations: any[] = [];

  try {
    logger.info({
      msg: 'Received transformation request',
      correlationId,
      contentType: req.headers['content-type'],
    });

    // Step 1: Validate CloudEvent
    const cloudEvent: CloudEvent = req.body;
    const validationResult = validateCloudEvent(cloudEvent);

    if (!validationResult.valid) {
      logger.warn({
        msg: 'CloudEvent validation failed',
        correlationId,
        errors: validationResult.errors,
      });

      const response = buildMediatorResponse(
        'Failed',
        400,
        `Invalid CloudEvent: ${validationResult.errors?.join(', ')}`,
        orchestrations
      );

      return res.status(400).json(response);
    }

    logger.debug({
      msg: 'CloudEvent validated successfully',
      correlationId,
      eventId: cloudEvent.id,
      eventType: cloudEvent.type,
    });

    // Step 2: Load transformation rule
    const transformStartTime = Date.now();
    const rule = await loadRuleByName(config.transformation.defaultRule);

    if (!rule) {
      logger.error({
        msg: 'Transformation rule not found',
        correlationId,
        ruleName: config.transformation.defaultRule,
      });

      const response = buildMediatorResponse(
        'Failed',
        500,
        `Transformation rule not found: ${config.transformation.defaultRule}`,
        orchestrations
      );

      return res.status(500).json(response);
    }

    // Step 3: Transform CloudEvent to Custom JSON
    const transformResult = await transformToCustomJSON(cloudEvent, rule);

    orchestrations.push({
      name: 'Transform to Custom JSON',
      request: {
        method: 'INTERNAL',
        body: JSON.stringify({
          eventType: cloudEvent.type,
          eventId: cloudEvent.id,
          rule: rule.name,
        }),
        timestamp: new Date(transformStartTime).toISOString(),
      },
      response: {
        status: transformResult.success ? 200 : 500,
        body: JSON.stringify({
          success: transformResult.success,
          errors: transformResult.errors,
        }),
        timestamp: new Date().toISOString(),
      },
    });

    if (!transformResult.success) {
      logger.error({
        msg: 'Transformation failed',
        correlationId,
        eventId: cloudEvent.id,
        errors: transformResult.errors,
      });

      const response = buildMediatorResponse(
        'Failed',
        500,
        `Transformation failed: ${transformResult.errors?.join(', ')}`,
        orchestrations
      );

      return res.status(500).json(response);
    }

    logger.info({
      msg: 'Transformation completed successfully',
      correlationId,
      eventId: cloudEvent.id,
      ruleName: rule.name,
    });

    // Step 4: Forward to warehouse client
    const forwardStartTime = Date.now();
    let forwardSuccess = false;
    let forwardStatus = 0;
    let forwardError: string | undefined;

    try {
      logger.info({
        msg: 'Forwarding to warehouse client',
        correlationId,
        endpoint: config.client.endpoint,
        clientName: config.client.name,
      });

      const response = await axios.post(
        config.client.endpoint,
        transformResult.data,
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

      forwardSuccess = true;
      forwardStatus = response.status;

      logger.info({
        msg: 'Successfully forwarded to warehouse client',
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
          body: JSON.stringify(transformResult.data),
          timestamp: new Date(forwardStartTime).toISOString(),
        },
        response: {
          status: response.status,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(response.data),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      forwardSuccess = false;
      forwardError = error.message;
      forwardStatus = error.response?.status || 0;

      logger.error({
        msg: 'Failed to forward to warehouse client',
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

    // Step 5: Build success response
    const totalDuration = Date.now() - startTime;

    logger.info({
      msg: 'Request completed successfully',
      correlationId,
      eventId: cloudEvent.id,
      totalDuration,
      orchestrations: orchestrations.length,
    });

    const response = buildMediatorResponse(
      'Successful',
      200,
      `CloudEvent transformed and forwarded to ${config.client.name}`,
      orchestrations
    );

    response.response.body = JSON.stringify({
      message: `CloudEvent transformed and forwarded to ${config.client.name}`,
      eventId: cloudEvent.id,
      eventType: cloudEvent.type,
      client: config.client.name,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json(response);
  } catch (error: any) {
    logger.error({
      msg: 'Unexpected error in transformation endpoint',
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
 * GET /health
 * Health check endpoint
 */
router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: config.service.name,
    version: '1.0.0',
    client: config.client.name,
    timestamp: new Date().toISOString(),
  });
});

export default router;
