/**
 * FHIR R4 Transformer
 * Transforms CloudEvents to FHIR R4 resources (ServiceRequest, Bundle, etc.)
 */

import { CloudEvent } from '../config/types';
import { TransformationRule } from '../rules/types';
import { getLogger } from '../utils/logger';
import { extractValue, setValue } from '../utils/mapper';

const logger = getLogger('fhir-transformer');

/**
 * Transformation result
 */
export interface FHIRTransformationResult {
  success: boolean;
  data?: any;
  errors?: string[];
}

/**
 * Transform CloudEvent to FHIR R4 resource
 */
export async function transformToFHIR(
  cloudEvent: CloudEvent,
  rule: TransformationRule
): Promise<FHIRTransformationResult> {
  try {
    logger.info({
      msg: 'Starting FHIR R4 transformation',
      eventId: cloudEvent.id,
      ruleName: rule.name,
    });

    const errors: string[] = [];
    const fhirResource: any = {};
    const ruleExt = rule as any; // Allow access to custom fields

    // Apply field mappings
    for (const mapping of rule.mappings) {
      try {
        const mappingExt = mapping as any;
        let value: any;

        // Handle different source types
        if (mappingExt.value !== undefined) {
          value = mappingExt.value;
        } else if (mapping.source === 'constant' && mappingExt.value !== undefined) {
          value = mappingExt.value;
        } else if (mapping.source.startsWith('$.')) {
          // JSONPath expression
          value = extractValue(cloudEvent, mapping.source);

          // Apply transformations if specified
          if (mappingExt.transforms && Array.isArray(mappingExt.transforms)) {
            for (const transform of mappingExt.transforms) {
              value = applyTransformFunction(value, transform, ruleExt.transformFunctions);
            }
          }

          // Use default value if result is null/undefined
          if ((value === null || value === undefined) && mapping.defaultValue !== undefined) {
            value = mapping.defaultValue;
          }
        }

        // Skip if value is still null/undefined and field is not required
        if (value === null || value === undefined) {
          if (mapping.required) {
            errors.push(`Required field ${mapping.target} is missing`);
          }
          continue;
        }

        // Set the value in the FHIR resource using dot notation
        setValue(fhirResource, mapping.target, value);
      } catch (error: any) {
        errors.push(`Failed to map ${mapping.target}: ${error.message}`);
      }
    }

    // Handle contained resources (like SupplyRequest for line items)
    if (ruleExt.itemMappings && cloudEvent.data) {
      try {
        const sourceArray = extractValue(
          cloudEvent,
          ruleExt.itemMappings.sourceArray
        );

        if (Array.isArray(sourceArray) && sourceArray.length > 0) {
          const containedResources: any[] = [];

          for (let i = 0; i < sourceArray.length; i++) {
            const item = sourceArray[i];
            const containedResource: any = {};

            for (const itemMapping of ruleExt.itemMappings.itemMappings) {
              let itemValue: any;

              if (itemMapping.source === 'constant') {
                itemValue = itemMapping.value;
              } else if (itemMapping.source === 'index') {
                itemValue = i;
              } else if (itemMapping.source.startsWith('$.')) {
                // Apply JSONPath relative to item
                const path = itemMapping.source.replace(/^\$\./, '');
                itemValue = getNestedProperty(item, path);

                // Apply transformations
                if (itemMapping.transforms && Array.isArray(itemMapping.transforms)) {
                  for (const transform of itemMapping.transforms) {
                    itemValue = applyTransformFunction(
                      itemValue,
                      transform,
                      ruleExt.transformFunctions
                    );
                  }
                }

                // Use default value if needed
                if (
                  (itemValue === null || itemValue === undefined) &&
                  itemMapping.defaultValue !== undefined
                ) {
                  itemValue = itemMapping.defaultValue;
                }
              }

              if (itemValue !== null && itemValue !== undefined) {
                setNestedProperty(containedResource, itemMapping.target, itemValue);
              }
            }

            containedResources.push(containedResource);
          }

          fhirResource.contained = containedResources;
        }
      } catch (error: any) {
        errors.push(`Failed to process item mappings: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      logger.warn({
        msg: 'FHIR transformation completed with errors',
        eventId: cloudEvent.id,
        errors,
      });

      return {
        success: false,
        data: fhirResource,
        errors,
      };
    }

    logger.info({
      msg: 'FHIR R4 transformation completed successfully',
      eventId: cloudEvent.id,
      resourceType: fhirResource.resourceType,
    });

    return {
      success: true,
      data: fhirResource,
    };
  } catch (error: any) {
    logger.error({
      msg: 'FHIR transformation failed',
      eventId: cloudEvent.id,
      error: error.message,
      stack: error.stack,
    });

    return {
      success: false,
      errors: [`FHIR transformation failed: ${error.message}`],
    };
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

  if (transform === 'toTitleCase' && typeof value === 'string') {
    return value.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
  }

  if (transform === 'toNumber') {
    return Number(value);
  }

  if (transform === 'formatDateISO8601' && value) {
    return new Date(value).toISOString();
  }

  if (transform.startsWith('addPrefix:')) {
    const prefix = transform.replace('addPrefix:', '');
    return `${prefix}${value}`;
  }

  if (transform.startsWith('addSuffix:')) {
    const suffix = transform.replace('addSuffix:', '');
    return `${value}${suffix}`;
  }

  if (transform === 'incrementIndex') {
    return Number(value) + 1;
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
 * Set a nested property using dot notation (e.g., "code.coding[0].system")
 */
function setNestedProperty(obj: any, path: string, value: any): void {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);

    if (arrayMatch) {
      const arrayName = arrayMatch[1];
      const index = parseInt(arrayMatch[2], 10);

      if (!current[arrayName]) {
        current[arrayName] = [];
      }

      if (!current[arrayName][index]) {
        current[arrayName][index] = {};
      }

      current = current[arrayName][index];
    } else {
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }
  }

  const lastPart = parts[parts.length - 1];
  const arrayMatch = lastPart.match(/^(.+)\[(\d+)\]$/);

  if (arrayMatch) {
    const arrayName = arrayMatch[1];
    const index = parseInt(arrayMatch[2], 10);

    if (!current[arrayName]) {
      current[arrayName] = [];
    }

    current[arrayName][index] = value;
  } else {
    current[lastPart] = value;
  }
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

    const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);

    if (arrayMatch) {
      const arrayName = arrayMatch[1];
      const index = parseInt(arrayMatch[2], 10);
      current = current[arrayName]?.[index];
    } else {
      current = current[part];
    }
  }

  return current;
}
