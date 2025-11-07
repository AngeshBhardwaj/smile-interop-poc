/**
 * Orders Service
 * Calls Orders Service to create orders
 * This is CRITICAL: orchestration fails if orders creation fails
 */

import axios, { AxiosError } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';
import { retryWithBackoff, isRetryableError } from '../utils/retry';

/**
 * Create order in Orders Service
 * This is critical - must succeed for orchestration to succeed
 */
export async function createOrder(
  orderData: any,
  enrichmentData: any,
  correlationId: string
): Promise<any> {
  const ordersLogger = logger.child({
    context: 'orders-service',
    correlationId,
  });

  // Build enriched order request
  const request = {
    ...orderData,
    metadata: {
      ...orderData.metadata,
      orchestration_id: correlationId,
      source: 'orchestration-mediator',
      warehouse_status: enrichmentData.warehouse?.status,
      finance_status: enrichmentData.finance?.status,
      audit_status: enrichmentData.audit?.status,
    },
  };

  ordersLogger.info('Preparing orders service call', {
    endpoint: config.ordersService.endpoint,
    itemCount: orderData.items?.length || 0,
    facilityId: orderData.facilityId,
  });

  try {
    // Retry logic for orders calls
    // BUT: Don't retry validation errors (400, 422)
    const response = await retryWithBackoff(
      async () => {
        ordersLogger.debug('Calling orders service', {
          endpoint: config.ordersService.endpoint,
        });

        return await axios.post(
          config.ordersService.endpoint,
          request,
          {
            timeout: config.ordersService.timeout,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.ordersService.authToken}`,
              'X-Correlation-ID': correlationId,
            },
          }
        );
      },
      {
        maxRetries: config.orchestration.maxRetries,
        delayMs: config.orchestration.retryDelays,
        jitterEnabled: config.orchestration.jitterEnabled,
      },
      'Orders service call',
      { correlationId }
    );

    ordersLogger.info('Order created successfully', {
      statusCode: response.status,
      orderId: response.data?.orderId,
      status: response.data?.status,
    });

    return {
      status: 'success',
      data: response.data,
    };
  } catch (error: any) {
    const statusCode = error.response?.status;
    const isValidationError = statusCode === 400 || statusCode === 422;

    if (isValidationError) {
      ordersLogger.error('Order creation validation error (not retrying)', {
        error: error.message,
        statusCode,
        responseData: error.response?.data,
      });

      return {
        status: 'failed',
        error: error.message,
        errorCode: error.response?.data?.code,
        errorDetails: error.response?.data?.details,
        statusCode,
        isValidationError: true,
      };
    }

    // Connection/timeout error
    ordersLogger.error('Order creation failed (after retries)', {
      error: error.message,
      statusCode,
      isRetryable: isRetryableError(error),
    });

    return {
      status: 'failed',
      error: error.message,
      statusCode,
      retries: config.orchestration.maxRetries,
    };
  }
}

/**
 * Format order data for Orders Service
 */
export function formatOrderData(
  requestBody: any,
  deliveryAddress?: any
): any {
  return {
    orderType: requestBody.orderType || 'medicine',
    items: formatItems(requestBody.items),
    facilityId: requestBody.facilityId,
    departmentId: requestBody.departmentId,
    requestedBy: requestBody.requestedBy,
    priority: requestBody.priority || 'normal',
    requiredDate: requestBody.requiredDate || getDefaultRequiredDate(),
    deliveryAddress: deliveryAddress || getDefaultDeliveryAddress(requestBody.facilityId),
    metadata: {
      source: 'orchestration-mediator',
      transformedAt: new Date().toISOString(),
    },
  };
}

/**
 * Format items for Orders Service
 */
function formatItems(items: any[]): any[] {
  return (items || []).map((item: any, idx: number) => ({
    medicineId: item.itemId || item.medicineId || `ITEM-${idx + 1}`,
    name: item.name || item.description || `Item ${idx + 1}`,
    category: item.category || 'medicine-supplies',
    unitOfMeasure: item.unitOfMeasure || 'units',
    quantityOrdered: item.quantity || item.quantityOrdered || 1,
    unitPrice: item.unitPrice,
  }));
}

/**
 * Get default required date (7 days from now)
 */
function getDefaultRequiredDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString();
}

/**
 * Get default delivery address
 */
function getDefaultDeliveryAddress(facilityId: string): any {
  return {
    street: 'Main Street',
    city: facilityId || 'Main City',
    state: 'ST',
    zipCode: '12345',
    country: 'Country',
  };
}
