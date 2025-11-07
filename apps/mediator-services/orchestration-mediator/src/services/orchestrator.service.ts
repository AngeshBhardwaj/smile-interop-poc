/**
 * Orchestrator Service
 * Core orchestration logic: coordinates warehouse, finance, audit, and orders services
 * Implements 4-phase execution: Validation → Parallel → Order Creation → Aggregation
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { callWarehouseMediator } from './warehouse.service';
import { callFinanceMediator } from './finance.service';
import { callAuditMediator } from './audit.service';
import { createOrder, formatOrderData } from './orders.service';
import {
  aggregateResponse,
  buildOpenHIMResponse,
  createOrchestrationEntry,
  logOrchestrationCompletion,
  createDefaultStepResult,
  ExecutionMetrics,
  StepResult,
  OrchestrationContext,
} from '../utils/response-aggregator';

/**
 * Execute orchestration workflow
 */
export async function executeOrchestration(requestBody: any): Promise<any> {
  const orchestrationId = requestBody.orchestrationId || `corr-${uuidv4()}`;
  const requestId = `req-${uuidv4()}`;
  const orchestrationStartTime = Date.now();

  const orchestrationLogger = logger.child({
    context: 'orchestrator-service',
    orchestrationId,
    requestId,
  });

  orchestrationLogger.info('Starting orchestration', {
    itemCount: requestBody.items?.length || 0,
    facilityId: requestBody.facilityId,
  });

  // Initialize execution context with default step results
  const context: OrchestrationContext = {
    orchestrationId,
    requestId,
    startTime: orchestrationStartTime,
    request: requestBody,
    results: {
      warehouse: createDefaultStepResult(),
      finance: createDefaultStepResult(),
      audit: createDefaultStepResult(),
      orders: createDefaultStepResult(),
    },
    errors: [],
    metrics: {
      totalExecutionMs: 0,
      phase1ValidationMs: 0,
      phase2ParallelMs: 0,
      phase3OrderCreationMs: 0,
      phase4AggregationMs: 0,
      retriesAttempted: 0,
      retriesSucceeded: 0,
    },
  };

  // Orchestrations array for OpenHIM tracking
  const orchestrations: any[] = [];

  try {
    // ========================================
    // PHASE 1: VALIDATION
    // ========================================
    const phase1StartTime = Date.now();

    orchestrationLogger.debug('Starting Phase 1: Validation');

    const validationError = validateRequest(requestBody, orchestrationLogger);
    if (validationError) {
      orchestrationLogger.error('Request validation failed', { error: validationError });

      context.metrics.phase1ValidationMs = Date.now() - phase1StartTime;
      context.metrics.totalExecutionMs = Date.now() - orchestrationStartTime;

      return buildErrorResponse(
        context,
        validationError,
        orchestrations
      );
    }

    context.metrics.phase1ValidationMs = Date.now() - phase1StartTime;
    orchestrationLogger.info('Phase 1 completed: Request validated', {
      phase1DurationMs: context.metrics.phase1ValidationMs,
    });

    // ========================================
    // PHASE 2: PARALLEL EXECUTION
    // ========================================
    const phase2StartTime = Date.now();

    orchestrationLogger.debug('Starting Phase 2: Parallel Execution');

    // Execute warehouse, finance, and audit in parallel
    const [warehouseResult, financeResult, auditResult] = await Promise.allSettled([
      callWarehouseMediator(
        requestBody.items,
        requestBody.facilityId,
        orchestrationId
      ),
      callFinanceMediator(
        requestBody.items,
        requestBody.facilityId,
        orchestrationId
      ),
      callAuditMediator(
        requestBody.items,
        requestBody.facilityId,
        requestBody.requestedBy,
        orchestrationId
      ),
    ]);

    // Extract results from Promise.allSettled
    context.results.warehouse = extractSettledResult(warehouseResult);
    context.results.finance = extractSettledResult(financeResult);
    context.results.audit = extractSettledResult(auditResult);

    // Log Phase 2 results
    orchestrationLogger.info('Phase 2 completed: Parallel calls finished', {
      warehouseStatus: context.results.warehouse.status,
      financeStatus: context.results.finance.status,
      auditStatus: context.results.audit.status,
      phase2DurationMs: Date.now() - phase2StartTime,
    });

    context.metrics.phase2ParallelMs = Date.now() - phase2StartTime;

    // Create orchestration entries for Phase 2 results
    createOrchestrationEntries(
      orchestrations,
      'Warehouse Call',
      requestBody.items,
      context.results.warehouse,
      orchestrationId
    );
    createOrchestrationEntries(
      orchestrations,
      'Finance Call',
      requestBody.items,
      context.results.finance,
      orchestrationId
    );
    createOrchestrationEntries(
      orchestrations,
      'Audit Call',
      requestBody.items,
      context.results.audit,
      orchestrationId
    );

    // ========================================
    // PHASE 3: ORDER CREATION
    // ========================================
    const phase3StartTime = Date.now();

    orchestrationLogger.debug('Starting Phase 3: Order Creation');

    // Format order data with enrichment from Phase 2
    const orderData = formatOrderData(requestBody);

    // Call orders service
    const ordersResult = await createOrder(
      orderData,
      {
        warehouse: context.results.warehouse,
        finance: context.results.finance,
        audit: context.results.audit,
      },
      orchestrationId
    );

    context.results.orders = ordersResult;

    orchestrationLogger.info('Phase 3 completed: Order created', {
      ordersStatus: context.results.orders.status,
      orderId: context.results.orders.data?.orderId,
      phase3DurationMs: Date.now() - phase3StartTime,
    });

    context.metrics.phase3OrderCreationMs = Date.now() - phase3StartTime;

    // Create orchestration entry for orders call
    createOrchestrationEntries(
      orchestrations,
      'Orders Service Call',
      orderData,
      context.results.orders,
      orchestrationId
    );

    // ========================================
    // PHASE 4: RESPONSE AGGREGATION
    // ========================================
    const phase4StartTime = Date.now();

    orchestrationLogger.debug('Starting Phase 4: Response Aggregation');

    // Aggregate all results
    const aggregatedBody = aggregateResponse(context);
    context.metrics.phase4AggregationMs = Date.now() - phase4StartTime;

    // Calculate total time
    context.metrics.totalExecutionMs = Date.now() - orchestrationStartTime;

    orchestrationLogger.info('Phase 4 completed: Response aggregated', {
      overallStatus: aggregatedBody.status,
      totalDurationMs: context.metrics.totalExecutionMs,
    });

    // Build final OpenHIM response
    const response = buildOpenHIMResponse(context, aggregatedBody, orchestrations);

    // Log completion
    logOrchestrationCompletion(context);

    return response;
  } catch (error: any) {
    orchestrationLogger.error('Unexpected error during orchestration', {
      error: error.message,
      stack: error.stack,
    });

    context.metrics.totalExecutionMs = Date.now() - orchestrationStartTime;

    return buildErrorResponse(
      context,
      error.message,
      orchestrations
    );
  }
}

