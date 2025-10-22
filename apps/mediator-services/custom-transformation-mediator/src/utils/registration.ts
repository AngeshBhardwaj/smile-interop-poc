/**
 * OpenHIM mediator registration and heartbeat
 * Uses official openhim-mediator-utils library
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - openhim-mediator-utils doesn't have TypeScript definitions
import { registerMediator, activateHeartbeat } from 'openhim-mediator-utils';
import { openhimConfig, getMediatorConfig } from '../config/openhim.config';
import { getLogger } from './logger';

const logger = getLogger('registration');

/**
 * Register mediator with OpenHIM and activate heartbeat
 */
export function registerWithOpenHIM(): Promise<void> {
  return new Promise((resolve, reject) => {
    const mediatorConfig = getMediatorConfig();

    logger.info({
      msg: 'Registering custom transformation mediator with OpenHIM',
      apiURL: openhimConfig.apiURL,
      urn: mediatorConfig.urn,
      version: mediatorConfig.version,
    });

    registerMediator(openhimConfig, mediatorConfig, (err: any) => {
      if (err) {
        logger.error({
          msg: 'Failed to register mediator with OpenHIM',
          error: err.message,
          stack: err.stack,
        });
        return reject(err);
      }

      logger.info({
        msg: 'Custom transformation mediator registered successfully with OpenHIM',
        urn: mediatorConfig.urn,
        name: mediatorConfig.name,
      });

      // Activate heartbeat
      try {
        const heartbeatInterval = activateHeartbeat(openhimConfig);
        logger.info({
          msg: 'Heartbeat activated',
          interval: heartbeatInterval,
        });
      } catch (heartbeatErr: any) {
        logger.warn({
          msg: 'Failed to activate heartbeat',
          error: heartbeatErr.message,
        });
        // Don't reject - mediator can still function without heartbeat
      }

      resolve();
    });
  });
}

/**
 * Unregister mediator (for graceful shutdown)
 */
export function unregisterFromOpenHIM(): void {
  logger.info({ msg: 'Unregistering custom transformation mediator from OpenHIM' });
  // openhim-mediator-utils doesn't provide explicit unregister
  // Heartbeat will simply stop when process exits
}
