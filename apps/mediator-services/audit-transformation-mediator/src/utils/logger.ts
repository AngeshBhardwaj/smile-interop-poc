import pino from 'pino';
import { config } from '../config';

export const logger = pino({
  level: config.logLevel,
  transport:
    config.env === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  base: {
    service: 'audit-transformation-mediator',
    env: config.env,
  },
});

export function createChildLogger(context: Record<string, any>) {
  return logger.child(context);
}
