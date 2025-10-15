/**
 * JSON Schema validator - Validates data against JSON Schema
 */

import Ajv, { ValidateFunction, ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../utils/logger';

const logger = getLogger('json-schema-validator');

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

/**
 * Validation error details
 */
export interface ValidationError {
  field: string;
  message: string;
  value?: any;
  constraint?: string;
}

/**
 * JSON Schema Validator class
 */
export class JsonSchemaValidator {
  private ajv: Ajv;
  private schemaCache: Map<string, ValidateFunction>;

  constructor() {
    // Initialize AJV with strict mode and all errors
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false, // Allow additional properties by default
      coerceTypes: false, // Don't coerce types automatically
    });

    // Add format validators (email, date-time, uri, etc.)
    addFormats(this.ajv);

    // Initialize schema cache
    this.schemaCache = new Map();

    logger.info('JSON Schema Validator initialized');
  }

  /**
   * Validate data against a JSON schema
   */
  validate(data: any, schema: object | string): ValidationResult {
    try {
      let validateFn: ValidateFunction;

      // If schema is a string, treat it as a file path
      if (typeof schema === 'string') {
        validateFn = this.getValidatorFromFile(schema);
      } else {
        // Compile schema
        validateFn = this.ajv.compile(schema);
      }

      // Validate data
      const valid = validateFn(data);

      if (valid) {
        return { valid: true };
      }

      // Extract and format errors
      const errors = this.formatErrors(validateFn.errors || []);

      logger.warn({
        msg: 'Validation failed',
        errorCount: errors.length,
        errors,
      });

      return {
        valid: false,
        errors,
      };
    } catch (error: any) {
      logger.error({
        msg: 'Validation error',
        error: error.message,
        stack: error.stack,
      });

      return {
        valid: false,
        errors: [
          {
            field: 'schema',
            message: `Schema validation error: ${error.message}`,
          },
        ],
      };
    }
  }

  /**
   * Load and cache validator from schema file
   */
  private getValidatorFromFile(filePath: string): ValidateFunction {
    // Check cache first
    if (this.schemaCache.has(filePath)) {
      return this.schemaCache.get(filePath)!;
    }

    // Load schema from file
    if (!fs.existsSync(filePath)) {
      throw new Error(`Schema file not found: ${filePath}`);
    }

    const schemaContent = fs.readFileSync(filePath, 'utf-8');
    const schema = JSON.parse(schemaContent);

    // Compile and cache
    const validateFn = this.ajv.compile(schema);
    this.schemaCache.set(filePath, validateFn);

    logger.debug({
      msg: 'Schema loaded and cached',
      filePath,
    });

    return validateFn;
  }

  /**
   * Format AJV errors into a more readable format
   */
  private formatErrors(ajvErrors: ErrorObject[]): ValidationError[] {
    return ajvErrors.map((error) => {
      const field = error.instancePath || error.schemaPath || 'root';
      let message = error.message || 'Validation failed';

      // Enhance error messages based on error type
      switch (error.keyword) {
        case 'required':
          message = `Missing required property: ${error.params.missingProperty}`;
          break;
        case 'type':
          message = `Invalid type: expected ${error.params.type}, got ${typeof error.data}`;
          break;
        case 'format':
          message = `Invalid format: expected ${error.params.format}`;
          break;
        case 'minimum':
        case 'maximum':
          message = `Value must be ${error.keyword} ${error.params.limit}`;
          break;
        case 'minLength':
        case 'maxLength':
          message = `String length must be ${error.keyword.replace('Length', '')} ${error.params.limit}`;
          break;
        case 'pattern':
          message = `String does not match required pattern`;
          break;
        case 'enum':
          message = `Value must be one of: ${error.params.allowedValues?.join(', ')}`;
          break;
        case 'additionalProperties':
          message = `Additional property not allowed: ${error.params.additionalProperty}`;
          break;
      }

      return {
        field: field.replace(/^\//, ''), // Remove leading slash
        message,
        value: error.data,
        constraint: error.keyword,
      };
    });
  }

  /**
   * Clear schema cache
   */
  clearCache(): void {
    this.schemaCache.clear();
    logger.debug('Schema cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    cachedSchemas: number;
    schemas: string[];
  } {
    return {
      cachedSchemas: this.schemaCache.size,
      schemas: Array.from(this.schemaCache.keys()),
    };
  }

  /**
   * Add a custom format validator
   */
  addFormat(name: string, validator: string | RegExp | ((data: string) => boolean)): void {
    this.ajv.addFormat(name, validator);
    logger.debug({
      msg: 'Custom format added',
      format: name,
    });
  }

  /**
   * Validate multiple data items against the same schema
   */
  validateBatch(
    dataItems: any[],
    schema: object | string
  ): {
    valid: ValidationResult[];
    invalid: ValidationResult[];
    summary: {
      total: number;
      valid: number;
      invalid: number;
    };
  } {
    const valid: ValidationResult[] = [];
    const invalid: ValidationResult[] = [];

    for (const data of dataItems) {
      const result = this.validate(data, schema);
      if (result.valid) {
        valid.push(result);
      } else {
        invalid.push(result);
      }
    }

    return {
      valid,
      invalid,
      summary: {
        total: dataItems.length,
        valid: valid.length,
        invalid: invalid.length,
      },
    };
  }
}

/**
 * Create a singleton instance
 */
let validatorInstance: JsonSchemaValidator | null = null;

/**
 * Get the global validator instance
 */
export function getValidator(): JsonSchemaValidator {
  if (!validatorInstance) {
    validatorInstance = new JsonSchemaValidator();
  }
  return validatorInstance;
}

/**
 * Validate data against a schema (convenience function)
 */
export function validateSchema(data: any, schema: object | string): ValidationResult {
  return getValidator().validate(data, schema);
}

/**
 * Reset the validator instance (useful for testing)
 */
export function resetValidator(): void {
  validatorInstance = null;
}
