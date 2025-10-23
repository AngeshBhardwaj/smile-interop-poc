/**
 * JSONPath mapper - Maps fields from source to target using JSONPath expressions
 */

import { JSONPath } from 'jsonpath-plus';
import { FieldMapping, TransformFunction } from '../rules/types';

/**
 * Mapping result
 */
export interface MappingResult {
  success: boolean;
  data?: any;
  errors?: string[] | undefined;
}

/**
 * Apply field mappings to transform source data to target format
 */
export function applyMappings(
  sourceData: any,
  mappings: FieldMapping[]
): MappingResult {
  const errors: string[] = [];
  const result: any = {};

  for (const mapping of mappings) {
    try {
      // Extract value from source using JSONPath
      const extractedValue = extractValue(sourceData, mapping.source);

      // Check if value is required but missing
      if (mapping.required && extractedValue === undefined) {
        errors.push(
          `Required field missing: ${mapping.source} -> ${mapping.target}`
        );
        continue;
      }

      // Use extracted value or default value
      let value = extractedValue !== undefined ? extractedValue : mapping.defaultValue;

      // Apply transformation if specified
      if (mapping.transform && value !== undefined) {
        try {
          value = applyTransformation(value, mapping.transform);
        } catch (error: any) {
          errors.push(
            `Transformation failed for ${mapping.target}: ${error.message}`
          );
          continue;
        }
      }

      // Set value in target using JSONPath
      if (value !== undefined) {
        setValue(result, mapping.target, value);
      }
    } catch (error: any) {
      errors.push(
        `Mapping failed for ${mapping.source} -> ${mapping.target}: ${error.message}`
      );
    }
  }

  return {
    success: errors.length === 0,
    data: result,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Extract value from object using JSONPath expression
 */
export function extractValue(obj: any, path: string): any {
  try {
    const results = JSONPath({ path, json: obj, wrap: false });
    return results;
  } catch (error: any) {
    throw new Error(`Failed to extract value at path ${path}: ${error.message}`);
  }
}

/**
 * Set value in object using JSONPath expression
 * Note: This is a simplified implementation for setting values
 */
export function setValue(obj: any, path: string, value: any): void {
  // Remove leading $ if present
  const cleanPath = path.startsWith('$.') ? path.substring(2) : path.startsWith('$') ? path.substring(1) : path;

  if (!cleanPath) {
    throw new Error('Invalid path: path cannot be empty');
  }

  // Split path into parts
  const parts = cleanPath.split('.');
  if (parts.length === 0) {
    throw new Error('Invalid path: cannot parse path');
  }

  let current: any = obj;

  // Navigate/create the path
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!part) {
      throw new Error(`Invalid path: empty segment at position ${i}`);
    }

    // Handle array notation [0]
    const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
    if (arrayMatch && arrayMatch[1] && arrayMatch[2]) {
      const key = arrayMatch[1];
      const index = parseInt(arrayMatch[2], 10);

      if (!current[key]) {
        current[key] = [];
      }
      if (!current[key][index]) {
        current[key][index] = {};
      }
      current = current[key][index];
    } else {
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }
  }

  // Set the final value
  const lastPart = parts[parts.length - 1];
  if (!lastPart) {
    throw new Error('Invalid path: empty final segment');
  }

  const arrayMatch = lastPart.match(/^(.+)\[(\d+)\]$/);

  if (arrayMatch && arrayMatch[1] && arrayMatch[2]) {
    const key = arrayMatch[1];
    const index = parseInt(arrayMatch[2], 10);

    if (!current[key]) {
      current[key] = [];
    }
    current[key][index] = value;
  } else {
    current[lastPart] = value;
  }
}

/**
 * Apply transformation function to a value
 */
export function applyTransformation(value: any, transform: TransformFunction): any {
  switch (transform) {
    case 'toUpperCase':
      return String(value).toUpperCase();

    case 'toLowerCase':
      return String(value).toLowerCase();

    case 'trim':
      return String(value).trim();

    case 'toString':
      return String(value);

    case 'toNumber':
      const num = Number(value);
      if (isNaN(num)) {
        throw new Error(`Cannot convert "${value}" to number`);
      }
      return num;

    case 'toBoolean':
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const lower = value.toLowerCase();
        if (lower === 'true' || lower === '1' || lower === 'yes') return true;
        if (lower === 'false' || lower === '0' || lower === 'no') return false;
      }
      if (typeof value === 'number') {
        return value !== 0;
      }
      throw new Error(`Cannot convert "${value}" to boolean`);

    case 'formatDate':
      return formatDate(value);

    case 'mapGender':
      return mapGender(value);

    case 'generateUUID':
      // For generateUUID, we ignore the input value and generate a new UUID
      return generateUUID();

    default:
      throw new Error(`Unknown transformation function: ${transform}`);
  }
}

/**
 * Format date to ISO 8601 string
 */
function formatDate(value: any): string {
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date: ${value}`);
    }
    return date.toISOString();
  } catch (error: any) {
    throw new Error(`Date formatting failed: ${error.message}`);
  }
}

/**
 * Map gender values to standard format
 */
function mapGender(value: any): string {
  const normalized = String(value).toLowerCase().trim();

  const maleVariants = ['m', 'male', 'man', '1'];
  const femaleVariants = ['f', 'female', 'woman', '2'];
  const otherVariants = ['o', 'other', 'x', '3'];
  const unknownVariants = ['u', 'unknown', 'n/a', 'null', '0', ''];

  if (maleVariants.includes(normalized)) return 'male';
  if (femaleVariants.includes(normalized)) return 'female';
  if (otherVariants.includes(normalized)) return 'other';
  if (unknownVariants.includes(normalized)) return 'unknown';

  // If no match, return original value
  return String(value);
}

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Validate mapping configuration
 */
export function validateMapping(mapping: FieldMapping): { valid: boolean; error?: string } {
  if (!mapping.source) {
    return { valid: false, error: 'Mapping source is required' };
  }

  if (!mapping.target) {
    return { valid: false, error: 'Mapping target is required' };
  }

  // Validate JSONPath syntax (basic check)
  if (!mapping.source.startsWith('$')) {
    return { valid: false, error: 'Source path must start with $' };
  }

  if (!mapping.target.startsWith('$')) {
    return { valid: false, error: 'Target path must start with $' };
  }

  return { valid: true };
}
