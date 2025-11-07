/**
 * Orchestration Routes
 * Main endpoint for orchestration requests
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { executeOrchestration } from '../services';

const router: Router = Router();
const routeLogger = logger.child({ context: 'orchestration-routes' });

/**
 * POST /orchestrate
 * Main orchestration endpoint
 */
router.post('/orchestrate', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();

  const endpointLogger = logger.child({
    context: 'orchestration-endpoint',
    correlationId,
    requestId,
  });

  try {
    endpointLogger.info('Received orchestration request', {
      method: req.method,
      path: req.path,
      contentType: req.headers['content-type'],
      bodyKeys: Object.keys(req.body || {}),
    });

    endpointLogger.debug('Request body received', {
      body: JSON.stringify(req.body).substring(0, 500),
    });

    // Add orchestrationId and correlation ID to request for orchestrator
    const enrichedRequest = {
      ...req.body,
      orchestrationId: correlationId,
    };

    // Execute orchestration
    const response = await executeOrchestration(enrichedRequest);

    // Log response
    endpointLogger.info('Orchestration completed', {
      status: response.status,
      httpStatus: response.response.status,
      durationMs: Date.now() - startTime,
    });

    // Return OpenHIM mediator format response
    return res.status(response.response.status).json(response);
  } catch (error: any) {
    endpointLogger.error('Unexpected error in orchestration endpoint', {
      error: error.message,
      stack: error.stack,
      durationMs: Date.now() - startTime,
    });

    // Build error response
    const errorResponse = {
      'x-mediator-urn': 'urn:mediator:smile-orchestration',
      status: 'Failed',
      response: {
        status: 500,
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          error: 'Internal Server Error',
          message: error.message,
          timestamp: new Date().toISOString(),
        }),
        timestamp: new Date().toISOString(),
      },
      orchestrations: [],
    };

    return res.status(500).json(errorResponse);
  }
});

/**
 * GET /health
 * Health check endpoint
 */
router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'Orchestration Mediator',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /
 * Root endpoint
 */
router.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    service: 'SMILE Orchestration Mediator',
    version: '1.0.0',
    description:
      'Orchestrates multi-step workflows coordinating Warehouse, Finance, Audit mediators and Orders Service',
    endpoints: {
      health: 'GET /health',
      orchestrate: 'POST /orchestrate',
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
