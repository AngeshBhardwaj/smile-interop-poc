/**
 * Response aggregator for orchestration mediator
 * Combines results from all orchestration steps into unified response
 */

import { logger } from './logger';

/**
 * Execution metrics
 */
export interface ExecutionMetrics {
  totalExecutionMs: number;
  phase1ValidationMs: number;
  phase2ParallelMs: number;
  phase3OrderCreationMs: number;
  phase4AggregationMs: number;
  retriesAttempted: number;
  retriesSucceeded: number;
}

/**
 * Step result
 */
export interface StepResult {
  status: 'success' | 'failed' | 'skipped' | 'estimated';
  data?: any;
  error?: string;
  retries?: number;
}

/**
 * Create a default step result (pending state)
 */
export function createDefaultStepResult(): StepResult {
  return {
    status: 'skipped',
  };
}

/**
 * Orchestration context with results
 */
export interface OrchestrationContext {
  orchestrationId: string;
  requestId: string;
  startTime: number;
  request: any;
  results: {
    warehouse: StepResult;
    finance: StepResult;
    audit: StepResult;
    orders: StepResult;
  };
  errors: Array<{
    step: string;
    error: string;
    timestamp: string;
  }>;
  metrics: ExecutionMetrics;
}

/**
 * OpenHIM mediator response
 */
export interface OpenHIMResponse {
  'x-mediator-urn': string;
  status: 'Successful' | 'Failed';
  response: {
    status: number;
    headers: Record<string, string>;
    body: string;
    timestamp: string;
  };
  orchestrations: Array<{
    name: string;
    request: Record<string, any>;
    response: Record<string, any>;
  }>;
}

/**
 * Aggregate orchestration results into user-friendly response
 */
export function aggregateResponse(context: OrchestrationContext): Record<string, any> {
  const aggregationStartTime = Date.now();

  // Determine overall status
  const overallStatus = determineStatus(context);

  // Build aggregated response
  const response: Record<string, any> = {
    orchestration_id: context.orchestrationId,
    timestamp: new Date().toISOString(),
    status: overallStatus,
  };

  // Include order if created
  if (context.results.orders?.status === 'success') {
    response.order = context.results.orders.data;
  }

  // Include warehouse result
  if (context.results.warehouse) {
    response.warehouse = {
      status: context.results.warehouse.status,
      message: context.results.warehouse.error || 'Warehouse data received',
    };
  }

  // Include finance result
  if (context.results.finance) {
    response.finance = {
      status: context.results.finance.status,
      source: context.results.finance.status === 'estimated' ? 'estimated' : 'live',
      ...(context.results.finance.data || {}),
    };
  }

  // Include audit result
  if (context.results.audit) {
    response.audit = {
      status: context.results.audit.status,
      message: context.results.audit.error || 'Audit data received',
    };
  }

  // Include metrics
  context.metrics.phase4AggregationMs = Date.now() - aggregationStartTime;
  response.metrics = context.metrics;

  // Include failures if any
  if (context.errors.length > 0) {
    response.failures = context.errors;
  }

  return response;
}

/**
 * Determine overall status based on results
 */
function determineStatus(context: OrchestrationContext): 'success' | 'partial_success' | 'failed' {
  const ordersResult = context.results.orders;

  // If orders creation failed -> overall failed
  if (!ordersResult || ordersResult.status === 'failed') {
    return 'failed';
  }

  // If orders created but some enrichment failed -> partial success
  if (ordersResult.status === 'success') {
    const warehouseFailed = context.results.warehouse?.status === 'failed';
    const financeFailed = context.results.finance?.status === 'failed';
    const auditFailed = context.results.audit?.status === 'failed';

    if (warehouseFailed || financeFailed || auditFailed) {
      return 'partial_success';
    }

    return 'success';
  }

  return 'failed';
}

/**
 * Build OpenHIM mediator response
 */
export function buildOpenHIMResponse(
  context: OrchestrationContext,
  aggregatedBody: Record<string, any>,
  orchestrations: Array<any> = []
): OpenHIMResponse {
  const status = aggregatedBody.status;
  const httpStatus = status === 'failed' ? 500 : 200;
  const mediatorStatus = status === 'failed' ? 'Failed' : 'Successful';

  return {
    'x-mediator-urn': 'urn:mediator:smile-orchestration',
    status: mediatorStatus,
    response: {
      status: httpStatus,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(aggregatedBody),
      timestamp: new Date().toISOString(),
    },
    orchestrations: orchestrations,
  };
}

/**
 * Create orchestration entry for OpenHIM tracking
 */
export function createOrchestrationEntry(
  name: string,
  request: Record<string, any>,
  response: Record<string, any>
): Record<string, any> {
  return {
    name,
    request: {
      method: request.method || 'POST',
      url: request.url || 'internal',
      headers: request.headers || {},
      body: typeof request.body === 'string' ? request.body : JSON.stringify(request.body || {}),
      timestamp: new Date(request.timestamp || Date.now()).toISOString(),
    },
    response: {
      status: response.status || 500,
      headers: response.headers || { 'content-type': 'application/json' },
      body:
        typeof response.body === 'string' ? response.body : JSON.stringify(response.body || {}),
      timestamp: new Date(response.timestamp || Date.now()).toISOString(),
    },
  };
}

/**
 * Log orchestration completion
 */
export function logOrchestrationCompletion(context: OrchestrationContext): void {
  const aggregatedResponse = aggregateResponse(context);
  const totalDuration = Date.now() - context.startTime;

  logger.info('Orchestration completed', {
    orchestrationId: context.orchestrationId,
    status: aggregatedResponse.status,
    totalDurationMs: totalDuration,
    warehouseStatus: context.results.warehouse?.status,
    financeStatus: context.results.finance?.status,
    auditStatus: context.results.audit?.status,
    ordersStatus: context.results.orders?.status,
    errorCount: context.errors.length,
    retriesTotal: context.metrics.retriesAttempted,
  });
}
