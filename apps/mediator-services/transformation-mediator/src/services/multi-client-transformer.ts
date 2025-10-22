import axios, { AxiosError } from 'axios';
import { CloudEvent } from '../config/types';
import { getLogger } from '../utils/logger';
import { getClientLoader } from '../clients/client-loader';
import { transform } from './transformer.service';
import { loadRuleByName } from '../rules/rule-loader';
import {
  ClientConfig,
  ClientDeliveryResult,
  FanOutResult,
  TransformationContext,
} from '../clients/types';

const logger = getLogger('multi-client-transformer');

/**
 * Multi-client transformation and fan-out service
 */
export class MultiClientTransformer {
  private clientLoader = getClientLoader();

  /**
   * Process a CloudEvent and fan-out to all matching clients
   */
  public async processAndFanOut(
    cloudEvent: CloudEvent
  ): Promise<FanOutResult> {
    const startTime = Date.now();
    const eventType = cloudEvent.type;

    logger.info('Starting multi-client fan-out', {
      eventId: cloudEvent.id,
      eventType,
      source: cloudEvent.source,
    });

    // Get all clients that should receive this event type
    const matchingClients = this.clientLoader.getClients({
      eventType,
      enabledOnly: true,
    });

    if (matchingClients.length === 0) {
      logger.warn('No matching clients found for event type', { eventType });
      return {
        eventId: cloudEvent.id,
        eventType,
        totalClients: 0,
        successfulDeliveries: 0,
        failedDeliveries: 0,
        results: [],
        totalDuration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    logger.info(`Found ${matchingClients.length} matching clients`, {
      clientIds: matchingClients.map(c => c.id),
    });

    // Process all clients in parallel
    const deliveryPromises = matchingClients.map(client =>
      this.deliverToClient(client, cloudEvent)
    );

    const results = await Promise.allSettled(deliveryPromises);

    // Aggregate results
    const deliveryResults: ClientDeliveryResult[] = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // Promise was rejected
        const client = matchingClients[index];
        return {
          clientId: client.id,
          clientName: client.name,
          success: false,
          responseTime: 0,
          error: result.reason,
          errorMessage: result.reason?.message || 'Unknown error',
          endpoint: client.endpoint,
          timestamp: new Date().toISOString(),
        };
      }
    });

    const successfulDeliveries = deliveryResults.filter(r => r.success).length;
    const failedDeliveries = deliveryResults.filter(r => !r.success).length;

    const fanOutResult: FanOutResult = {
      eventId: cloudEvent.id,
      eventType,
      totalClients: matchingClients.length,
      successfulDeliveries,
      failedDeliveries,
      results: deliveryResults,
      totalDuration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };

    logger.info('Multi-client fan-out completed', {
      eventId: cloudEvent.id,
      totalClients: matchingClients.length,
      successfulDeliveries,
      failedDeliveries,
      duration: fanOutResult.totalDuration,
    });

