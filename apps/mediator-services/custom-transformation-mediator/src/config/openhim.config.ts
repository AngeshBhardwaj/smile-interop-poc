import { config } from './index';

/**
 * OpenHIM API Configuration
 * Used by openhim-mediator-utils for registration and heartbeat
 */
export const openhimConfig = {
  apiURL: config.openhim.apiURL,
  username: config.openhim.username,
  password: config.openhim.password,
  trustSelfSigned: config.openhim.trustSelfSigned,
  urn: config.openhim.mediatorUrn,
};

/**
 * Get mediator configuration
 * Loads from mediatorConfig.json and injects runtime values
 */
export function getMediatorConfig() {
  // Load mediator configuration from JSON file
  const mediatorConfig = require('../../mediatorConfig.json');

  // Update dynamic values from environment/config
  if (mediatorConfig.configDefs) {
    mediatorConfig.config = {
      clientEndpoint: config.client.endpoint,
      clientTimeout: config.client.timeout,
      retryAttempts: config.client.retryAttempts,
    };
  }

  return mediatorConfig;
}
