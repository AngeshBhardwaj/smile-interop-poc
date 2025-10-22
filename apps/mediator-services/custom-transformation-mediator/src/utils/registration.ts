/**
 * OpenHIM mediator registration and heartbeat
 */

import axios from 'axios';
import https from 'https';
import { openhimConfig, getMediatorConfig } from '../config/openhim.config';
import { getLogger } from './logger';

const logger = getLogger('registration');

// Create axios instance with self-signed cert support
const httpsAgent = new https.Agent({
  rejectUnauthorized: !openhimConfig.trustSelfSigned,
});

/**
 * Register mediator with OpenHIM and activate heartbeat
 */
export async function registerWithOpenHIM(): Promise<void> {
  try {
    const mediatorConfig = getMediatorConfig();

    logger.info({
      msg: 'Registering custom transformation mediator with OpenHIM',
      apiURL: openhimConfig.apiURL,
      urn: mediatorConfig.urn,
      version: mediatorConfig.version,
    });

    // Register mediator via OpenHIM API
    const auth = Buffer.from(`${openhimConfig.username}:${openhimConfig.password}`).toString('base64');

    const response = await axios.post(
      `${openhimConfig.apiURL}/api/mediators`,
      mediatorConfig,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${auth}`,
        },
        httpsAgent,
      }
    );

    logger.info({
      msg: 'Custom transformation mediator registered successfully with OpenHIM',
      urn: mediatorConfig.urn,
      name: mediatorConfig.name,
      status: response.status,
    });

    // Start heartbeat (simple version - send heartbeat every 30 seconds)
    startHeartbeat();
  } catch (error: any) {
    logger.error({
      msg: 'Failed to register mediator with OpenHIM',
      error: error.message,
      response: error.response?.data,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Send heartbeat to OpenHIM
 */
async function sendHeartbeat(): Promise<void> {
  try {
    const mediatorConfig = getMediatorConfig();
    const auth = Buffer.from(`${openhimConfig.username}:${openhimConfig.password}`).toString('base64');

    await axios.post(
      `${openhimConfig.apiURL}/api/mediators/${mediatorConfig.urn}/heartbeat`,
      {
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${auth}`,
        },
        httpsAgent,
      }
    );

    logger.debug({ msg: 'Heartbeat sent to OpenHIM' });
  } catch (error: any) {
    logger.warn({
      msg: 'Failed to send heartbeat',
      error: error.message,
    });
  }
}

let heartbeatInterval: NodeJS.Timeout | null = null;

/**
 * Start heartbeat interval
 */
function startHeartbeat(): void {
  if (heartbeatInterval) {
    return;
  }

  // Send heartbeat every 30 seconds
  heartbeatInterval = setInterval(() => {
    sendHeartbeat();
  }, 30000);

  logger.info({ msg: 'Heartbeat activated', interval: '30s' });
}

/**
 * Unregister mediator (for graceful shutdown)
 */
export function unregisterFromOpenHIM(): void {
  logger.info({ msg: 'Unregistering custom transformation mediator from OpenHIM' });

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    logger.info({ msg: 'Heartbeat stopped' });
  }
}
