/**
 * HL7 v2 Transformer
 * Transforms CloudEvents to HL7 v2.x messages (ORM, ADT, etc.)
 */

import { CloudEvent } from '../config/types';
import { TransformationRule } from '../rules/types';
import { getLogger } from '../utils/logger';
import { extractValue } from '../utils/mapper';

const logger = getLogger('hl7-transformer');

/**
 * Transformation result
 */
export interface HL7TransformationResult {
  success: boolean;
  data?: any;
  errors?: string[];
}

/**
 * Transform CloudEvent to HL7 v2 message
 */
export async function transformToHL7(
  cloudEvent: CloudEvent,
  rule: TransformationRule
): Promise<HL7TransformationResult> {
  try {
    logger.info({
      msg: 'Starting HL7 v2 transformation',
      eventId: cloudEvent.id,
      ruleName: rule.name,
    });

    const errors: string[] = [];
    const hl7Message: any = {};
    const ruleExt = rule as any; // Allow access to custom fields

    // Process each segment defined in the rule
    if (ruleExt.segments && Array.isArray(ruleExt.segments)) {
      for (const segmentDef of ruleExt.segments) {
        try {
          // Check segment condition if specified
          if (segmentDef.condition) {
            const conditionResult = evaluateCondition(cloudEvent, segmentDef.condition);
            if (!conditionResult) {
              continue; // Skip this segment
            }
          }

          // Handle repeatable segments (like OBX)
          if (segmentDef.repeatable && segmentDef.itemSource) {
            const sourceArray = extractValue(cloudEvent, segmentDef.itemSource);

            if (Array.isArray(sourceArray)) {
              const segments: any[] = [];

              for (let i = 0; i < sourceArray.length; i++) {
                const item = sourceArray[i];
                const segment = await buildSegment(
                  segmentDef.segment,
                  segmentDef.fields,
                  cloudEvent,
                  ruleExt.transformFunctions,
                  item,
                  i
                );
                segments.push(segment);
              }

              hl7Message[segmentDef.segment] = segments;
            }
          } else {
            // Single segment
            const segment = await buildSegment(
              segmentDef.segment,
              segmentDef.fields,
              cloudEvent,
              ruleExt.transformFunctions
            );
            hl7Message[segmentDef.segment] = segment;
          }
        } catch (error: any) {
          errors.push(`Failed to build segment ${segmentDef.segment}: ${error.message}`);
        }
      }
    }

    // Convert to HL7 delimited string if outputType is hl7-delimited
    let finalOutput = hl7Message;
    if (ruleExt.outputType === 'hl7-delimited') {
      try {
        finalOutput = convertToHL7String(hl7Message, ruleExt.metadata);
      } catch (error: any) {
        errors.push(`Failed to convert to HL7 string: ${error.message}`);
        // Return JSON structure as fallback
        finalOutput = hl7Message;
      }
    }

    if (errors.length > 0) {
      logger.warn({
        msg: 'HL7 transformation completed with errors',
        eventId: cloudEvent.id,
        errors,
      });

      return {
        success: false,
        data: finalOutput,
        errors,
      };
    }

    logger.info({
      msg: 'HL7 v2 transformation completed successfully',
      eventId: cloudEvent.id,
      messageType: hl7Message.MSH?.messageType,
    });

    return {
      success: true,
      data: finalOutput,
    };
  } catch (error: any) {
    logger.error({
      msg: 'HL7 transformation failed',
      eventId: cloudEvent.id,
      error: error.message,
      stack: error.stack,
    });

    return {
      success: false,
      errors: [`HL7 transformation failed: ${error.message}`],
    };
  }
}

/**
 * Build a single segment
 */
async function buildSegment(
  segmentName: string,
  fields: any[],
  cloudEvent: CloudEvent,
  transformFunctions?: any,
  itemContext?: any,
  itemIndex?: number
): Promise<any> {
  const segment: any = {};

  for (const field of fields) {
    try {
      let value: any;

      // Handle different source types
      if (field.value !== undefined) {
        value = field.value;
      } else if (field.source === 'constant') {
        value = field.value;
      } else if (field.source === 'index' && itemIndex !== undefined) {
        value = itemIndex;
      } else if (field.source && field.source.startsWith('$.')) {
        // JSONPath expression
        if (itemContext) {
          // Relative to item context
          const path = field.source.replace(/^\$\./, '');
          value = getNestedProperty(itemContext, path);
        } else {
          // Relative to CloudEvent
          value = extractValue(cloudEvent, field.source);
        }

        // Apply transformations if specified
        if (field.transforms && Array.isArray(field.transforms)) {
          for (const transform of field.transforms) {
            value = applyTransformFunction(value, transform, transformFunctions);
          }
        }

        // Use default value if result is null/undefined
        if ((value === null || value === undefined) && field.defaultValue !== undefined) {
          value = field.defaultValue;
        }
      }

      // Store field value
      if (value !== null && value !== undefined) {
        segment[field.field] = value;
      }
    } catch (error: any) {
      logger.warn({
        msg: 'Failed to process field',
        segment: segmentName,
        field: field.field,
        error: error.message,
      });
    }
  }

  return segment;
}

/**
 * Convert HL7 JSON structure to delimited string format
 */
