/**
 * OpenHIM Bridge
 *
 * Simple protocol bridge that converts CloudEvents to HTTP requests for OpenHIM.
 *
 * Key responsibilities:
 * 1. Map event.source to OpenHIM endpoint (simple mapping)
 * 2. Convert CloudEvent to HTTP POST request
 * 3. Send to OpenHIM with authentication
 * 4. Return HTTP response
 * 5. Track basic statistics
 */

import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { logger } from '@smile/common';

/**
 * Constants
 */
const EVENT_SOURCES = {
  HEALTH_SERVICE: 'smile.health-service',
  ORDERS_SERVICE: 'smile.orders-service',
} as const;

const CONTENT_TYPE = 'application/cloudevents+json';
const CORRELATION_HEADER = 'X-Correlation-ID';

/**
 * OpenHIM Bridge configuration
 */
export interface OpenHIMConfig {
  healthEndpoint: string; // For smile.health-service events
  ordersEndpoint: string; // For smile.orders-service events
  defaultEndpoint: string; // Fallback for unknown sources
  username: string; // OpenHIM username
  password: string; // OpenHIM password
  timeout: number; // HTTP request timeout in ms
  retryAttempts: number; // Number of retry attempts
  retryDelay: number; // Delay between retries in ms
}

/**
 * OpenHIM response
 */
export interface OpenHIMResponse {
  success: boolean;
  statusCode?: number;
  statusText?: string;
  data?: any;
  error?: string;
  timestamp: string;
}

/**
 * Bridge statistics
 */
export interface BridgeStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTimeMs: number;
}

/**
 * OpenHIM Bridge implementation
 */
export class OpenHIMBridge {
  private config: OpenHIMConfig;
  private stats: BridgeStats;
  private responseTimes: number[] = [];

  constructor(config: OpenHIMConfig) {
    this.validateConfig(config);
    this.config = config;
    this.stats = this.createInitialStats();

    logger.info('OpenHIM Bridge initialized', {
      healthEndpoint: config.healthEndpoint,
      ordersEndpoint: config.ordersEndpoint,
      defaultEndpoint: config.defaultEndpoint,
      timeout: config.timeout,
    });
  }

  /**
   * Validate configuration
   *
   * @param config - Configuration to validate
   * @throws Error if configuration is invalid
   */
  private validateConfig(config: OpenHIMConfig): void {
    if (!config.healthEndpoint || config.healthEndpoint.trim() === '') {
      throw new Error('healthEndpoint is required');
    }

    if (!config.ordersEndpoint || config.ordersEndpoint.trim() === '') {
      throw new Error('ordersEndpoint is required');
    }

    if (!config.defaultEndpoint || config.defaultEndpoint.trim() === '') {
      throw new Error('defaultEndpoint is required');
    }

    if (!config.username || config.username.trim() === '') {
      throw new Error('username is required');
    }

    if (!config.password || config.password.trim() === '') {
      throw new Error('password is required');
    }
  }

  /**
   * Get OpenHIM endpoint based on event source
   *
   * @param source - CloudEvent source field
   * @returns OpenHIM endpoint URL
   */
  public getEndpointForSource(source: string): string {
    if (source === EVENT_SOURCES.HEALTH_SERVICE) {
      return this.config.healthEndpoint;
    } else if (source === EVENT_SOURCES.ORDERS_SERVICE) {
      return this.config.ordersEndpoint;
    } else {
      return this.config.defaultEndpoint;
    }
  }

