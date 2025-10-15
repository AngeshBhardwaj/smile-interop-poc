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
  urn: 'urn:mediator:smile-transformation',
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
      rulesDirectory: config.transformation.rulesDirectory,
      enableCaching: config.transformation.enableCaching,
    };
  }

  return mediatorConfig;
}
