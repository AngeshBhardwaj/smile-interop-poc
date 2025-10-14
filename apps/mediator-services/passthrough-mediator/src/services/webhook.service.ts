import axios, { AxiosResponse } from 'axios';
import { config } from '../config';
import { CloudEvent } from '../config/types';
import { logger } from '../utils/logger';

/**
 * Webhook response structure
 */
export interface WebhookResponse {
  status: number;
  data: any;
  headers: Record<string, any>;
}

/**
 * Forward CloudEvent to configured webhook
 */
export async function forwardToWebhook(
  event: CloudEvent,
  correlationId?: string
): Promise<WebhookResponse> {
  const startTime = Date.now();

  logger.info('Forwarding CloudEvent to webhook', {
    eventId: event.id,
    eventType: event.type,
    eventSource: event.source,
    webhookUrl: config.webhook.url,
    correlationId,
  });

  try {
    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/cloudevents+json',
      'ce-specversion': event.specversion,
      'ce-type': event.type,
      'ce-source': event.source,
      'ce-id': event.id,
    };

    // Add optional CloudEvent headers
    if (event.time) {
      headers['ce-time'] = event.time;
    }
    if (event.datacontenttype) {
      headers['ce-datacontenttype'] = event.datacontenttype;
    }
    if (event.subject) {
      headers['ce-subject'] = event.subject;
    }

    // Add correlation ID if provided
    if (correlationId) {
      headers['X-Correlation-ID'] = correlationId;
    }

    // Forward to webhook
    const response: AxiosResponse = await axios.post(config.webhook.url, event, {
      headers,
      timeout: config.webhook.timeout,
      validateStatus: (status) => status < 500, // Don't throw on 4xx errors
    });

    const duration = Date.now() - startTime;

    logger.info('CloudEvent successfully forwarded to webhook', {
      eventId: event.id,
      webhookStatus: response.status,
      duration,
      correlationId,
    });

    return {
      status: response.status,
      data: response.data,
      headers: response.headers as Record<string, any>,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;

    logger.error('Failed to forward CloudEvent to webhook', {
      eventId: event.id,
      error: error.message,
      code: error.code,
      duration,
      correlationId,
    });

    throw error;
  }
}

/**
 * Retry wrapper for webhook forwarding (with exponential backoff)
 */
export async function forwardToWebhookWithRetry(
  event: CloudEvent,
  correlationId?: string,
  attempt: number = 0
): Promise<WebhookResponse> {
  try {
    return await forwardToWebhook(event, correlationId);
  } catch (error: any) {
    const maxAttempts = config.webhook.retryAttempts;

    if (attempt >= maxAttempts) {
      logger.error('Max retry attempts reached for webhook forward', {
        eventId: event.id,
        attempt,
        maxAttempts,
        correlationId,
      });
      throw error;
    }

    // Calculate backoff delay (exponential with jitter)
    const baseDelay = 1000;
    const exponentialDelay = baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 1000;
    const delay = exponentialDelay + jitter;

    logger.warn('Retrying webhook forward after delay', {
      eventId: event.id,
      attempt: attempt + 1,
      maxAttempts,
      delay,
      correlationId,
    });

    // Wait before retry
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Retry
    return forwardToWebhookWithRetry(event, correlationId, attempt + 1);
  }
}
