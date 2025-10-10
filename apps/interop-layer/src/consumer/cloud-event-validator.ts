/**
 * CloudEvent Validator
 *
 * Validates CloudEvents according to CloudEvents v1.0 specification
 * and extracts correlation IDs for tracing
 */

import { ValidationResult } from '../messaging/types';
import { logger } from '@smile/common';

/**
 * CloudEvent Validator
 *
 * Validates CloudEvent structure and extracts metadata
 */
export class CloudEventValidator {
  private readonly requiredFields = ['specversion', 'type', 'source', 'id'];
  private readonly supportedVersions = ['1.0'];

  /**
   * Validate a CloudEvent
   *
   * @param event - The event to validate
   * @returns Validation result with errors if invalid
   */
  public validate(event: any): ValidationResult {
    const errors: string[] = [];

    // Check null/undefined
    if (event === null || event === undefined) {
      return {
        valid: false,
        errors: ['Event is null or undefined'],
      };
    }

    // Check if object
    if (typeof event !== 'object' || Array.isArray(event)) {
      return {
        valid: false,
        errors: ['Event must be an object'],
      };
    }

    // Validate required fields
    for (const field of this.requiredFields) {
      if (!event[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Validate specversion if present
    if (event.specversion && !this.supportedVersions.includes(event.specversion)) {
      errors.push(`Unsupported specversion: ${event.specversion}`);
    }

    // Return result
    if (errors.length > 0) {
      logger.debug('CloudEvent validation failed', { errors, eventId: event.id });
      return {
        valid: false,
        errors,
      };
    }

    logger.debug('CloudEvent validated successfully', {
      type: event.type,
      source: event.source,
      id: event.id,
    });

    return {
      valid: true,
      event,
    };
  }

  /**
   * Extract correlation ID from CloudEvent
   *
   * Looks for correlation ID in multiple locations:
   * 1. data.metadata.correlationId (health-service/orders-service format)
   * 2. correlationid extension attribute (CloudEvents extension)
   * 3. Falls back to event.id
   *
   * @param event - The CloudEvent
   * @returns The correlation ID
   */
  public extractCorrelationId(event: any): string {
    // Try data.metadata.correlationId first (our convention)
    if (
      event.data &&
      typeof event.data === 'object' &&
      event.data.metadata &&
      event.data.metadata.correlationId
    ) {
      return event.data.metadata.correlationId;
    }

    // Try correlationid extension attribute
    if (event.correlationid) {
      return event.correlationid;
    }

    // Fallback to event ID
    return event.id;
  }

  /**
   * Check if event contains PII/PHI based on metadata
   *
   * @param event - The CloudEvent
   * @returns Whether event contains sensitive data
   */
  public containsSensitiveData(event: any): boolean {
    if (
      event.data &&
      typeof event.data === 'object' &&
      event.data.metadata
    ) {
      const metadata = event.data.metadata;
      return metadata.containsPHI === true || metadata.containsPII === true;
    }

    // Assume sensitive for health events
    if (event.type && typeof event.type === 'string' && event.type.startsWith('health.')) {
      return true;
    }

    return false;
  }

  /**
   * Extract event metadata for logging and tracing
   *
   * @param event - The CloudEvent
   * @returns Event metadata object
   */
  public extractMetadata(event: any): Record<string, any> {
    return {
      eventId: event.id,
      eventType: event.type,
      eventSource: event.source,
      eventTime: event.time,
      specVersion: event.specversion,
      correlationId: this.extractCorrelationId(event),
      containsSensitiveData: this.containsSensitiveData(event),
      dataContentType: event.datacontenttype,
      subject: event.subject,
    };
  }
}
