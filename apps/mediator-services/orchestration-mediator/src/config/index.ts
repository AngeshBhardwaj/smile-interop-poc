/**
 * Configuration management for Orchestration Mediator
 */

import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Service Configuration
 */
export const config = {
  port: parseInt(process.env.PORT || '3206', 10),
  env: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',

  openhim: {
    apiURL: process.env.OPENHIM_API_URL || 'https://openhim-core:8080',
    username: process.env.OPENHIM_USERNAME || 'root@openhim.org',
    password: process.env.OPENHIM_PASSWORD || 'password',
    trustSelfSigned: process.env.OPENHIM_TRUST_SELF_SIGNED !== 'false',
  },

  // Mediator endpoints
  mediators: {
    warehouse: {
      endpoint: process.env.WAREHOUSE_ENDPOINT || 'http://warehouse-transformation-mediator:3301/transform',
      timeout: parseInt(process.env.WAREHOUSE_TIMEOUT || '5000', 10),
    },
    finance: {
      endpoint: process.env.FINANCE_ENDPOINT || 'http://finance-transformation-mediator:3302/transform',
      timeout: parseInt(process.env.FINANCE_TIMEOUT || '5000', 10),
    },
    audit: {
      endpoint: process.env.AUDIT_ENDPOINT || 'http://audit-transformation-mediator:3303/transform',
      timeout: parseInt(process.env.AUDIT_TIMEOUT || '5000', 10),
    },
  },

  // Orders service endpoint
  ordersService: {
    endpoint: process.env.ORDERS_ENDPOINT || 'http://orders-service:3005/api/v1/orders',
    timeout: parseInt(process.env.ORDERS_TIMEOUT || '5000', 10),
    authToken: process.env.ORDERS_AUTH_TOKEN || 'mock-jwt-token',
  },

  // Orchestration settings
  orchestration: {
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
    retryDelays: [1000, 2000, 4000], // 1s, 2s, 4s backoff
    jitterEnabled: process.env.RETRY_JITTER !== 'false',
    maxTotalExecutionTime: parseInt(process.env.MAX_TOTAL_EXECUTION_MS || '30000', 10),
  },
};

/**
 * Validate configuration at startup
 */
export function validateConfig(): void {
  if (!config.port || config.port < 1 || config.port > 65535) {
    throw new Error(`Invalid PORT: ${config.port}`);
  }

  if (!config.openhim.apiURL) {
    throw new Error('OPENHIM_API_URL is required');
  }

  if (!config.mediators.warehouse.endpoint) {
    throw new Error('WAREHOUSE_ENDPOINT is required');
  }

  if (!config.mediators.finance.endpoint) {
    throw new Error('FINANCE_ENDPOINT is required');
  }

  if (!config.mediators.audit.endpoint) {
    throw new Error('AUDIT_ENDPOINT is required');
  }

  if (!config.ordersService.endpoint) {
    throw new Error('ORDERS_ENDPOINT is required');
  }
}
