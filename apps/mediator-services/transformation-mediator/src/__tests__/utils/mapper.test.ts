/**
 * Tests for mapper utility
 */

import {
  applyMappings,
  extractValue,
  setValue,
  applyTransformation,
  validateMapping,
} from '../../utils/mapper';
import { FieldMapping } from '../../rules/types';

describe('Mapper Utility', () => {
  describe('extractValue', () => {
    it('should extract simple field value', () => {
      const obj = { name: 'John', age: 30 };
      const result = extractValue(obj, '$.name');
      expect(result).toBe('John');
    });

    it('should extract nested field value', () => {
      const obj = { user: { profile: { name: 'John' } } };
      const result = extractValue(obj, '$.user.profile.name');
      expect(result).toBe('John');
    });

    it('should extract array element', () => {
      const obj = { items: ['a', 'b', 'c'] };
      const result = extractValue(obj, '$.items[1]');
      expect(result).toBe('b');
    });

    it('should return undefined for non-existent path', () => {
      const obj = { name: 'John' };
      const result = extractValue(obj, '$.nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('setValue', () => {
    it('should set simple field value', () => {
      const obj: any = {};
      setValue(obj, '$.name', 'John');
      expect(obj.name).toBe('John');
    });

    it('should set nested field value', () => {
      const obj: any = {};
      setValue(obj, '$.user.profile.name', 'John');
      expect(obj.user.profile.name).toBe('John');
    });

    it('should set array element', () => {
      const obj: any = {};
      setValue(obj, '$.items[0]', 'first');
      expect(obj.items[0]).toBe('first');
    });

    it('should handle path without $ prefix', () => {
      const obj: any = {};
      setValue(obj, 'name', 'John');
      expect(obj.name).toBe('John');
    });

    it('should throw error for empty path', () => {
      const obj: any = {};
      expect(() => setValue(obj, '$', 'value')).toThrow('Invalid path');
    });
  });

  describe('applyTransformation', () => {
    describe('toUpperCase', () => {
      it('should convert string to uppercase', () => {
        const result = applyTransformation('hello', 'toUpperCase');
        expect(result).toBe('HELLO');
      });
    });

    describe('toLowerCase', () => {
      it('should convert string to lowercase', () => {
        const result = applyTransformation('HELLO', 'toLowerCase');
        expect(result).toBe('hello');
      });
    });

    describe('trim', () => {
      it('should trim whitespace', () => {
        const result = applyTransformation('  hello  ', 'trim');
        expect(result).toBe('hello');
      });
    });

    describe('toString', () => {
      it('should convert number to string', () => {
        const result = applyTransformation(123, 'toString');
        expect(result).toBe('123');
      });

      it('should convert boolean to string', () => {
        const result = applyTransformation(true, 'toString');
        expect(result).toBe('true');
      });
    });

    describe('toNumber', () => {
      it('should convert string to number', () => {
        const result = applyTransformation('123', 'toNumber');
        expect(result).toBe(123);
      });

      it('should convert float string to number', () => {
        const result = applyTransformation('123.45', 'toNumber');
        expect(result).toBe(123.45);
      });

      it('should throw error for invalid number', () => {
        expect(() => applyTransformation('abc', 'toNumber')).toThrow(
          'Cannot convert "abc" to number'
        );
      });
    });

    describe('toBoolean', () => {
      it('should convert "true" string to boolean', () => {
        const result = applyTransformation('true', 'toBoolean');
        expect(result).toBe(true);
      });

      it('should convert "false" string to boolean', () => {
        const result = applyTransformation('false', 'toBoolean');
        expect(result).toBe(false);
      });

      it('should convert "1" to true', () => {
        const result = applyTransformation('1', 'toBoolean');
        expect(result).toBe(true);
      });

      it('should convert "0" to false', () => {
        const result = applyTransformation('0', 'toBoolean');
        expect(result).toBe(false);
      });

      it('should convert number 1 to true', () => {
        const result = applyTransformation(1, 'toBoolean');
        expect(result).toBe(true);
      });

      it('should convert number 0 to false', () => {
        const result = applyTransformation(0, 'toBoolean');
        expect(result).toBe(false);
      });

      it('should throw error for invalid boolean value', () => {
        expect(() => applyTransformation('invalid', 'toBoolean')).toThrow(
          'Cannot convert "invalid" to boolean'
        );
      });
    });

    describe('formatDate', () => {
      it('should format valid date string', () => {
        const result = applyTransformation('2024-01-15', 'formatDate');
        expect(result).toContain('2024-01-15');
        expect(result).toContain('T');
      });

      it('should format timestamp', () => {
        const timestamp = new Date('2024-01-15').getTime();
        const result = applyTransformation(timestamp, 'formatDate');
        expect(result).toContain('2024-01-15');
      });

      it('should throw error for invalid date', () => {
        expect(() => applyTransformation('invalid-date', 'formatDate')).toThrow(
          'Date formatting failed'
        );
      });
    });

    describe('mapGender', () => {
      it('should map male variants', () => {
        expect(applyTransformation('m', 'mapGender')).toBe('male');
        expect(applyTransformation('M', 'mapGender')).toBe('male');
        expect(applyTransformation('male', 'mapGender')).toBe('male');
        expect(applyTransformation('Male', 'mapGender')).toBe('male');
        expect(applyTransformation('1', 'mapGender')).toBe('male');
      });

      it('should map female variants', () => {
        expect(applyTransformation('f', 'mapGender')).toBe('female');
        expect(applyTransformation('F', 'mapGender')).toBe('female');
        expect(applyTransformation('female', 'mapGender')).toBe('female');
        expect(applyTransformation('Female', 'mapGender')).toBe('female');
        expect(applyTransformation('2', 'mapGender')).toBe('female');
      });

      it('should map other variants', () => {
        expect(applyTransformation('o', 'mapGender')).toBe('other');
        expect(applyTransformation('other', 'mapGender')).toBe('other');
        expect(applyTransformation('x', 'mapGender')).toBe('other');
      });

      it('should map unknown variants', () => {
        expect(applyTransformation('u', 'mapGender')).toBe('unknown');
        expect(applyTransformation('unknown', 'mapGender')).toBe('unknown');
        expect(applyTransformation('', 'mapGender')).toBe('unknown');
      });

      it('should return original value for unmapped input', () => {
        const result = applyTransformation('custom', 'mapGender');
        expect(result).toBe('custom');
      });
    });

    describe('generateUUID', () => {
      it('should generate valid UUID v4', () => {
        const result = applyTransformation(null, 'generateUUID');
        expect(result).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
        );
      });

      it('should generate different UUIDs', () => {
        const uuid1 = applyTransformation(null, 'generateUUID');
        const uuid2 = applyTransformation(null, 'generateUUID');
        expect(uuid1).not.toBe(uuid2);
      });
    });

    it('should throw error for unknown transformation', () => {
      expect(() => applyTransformation('value', 'unknownFunc' as any)).toThrow(
        'Unknown transformation function'
      );
    });
  });

  describe('validateMapping', () => {
    it('should validate correct mapping', () => {
      const mapping: FieldMapping = {
        source: '$.data.name',
        target: '$.name',
      };
      const result = validateMapping(mapping);
      expect(result.valid).toBe(true);
    });

    it('should reject mapping without source', () => {
      const mapping: any = {
        target: '$.name',
      };
      const result = validateMapping(mapping);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('source is required');
    });

    it('should reject mapping without target', () => {
      const mapping: any = {
        source: '$.data.name',
      };
      const result = validateMapping(mapping);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('target is required');
    });

    it('should reject source not starting with $', () => {
      const mapping: FieldMapping = {
        source: 'data.name',
        target: '$.name',
      };
      const result = validateMapping(mapping);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Source path must start with $');
    });

    it('should reject target not starting with $', () => {
      const mapping: FieldMapping = {
        source: '$.data.name',
        target: 'name',
      };
      const result = validateMapping(mapping);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Target path must start with $');
    });
  });

  describe('applyMappings', () => {
    it('should apply simple mapping', () => {
      const source = { name: 'John', age: 30 };
      const mappings: FieldMapping[] = [
        { source: '$.name', target: '$.fullName' },
        { source: '$.age', target: '$.years' },
      ];

      const result = applyMappings(source, mappings);

      expect(result.success).toBe(true);
      expect(result.data.fullName).toBe('John');
      expect(result.data.years).toBe(30);
    });

    it('should apply nested mapping', () => {
      const source = {
        user: {
          profile: {
            firstName: 'John',
            lastName: 'Doe',
          },
        },
      };
      const mappings: FieldMapping[] = [
        { source: '$.user.profile.firstName', target: '$.patient.givenName' },
        { source: '$.user.profile.lastName', target: '$.patient.familyName' },
      ];

      const result = applyMappings(source, mappings);

      expect(result.success).toBe(true);
      expect(result.data.patient.givenName).toBe('John');
      expect(result.data.patient.familyName).toBe('Doe');
    });

    it('should apply transformation', () => {
      const source = { name: 'john' };
      const mappings: FieldMapping[] = [
        {
          source: '$.name',
          target: '$.name',
          transform: 'toUpperCase',
        },
      ];

      const result = applyMappings(source, mappings);

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('JOHN');
    });

    it('should use default value when source is missing', () => {
      const source = { name: 'John' };
      const mappings: FieldMapping[] = [
        {
          source: '$.country',
          target: '$.country',
          defaultValue: 'USA',
        },
      ];

      const result = applyMappings(source, mappings);

      expect(result.success).toBe(true);
      expect(result.data.country).toBe('USA');
    });

    it('should handle required field missing', () => {
      const source = { name: 'John' };
      const mappings: FieldMapping[] = [
        {
          source: '$.email',
          target: '$.email',
          required: true,
        },
      ];

      const result = applyMappings(source, mappings);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Required field missing');
    });

    it('should handle transformation errors', () => {
      const source = { value: 'not-a-number' };
      const mappings: FieldMapping[] = [
        {
          source: '$.value',
          target: '$.number',
          transform: 'toNumber',
        },
      ];

      const result = applyMappings(source, mappings);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Transformation failed');
    });

    it('should apply multiple mappings with mixed success', () => {
      const source = { name: 'John', invalidNumber: 'abc', age: '30' };
      const mappings: FieldMapping[] = [
        { source: '$.name', target: '$.name' },
        { source: '$.invalidNumber', target: '$.number', transform: 'toNumber' },
        { source: '$.age', target: '$.age', transform: 'toNumber' },
      ];

      const result = applyMappings(source, mappings);

      expect(result.success).toBe(false);
      expect(result.data.name).toBe('John');
      expect(result.data.age).toBe(30);
      expect(result.data.number).toBeUndefined();
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBe(1);
    });

    it('should handle complex CloudEvent structure', () => {
      const cloudEvent = {
        specversion: '1.0',
        type: 'health.patient.registered',
        source: '/health-service',
        id: 'abc-123',
        time: '2024-01-15T10:00:00Z',
        data: {
          patient: {
            id: 'P12345',
            firstName: 'John',
            lastName: 'Doe',
            dateOfBirth: '1990-05-15',
            gender: 'm',
            contact: {
              email: 'john@example.com',
              phone: '555-0100',
            },
          },
        },
      };

      const mappings: FieldMapping[] = [
        { source: '$.data.patient.id', target: '$.patientId' },
        { source: '$.data.patient.firstName', target: '$.given[0]' },
        { source: '$.data.patient.lastName', target: '$.family' },
        { source: '$.data.patient.gender', target: '$.gender', transform: 'mapGender' },
        { source: '$.data.patient.contact.email', target: '$.telecom.email' },
      ];

      const result = applyMappings(cloudEvent, mappings);

      expect(result.success).toBe(true);
      expect(result.data.patientId).toBe('P12345');
      expect(result.data.given[0]).toBe('John');
      expect(result.data.family).toBe('Doe');
      expect(result.data.gender).toBe('male');
      expect(result.data.telecom.email).toBe('john@example.com');
    });

    it('should skip undefined values without default', () => {
      const source = { name: 'John' };
      const mappings: FieldMapping[] = [
        { source: '$.name', target: '$.name' },
        { source: '$.missing', target: '$.optional' },
      ];

      const result = applyMappings(source, mappings);

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('John');
      expect(result.data.optional).toBeUndefined();
    });
  });
});