    return fanOutResult;
  }

  /**
   * Deliver transformed event to a single client
   */
  private async deliverToClient(
    client: ClientConfig,
    cloudEvent: CloudEvent
  ): Promise<ClientDeliveryResult> {
    const startTime = Date.now();

    try {
      logger.info('Delivering to client', {
        clientId: client.id,
        clientName: client.name,
        endpoint: client.endpoint,
      });

      // Apply transformations for this client
      const transformedData = await this.applyClientTransformations(client, cloudEvent);

      // Deliver to client endpoint with retry logic
      const deliveryResult = await this.deliverWithRetry(
        client,
        transformedData,
        cloudEvent
      );

      // Record success
      this.clientLoader.recordSuccess(client.id);

      const responseTime = Date.now() - startTime;

      return {
        clientId: client.id,
        clientName: client.name,
        success: true,
        statusCode: deliveryResult.statusCode,
        responseTime,
        transformationRule: client.transformationRules.join(', '),
        endpoint: client.endpoint,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      // Record failure
      this.clientLoader.recordFailure(client.id);

      const responseTime = Date.now() - startTime;
      const err = error as Error;

      logger.error('Failed to deliver to client', {
        clientId: client.id,
        clientName: client.name,
        error: err.message,
        responseTime,
      });

      return {
        clientId: client.id,
        clientName: client.name,
        success: false,
        responseTime,
        error: err,
        errorMessage: err.message,
        transformationRule: client.transformationRules.join(', '),
        endpoint: client.endpoint,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Apply all transformation rules for a client
   */
  private async applyClientTransformations(
    client: ClientConfig,
    cloudEvent: CloudEvent
  ): Promise<any> {
    if (client.transformationRules.length === 0) {
      // No transformation, return original CloudEvent
      return cloudEvent;
    }

    let transformedData: any = cloudEvent;

    // Apply each transformation rule in sequence
    for (const ruleId of client.transformationRules) {
      logger.debug({
        msg: 'Applying transformation rule',
        ruleId,
        clientId: client.id,
      });

      // Use existing transform function with rule name
      const transformResult = await transform(transformedData, {
        ruleName: ruleId,
        validateOutput: false, // We'll validate at the end
        continueOnError: false,
      });

      if (!transformResult.success) {
        throw new Error(
          `Transformation failed for rule ${ruleId}: ${transformResult.errors?.join(', ')}`
        );
      }

      transformedData = transformResult.data;
    }

    return transformedData;
  }

  /**
   * Deliver to client with retry logic
   */
  private async deliverWithRetry(
    client: ClientConfig,
    data: any,
    cloudEvent: CloudEvent
  ): Promise<{ statusCode: number; data: any }> {
    let lastError: Error | null = null;
    const maxAttempts = client.retryAttempts + 1; // Initial attempt + retries

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.debug('Attempting delivery', {
          clientId: client.id,
          attempt,
          maxAttempts,
        });

        // Determine content type based on data format
        const isHL7String = typeof data === 'string' && data.startsWith('MSH');
        const contentType = isHL7String ? 'text/plain' : 'application/json';

        const response = await axios.post(client.endpoint, data, {
          timeout: client.timeout,
          headers: {
            'Content-Type': contentType,
            'X-Event-Id': cloudEvent.id,
            'X-Event-Type': cloudEvent.type,
            'X-Event-Source': cloudEvent.source,
            'X-Client-Id': client.id,
            ...this.getAuthHeaders(client),
          },
        });

        logger.info('Successfully delivered to client', {
          clientId: client.id,
          statusCode: response.status,
          attempt,
        });

        return {
          statusCode: response.status,
          data: response.data,
        };
      } catch (error) {
        lastError = error as Error;
        const axiosError = error as AxiosError;

        logger.warn('Delivery attempt failed', {
          clientId: client.id,
          attempt,
          maxAttempts,
          error: axiosError.message,
          statusCode: axiosError.response?.status,
        });

        // Don't retry on client errors (4xx)
        if (axiosError.response?.status && axiosError.response.status >= 400 && axiosError.response.status < 500) {
          logger.error('Client error, not retrying', {
            clientId: client.id,
            statusCode: axiosError.response.status,
          });
          throw error;
        }

        // Wait before retry (except on last attempt)
        if (attempt < maxAttempts) {
          const delay = client.retryDelay * attempt; // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All attempts failed
    throw lastError || new Error('Delivery failed after all retry attempts');
  }

  /**
   * Get authentication headers for client
   */
  private getAuthHeaders(client: ClientConfig): Record<string, string> {
    const headers: Record<string, string> = {};

    switch (client.authType) {
      case 'basic':
        if (client.authConfig?.username && client.authConfig?.password) {
          const credentials = Buffer.from(
            `${client.authConfig.username}:${client.authConfig.password}`
          ).toString('base64');
          headers['Authorization'] = `Basic ${credentials}`;
        }
        break;

      case 'bearer':
        if (client.authConfig?.token) {
          headers['Authorization'] = `Bearer ${client.authConfig.token}`;
        }
        break;

      case 'api-key':
        if (client.authConfig?.apiKey) {
          const headerName = client.authConfig.apiKeyHeader || 'X-API-Key';
          headers[headerName] = client.authConfig.apiKey;
        }
        break;

      case 'none':
      default:
        // No authentication
        break;
    }

    return headers;
  }

  /**
   * Get statistics for all clients
   */
  public getClientStats() {
    const allClients = this.clientLoader.getClients({ enabledOnly: false });

    return allClients.map(client => ({
      id: client.id,
      name: client.name,
      enabled: client.enabled,
      endpoint: client.endpoint,
      eventTypes: client.eventTypes,
      transformationRules: client.transformationRules,
      circuitBreaker: this.clientLoader.getCircuitBreakerState(client.id),
    }));
  }
}
