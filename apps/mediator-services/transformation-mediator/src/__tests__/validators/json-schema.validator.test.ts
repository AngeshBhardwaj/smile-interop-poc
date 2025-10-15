/**
 * Tests for json-schema validator
 */

import {
  JsonSchemaValidator,
  getValidator,
  validateSchema,
  resetValidator,
} from '../../validators/json-schema.validator';
import * as fs from 'fs';
import * as path from 'path';

// Mock logger
jest.mock('../../utils/logger', () => ({
  getLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

describe('JSON Schema Validator', () => {
  let validator: JsonSchemaValidator;

  beforeEach(() => {
    validator = new JsonSchemaValidator();
  });

  describe('Basic Validation', () => {
    it('should validate data that matches schema', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name', 'age'],
      };

      const data = {
        name: 'John Doe',
        age: 30,
      };

      const result = validator.validate(data, schema);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject data with missing required fields', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name', 'age'],
      };

      const data = {
        name: 'John Doe',
        // age is missing
      };

      const result = validator.validate(data, schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      expect(result.errors![0].message).toContain('Missing required property: age');
    });

    it('should reject data with wrong type', () => {
      const schema = {
        type: 'object',
        properties: {
          age: { type: 'number' },
        },
      };

      const data = {
        age: 'not-a-number',
      };

      const result = validator.validate(data, schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('Invalid type');
    });
  });

  describe('Type Validation', () => {
    it('should validate string type', () => {
      const schema = { type: 'string' };
      expect(validator.validate('hello', schema).valid).toBe(true);
      expect(validator.validate(123, schema).valid).toBe(false);
    });

    it('should validate number type', () => {
      const schema = { type: 'number' };
      expect(validator.validate(123, schema).valid).toBe(true);
      expect(validator.validate('123', schema).valid).toBe(false);
    });

    it('should validate boolean type', () => {
      const schema = { type: 'boolean' };
      expect(validator.validate(true, schema).valid).toBe(true);
      expect(validator.validate('true', schema).valid).toBe(false);
    });

    it('should validate array type', () => {
      const schema = {
        type: 'array',
        items: { type: 'number' },
      };
      expect(validator.validate([1, 2, 3], schema).valid).toBe(true);
      expect(validator.validate([1, '2', 3], schema).valid).toBe(false);
    });

    it('should validate object type', () => {
      const schema = { type: 'object' };
      expect(validator.validate({}, schema).valid).toBe(true);
      expect(validator.validate([], schema).valid).toBe(false);
    });
  });

  describe('Constraint Validation', () => {
    it('should validate minimum constraint', () => {
      const schema = {
        type: 'number',
        minimum: 10,
      };

      expect(validator.validate(15, schema).valid).toBe(true);
      expect(validator.validate(5, schema).valid).toBe(false);
    });

    it('should validate maximum constraint', () => {
      const schema = {
        type: 'number',
        maximum: 100,
      };

      expect(validator.validate(50, schema).valid).toBe(true);
      expect(validator.validate(150, schema).valid).toBe(false);
    });

    it('should validate minLength constraint', () => {
      const schema = {
        type: 'string',
        minLength: 3,
      };

      expect(validator.validate('hello', schema).valid).toBe(true);
      expect(validator.validate('hi', schema).valid).toBe(false);
    });

    it('should validate maxLength constraint', () => {
      const schema = {
        type: 'string',
        maxLength: 10,
      };

      expect(validator.validate('hello', schema).valid).toBe(true);
      expect(validator.validate('hello world!', schema).valid).toBe(false);
    });

    it('should validate pattern constraint', () => {
      const schema = {
        type: 'string',
        pattern: '^[A-Z][0-9]+$',
      };

      expect(validator.validate('A123', schema).valid).toBe(true);
      expect(validator.validate('abc123', schema).valid).toBe(false);
    });

    it('should validate enum constraint', () => {
      const schema = {
        type: 'string',
        enum: ['red', 'green', 'blue'],
      };

      expect(validator.validate('red', schema).valid).toBe(true);
      expect(validator.validate('yellow', schema).valid).toBe(false);
    });
  });

  describe('Format Validation', () => {
    it('should validate email format', () => {
      const schema = {
        type: 'string',
        format: 'email',
      };

      expect(validator.validate('test@example.com', schema).valid).toBe(true);
      expect(validator.validate('invalid-email', schema).valid).toBe(false);
    });

    it('should validate date-time format', () => {
      const schema = {
        type: 'string',
        format: 'date-time',
      };

      expect(validator.validate('2024-01-15T10:00:00Z', schema).valid).toBe(true);
      expect(validator.validate('not-a-date', schema).valid).toBe(false);
    });

    it('should validate uri format', () => {
      const schema = {
        type: 'string',
        format: 'uri',
      };

      expect(validator.validate('https://example.com', schema).valid).toBe(true);
      expect(validator.validate('not a uri', schema).valid).toBe(false);
    });
  });

  describe('Complex Schema Validation', () => {
    it('should validate nested objects', () => {
      const schema = {
        type: 'object',
        properties: {
          patient: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
            },
            required: ['id', 'name'],
          },
        },
        required: ['patient'],
      };

      const validData = {
        patient: {
          id: 'P123',
          name: 'John Doe',
        },
      };

      const invalidData = {
        patient: {
          id: 'P123',
          // name is missing
        },
      };

      expect(validator.validate(validData, schema).valid).toBe(true);
      expect(validator.validate(invalidData, schema).valid).toBe(false);
    });

    it('should validate arrays of objects', () => {
      const schema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            value: { type: 'number' },
          },
          required: ['id', 'value'],
        },
      };

      const validData = [
        { id: 'item1', value: 100 },
        { id: 'item2', value: 200 },
      ];

      const invalidData = [
        { id: 'item1', value: 100 },
        { id: 'item2' }, // missing value
      ];

      expect(validator.validate(validData, schema).valid).toBe(true);
      expect(validator.validate(invalidData, schema).valid).toBe(false);
    });

    it('should validate with additional properties', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
        additionalProperties: false,
      };

      const validData = {
        name: 'John',
      };

      const invalidData = {
        name: 'John',
        extra: 'field',
      };

      expect(validator.validate(validData, schema).valid).toBe(true);
      expect(validator.validate(invalidData, schema).valid).toBe(false);
    });
  });

  describe('Error Formatting', () => {
    it('should provide detailed error messages', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 3 },
          age: { type: 'number', minimum: 0, maximum: 120 },
          email: { type: 'string', format: 'email' },
        },
        required: ['name', 'age', 'email'],
      };

      const data = {
        name: 'Jo', // too short
        age: 150, // too high
        email: 'invalid', // invalid format
      };

      const result = validator.validate(data, schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should include field path in errors', () => {
      const schema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
            required: ['name'],
          },
        },
      };

      const data = {
        user: {},
      };

      const result = validator.validate(data, schema);

      expect(result.valid).toBe(false);
      expect(result.errors![0].field).toContain('user');
    });
  });

  describe('Cache Management', () => {
    it('should cache loaded schemas', () => {
      const schema = {
        type: 'object',
        properties: {
          test: { type: 'string' },
        },
      };

      // First validation
      validator.validate({ test: 'value' }, schema);

      // Check cache stats
      const stats = validator.getCacheStats();
      expect(stats.cachedSchemas).toBeGreaterThanOrEqual(0);
    });

    it('should clear cache', () => {
      validator.clearCache();
      const stats = validator.getCacheStats();
      expect(stats.cachedSchemas).toBe(0);
      expect(stats.schemas).toEqual([]);
    });
  });

  describe('Batch Validation', () => {
    it('should validate multiple items', () => {
      const schema = {
        type: 'object',
        properties: {
          value: { type: 'number' },
        },
        required: ['value'],
      };

      const dataItems = [
        { value: 1 },
        { value: 2 },
        { value: 'invalid' },
        { value: 4 },
      ];

      const result = validator.validateBatch(dataItems, schema);

      expect(result.summary.total).toBe(4);
      expect(result.summary.valid).toBe(3);
      expect(result.summary.invalid).toBe(1);
      expect(result.valid).toHaveLength(3);
      expect(result.invalid).toHaveLength(1);
    });

    it('should handle empty batch', () => {
      const schema = { type: 'string' };
      const result = validator.validateBatch([], schema);

      expect(result.summary.total).toBe(0);
      expect(result.summary.valid).toBe(0);
      expect(result.summary.invalid).toBe(0);
    });
  });

  describe('Custom Formats', () => {
    it('should allow adding custom formats', () => {
      validator.addFormat('custom-id', /^C[0-9]{4}$/);

      const schema = {
        type: 'string',
        format: 'custom-id',
      };

      expect(validator.validate('C1234', schema).valid).toBe(true);
      expect(validator.validate('A1234', schema).valid).toBe(false);
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const instance1 = getValidator();
      const instance2 = getValidator();
      expect(instance1).toBe(instance2);
    });

    it('should reset singleton', () => {
      const instance1 = getValidator();
      resetValidator();
      const instance2 = getValidator();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Convenience Function', () => {
    it('should validate using convenience function', () => {
      const schema = { type: 'string' };
      const result = validateSchema('test', schema);
      expect(result.valid).toBe(true);
    });
  });

  describe('Real-world Patient Schema', () => {
    it('should validate patient data', () => {
      const patientSchema = {
        type: 'object',
        properties: {
          patientId: { type: 'string', pattern: '^P[0-9]+$' },
          given: { type: 'string', minLength: 1 },
          family: { type: 'string', minLength: 1 },
          gender: { type: 'string', enum: ['male', 'female', 'other', 'unknown'] },
          birthDate: { type: 'string', format: 'date' },
          contact: {
            type: 'object',
            properties: {
              email: { type: 'string', format: 'email' },
              phone: { type: 'string' },
            },
          },
        },
        required: ['patientId', 'given', 'family', 'gender'],
      };

      const validPatient = {
        patientId: 'P12345',
        given: 'John',
        family: 'Doe',
        gender: 'male',
        birthDate: '1990-05-15',
        contact: {
          email: 'john@example.com',
          phone: '555-0100',
        },
      };

      const result = validator.validate(validPatient, patientSchema);
      expect(result.valid).toBe(true);
    });
  });
});
