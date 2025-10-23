/**
 * Logger utility using Pino
 */

import pino from 'pino';

/**
 * Get log level from environment or default to 'info'
 */
function getLogLevel(): string {
  return process.env.LOG_LEVEL || 'info';
}

/**
 * Check if running in development
 */
function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Create base logger instance
 */
const loggerConfig: any = {
  level: getLogLevel(),
  formatters: {
    level: (label: string) => {
      return { level: label };
    },
  },
};

// Add transport only in development mode
if (isDevelopment()) {
  loggerConfig.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    },
  };
}

const baseLogger = pino(loggerConfig);

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
