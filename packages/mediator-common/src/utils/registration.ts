/**
 * OpenHIM mediator registration and heartbeat
 * Uses official openhim-mediator-utils library
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - openhim-mediator-utils doesn't have TypeScript definitions
import { registerMediator, activateHeartbeat } from 'openhim-mediator-utils';
import { getLogger } from './logger';

const logger = getLogger('registration');

/**
 * OpenHIM Configuration interface
 */
export interface OpenHIMConfig {
  apiURL: string;
  username: string;
  password: string;
  trustSelfSigned?: boolean;
}

/**
 * Mediator Configuration interface
 */
export interface MediatorConfig {
  urn: string;
  version: string;
  name: string;
  description?: string;
  defaultChannelConfig?: any[];
  [key: string]: any;
}

/**
 * Register mediator with OpenHIM and activate heartbeat
 * @param openhimConfig - OpenHIM core configuration
 * @param mediatorConfig - Mediator configuration
 */
export function registerWithOpenHIM(
  openhimConfig: OpenHIMConfig,
  mediatorConfig: MediatorConfig
): Promise<void> {
  return new Promise((resolve, reject) => {
    logger.info({
      msg: 'Registering mediator with OpenHIM',
      apiURL: openhimConfig.apiURL,
      urn: mediatorConfig.urn,
      version: mediatorConfig.version,
      mediatorName: mediatorConfig.name,
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
        msg: 'Mediator registered successfully with OpenHIM',
        urn: mediatorConfig.urn,
        name: mediatorConfig.name,
      });

      // Activate heartbeat
      try {
        const heartbeatInterval = activateHeartbeat(openhimConfig);
        logger.info({
          msg: 'Heartbeat activated',
          interval: heartbeatInterval,
          urn: mediatorConfig.urn,
        });
      } catch (heartbeatErr: any) {
        logger.warn({
          msg: 'Failed to activate heartbeat',
          error: heartbeatErr.message,
          urn: mediatorConfig.urn,
        });
        // Don't reject - mediator can still function without heartbeat
      }

      resolve();
    });
  });
}

/**
 * Unregister mediator (for graceful shutdown)
 * Note: openhim-mediator-utils doesn't provide explicit unregister
 * The heartbeat will simply stop when the process exits
 */
export function unregisterFromOpenHIM(mediatorUrn: string): void {
  logger.info({
    msg: 'Mediator shutdown initiated',
    urn: mediatorUrn,
  });
  // Heartbeat will stop when process exits
}
