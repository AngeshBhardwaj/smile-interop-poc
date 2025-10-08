import { z } from 'zod';

export const configSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  port: z.number().int().positive().default(3000),
  rabbitmqUrl: z.string().url().default('amqp://admin:admin123@localhost:5672'),
  openHimApiUrl: z.string().url().default('http://localhost:8080'),
  jaegerEndpoint: z.string().url().optional(),
  redisUrl: z.string().url().default('redis://localhost:6379'),
});

export type Config = z.infer<typeof configSchema>;

export const loadConfig = (): Config => {
  const config = {
    nodeEnv: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL,
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
    rabbitmqUrl: process.env.RABBITMQ_URL,
    openHimApiUrl: process.env.OPENHIM_API_URL,
    jaegerEndpoint: process.env.JAEGER_ENDPOINT,
    redisUrl: process.env.REDIS_URL,
  };

  return configSchema.parse(config);
};