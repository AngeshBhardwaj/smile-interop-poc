/**
 * CloudEvent type definitions
 */

export interface CloudEvent {
  specversion: string;
  type: string;
  source: string;
  id: string;
  time: string;
  datacontenttype?: string;
  subject?: string;
  data?: any;
}

export interface CloudEventData {
  eventData: any;
  metadata: any;
}

/**
 * Transformation target formats
 */
export type TransformationTarget = 'custom-json' | 'fhir-r4' | 'hl7-v2';
