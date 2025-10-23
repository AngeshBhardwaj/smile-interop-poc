import { registerMediator, activateHeartbeat } from 'openhim-mediator-utils';
import { openhimConfig, getMediatorConfig } from '../config/openhim.config';
import { logger } from './logger';

export function registerWithOpenHIM(): Promise<void> {
  return new Promise((resolve, reject) => {
    const mediatorConfig = getMediatorConfig();

    logger.info('Registering mediator with OpenHIM...', {
      apiURL: openhimConfig.apiURL,
      urn: mediatorConfig.urn,
      version: mediatorConfig.version,
    });

    registerMediator(openhimConfig, mediatorConfig, (err: Error | null) => {
      if (err) {
        logger.error('Failed to register mediator with OpenHIM', {
          error: (err as Error).message,
          stack: (err as Error).stack,
        });
        return reject(err);
      }

      logger.info('Mediator registered successfully with OpenHIM', {
        urn: mediatorConfig.urn,
        name: mediatorConfig.name,
      });

      try {
        const heartbeatInterval = activateHeartbeat(openhimConfig);
        logger.info('Heartbeat activated', {
          interval: heartbeatInterval,
        });
      } catch (heartbeatErr: any) {
        logger.warn('Failed to activate heartbeat', {
          error: heartbeatErr.message,
        });
      }

      resolve();
    });
  });
}

export function unregisterFromOpenHIM(): void {
  logger.info('Unregistering mediator from OpenHIM...');
}
