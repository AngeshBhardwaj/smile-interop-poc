/**
 * Custom JSON transformer - Transforms CloudEvents to custom JSON formats
 */

import { CloudEvent } from '../config/types';
import { TransformationRule } from '../rules/types';
import { applyMappings, MappingResult } from '../utils/mapper';
import { getLogger } from '../utils/logger';

const logger = getLogger('custom-transformer');

/**
 * Transformation result
 */
export interface TransformationResult {
  success: boolean;
  data?: any;
  errors?: string[];
  metadata?: {
    rule: string;
    eventType: string;
    transformedAt: string;
  };
}

/**
 * Transform CloudEvent to custom JSON format using the provided rule
 */
export async function transformToCustomJSON(
  cloudEvent: CloudEvent,
  rule: TransformationRule
): Promise<TransformationResult> {
  const startTime = Date.now();

  try {
    // Validate input first (before any logging)
    if (!cloudEvent) {
      return {
        success: false,
        errors: ['CloudEvent is required'],
      };
    }

    if (!rule) {
      return {
        success: false,
        errors: ['Transformation rule is required'],
      };
    }

    logger.info({
      msg: 'Starting custom JSON transformation',
      eventId: cloudEvent.id,
      eventType: cloudEvent.type,
      rule: rule.name,
    });

    if (!rule.mappings || rule.mappings.length === 0) {
      return {
        success: false,
        errors: ['Transformation rule has no mappings'],
      };
    }

    // Apply field mappings
    const mappingResult: MappingResult = applyMappings(cloudEvent, rule.mappings);

    if (!mappingResult.success) {
      logger.warn({
        msg: 'Transformation completed with errors',
        eventId: cloudEvent.id,
        rule: rule.name,
        errors: mappingResult.errors,
        duration: Date.now() - startTime,
      });

      return {
        success: false,
        data: mappingResult.data,
        errors: mappingResult.errors,
        metadata: {
          rule: rule.name,
          eventType: cloudEvent.type,
          transformedAt: new Date().toISOString(),
        },
      };
    }

    // Successful transformation
    logger.info({
      msg: 'Transformation completed successfully',
      eventId: cloudEvent.id,
      rule: rule.name,
      duration: Date.now() - startTime,
    });

    return {
      success: true,
      data: mappingResult.data,
      metadata: {
        rule: rule.name,
        eventType: cloudEvent.type,
        transformedAt: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    logger.error({
      msg: 'Transformation failed with exception',
      eventId: cloudEvent?.id,
      rule: rule?.name,
      error: error.message,
      stack: error.stack,
      duration: Date.now() - startTime,
    });

    return {
      success: false,
      errors: [`Transformation failed: ${error.message}`],
      metadata: cloudEvent && rule ? {
        rule: rule.name,
        eventType: cloudEvent.type,
        transformedAt: new Date().toISOString(),
      } : undefined,
    };
  }
}

/**
 * Validate CloudEvent structure
 */
export function validateCloudEvent(cloudEvent: any): {
  valid: boolean;
  errors?: string[];
} {
  const errors: string[] = [];

  // Check required CloudEvents fields
  if (!cloudEvent.specversion) {
    errors.push('Missing required field: specversion');
  }

  if (!cloudEvent.type) {
    errors.push('Missing required field: type');
  }

  if (!cloudEvent.source) {
    errors.push('Missing required field: source');
  }

  if (!cloudEvent.id) {
    errors.push('Missing required field: id');
  }

  // Validate specversion
  if (cloudEvent.specversion && cloudEvent.specversion !== '1.0') {
    errors.push(
      `Unsupported CloudEvents version: ${cloudEvent.specversion}. Only 1.0 is supported.`
    );
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Batch transform multiple CloudEvents
 */
export async function transformBatch(
  cloudEvents: CloudEvent[],
  rule: TransformationRule
): Promise<{
  successful: TransformationResult[];
  failed: TransformationResult[];
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}> {
  logger.info({
    msg: 'Starting batch transformation',
    count: cloudEvents.length,
    rule: rule.name,
  });

  const successful: TransformationResult[] = [];
  const failed: TransformationResult[] = [];

  for (const cloudEvent of cloudEvents) {
    const result = await transformToCustomJSON(cloudEvent, rule);

    if (result.success) {
      successful.push(result);
    } else {
      failed.push(result);
    }
  }

  const summary = {
    total: cloudEvents.length,
    successful: successful.length,
    failed: failed.length,
  };

  logger.info({
    msg: 'Batch transformation completed',
    summary,
    rule: rule.name,
  });

  return {
    successful,
    failed,
    summary,
  };
}

/**
 * Enrich transformed data with additional metadata
 */
export function enrichTransformedData(
  transformedData: any,
  cloudEvent: CloudEvent,
  options?: {
    includeEventMetadata?: boolean;
    includeTimestamps?: boolean;
    customMetadata?: Record<string, any>;
  }
): any {
  const enriched = { ...transformedData };

  if (options?.includeEventMetadata) {
    enriched._cloudEvent = {
      id: cloudEvent.id,
      type: cloudEvent.type,
      source: cloudEvent.source,
      time: cloudEvent.time,
    };
  }

  if (options?.includeTimestamps) {
    enriched._timestamps = {
      transformedAt: new Date().toISOString(),
      originalEventTime: cloudEvent.time,
    };
  }

  if (options?.customMetadata) {
    enriched._metadata = options.customMetadata;
  }

  return enriched;
}

/**
 * Extract specific fields from CloudEvent for logging/auditing
 */
export function extractEventSummary(cloudEvent: CloudEvent): {
  id: string;
  type: string;
  source: string;
  time?: string;
  dataContentType?: string;
} {
  return {
    id: cloudEvent.id,
    type: cloudEvent.type,
    source: cloudEvent.source,
    time: cloudEvent.time,
    dataContentType: cloudEvent.datacontenttype,
  };
}