/**
 * Validate request structure
 */
function validateRequest(requestBody: any, contextLogger: any): string | null {
  // Check for required fields
  if (!requestBody.items || !Array.isArray(requestBody.items) || requestBody.items.length === 0) {
    const error = 'Missing or empty items array';
    contextLogger.warn(error);
    return error;
  }

  if (!requestBody.facilityId) {
    const error = 'Missing facilityId';
    contextLogger.warn(error);
    return error;
  }

  if (!requestBody.requestedBy) {
    const error = 'Missing requestedBy';
    contextLogger.warn(error);
    return error;
  }

  // Validate items structure
  for (let i = 0; i < requestBody.items.length; i++) {
    const item = requestBody.items[i];

    if (!item.itemId) {
      const error = `Item ${i} missing itemId`;
      contextLogger.warn(error);
      return error;
    }

    if (item.quantity === undefined || item.quantity <= 0) {
      const error = `Item ${i} invalid quantity`;
      contextLogger.warn(error);
      return error;
    }
  }

  return null; // No errors
}

/**
 * Extract result from Promise.allSettled
 */
function extractSettledResult(result: PromiseSettledResult<any>): any {
  if (result.status === 'fulfilled') {
    return result.value;
  } else {
    return {
      status: 'failed',
      error: result.reason?.message || String(result.reason),
    };
  }
}

/**
 * Create orchestration entries for OpenHIM tracking
 */
function createOrchestrationEntries(
  orchestrations: any[],
  name: string,
  requestData: any,
  result: any,
  correlationId: string
): void {
  const entry = createOrchestrationEntry(
    name,
    {
      method: 'POST',
      url: `orchestration:${name}`,
      body: requestData,
      timestamp: Date.now(),
      headers: {
        'X-Correlation-ID': correlationId,
        'Content-Type': 'application/json',
      },
    },
    {
      status: result.status === 'success' ? 200 : 500,
      body: result.data || { error: result.error },
      timestamp: Date.now(),
      headers: { 'Content-Type': 'application/json' },
    }
  );

  orchestrations.push(entry);
}

/**
 * Build error response
 */
function buildErrorResponse(
  context: OrchestrationContext,
  errorMessage: string,
  orchestrations: any[]
): any {
  const errorBody = {
    orchestration_id: context.orchestrationId,
    timestamp: new Date().toISOString(),
    status: 'failed',
    error: {
      message: errorMessage,
      error_code: 'ORCHESTRATION_ERROR',
    },
    metrics: context.metrics,
  };

  return buildOpenHIMResponse(context, errorBody, orchestrations);
}
