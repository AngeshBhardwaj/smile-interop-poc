/**
 * Warehouse Service
 * Calls warehouse-transformation-mediator to validate inventory
 */

import axios, { AxiosError } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';
import { retryWithBackoff, isRetryableError } from '../utils/retry';
import { v4 as uuidv4 } from 'uuid';

/**
 * Call warehouse mediator to validate inventory
 */
export async function callWarehouseMediator(
  items: any[],
  facilityId: string,
  correlationId: string
): Promise<any> {
  const warehouseLogger = logger.child({
    context: 'warehouse-service',
    correlationId
  });

  // Build CloudEvent format request for warehouse mediator
  const request = {
    id: correlationId,
    type: 'warehouse.inventory.validate',
    source: 'orchestration-mediator',
    time: new Date().toISOString(),
    data: {
      items: items.map((item: any) => ({
        itemId: item.itemId,
        quantity: item.quantity,
      })),
      facilityId,
    },
  };

  warehouseLogger.info('Preparing warehouse mediator call', {
    endpoint: config.mediators.warehouse.endpoint,
    itemCount: items.length,
  });

  try {
    // Retry logic for warehouse calls
    const response = await retryWithBackoff(
      async () => {
        warehouseLogger.debug('Calling warehouse mediator', {
          endpoint: config.mediators.warehouse.endpoint,
        });

        return await axios.post(
          config.mediators.warehouse.endpoint,
          request,
          {
            timeout: config.mediators.warehouse.timeout,
            headers: {
              'Content-Type': 'application/json',
              'X-Correlation-ID': correlationId,
              'X-Event-Id': correlationId,
            },
          }
        );
      },
      {
        maxRetries: config.orchestration.maxRetries,
        delayMs: config.orchestration.retryDelays,
        jitterEnabled: config.orchestration.jitterEnabled,
      },
      'Warehouse mediator call',
      { correlationId }
    );

    warehouseLogger.info('Warehouse mediator call successful', {
      statusCode: response.status,
      status: response.data?.status,
    });

    // Extract warehouse response from OpenHIM format
    const warehouseResponse = extractMediatorResponse(response.data, warehouseLogger);

    return {
      status: 'success',
      data: warehouseResponse,
    };
  } catch (error: any) {
    warehouseLogger.error('Warehouse mediator call failed', {
      error: error.message,
      statusCode: error.response?.status,
      isRetryable: isRetryableError(error),
    });

    return {
      status: 'failed',
      error: error.message,
      retries: config.orchestration.maxRetries,
    };
  }
}

/**
 * Extract data from OpenHIM mediator response format
 */
function extractMediatorResponse(response: any, contextLogger: any): any {
  try {
    // Response should be in OpenHIM mediator format
    if (response.response?.body) {
      return JSON.parse(response.response.body);
    }

    // Fallback: return response as-is
    return response;
  } catch (error: any) {
    contextLogger.warn('Failed to parse warehouse response', {
      error: error.message,
    });

    return response;
  }
}
