import { config } from './index';

export const openhimConfig = {
  apiURL: config.openhim.apiURL,
  username: config.openhim.username,
  password: config.openhim.password,
  trustSelfSigned: config.openhim.trustSelfSigned,
  urn: 'urn:mediator:smile-audit-transformation',
};

export function getMediatorConfig() {
  const mediatorConfig = require('../../mediatorConfig.json');
  return mediatorConfig;
}
