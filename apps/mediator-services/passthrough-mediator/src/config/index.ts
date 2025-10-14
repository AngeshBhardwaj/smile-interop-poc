import dotenv from 'dotenv';
import Joi from 'joi';
import { MediatorConfig } from './types';

// Load environment variables
dotenv.config();

/**
 * Configuration schema validation
 */
const configSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  MEDIATOR_PORT: Joi.number().port().default(3100),
  LOG_LEVEL: Joi.string().valid('trace', 'debug', 'info', 'warn', 'error', 'fatal').default('info'),

  // OpenHIM Configuration
  OPENHIM_API_URL: Joi.string().uri().required(),
  OPENHIM_USERNAME: Joi.string().required(),
  OPENHIM_PASSWORD: Joi.string().required(),
  OPENHIM_TRUST_SELF_SIGNED: Joi.boolean().default(true),

  // Webhook Configuration
  WEBHOOK_URL: Joi.string().uri().required(),
  WEBHOOK_TIMEOUT: Joi.number().integer().min(1000).max(60000).default(10000),
  WEBHOOK_RETRY_ATTEMPTS: Joi.number().integer().min(0).max(5).default(3),
});

/**
 * Validate and load configuration
 */
function loadConfig(): MediatorConfig {
  const { error, value: envVars } = configSchema.validate(process.env, {
    allowUnknown: true,
    abortEarly: false,
  });

  if (error) {
    throw new Error(`Configuration validation error: ${error.message}`);
  }

  return {
    port: envVars.MEDIATOR_PORT,
    env: envVars.NODE_ENV,
    logLevel: envVars.LOG_LEVEL,
    openhim: {
      apiURL: envVars.OPENHIM_API_URL,
      username: envVars.OPENHIM_USERNAME,
      password: envVars.OPENHIM_PASSWORD,
      trustSelfSigned: envVars.OPENHIM_TRUST_SELF_SIGNED,
    },
    webhook: {
      url: envVars.WEBHOOK_URL,
      timeout: envVars.WEBHOOK_TIMEOUT,
      retryAttempts: envVars.WEBHOOK_RETRY_ATTEMPTS,
    },
  };
}

/**
 * Export singleton configuration
 */
export const config: MediatorConfig = loadConfig();

/**
 * Export for testing
 */
export { loadConfig };
