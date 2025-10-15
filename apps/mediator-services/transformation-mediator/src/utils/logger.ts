/**
 * Logger utility using Pino
 */

import pino from 'pino';
import { config } from '../config';

/**
 * Create base logger instance
 */
const baseLogger = pino({
  level: config.service.logLevel,
  transport:
    config.service.env === 'development'
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
      return { level: label };
    },
  },
});

/**
 * Get a logger instance with a specific context
 */
export function getLogger(context: string): pino.Logger {
  return baseLogger.child({ context });
}

/**
 * Export the base logger for direct use
 */
export const logger = baseLogger;

/**
 * Log levels
 */
export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}
