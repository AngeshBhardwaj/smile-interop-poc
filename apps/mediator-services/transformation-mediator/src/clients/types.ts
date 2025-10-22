/**
 * Client configuration types for multi-client transformation mediator
 */

/**
 * Authentication types supported by clients
 */
export type AuthType = 'none' | 'basic' | 'bearer' | 'api-key' | 'oauth2';

/**
 * Client metadata for additional context
 */
export interface ClientMetadata {
  facilityId?: string;
  integrationType?: string;
  version?: string;
  messageType?: string;
  contactEmail?: string;
  [key: string]: any; // Allow additional custom metadata
}

/**
 * Individual client configuration
 */
export interface ClientConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  endpoint: string;
  authType: AuthType;
  authConfig?: {
    username?: string;
    password?: string;
    token?: string;
    apiKey?: string;
    apiKeyHeader?: string;
    [key: string]: any;
  };
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  transformationRules: string[];
  eventTypes: string[];
  metadata: ClientMetadata;
}

/**
 * Global settings for all clients
 */
export interface GlobalSettings {
  enableCircuitBreaker: boolean;
  circuitBreakerThreshold: number;
  circuitBreakerTimeout: number;
  enableMetrics: boolean;
  enableAuditLogging: boolean;
  logLevel: string;
  defaultTimeout: number;
  defaultRetryAttempts: number;
  defaultRetryDelay: number;
}

/**
 * Complete client configuration structure
 */
export interface ClientsConfiguration {
  version: string;
  lastUpdated: string;
  clients: ClientConfig[];
  globalSettings: GlobalSettings;
}

/**
 * Client delivery result
 */
export interface ClientDeliveryResult {
  clientId: string;
  clientName: string;
  success: boolean;
  statusCode?: number;
  responseTime: number;
  error?: Error;
  errorMessage?: string;
  transformationRule?: string;
  endpoint?: string;
  timestamp: string;
}

/**
 * Multi-client fan-out result
 */
export interface FanOutResult {
  eventId: string;
  eventType: string;
  totalClients: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  results: ClientDeliveryResult[];
  totalDuration: number;
  timestamp: string;
}

/**
 * Circuit breaker state for a client
 */
export interface CircuitBreakerState {
  clientId: string;
  isOpen: boolean;
  failureCount: number;
  lastFailureTime?: Date;
  nextAttemptTime?: Date;
}

/**
 * Client filter criteria for event routing
 */
export interface ClientFilter {
  eventType?: string;
  enabledOnly?: boolean;
  clientIds?: string[];
}

/**
 * Transformation context for client-specific transformations
 */
export interface TransformationContext {
  clientId: string;
  clientName: string;
  eventType: string;
  transformationRule: string;
  sourceEvent: any;
  metadata: ClientMetadata;
}
