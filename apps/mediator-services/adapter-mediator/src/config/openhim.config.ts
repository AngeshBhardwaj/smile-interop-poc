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
  urn: 'urn:mediator:smile-adapter',
};

/**
 * Get mediator configuration
 * This is loaded from mediatorConfig.json at runtime
 */
export function getMediatorConfig() {
  // Load mediator configuration from JSON file
  const mediatorConfig = require('../../mediatorConfig.json');

  // Return the mediator configuration
  return mediatorConfig;
}
