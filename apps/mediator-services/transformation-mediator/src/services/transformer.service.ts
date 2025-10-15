/**
 * Transformation service - Main orchestrator for transforming CloudEvents
 */

import { CloudEvent } from '../config/types';
import { matchRule } from '../rules/rule-engine';
import { transformToCustomJSON, validateCloudEvent } from './custom-transformer';
import { getValidator } from '../validators/json-schema.validator';
import { getLogger } from '../utils/logger';
import * as path from 'path';

const logger = getLogger('transformer-service');

/**
 * Transformation options
 */
export interface TransformationOptions {
  /** Optional rule name to use (otherwise matched by event type) */
  ruleName?: string;

  /** Whether to validate output against schema */
  validateOutput?: boolean;

  /** Whether to skip transformation errors */
  continueOnError?: boolean;
}

/**
 * Transformation response
 */
export interface TransformationResponse {
  success: boolean;
  data?: any;
  errors?: string[];
  warnings?: string[];
  metadata: {
    eventId: string;
    eventType: string;
    ruleName?: string;
    targetFormat?: string;
    transformedAt: string;
    validationPerformed: boolean;
    validationPassed?: boolean;
  };
}

/**
 * Transform a CloudEvent using the appropriate rule
 */
export async function transform(
  cloudEvent: CloudEvent,
  options: TransformationOptions = {}
): Promise<TransformationResponse> {
  const startTime = Date.now();
  const warnings: string[] = [];

  try {
    logger.info({
      msg: 'Starting transformation',
      eventId: cloudEvent?.id,
      eventType: cloudEvent?.type,
      options,
    });

    // Step 1: Validate CloudEvent structure
    const cloudEventValidation = validateCloudEvent(cloudEvent);
    if (!cloudEventValidation.valid) {
      logger.warn({
        msg: 'CloudEvent validation failed',
        eventId: cloudEvent?.id,
        errors: cloudEventValidation.errors,
      });

      return {
        success: false,
        errors: cloudEventValidation.errors,
        metadata: {
          eventId: cloudEvent?.id || 'unknown',
          eventType: cloudEvent?.type || 'unknown',
          transformedAt: new Date().toISOString(),
          validationPerformed: false,
        },
      };
    }

    // Step 2: Match transformation rule
    const ruleMatch = matchRule(cloudEvent, options.ruleName);
    if (!ruleMatch.matched || !ruleMatch.rule) {
      logger.warn({
        msg: 'No matching rule found',
        eventId: cloudEvent.id,
        eventType: cloudEvent.type,
        ruleName: options.ruleName,
      });

      return {
        success: false,
        errors: [ruleMatch.error || 'No matching transformation rule found'],
        metadata: {
          eventId: cloudEvent.id,
          eventType: cloudEvent.type,
          transformedAt: new Date().toISOString(),
          validationPerformed: false,
        },
      };
    }

    const rule = ruleMatch.rule;

    logger.info({
      msg: 'Rule matched',
      eventId: cloudEvent.id,
      rule: rule.name,
      targetFormat: rule.targetFormat,
    });

    // Step 3: Apply transformation based on target format
    let transformResult;

    switch (rule.targetFormat) {
      case 'custom-json':
        transformResult = await transformToCustomJSON(cloudEvent, rule);
        break;

      case 'hl7-v2':
        // TODO: Implement HL7 v2 transformation
        return {
          success: false,
          errors: ['HL7 v2 transformation not yet implemented'],
          metadata: {
            eventId: cloudEvent.id,
            eventType: cloudEvent.type,
            ruleName: rule.name,
            targetFormat: rule.targetFormat,
            transformedAt: new Date().toISOString(),
            validationPerformed: false,
          },
        };

      case 'fhir-r4':
        // TODO: Implement FHIR R4 transformation
        return {
          success: false,
          errors: ['FHIR R4 transformation not yet implemented'],
          metadata: {
            eventId: cloudEvent.id,
            eventType: cloudEvent.type,
            ruleName: rule.name,
            targetFormat: rule.targetFormat,
            transformedAt: new Date().toISOString(),
            validationPerformed: false,
          },
        };

      default:
        return {
          success: false,
          errors: [`Unsupported target format: ${rule.targetFormat}`],
          metadata: {
            eventId: cloudEvent.id,
            eventType: cloudEvent.type,
            ruleName: rule.name,
            targetFormat: rule.targetFormat,
            transformedAt: new Date().toISOString(),
            validationPerformed: false,
          },
        };
    }

    // Step 4: Check transformation result
    if (!transformResult.success) {
      if (options.continueOnError && transformResult.data) {
        warnings.push(...(transformResult.errors || []));
      } else {
        logger.warn({
          msg: 'Transformation failed',
          eventId: cloudEvent.id,
          rule: rule.name,
          errors: transformResult.errors,
        });

        return {
          success: false,
          data: transformResult.data,
          errors: transformResult.errors,
          metadata: {
            eventId: cloudEvent.id,
            eventType: cloudEvent.type,
            ruleName: rule.name,
            targetFormat: rule.targetFormat,
            transformedAt: new Date().toISOString(),
            validationPerformed: false,
          },
        };
      }
    }

    // Step 5: Validate output against schema (if specified)
    let validationPassed = true;
    if (options.validateOutput !== false && rule.outputSchema) {
      try {
        const validator = getValidator();
        const schemaPath = path.resolve(rule.outputSchema);
        const validationResult = validator.validate(transformResult.data, schemaPath);

        if (!validationResult.valid) {
          logger.warn({
            msg: 'Output validation failed',
            eventId: cloudEvent.id,
            rule: rule.name,
            errors: validationResult.errors,
          });

          validationPassed = false;

          const validationErrors = validationResult.errors?.map(
            (err) => `Validation error at ${err.field}: ${err.message}`
          );

          if (options.continueOnError) {
            warnings.push(...(validationErrors || []));
          } else {
            return {
              success: false,
              data: transformResult.data,
              errors: validationErrors,
              metadata: {
                eventId: cloudEvent.id,
                eventType: cloudEvent.type,
                ruleName: rule.name,
                targetFormat: rule.targetFormat,
                transformedAt: new Date().toISOString(),
                validationPerformed: true,
                validationPassed: false,
              },
            };
          }
        }
      } catch (error: any) {
        logger.error({
          msg: 'Schema validation error',
          eventId: cloudEvent.id,
          rule: rule.name,
          error: error.message,
        });

        warnings.push(`Schema validation error: ${error.message}`);
      }
    }

    // Step 6: Return successful result
    const duration = Date.now() - startTime;

    logger.info({
      msg: 'Transformation completed successfully',
      eventId: cloudEvent.id,
      rule: rule.name,
      duration,
      validationPerformed: !!rule.outputSchema,
      validationPassed,
    });

    return {
      success: true,
      data: transformResult.data,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        eventId: cloudEvent.id,
        eventType: cloudEvent.type,
        ruleName: rule.name,
        targetFormat: rule.targetFormat,
        transformedAt: new Date().toISOString(),
        validationPerformed: !!rule.outputSchema,
        validationPassed,
      },
    };
  } catch (error: any) {
    logger.error({
      msg: 'Transformation failed with exception',
      eventId: cloudEvent?.id,
      error: error.message,
      stack: error.stack,
      duration: Date.now() - startTime,
    });

    return {
      success: false,
      errors: [`Transformation failed: ${error.message}`],
      metadata: {
        eventId: cloudEvent?.id || 'unknown',
        eventType: cloudEvent?.type || 'unknown',
        transformedAt: new Date().toISOString(),
        validationPerformed: false,
      },
    };
  }
}

