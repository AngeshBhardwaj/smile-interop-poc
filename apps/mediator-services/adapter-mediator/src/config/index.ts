/**
 * Configuration management for Adapter Mediator
 */

import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Service Configuration
 */
export const config = {
  port: parseInt(process.env.PORT || '3204', 10),
  env: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',

  client: {
    name: process.env.CLIENT_NAME || 'Orders Service',
    endpoint: process.env.CLIENT_ENDPOINT || 'http://orders-service:3005/api/v1/orders',
    timeout: parseInt(process.env.CLIENT_TIMEOUT || '10000', 10),
  },

  openhim: {
    apiURL: process.env.OPENHIM_API_URL || 'https://openhim-core:8080',
    username: process.env.OPENHIM_USERNAME || 'adapter-mediator',
    password: process.env.OPENHIM_PASSWORD || 'password',
    trustSelfSigned: process.env.TRUST_SELF_SIGNED !== 'false',
  },

  transformation: {
    enableLogging: process.env.ENABLE_TRANSFORMATION_LOGGING !== 'false',
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
