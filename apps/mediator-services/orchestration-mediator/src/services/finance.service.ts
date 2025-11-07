/**
 * Finance Service
 * Calls finance-transformation-mediator to calculate pricing
 * Includes cache fallback for resilience
 */

import axios, { AxiosError } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';
import { retryWithBackoff, isRetryableError } from '../utils/retry';
import { v4 as uuidv4 } from 'uuid';

// Simple in-memory cache for pricing data
const pricingCache = new Map<string, any>();

/**
 * Call finance mediator to calculate pricing
 * Falls back to cached/estimated pricing if mediator fails
 */
export async function callFinanceMediator(
  items: any[],
  facilityId: string,
  correlationId: string
): Promise<any> {
  const financeLogger = logger.child({
    context: 'finance-service',
    correlationId,
  });

  // Build CloudEvent format request for finance mediator
  const request = {
    id: correlationId,
    type: 'finance.pricing.calculate',
    source: 'orchestration-mediator',
    time: new Date().toISOString(),
    data: {
      items: items.map((item: any) => ({
        itemId: item.itemId,
        quantity: item.quantity,
        unitPrice: item.unitPrice || 0,
      })),
      facilityId,
    },
  };

  financeLogger.info('Preparing finance mediator call', {
    endpoint: config.mediators.finance.endpoint,
    itemCount: items.length,
  });

  try {
    // Retry logic for finance calls
    const response = await retryWithBackoff(
      async () => {
        financeLogger.debug('Calling finance mediator', {
          endpoint: config.mediators.finance.endpoint,
        });

        return await axios.post(
          config.mediators.finance.endpoint,
          request,
          {
            timeout: config.mediators.finance.timeout,
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
      'Finance mediator call',
      { correlationId }
    );

    financeLogger.info('Finance mediator call successful', {
      statusCode: response.status,
      status: response.data?.status,
    });

    // Extract finance response from OpenHIM format
    const financeResponse = extractMediatorResponse(response.data, financeLogger);

    // Cache the response
    cacheFinancingData(facilityId, financeResponse);

    return {
      status: 'success',
      data: financeResponse,
    };
  } catch (error: any) {
    financeLogger.error('Finance mediator call failed, attempting fallback', {
      error: error.message,
      statusCode: error.response?.status,
      isRetryable: isRetryableError(error),
    });

    // Try to use cached pricing
    const cachedData = getCachedFinancingData(facilityId);
    if (cachedData) {
      financeLogger.info('Using cached pricing data', {
        facilityId,
      });

      return {
        status: 'estimated',
        data: cachedData,
        source: 'cached',
      };
    }

    // Calculate estimated pricing from items
    const estimatedPricing = calculateEstimatedPricing(items);
    financeLogger.info('Using estimated pricing (calculated)', {
      subtotal: estimatedPricing.subtotal,
      tax: estimatedPricing.tax,
      total: estimatedPricing.total,
    });

    // Cache the estimated data
    cacheFinancingData(facilityId, estimatedPricing);

    return {
      status: 'estimated',
      data: estimatedPricing,
      source: 'estimated',
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
    contextLogger.warn('Failed to parse finance response', {
      error: error.message,
    });

    return response;
  }
}

/**
 * Calculate estimated pricing from items
 */
function calculateEstimatedPricing(items: any[]): any {
  const subtotal = items.reduce((sum: number, item: any) => {
    const itemTotal = (item.unitPrice || 0) * (item.quantity || 0);
    return sum + itemTotal;
  }, 0);

  const taxRate = 0.08; // 8% default tax rate
  const tax = parseFloat((subtotal * taxRate).toFixed(2));
  const total = parseFloat((subtotal + tax).toFixed(2));

  return {
    subtotal,
    tax,
    total,
    taxRate: `${(taxRate * 100).toFixed(1)}%`,
    currency: 'USD',
    itemCount: items.length,
  };
}

/**
 * Cache financing data
 */
function cacheFinancingData(facilityId: string, data: any): void {
  pricingCache.set(facilityId, {
    data,
    timestamp: Date.now(),
  });
}

/**
 * Get cached financing data (if recent: within 5 minutes)
 */
function getCachedFinancingData(facilityId: string): any | null {
  const cached = pricingCache.get(facilityId);

  if (!cached) {
    return null;
  }

  // Check if cache is still valid (5 minutes)
  const age = Date.now() - cached.timestamp;
  if (age > 5 * 60 * 1000) {
    pricingCache.delete(facilityId);
    return null;
  }

  return cached.data;
}

/**
 * Clear pricing cache (for testing)
 */
export function clearPricingCache(): void {
  pricingCache.clear();
}
