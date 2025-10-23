declare module 'openhim-mediator-utils' {
  interface OpenHIMConfig {
    apiURL: string;
    username: string;
    password: string;
    trustSelfSigned?: boolean;
    urn?: string;
  }

  interface MediatorConfig {
    urn: string;
    version: string;
    name: string;
    description?: string;
    endpoints?: any[];
    configDefs?: any[];
    config?: any;
  }

  export function registerMediator(
    openhimConfig: OpenHIMConfig,
    mediatorConfig: MediatorConfig,
    callback: (err: Error | null) => void
  ): void;

  export function activateHeartbeat(openhimConfig: OpenHIMConfig): number;

  export function updateTransaction(
    openhimConfig: OpenHIMConfig,
    transactionId: string,
    response: any,
    callback?: (err: Error | null) => void
  ): void;
}
