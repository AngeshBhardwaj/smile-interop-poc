/**
 * Type definitions for CloudEvents and transformations
 */

/**
 * Transformation target formats
 */
export type TransformationTarget = 'custom-json' | 'hl7-v2' | 'fhir-r4';

/**
 * CloudEvents 1.0 specification
 * @see https://cloudevents.io/
 */
export interface CloudEvent {
  /** CloudEvents specification version */
  specversion: string;

  /** Event type identifier */
  type: string;

  /** Event source identifier */
  source: string;

  /** Unique event identifier */
  id: string;

  /** Event timestamp (ISO 8601) */
  time?: string;

  /** Content type of the data */
  datacontenttype?: string;

  /** Subject of the event */
  subject?: string;

  /** Event payload */
  data?: any;

  /** Extension attributes */
  [key: string]: any;
}

/**
 * Transformation request
 */
export interface TransformationRequest {
  /** CloudEvent to transform */
  cloudEvent: CloudEvent;

  /** Target format (optional, can be inferred from rule) */
  targetFormat?: TransformationTarget;

  /** Specific rule name to use (optional, auto-match by event type) */
  ruleName?: string;

  /** Destination URL to forward transformed data (optional) */
  destination?: string;
}

/**
 * Transformation result
 */
export interface TransformationResult {
  /** Success flag */
  success: boolean;

  /** Transformed output */
  output?: any;

  /** Error message if transformation failed */
  error?: string;

  /** Transformation metadata */
  metadata: {
    eventId: string;
    eventType: string;
    targetFormat: TransformationTarget;
    ruleName: string;
    duration: number;
    validationPassed?: boolean;
    schemaUsed?: string;
  };
}

/**
 * Forward result (after sending to destination)
 */
export interface ForwardResult {
  success: boolean;
  status?: number;
  headers?: Record<string, string>;
  body?: any;
  error?: string;
  duration: number;
}

/**
 * Application configuration
 */
export interface AppConfig {
  /** Service configuration */
  service: {
    port: number;
    env: string;
    logLevel: string;
  };

  /** OpenHIM configuration */
  openhim: {
    apiURL: string;
    username: string;
    password: string;
    trustSelfSigned: boolean;
  };

  /** Transformation configuration */
  transformation: {
    rulesDirectory: string;
    enableCaching: boolean;
    cacheTTL: number;
  };

  /** Destination configuration */
  destination: {
    defaultURL?: string;
    timeout: number;
    retryAttempts: number;
  };
}
