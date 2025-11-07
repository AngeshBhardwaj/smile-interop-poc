/**
 * Audit Service
 * Calls audit-transformation-mediator for compliance validation
 * Non-critical: failures don't block orchestration
 */

import axios, { AxiosError } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';
import { retryWithBackoff, isRetryableError } from '../utils/retry';
import { v4 as uuidv4 } from 'uuid';

/**
 * Call audit mediator for compliance validation
 */
export async function callAuditMediator(
  items: any[],
  facilityId: string,
  requestedBy: string,
  correlationId: string
): Promise<any> {
  const auditLogger = logger.child({
    context: 'audit-service',
    correlationId,
  });

  // Build CloudEvent format request for audit mediator
  const request = {
    id: correlationId,
    type: 'audit.compliance.validate',
    source: 'orchestration-mediator',
    time: new Date().toISOString(),
    data: {
      items: items.map((item: any) => item.itemId),
      facilityId,
      requestedBy,
    },
  };

  auditLogger.info('Preparing audit mediator call', {
    endpoint: config.mediators.audit.endpoint,
    itemCount: items.length,
    facilityId,
    requestedBy,
  });

  try {
    // Retry logic for audit calls
    const response = await retryWithBackoff(
      async () => {
        auditLogger.debug('Calling audit mediator', {
          endpoint: config.mediators.audit.endpoint,
        });

        return await axios.post(
          config.mediators.audit.endpoint,
          request,
          {
            timeout: config.mediators.audit.timeout,
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
      'Audit mediator call',
      { correlationId }
    );

    auditLogger.info('Audit mediator call successful', {
      statusCode: response.status,
      status: response.data?.status,
    });

    // Extract audit response from OpenHIM format
    const auditResponse = extractMediatorResponse(response.data, auditLogger);

    return {
      status: 'success',
      data: auditResponse,
    };
  } catch (error: any) {
    // Audit is non-critical - log but don't throw
    auditLogger.warn('Audit mediator call failed (non-critical)', {
      error: error.message,
      statusCode: error.response?.status,
      isRetryable: isRetryableError(error),
    });

    return {
      status: 'failed',
      error: error.message,
      retries: config.orchestration.maxRetries,
      // Non-critical: return success indicator to continue orchestration
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
    contextLogger.warn('Failed to parse audit response', {
      error: error.message,
    });

    return response;
  }
}
