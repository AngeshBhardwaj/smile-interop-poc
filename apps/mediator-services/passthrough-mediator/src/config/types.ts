/**
 * Configuration types for pass-through mediator
 */

export interface MediatorConfig {
  port: number;
  env: string;
  logLevel: string;
  openhim: OpenHIMConfig;
  webhook: WebhookConfig;
}

export interface OpenHIMConfig {
  apiURL: string;
  username: string;
  password: string;
  trustSelfSigned: boolean;
}

export interface WebhookConfig {
  url: string;
  timeout: number;
  retryAttempts: number;
}

export interface CloudEvent {
  specversion: string;
  type: string;
  source: string;
  id: string;
  time?: string;
  datacontenttype?: string;
  subject?: string;
  data?: any;
  [key: string]: any;
}

export interface MediatorResponse {
  'x-mediator-urn': string;
  status: 'Successful' | 'Failed' | 'Processing';
  response: {
    status: number;
    headers: Record<string, string>;
    body: string;
    timestamp: string;
  };
  orchestrations?: Array<{
    name: string;
    request: {
      method: string;
      url: string;
      headers: Record<string, string>;
      body?: string;
      timestamp: string;
    };
    response: {
      status: number;
      headers: Record<string, string>;
      body: string;
      timestamp: string;
    };
  }>;
  properties?: Record<string, any>;
}
