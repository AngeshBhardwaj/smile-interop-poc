/**
 * Tests for custom-transformer service
 */

import {
  transformToCustomJSON,
  validateCloudEvent,
  transformBatch,
  enrichTransformedData,
  extractEventSummary,
} from '../../services/custom-transformer';
import { CloudEvent } from '../../config/types';
import { TransformationRule } from '../../rules/types';

// Mock logger to avoid console output during tests
jest.mock('../../utils/logger', () => ({
  getLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

describe('Custom Transformer Service', () => {
  describe('validateCloudEvent', () => {
    it('should validate correct CloudEvent', () => {
      const cloudEvent: CloudEvent = {
        specversion: '1.0',
        type: 'health.patient.registered',
        source: '/health-service',
        id: 'test-123',
        data: { test: 'data' },
      };

      const result = validateCloudEvent(cloudEvent);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject CloudEvent without specversion', () => {
      const cloudEvent: any = {
        type: 'test.event',
        source: '/test',
        id: 'test-123',
      };

      const result = validateCloudEvent(cloudEvent);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: specversion');
    });

    it('should reject CloudEvent without type', () => {
      const cloudEvent: any = {
        specversion: '1.0',
        source: '/test',
        id: 'test-123',
      };

      const result = validateCloudEvent(cloudEvent);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: type');
    });

    it('should reject CloudEvent without source', () => {
      const cloudEvent: any = {
        specversion: '1.0',
        type: 'test.event',
        id: 'test-123',
      };

      const result = validateCloudEvent(cloudEvent);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: source');
    });

    it('should reject CloudEvent without id', () => {
      const cloudEvent: any = {
        specversion: '1.0',
        type: 'test.event',
        source: '/test',
      };

      const result = validateCloudEvent(cloudEvent);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: id');
    });

    it('should reject unsupported CloudEvents version', () => {
      const cloudEvent: any = {
        specversion: '0.3',
        type: 'test.event',
        source: '/test',
        id: 'test-123',
      };

      const result = validateCloudEvent(cloudEvent);
      expect(result.valid).toBe(false);
      expect(result.errors![0]).toContain('Unsupported CloudEvents version');
    });
  });

  describe('transformToCustomJSON', () => {
    const validCloudEvent: CloudEvent = {
      specversion: '1.0',
      type: 'health.patient.registered',
      source: '/health-service',
      id: 'patient-123',
      time: '2024-01-15T10:00:00Z',
      data: {
        patient: {
          id: 'P12345',
          firstName: 'John',
          lastName: 'Doe',
          gender: 'm',
          email: 'john@example.com',
        },
      },
    };

    const validRule: TransformationRule = {
      name: 'patient-to-custom',
      description: 'Transform patient to custom format',
      eventType: 'health.patient.registered',
      targetFormat: 'custom-json',
      enabled: true,
      mappings: [
        { source: '$.data.patient.id', target: '$.patientId' },
        { source: '$.data.patient.firstName', target: '$.given' },
        { source: '$.data.patient.lastName', target: '$.family' },
        { source: '$.data.patient.gender', target: '$.gender', transform: 'mapGender' },
        { source: '$.data.patient.email', target: '$.contact.email' },
      ],
    };

    it('should transform CloudEvent successfully', async () => {
      const result = await transformToCustomJSON(validCloudEvent, validRule);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.patientId).toBe('P12345');
      expect(result.data.given).toBe('John');
      expect(result.data.family).toBe('Doe');
      expect(result.data.gender).toBe('male');
      expect(result.data.contact.email).toBe('john@example.com');
      expect(result.metadata).toBeDefined();
      expect(result.metadata!.rule).toBe('patient-to-custom');
      expect(result.metadata!.eventType).toBe('health.patient.registered');
    });

    it('should handle missing CloudEvent', async () => {
      const result = await transformToCustomJSON(null as any, validRule);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('CloudEvent is required');
    });

    it('should handle missing rule', async () => {
      const result = await transformToCustomJSON(validCloudEvent, null as any);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Transformation rule is required');
    });

    it('should handle rule without mappings', async () => {
      const invalidRule: TransformationRule = {
        ...validRule,
        mappings: [],
      };

      const result = await transformToCustomJSON(validCloudEvent, invalidRule);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Transformation rule has no mappings');
    });

    it('should handle transformation with errors', async () => {
      // Create an event with an invalid value that will cause transformation error
      const eventWithInvalidData: CloudEvent = {
        ...validCloudEvent,
        data: {
          patient: {
            ...validCloudEvent.data.patient,
            age: 'not-a-number', // This will fail toNumber transformation
          },
        },
      };

      const ruleWithErrors: TransformationRule = {
        ...validRule,
        mappings: [
          { source: '$.data.patient.id', target: '$.patientId' },
          {
            source: '$.data.patient.age',
            target: '$.age',
            transform: 'toNumber',
          },
        ],
      };

      const result = await transformToCustomJSON(eventWithInvalidData, ruleWithErrors);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.data).toBeDefined();
      expect(result.data.patientId).toBe('P12345');
    });

    it('should handle required field missing', async () => {
      const ruleWithRequired: TransformationRule = {
        ...validRule,
        mappings: [
          {
            source: '$.data.patient.missingField',
            target: '$.required',
            required: true,
          },
        ],
      };

      const result = await transformToCustomJSON(validCloudEvent, ruleWithRequired);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Required field missing');
    });

    it('should apply transformations correctly', async () => {
      const transformationRule: TransformationRule = {
        ...validRule,
        mappings: [
          {
            source: '$.data.patient.firstName',
            target: '$.upperName',
            transform: 'toUpperCase',
          },
          {
            source: '$.data.patient.lastName',
            target: '$.lowerName',
            transform: 'toLowerCase',
          },
        ],
      };

      const result = await transformToCustomJSON(validCloudEvent, transformationRule);

      expect(result.success).toBe(true);
      expect(result.data.upperName).toBe('JOHN');
      expect(result.data.lowerName).toBe('doe');
    });

    it('should use default values when fields are missing', async () => {
      const ruleWithDefaults: TransformationRule = {
        ...validRule,
        mappings: [
          { source: '$.data.patient.id', target: '$.patientId' },
          {
            source: '$.data.patient.country',
            target: '$.country',
            defaultValue: 'USA',
          },
        ],
      };

      const result = await transformToCustomJSON(validCloudEvent, ruleWithDefaults);

      expect(result.success).toBe(true);
      expect(result.data.country).toBe('USA');
    });

    it('should handle exception during transformation', async () => {
      // Create a rule that will cause an exception
      const problematicRule: any = {
        ...validRule,
        mappings: [
          {
            source: '$.data',
            target: '$', // Invalid target that might cause issues
          },
        ],
      };

      const result = await transformToCustomJSON(validCloudEvent, problematicRule);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.metadata).toBeDefined();
    });
  });

  describe('transformBatch', () => {
    const cloudEvent1: CloudEvent = {
      specversion: '1.0',
      type: 'test.event',
      source: '/test',
      id: 'event-1',
      data: { value: 'test1' },
    };

    const cloudEvent2: CloudEvent = {
      specversion: '1.0',
      type: 'test.event',
      source: '/test',
      id: 'event-2',
      data: { value: 'test2' },
    };

    const rule: TransformationRule = {
      name: 'test-rule',
      description: 'Test rule',
      eventType: 'test.event',
      targetFormat: 'custom-json',
      enabled: true,
      mappings: [{ source: '$.data.value', target: '$.value' }],
    };

    it('should transform multiple CloudEvents successfully', async () => {
      const result = await transformBatch([cloudEvent1, cloudEvent2], rule);

      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
      expect(result.summary.total).toBe(2);
      expect(result.summary.successful).toBe(2);
      expect(result.summary.failed).toBe(0);
    });

    it('should handle mix of successful and failed transformations', async () => {
      const ruleWithRequired: TransformationRule = {
        ...rule,
        mappings: [
          {
            source: '$.data.requiredField',
            target: '$.required',
            required: true,
          },
        ],
      };

      const result = await transformBatch([cloudEvent1, cloudEvent2], ruleWithRequired);

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(2);
      expect(result.summary.total).toBe(2);
      expect(result.summary.successful).toBe(0);
      expect(result.summary.failed).toBe(2);
    });

    it('should handle empty batch', async () => {
      const result = await transformBatch([], rule);

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(0);
      expect(result.summary.total).toBe(0);
    });
  });

  describe('enrichTransformedData', () => {
    const transformedData = {
      patientId: 'P12345',
      name: 'John Doe',
    };

    const cloudEvent: CloudEvent = {
      specversion: '1.0',
      type: 'health.patient.registered',
      source: '/health-service',
      id: 'event-123',
      time: '2024-01-15T10:00:00Z',
      data: {},
    };

    it('should enrich with event metadata', () => {
      const enriched = enrichTransformedData(transformedData, cloudEvent, {
        includeEventMetadata: true,
      });

      expect(enriched.patientId).toBe('P12345');
      expect(enriched._cloudEvent).toBeDefined();
      expect(enriched._cloudEvent.id).toBe('event-123');
      expect(enriched._cloudEvent.type).toBe('health.patient.registered');
      expect(enriched._cloudEvent.source).toBe('/health-service');
    });

    it('should enrich with timestamps', () => {
      const enriched = enrichTransformedData(transformedData, cloudEvent, {
        includeTimestamps: true,
      });

      expect(enriched._timestamps).toBeDefined();
      expect(enriched._timestamps.transformedAt).toBeDefined();
      expect(enriched._timestamps.originalEventTime).toBe('2024-01-15T10:00:00Z');
    });

    it('should enrich with custom metadata', () => {
      const customMetadata = {
        version: '1.0',
        tenant: 'clinic-1',
      };

      const enriched = enrichTransformedData(transformedData, cloudEvent, {
        customMetadata,
      });

      expect(enriched._metadata).toEqual(customMetadata);
    });

    it('should enrich with all options', () => {
      const enriched = enrichTransformedData(transformedData, cloudEvent, {
        includeEventMetadata: true,
        includeTimestamps: true,
        customMetadata: { version: '1.0' },
      });

      expect(enriched._cloudEvent).toBeDefined();
      expect(enriched._timestamps).toBeDefined();
      expect(enriched._metadata).toBeDefined();
    });

    it('should not modify original data when no options provided', () => {
      const enriched = enrichTransformedData(transformedData, cloudEvent);

      expect(enriched.patientId).toBe('P12345');
      expect(enriched.name).toBe('John Doe');
      expect(enriched._cloudEvent).toBeUndefined();
      expect(enriched._timestamps).toBeUndefined();
      expect(enriched._metadata).toBeUndefined();
    });
  });

  describe('extractEventSummary', () => {
    it('should extract event summary', () => {
      const cloudEvent: CloudEvent = {
        specversion: '1.0',
        type: 'health.patient.registered',
        source: '/health-service',
        id: 'event-123',
        time: '2024-01-15T10:00:00Z',
        datacontenttype: 'application/json',
        data: {},
      };

      const summary = extractEventSummary(cloudEvent);

      expect(summary.id).toBe('event-123');
      expect(summary.type).toBe('health.patient.registered');
      expect(summary.source).toBe('/health-service');
      expect(summary.time).toBe('2024-01-15T10:00:00Z');
      expect(summary.dataContentType).toBe('application/json');
    });

    it('should handle optional fields', () => {
      const cloudEvent: CloudEvent = {
        specversion: '1.0',
        type: 'test.event',
        source: '/test',
        id: 'event-123',
        data: {},
      };

      const summary = extractEventSummary(cloudEvent);

      expect(summary.id).toBe('event-123');
      expect(summary.time).toBeUndefined();
      expect(summary.dataContentType).toBeUndefined();
    });
  });
});
