/**
 * Type declarations for openhim-mediator-utils
 * Since the package doesn't provide TypeScript definitions
 */
declare module 'openhim-mediator-utils' {
  export interface OpenHIMConfig {
    apiURL: string;
    username: string;
    password: string;
    trustSelfSigned?: boolean;
    urn?: string;
  }

  export interface MediatorConfig {
    urn: string;
    version: string;
    name: string;
    description: string;
    defaultChannelConfig?: any[];
    endpoints?: any[];
    configDefs?: any[];
    config?: any;
  }

  export function registerMediator(
    openhimConfig: OpenHIMConfig,
    mediatorConfig: MediatorConfig,
    callback: (error?: Error) => void
  ): void;

  export function activateHeartbeat(openhimConfig: OpenHIMConfig): number;

  export function fetchConfig(openhimConfig: OpenHIMConfig, callback: (error?: Error, config?: any) => void): void;
}
