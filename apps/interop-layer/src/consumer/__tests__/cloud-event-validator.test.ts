/**
 * CloudEvent Validator Unit Tests
 *
 * TDD approach: Write tests first, then implement validator
 */

import { CloudEventValidator } from '../cloud-event-validator';

describe('CloudEventValidator', () => {
  let validator: CloudEventValidator;

  beforeEach(() => {
    validator = new CloudEventValidator();
  });

  describe('validate()', () => {
    it('should validate a valid CloudEvent v1.0', () => {
      const validEvent = {
        specversion: '1.0',
        type: 'health.patient.registered',
        source: 'smile.health-service',
        id: 'test-123',
        time: '2025-10-10T00:00:00Z',
        datacontenttype: 'application/json',
        data: {
          patientId: '12345',
          name: 'John Doe',
        },
      };

      const result = validator.validate(validEvent);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
      expect(result.event).toEqual(validEvent);
    });

    it('should reject event with missing specversion', () => {
      const invalidEvent = {
        type: 'health.patient.registered',
        source: 'smile.health-service',
        id: 'test-123',
      };

      const result = validator.validate(invalidEvent);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: specversion');
    });

    it('should reject event with missing type', () => {
      const invalidEvent = {
        specversion: '1.0',
        source: 'smile.health-service',
        id: 'test-123',
      };

      const result = validator.validate(invalidEvent);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: type');
    });

    it('should reject event with missing source', () => {
      const invalidEvent = {
        specversion: '1.0',
        type: 'health.patient.registered',
        id: 'test-123',
      };

      const result = validator.validate(invalidEvent);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: source');
    });

    it('should reject event with missing id', () => {
      const invalidEvent = {
        specversion: '1.0',
        type: 'health.patient.registered',
        source: 'smile.health-service',
      };

      const result = validator.validate(invalidEvent);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: id');
    });

    it('should reject event with invalid specversion', () => {
      const invalidEvent = {
        specversion: '0.3',
        type: 'health.patient.registered',
        source: 'smile.health-service',
        id: 'test-123',
      };

      const result = validator.validate(invalidEvent);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unsupported specversion: 0.3');
    });

    it('should accept event without optional time field', () => {
      const validEvent = {
        specversion: '1.0',
        type: 'health.patient.registered',
        source: 'smile.health-service',
        id: 'test-123',
        data: { test: 'data' },
      };

      const result = validator.validate(validEvent);

      expect(result.valid).toBe(true);
    });

    it('should accept event without optional data field', () => {
      const validEvent = {
        specversion: '1.0',
        type: 'health.patient.registered',
        source: 'smile.health-service',
        id: 'test-123',
      };

      const result = validator.validate(validEvent);

      expect(result.valid).toBe(true);
    });

    it('should return multiple errors for multiple missing fields', () => {
      const invalidEvent = {
        specversion: '1.0',
      };

      const result = validator.validate(invalidEvent);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(3); // type, source, id
      expect(result.errors).toContain('Missing required field: type');
      expect(result.errors).toContain('Missing required field: source');
      expect(result.errors).toContain('Missing required field: id');
    });

    it('should handle null input', () => {
      const result = validator.validate(null);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Event is null or undefined');
    });

    it('should handle undefined input', () => {
      const result = validator.validate(undefined);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Event is null or undefined');
    });

    it('should handle non-object input', () => {
      const result = validator.validate('not an object' as any);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Event must be an object');
    });
  });

  describe('extractCorrelationId()', () => {
    it('should extract correlation ID from data.metadata.correlationId', () => {
      const event = {
        specversion: '1.0',
        type: 'test.event',
        source: 'test',
        id: '123',
        data: {
          metadata: {
            correlationId: 'corr-123',
          },
        },
      };

      const correlationId = validator.extractCorrelationId(event);

      expect(correlationId).toBe('corr-123');
    });

    it('should extract correlation ID from extension attribute', () => {
      const event = {
        specversion: '1.0',
        type: 'test.event',
        source: 'test',
        id: '123',
        correlationid: 'corr-456',
      };

      const correlationId = validator.extractCorrelationId(event);

      expect(correlationId).toBe('corr-456');
    });

    it('should use event ID as fallback if no correlation ID found', () => {
      const event = {
        specversion: '1.0',
        type: 'test.event',
        source: 'test',
        id: 'event-789',
      };

      const correlationId = validator.extractCorrelationId(event);

      expect(correlationId).toBe('event-789');
    });

    it('should prioritize data.metadata.correlationId over extension', () => {
      const event = {
        specversion: '1.0',
        type: 'test.event',
        source: 'test',
        id: '123',
        correlationid: 'corr-ext',
        data: {
          metadata: {
            correlationId: 'corr-data',
          },
        },
      };

      const correlationId = validator.extractCorrelationId(event);

      expect(correlationId).toBe('corr-data');
    });
  });
});
