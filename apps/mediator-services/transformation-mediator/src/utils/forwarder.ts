/**
 * HTTP forwarder utility for sending transformed data to destinations
 */

import axios, { AxiosError } from 'axios';
import { getLogger } from './logger';
import { config } from '../config';

const logger = getLogger('forwarder');

/**
 * Forward result
 */
export interface ForwardResult {
  success: boolean;
  status?: number;
  headers?: Record<string, string>;
  body?: any;
  error?: string;
  duration: number;
  url: string;
}

/**
 * Forward options
 */
export interface ForwardOptions {
  /** Destination URL (required) */
  url: string;

  /** HTTP method (default: POST) */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

  /** Request headers */
  headers?: Record<string, string>;

  /** Request timeout in ms */
  timeout?: number;

  /** Number of retry attempts on failure */
  retryAttempts?: number;

  /** Correlation ID for tracking */
  correlationId?: string;
}

/**
 * Forward data to a destination URL with retry logic
 */
export async function forwardData(
  data: any,
  options: ForwardOptions
): Promise<ForwardResult> {
  const startTime = Date.now();
  const {
    url,
    method = 'POST',
    headers = {},
    timeout = config.destination.timeout,
    retryAttempts = config.destination.retryAttempts,
    correlationId,
  } = options;

  logger.info({
    msg: 'Forwarding data to destination',
    url,
    method,
    correlationId,
    timeout,
    retryAttempts,
  });

  // Add default headers
  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (correlationId) {
    requestHeaders['X-Correlation-ID'] = correlationId;
  }

  let lastError: Error | null = null;
  let attempt = 0;

  while (attempt <= retryAttempts) {
    try {
      logger.debug({
        msg: 'Attempting to forward data',
        url,
        attempt: attempt + 1,
        maxAttempts: retryAttempts + 1,
        correlationId,
      });

      const response = await axios({
        method,
        url,
        data,
        headers: requestHeaders,
        timeout,
        validateStatus: () => true, // Don't throw on any status code
      });

      const duration = Date.now() - startTime;

      // Success if status is 2xx
      if (response.status >= 200 && response.status < 300) {
        logger.info({
          msg: 'Data forwarded successfully',
          url,
          status: response.status,
          duration,
          attempt: attempt + 1,
          correlationId,
        });

        return {
          success: true,
          status: response.status,
          headers: response.headers as Record<string, string>,
          body: response.data,
          duration,
          url,
        };
      }

      // If non-2xx status and we have retries left, try again
      if (attempt < retryAttempts) {
        logger.warn({
          msg: 'Forward failed with non-2xx status, retrying',
          url,
          status: response.status,
          attempt: attempt + 1,
          correlationId,
        });

        await sleep(getBackoffDelay(attempt));
        attempt++;
        continue;
      }

      // No more retries, return failure
      const duration2 = Date.now() - startTime;
      logger.error({
        msg: 'Forward failed after all retries',
        url,
        status: response.status,
        attempts: attempt + 1,
        duration: duration2,
        correlationId,
      });

      return {
        success: false,
        status: response.status,
        headers: response.headers as Record<string, string>,
        body: response.data,
        error: `HTTP ${response.status}: ${response.statusText || 'Request failed'}`,
        duration: duration2,
        url,
      };
    } catch (error: any) {
      lastError = error;

      const axiosError = error as AxiosError;
      const errorMessage = axiosError.response
        ? `HTTP ${axiosError.response.status}: ${axiosError.message}`
        : axiosError.code
        ? `${axiosError.code}: ${axiosError.message}`
        : error.message;

      logger.warn({
        msg: 'Forward attempt failed',
        url,
        attempt: attempt + 1,
        error: errorMessage,
        correlationId,
      });

      // If we have retries left, wait and try again
      if (attempt < retryAttempts) {
        await sleep(getBackoffDelay(attempt));
        attempt++;
        continue;
      }

      // No more retries
      break;
    }
  }

  // All retries exhausted
  const duration = Date.now() - startTime;

  logger.error({
    msg: 'Forward failed after all retry attempts',
    url,
    attempts: attempt + 1,
    duration,
    error: lastError?.message,
    correlationId,
  });

  return {
    success: false,
    error: lastError?.message || 'Unknown error',
    duration,
    url,
  };
}

/**
 * Calculate exponential backoff delay
 */
function getBackoffDelay(attempt: number): number {
  // Exponential backoff: 1s, 2s, 4s, 8s, ...
  const baseDelay = 1000;
  const delay = baseDelay * Math.pow(2, attempt);
  const maxDelay = 30000; // Cap at 30 seconds

  return Math.min(delay, maxDelay);
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Forward to multiple destinations in parallel
 */
export async function forwardToMultiple(
  data: any,
  destinations: ForwardOptions[]
): Promise<ForwardResult[]> {
  logger.info({
    msg: 'Forwarding data to multiple destinations',
    count: destinations.length,
  });

  const promises = destinations.map((dest) => forwardData(data, dest));
  const results = await Promise.allSettled(promises);

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        success: false,
        error: result.reason?.message || 'Unknown error',
        duration: 0,
        url: destinations[index].url,
      };
    }
  });
}
