import { z } from 'zod';
import { logger } from '@smile/common';

export interface MediatorConfig {
  urn: string;
  version: string;
  name: string;
  description: string;
  endpoints: MediatorEndpoint[];
  defaultChannelConfig: ChannelConfig[];
}

export interface MediatorEndpoint {
  name: string;
  host: string;
  port: number;
  path?: string;
  type: 'http' | 'tcp';
}

export interface ChannelConfig {
  name: string;
  urlPattern: string;
  routes: RouteConfig[];
  allow: string[];
  methods: string[];
}

export interface RouteConfig {
  name: string;
  host: string;
  port: number;
  path?: string;
  pathTransform?: string;
  primary: boolean;
}

export const mediatorRequestSchema = z.object({
  requestTimestamp: z.string(),
  method: z.string(),
  url: z.string(),
  headers: z.record(z.string()),
  body: z.unknown().optional(),
});

export const mediatorResponseSchema = z.object({
  status: z.enum(['Successful', 'Failed', 'Completed']),
  response: z.object({
    status: z.number(),
    headers: z.record(z.string()),
    body: z.unknown().optional(),
    timestamp: z.string(),
  }),
  orchestrations: z.array(z.object({
    name: z.string(),
    request: z.object({
      method: z.string(),
      url: z.string(),
      headers: z.record(z.string()),
      body: z.unknown().optional(),
      timestamp: z.string(),
    }),
    response: z.object({
      status: z.number(),
      headers: z.record(z.string()),
      body: z.unknown().optional(),
      timestamp: z.string(),
    }),
  })).optional(),
  properties: z.record(z.unknown()).optional(),
});

export type MediatorRequest = z.infer<typeof mediatorRequestSchema>;
export type MediatorResponse = z.infer<typeof mediatorResponseSchema>;

export abstract class BaseMediator {
  constructor(protected config: MediatorConfig) {
    logger.info('BaseMediator initialized', {
      mediator: config.name,
      version: config.version,
      urn: config.urn,
    });
  }

  abstract process(request: MediatorRequest): Promise<MediatorResponse>;

  protected createSuccessResponse(
    status: number,
    body?: unknown,
    headers: Record<string, string> = {},
  ): MediatorResponse {
    logger.debug('Creating success response', { status, hasBody: !!body });
    return {
      status: 'Successful',
      response: {
        status,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body,
        timestamp: new Date().toISOString(),
      },
    };
  }

  protected createErrorResponse(
    status: number,
    error: string,
    headers: Record<string, string> = {},
  ): MediatorResponse {
    logger.error('Creating error response', { status, error });
    return {
      status: 'Failed',
      response: {
        status,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: { error },
        timestamp: new Date().toISOString(),
      },
    };
  }

  getConfig(): MediatorConfig {
    return this.config;
  }

  async heartbeat(): Promise<{ uptime: number }> {
    const uptime = process.uptime();
    logger.debug('Mediator heartbeat check', {
      mediator: this.config.name,
      uptime: `${uptime}s`,
    });
    return {
      uptime,
    };
  }
}