function convertToHL7String(hl7Message: any, metadata?: any): string {
  const fieldDelimiter = metadata?.fieldDelimiter || '|';
  const componentDelimiter = metadata?.componentDelimiter || '^';
  const repetitionDelimiter = metadata?.repetitionDelimiter || '~';
  const escapeCharacter = metadata?.escapeCharacter || '\\';
  const subcomponentDelimiter = metadata?.subcomponentDelimiter || '&';
  const segmentDelimiter = '\r';

  const segments: string[] = [];

  // Build MSH segment (special handling)
  if (hl7Message.MSH) {
    const msh = hl7Message.MSH;
    const mshFields: string[] = ['MSH'];

    // MSH-1 (Field Separator)
    mshFields.push(fieldDelimiter);

    // MSH-2 (Encoding Characters)
    mshFields.push(`${componentDelimiter}${repetitionDelimiter}${escapeCharacter}${subcomponentDelimiter}`);

    // MSH-3 onwards
    const fieldNames = Object.keys(msh).filter(f => f.startsWith('MSH-') && f !== 'MSH-1' && f !== 'MSH-2');
    fieldNames.sort((a, b) => parseInt(a.split('-')[1]) - parseInt(b.split('-')[1]));

    let currentFieldNum = 3;
    for (const fieldName of fieldNames) {
      const fieldNum = parseInt(fieldName.split('-')[1]);

      // Add empty fields for gaps
      while (currentFieldNum < fieldNum) {
        mshFields.push('');
        currentFieldNum++;
      }

      mshFields.push(String(msh[fieldName] || ''));
      currentFieldNum++;
    }

    segments.push(mshFields.join(fieldDelimiter));
  }

  // Build other segments
  const segmentNames = Object.keys(hl7Message).filter(s => s !== 'MSH');

  for (const segmentName of segmentNames) {
    const segmentData = hl7Message[segmentName];

    if (Array.isArray(segmentData)) {
      // Repeatable segment
      for (const segment of segmentData) {
        segments.push(buildSegmentString(segmentName, segment, fieldDelimiter));
      }
    } else {
      // Single segment
      segments.push(buildSegmentString(segmentName, segmentData, fieldDelimiter));
    }
  }

  return segments.join(segmentDelimiter);
}

/**
 * Build segment string from segment object
 */
function buildSegmentString(segmentName: string, segment: any, fieldDelimiter: string): string {
  const fields: string[] = [segmentName];

  const fieldNames = Object.keys(segment).filter(f => f.startsWith(`${segmentName}-`));
  fieldNames.sort((a, b) => parseInt(a.split('-')[1]) - parseInt(b.split('-')[1]));

  let currentFieldNum = 1;
  for (const fieldName of fieldNames) {
    const fieldNum = parseInt(fieldName.split('-')[1]);

    // Add empty fields for gaps
    while (currentFieldNum < fieldNum) {
      fields.push('');
      currentFieldNum++;
    }

    fields.push(String(segment[fieldName] || ''));
    currentFieldNum++;
  }

  return fields.join(fieldDelimiter);
}

/**
 * Evaluate a condition expression
 */
function evaluateCondition(cloudEvent: CloudEvent, condition: string): boolean {
  try {
    // Simple condition evaluation (e.g., "$.data.orderType == 'medicines'")
    const match = condition.match(/\$\.([^\s]+)\s*(==|!=|>|<|>=|<=)\s*'([^']+)'/);
    if (match) {
      const path = match[1];
      const operator = match[2];
      const expectedValue = match[3];

      const actualValue = extractValue(cloudEvent, `$.${path}`);

      switch (operator) {
        case '==':
          return actualValue === expectedValue;
        case '!=':
          return actualValue !== expectedValue;
        case '>':
          return actualValue > expectedValue;
        case '<':
          return actualValue < expectedValue;
        case '>=':
          return actualValue >= expectedValue;
        case '<=':
          return actualValue <= expectedValue;
        default:
          return false;
      }
    }

    return false;
  } catch (error) {
    logger.warn({
      msg: 'Failed to evaluate condition',
      condition,
      error: error,
    });
    return false;
  }
}

/**
 * Apply transformation function to a value
 */
function applyTransformFunction(value: any, transform: string, transformFunctions?: any): any {
  // Handle built-in transformations
  if (transform === 'trim' && typeof value === 'string') {
    return value.trim();
  }

  if (transform === 'toLowerCase' && typeof value === 'string') {
    return value.toLowerCase();
  }

  if (transform === 'toUpperCase' && typeof value === 'string') {
    return value.toUpperCase();
  }

  if (transform === 'toNumber') {
    return Number(value);
  }

  if (transform === 'formatDateHL7' && value) {
    // HL7 date format: YYYYMMDDHHMMSS
    const date = new Date(value);
    return date.toISOString().replace(/[-:]/g, '').slice(0, 14);
  }

  if (transform.startsWith('addPrefix:')) {
    const prefix = transform.replace('addPrefix:', '');
    return `${prefix}${value}`;
  }

  if (transform === 'incrementIndex') {
    return Number(value) + 1;
  }

  if (transform === 'escapeHL7' && typeof value === 'string') {
    // Escape HL7 special characters
    return value
      .replace(/\\/g, '\\E\\')
      .replace(/\|/g, '\\F\\')
      .replace(/\^/g, '\\S\\')
      .replace(/~/g, '\\T\\')
      .replace(/&/g, '\\R\\');
  }

  if (transform === 'formatHL7Provider' && typeof value === 'string') {
    // Format provider as HL7 XCN data type
    return `${value}^^^`;
  }

  // Handle custom transformation functions defined in the rule
  if (transformFunctions && transformFunctions[transform]) {
    const mapping = transformFunctions[transform];
    if (typeof mapping === 'object' && !Array.isArray(mapping)) {
      // It's a lookup table
      return mapping[value] !== undefined ? mapping[value] : value;
    }
  }

  return value;
}

/**
 * Get a nested property using dot notation
 */
function getNestedProperty(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    current = current[part];
  }

  return current;
}
