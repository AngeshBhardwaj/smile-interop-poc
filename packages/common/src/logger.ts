import pino from 'pino';

export const createLogger = (name: string): pino.Logger => {
  return pino({
    name,
    level: process.env.LOG_LEVEL ?? 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  });
};

export const logger = createLogger('smile-interop');