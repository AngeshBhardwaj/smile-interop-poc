/**
 * Custom Transformation Mediator Configuration
 */

import dotenv from 'dotenv';
dotenv.config();

export const config = {
  service: {
    name: 'custom-transformation-mediator',
    port: parseInt(process.env.PORT || '3303', 10),
    env: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
  },
  client: {
    endpoint: process.env.CLIENT_ENDPOINT || 'http://mock-client-warehouse:3203/orders',
    name: process.env.CLIENT_NAME || 'Warehouse Custom Client',
    timeout: parseInt(process.env.CLIENT_TIMEOUT || '30000', 10),
    retryAttempts: parseInt(process.env.CLIENT_RETRY_ATTEMPTS || '3', 10),
    retryDelay: parseInt(process.env.CLIENT_RETRY_DELAY || '1000', 10),
  },
  openhim: {
    apiURL: process.env.OPENHIM_API_URL || 'https://openhim-core:8080',
    username: process.env.OPENHIM_USERNAME || 'root@openhim.org',
    password: process.env.OPENHIM_PASSWORD || 'password',
    trustSelfSigned: process.env.OPENHIM_TRUST_SELF_SIGNED === 'true',
    mediatorUrn: 'urn:mediator:smile-custom-transformation',
  },
  transformation: {
    rulesPath: process.env.RULES_PATH || './src/transformation-rules',
    rulesDirectory: process.env.RULES_PATH || './src/transformation-rules',
    defaultRule: 'order-to-warehouse-json',
    enableCaching: process.env.ENABLE_RULE_CACHING !== 'false',
    cacheTTL: parseInt(process.env.CACHE_TTL_SECONDS || '300', 10),
  },
};
