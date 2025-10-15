/**
 * Transformation endpoint routes
 */

import { Router, Request, Response } from 'express';
import { transform } from '../services/transformer.service';
import { validateCloudEvent } from '../validators/cloudevents.validator';
import { forwardData, ForwardOptions } from '../utils/forwarder';
import { getLogger } from '../utils/logger';
import { config } from '../config';
import { v4 as uuidv4 } from 'uuid';

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
    'x-mediator-urn': 'urn:mediator:smile-transformation',
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
 * Main transformation endpoint
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
    const cloudEvent = req.body;
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

    // Step 2: Transform CloudEvent
    const transformStartTime = Date.now();
    const transformResult = await transform(cloudEvent, {
      validateOutput: true,
      continueOnError: false,
    });

    orchestrations.push({
      name: 'Transform CloudEvent',
      request: {
        method: 'INTERNAL',
        body: JSON.stringify({ eventType: cloudEvent.type, eventId: cloudEvent.id }),
        timestamp: new Date(transformStartTime).toISOString(),
      },
      response: {
        status: transformResult.success ? 200 : 500,
        body: JSON.stringify({
          success: transformResult.success,
          errors: transformResult.errors,
          warnings: transformResult.warnings,
          metadata: transformResult.metadata,
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
      ruleName: transformResult.metadata.ruleName,
      targetFormat: transformResult.metadata.targetFormat,
    });

    // Step 3: Forward transformed data to destination (if specified)
    let destination = req.query.destination as string | undefined;

    // If not provided in query, use default from config
    if (!destination && config.destination.defaultURL) {
      destination = config.destination.defaultURL;
    }

    if (destination) {
      logger.info({
        msg: 'Forwarding transformed data to destination',
        correlationId,
        destination,
      });

      const forwardOptions: ForwardOptions = {
        url: destination,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': correlationId,
          'X-Event-Type': cloudEvent.type,
          'X-Event-ID': cloudEvent.id,
        },
        correlationId,
      };

      const forwardStartTime = Date.now();
      const forwardResult = await forwardData(transformResult.data, forwardOptions);

      orchestrations.push({
        name: 'Forward to Destination',
        request: {
          method: 'POST',
          url: destination,
          headers: forwardOptions.headers,
          body: JSON.stringify(transformResult.data),
          timestamp: new Date(forwardStartTime).toISOString(),
        },
        response: {
          status: forwardResult.status || 0,
          headers: forwardResult.headers || {},
          body: JSON.stringify(forwardResult.body || { error: forwardResult.error }),
          timestamp: new Date().toISOString(),
        },
      });

      if (!forwardResult.success) {
        logger.error({
          msg: 'Failed to forward data to destination',
          correlationId,
          destination,
          error: forwardResult.error,
        });

        const response = buildMediatorResponse(
          'Failed',
          502,
          `Forward failed: ${forwardResult.error}`,
          orchestrations
        );

        return res.status(502).json(response);
      }

      logger.info({
        msg: 'Data forwarded successfully',
        correlationId,
        destination,
        status: forwardResult.status,
        duration: forwardResult.duration,
      });
    }

    // Step 4: Build success response
    const totalDuration = Date.now() - startTime;

    logger.info({
      msg: 'Transformation request completed successfully',
      correlationId,
      eventId: cloudEvent.id,
      totalDuration,
      orchestrations: orchestrations.length,
    });

    const response = buildMediatorResponse(
      'Successful',
      200,
      'CloudEvent transformed and forwarded successfully',
      orchestrations
    );

    // Include transformed data in the response body for inspection
    response.response.body = JSON.stringify({
      message: 'CloudEvent transformed and forwarded successfully',
      eventId: cloudEvent.id,
      eventType: cloudEvent.type,
      transformedData: transformResult.data,
      metadata: transformResult.metadata,
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
    service: 'transformation-mediator',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

export default router;