  /**
   * Send CloudEvent to OpenHIM
   *
   * @param event - CloudEvent to send
   * @param correlationId - Correlation ID for tracing
   * @returns OpenHIM response
   */
  public async sendToOpenHIM(event: any, correlationId: string): Promise<OpenHIMResponse> {
    const startTime = Date.now();

    // Determine endpoint based on source (declare outside try for error logging)
    const endpoint = this.getEndpointForSource(event.source);

    try {
      // Build request configuration
      const requestConfig: AxiosRequestConfig = {
        headers: {
          'Content-Type': CONTENT_TYPE,
          [CORRELATION_HEADER]: correlationId,
          Authorization: this.buildAuthHeader(),
        },
        timeout: this.config.timeout,
      };

      logger.info('Sending CloudEvent to OpenHIM', {
        endpoint,
        eventType: event.type,
        eventSource: event.source,
        eventId: event.id,
        correlationId,
      });

      // Send HTTP POST request
      const response = await axios.post(endpoint, event, requestConfig);

      // Calculate response time
      const responseTime = Date.now() - startTime;
      this.recordSuccess(responseTime);

      logger.info('OpenHIM request successful', {
        endpoint,
        statusCode: response.status,
        statusText: response.statusText,
        responseTime,
        correlationId,
      });

      return {
        success: true,
        statusCode: response.status,
        statusText: response.statusText,
        data: response.data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      // Calculate response time (even for errors)
      const responseTime = Date.now() - startTime;
      this.recordFailure(responseTime);

      // Log the full axios error (if available) for easier debugging
      const axiosErr = error as AxiosError;
      if (axiosErr.response) {
        logger.error('OpenHIM HTTP error response body', {
          endpoint,
          statusCode: axiosErr.response.status,
          statusText: axiosErr.response.statusText,
          data: axiosErr.response.data,
          correlationId,
        });
      }

      return this.handleError(error, correlationId);
    }
  }

  /**
   * Build Basic authentication header
   *
   * @returns Base64-encoded Basic auth header value
   */
  private buildAuthHeader(): string {
    const credentials = `${this.config.username}:${this.config.password}`;
    const base64Credentials = Buffer.from(credentials).toString('base64');
    return `Basic ${base64Credentials}`;
  }

  /**
   * Handle HTTP errors
   *
   * @param error - Error object
   * @param correlationId - Correlation ID for tracing
   * @returns OpenHIM error response
   */
  private handleError(error: any, correlationId: string): OpenHIMResponse {
    const axiosError = error as AxiosError;

    if (axiosError.response) {
      // HTTP error response (4xx, 5xx)
      logger.error('OpenHIM request failed with HTTP error', {
        statusCode: axiosError.response.status,
        statusText: axiosError.response.statusText,
        data: axiosError.response.data,
        correlationId,
      });

      return {
        success: false,
        statusCode: axiosError.response.status,
        statusText: axiosError.response.statusText,
        data: axiosError.response.data,
        error: `HTTP ${axiosError.response.status}: ${axiosError.response.statusText}`,
        timestamp: new Date().toISOString(),
      };
    } else if (axiosError.code) {
      // Network error (ECONNREFUSED, ECONNABORTED, etc.)
      logger.error('OpenHIM request failed with network error', {
        code: axiosError.code,
        message: axiosError.message,
        correlationId,
      });

      return {
        success: false,
        error: `Network error: ${axiosError.message}`,
        timestamp: new Date().toISOString(),
      };
    } else {
      // Unknown error
      logger.error('OpenHIM request failed with unknown error', {
        error: error instanceof Error ? error.message : String(error),
        correlationId,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Record successful request
   *
   * @param responseTimeMs - Response time in milliseconds
   */
  private recordSuccess(responseTimeMs: number): void {
    this.stats.totalRequests++;
    this.stats.successfulRequests++;
    this.responseTimes.push(responseTimeMs);
    this.updateAverageResponseTime();
  }

  /**
   * Record failed request
   *
   * @param responseTimeMs - Response time in milliseconds
   */
  private recordFailure(responseTimeMs: number): void {
    this.stats.totalRequests++;
    this.stats.failedRequests++;
    this.responseTimes.push(responseTimeMs);
    this.updateAverageResponseTime();
  }

  /**
   * Update average response time
   */
  private updateAverageResponseTime(): void {
    if (this.responseTimes.length === 0) {
      this.stats.averageResponseTimeMs = 0;
      return;
    }

    const sum = this.responseTimes.reduce((acc, time) => acc + time, 0);
    this.stats.averageResponseTimeMs = Math.round(sum / this.responseTimes.length);
  }

  /**
   * Get bridge statistics
   *
   * @returns Current statistics
   */
  public getStats(): BridgeStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  public resetStats(): void {
    this.stats = this.createInitialStats();
    this.responseTimes = [];
  }

  /**
   * Create initial statistics object
   *
   * @returns Initial stats with zero values
   */
  private createInitialStats(): BridgeStats {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTimeMs: 0,
    };
  }
}
