/**
 * Retry utility with exponential backoff
 */

import { logger } from './logger';

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  delayMs: number[];
  jitterEnabled?: boolean;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  delayMs: [1000, 2000, 4000], // 1s, 2s, 4s
  jitterEnabled: true,
};

/**
 * Retry a function with exponential backoff
 *
 * @param fn Function to retry
 * @param config Retry configuration
 * @param operationName Name of operation for logging
 * @param context Additional context for logging
 * @returns Result of the function or throws error after all retries exhausted
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  operationName: string = 'operation',
  context: Record<string, any> = {}
): Promise<T> {
  const finalConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      // First attempt (attempt 0) - no delay
      if (attempt > 0) {
        const delayIndex = Math.min(attempt - 1, finalConfig.delayMs.length - 1);
        let delayMs = finalConfig.delayMs[delayIndex];

        // Add jitter: ±20% randomness
        if (finalConfig.jitterEnabled) {
          const jitterAmount = delayMs * 0.2;
          const jitter = (Math.random() - 0.5) * 2 * jitterAmount;
          delayMs = Math.max(0, delayMs + jitter);
        }

        logger.info(`Retry ${operationName} - waiting before attempt ${attempt + 1}`, {
          ...context,
          attempt,
          maxRetries: finalConfig.maxRetries,
          delayMs: Math.round(delayMs),
        });

        await sleep(delayMs);
      }

      // Execute the function
      logger.debug(`Attempting ${operationName}`, {
        ...context,
        attempt: attempt + 1,
        maxRetries: finalConfig.maxRetries + 1,
      });

      const result = await fn();

      // Success
      if (attempt > 0) {
        logger.info(`${operationName} succeeded on retry`, {
          ...context,
          attempt: attempt + 1,
          totalAttempts: finalConfig.maxRetries + 1,
        });
      }

      return result;
    } catch (error: any) {
      lastError = error;

      if (attempt === finalConfig.maxRetries) {
        // All retries exhausted
        logger.error(`${operationName} failed after all retries`, {
          ...context,
          attempt: attempt + 1,
          maxRetries: finalConfig.maxRetries + 1,
          error: error.message,
          errorCode: error.code,
          statusCode: error.response?.status,
        });
        break;
      }

      logger.warn(`${operationName} attempt ${attempt + 1} failed, will retry`, {
        ...context,
        attempt: attempt + 1,
        maxRetries: finalConfig.maxRetries + 1,
        error: error.message,
        errorCode: error.code,
        statusCode: error.response?.status,
      });
    }
  }

  // All retries exhausted
  throw lastError || new Error(`${operationName} failed after ${finalConfig.maxRetries + 1} attempts`);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if error is retryable
 * Non-retryable errors: 400, 401, 403, 404, 422, etc.
 */
export function isRetryableError(error: any): boolean {
  // Connection errors are retryable
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
    return true;
  }

  // Timeout is retryable
  if (error.code === 'ECONNABORTED') {
    return true;
  }

  // HTTP status codes
  if (error.response?.status) {
    const status = error.response.status;
    // 5xx errors are retryable
    if (status >= 500) {
      return true;
    }
    // 4xx errors are NOT retryable (except 408 Request Timeout and 429 Too Many Requests)
    if (status === 408 || status === 429) {
      return true;
    }
    return false;
  }

  // Unknown errors: assume not retryable
  return false;
}
