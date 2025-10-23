/**
 * Configuration management for Warehouse Transformation Mediator
 */

import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Service Configuration
 */
export const config = {
  port: parseInt(process.env.PORT || '3301', 10),
  env: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',

  client: {
    name: process.env.CLIENT_NAME || 'Warehouse Fulfillment Client',
    endpoint: process.env.CLIENT_ENDPOINT || 'http://warehouse-client:3201/orders',
    timeout: parseInt(process.env.CLIENT_TIMEOUT || '5000', 10),
  },

  openhim: {
    apiURL: process.env.OPENHIM_API_URL || 'https://openhim-core:8080',
    username: process.env.OPENHIM_USERNAME || 'warehouse-mediator',
    password: process.env.OPENHIM_PASSWORD || 'password',
    trustSelfSigned: process.env.TRUST_SELF_SIGNED !== 'false',
  },

  transformation: {
    rulesDirectory: process.env.RULES_DIRECTORY || './src/transformation-rules',
    enableCaching: process.env.RULE_CACHE_ENABLED !== 'false',
    cacheTTL: parseInt(process.env.RULE_CACHE_TTL || '300', 10),
  },
};

/**
 * Validate configuration at startup
 */
export function validateConfig(): void {
  if (!config.port || config.port < 1 || config.port > 65535) {
    throw new Error(`Invalid PORT: ${config.port}`);
  }

  if (!config.client.endpoint) {
    throw new Error('CLIENT_ENDPOINT is required');
  }

  if (!config.openhim.apiURL) {
    throw new Error('OPENHIM_API_URL is required');
  }
}