/**
 * Transform multiple CloudEvents in batch
 */
export async function transformBatch(
  cloudEvents: CloudEvent[],
  options: TransformationOptions = {}
): Promise<{
  successful: TransformationResponse[];
  failed: TransformationResponse[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    duration: number;
  };
}> {
  const startTime = Date.now();

  logger.info({
    msg: 'Starting batch transformation',
    count: cloudEvents.length,
    options,
  });

  const successful: TransformationResponse[] = [];
  const failed: TransformationResponse[] = [];

  for (const cloudEvent of cloudEvents) {
    const result = await transform(cloudEvent, options);

    if (result.success) {
      successful.push(result);
    } else {
      failed.push(result);
    }
  }

  const duration = Date.now() - startTime;

  const summary = {
    total: cloudEvents.length,
    successful: successful.length,
    failed: failed.length,
    duration,
  };

  logger.info({
    msg: 'Batch transformation completed',
    summary,
  });

  return {
    successful,
    failed,
    summary,
  };
}

/**
 * Get transformation statistics
 */
export interface TransformationStats {
  rulesLoaded: number;
  cachedRules: number;
  schemasLoaded: number;
  uptime: number;
}

const serviceStartTime = Date.now();

export function getStats(): TransformationStats {
  const { getRules, getCacheStats } = require('../rules/rule-engine');
  const { getValidator } = require('../validators/json-schema.validator');

  const rules = getRules();
  const ruleCache = getCacheStats();
  const validator = getValidator();
  const schemaCache = validator.getCacheStats();

  return {
    rulesLoaded: rules.length,
    cachedRules: ruleCache.cachedRules,
    schemasLoaded: schemaCache.cachedSchemas,
    uptime: Date.now() - serviceStartTime,
  };
}
