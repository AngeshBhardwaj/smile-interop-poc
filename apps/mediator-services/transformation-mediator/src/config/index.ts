import Joi from 'joi';
import dotenv from 'dotenv';
import { AppConfig } from './types';

// Load environment variables
dotenv.config();

/**
 * Configuration schema with Joi validation
 */
const configSchema = Joi.object({
  service: Joi.object({
    port: Joi.number().port().default(3101),
    env: Joi.string().valid('development', 'production', 'test').default('development'),
    logLevel: Joi.string().valid('debug', 'info', 'warn', 'error').default('info'),
  }).required(),

  openhim: Joi.object({
    apiURL: Joi.string().uri().required(),
    username: Joi.string().required(),
    password: Joi.string().required(),
    trustSelfSigned: Joi.boolean().default(false),
  }).required(),

  transformation: Joi.object({
    rulesDirectory: Joi.string().required(),
    enableCaching: Joi.boolean().default(true),
    cacheTTL: Joi.number().integer().min(0).default(300),
  }).required(),

  destination: Joi.object({
    defaultURL: Joi.string().uri().optional(),
    timeout: Joi.number().integer().min(1000).max(120000).default(30000),
    retryAttempts: Joi.number().integer().min(0).max(5).default(3),
  }).required(),
}).required();

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(): AppConfig {
  const rawConfig = {
    service: {
      port: process.env.MEDIATOR_PORT ? parseInt(process.env.MEDIATOR_PORT, 10) : undefined,
      env: process.env.NODE_ENV,
      logLevel: process.env.LOG_LEVEL,
    },
    openhim: {
      apiURL: process.env.OPENHIM_API_URL,
      username: process.env.OPENHIM_USERNAME,
      password: process.env.OPENHIM_PASSWORD,
      trustSelfSigned: process.env.OPENHIM_TRUST_SELF_SIGNED === 'true',
    },
    transformation: {
      rulesDirectory: process.env.RULES_DIRECTORY,
      enableCaching: process.env.ENABLE_RULE_CACHING !== 'false',
      cacheTTL: process.env.CACHE_TTL_SECONDS
        ? parseInt(process.env.CACHE_TTL_SECONDS, 10)
        : undefined,
    },
    destination: {
      defaultURL: process.env.DEFAULT_DESTINATION,
      timeout: process.env.DEFAULT_TIMEOUT
        ? parseInt(process.env.DEFAULT_TIMEOUT, 10)
        : undefined,
      retryAttempts: process.env.DEFAULT_RETRY_ATTEMPTS
        ? parseInt(process.env.DEFAULT_RETRY_ATTEMPTS, 10)
        : undefined,
    },
  };

  const { error, value } = configSchema.validate(rawConfig, {
    abortEarly: false,
    allowUnknown: false,
  });

  if (error) {
    throw new Error(`Configuration validation failed: ${error.message}`);
  }

  return value as AppConfig;
}

/**
 * Singleton config instance
 */
export const config = loadConfig();
