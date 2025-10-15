/**
 * Tests for rule-loader module
 */

import { TransformationRule } from '../../rules/types';

// Mock fs module
let mockExistsSync: jest.Mock;
let mockReaddirSync: jest.Mock;
let mockReadFileSync: jest.Mock;

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  readFileSync: jest.fn(),
}));

// Mock config
jest.mock('../../config', () => ({
  config: {
    transformation: {
      rulesDirectory: '/mock/rules',
      enableCaching: true,
      cacheTTL: 300,
    },
  },
}));

// Import after mocking
import * as fs from 'fs';
import { loadRules, loadRuleByName } from '../../rules/rule-loader';

describe('Rule Loader', () => {
  const mockRulesDir = '/mock/rules';
  const mockCustomDir = '/mock/rules/custom';

  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync = fs.existsSync as jest.Mock;
    mockReaddirSync = fs.readdirSync as jest.Mock;
    mockReadFileSync = fs.readFileSync as jest.Mock;
  });

  describe('loadRules', () => {
    it('should successfully load valid rules from custom directory', () => {
      const validRule: TransformationRule = {
        name: 'patient-to-custom',
        description: 'Transform patient registration to custom format',
        eventType: 'health.patient.registered',
        targetFormat: 'custom-json',
        enabled: true,
        mappings: [
          {
            source: '$.data.patient.id',
            target: '$.patientId',
          },
        ],
      };

      mockExistsSync.mockImplementation((p) => {
        if (p === mockRulesDir) return true;
        if (p === mockCustomDir) return true;
        return false;
      });

      mockReaddirSync.mockReturnValue(['rule1.json']);
      mockReadFileSync.mockReturnValue(JSON.stringify(validRule));

      const result = loadRules();

      expect(result.success).toBe(true);
      expect(result.rules).toHaveLength(1);
      expect(result.rules![0].name).toBe('patient-to-custom');
      expect(result.errors).toBeUndefined();
    });

    it('should return error when rules directory does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      const result = loadRules();

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Rules directory not found');
    });

    it('should handle missing custom directory gracefully', () => {
      mockExistsSync.mockImplementation((p) => {
        if (p === mockRulesDir) return true;
        return false; // custom directory doesn't exist
      });

      const result = loadRules();

      expect(result.success).toBe(true);
      expect(result.rules).toEqual([]);
    });

    it('should skip non-JSON files in directory', () => {
      const validRule: TransformationRule = {
        name: 'test-rule',
        description: 'Test rule',
        eventType: 'test.event',
        targetFormat: 'custom-json',
        enabled: true,
        mappings: [{ source: '$.data', target: '$.output' }],
      };

      mockExistsSync.mockImplementation((p) => {
        if (p === mockRulesDir) return true;
        if (p === mockCustomDir) return true;
        return false;
      });

      mockReaddirSync.mockReturnValue(['rule.json', 'readme.txt', 'config.yaml']);
      mockReadFileSync.mockReturnValue(JSON.stringify(validRule));

      const result = loadRules();

      expect(result.success).toBe(true);
      expect(result.rules).toHaveLength(1); // Only JSON file loaded
      expect(mockReadFileSync).toHaveBeenCalledTimes(1);
    });

    it('should handle invalid JSON in rule file', () => {
      mockExistsSync.mockImplementation((p) => {
        if (p === mockRulesDir) return true;
        if (p === mockCustomDir) return true;
        return false;
      });

      mockReaddirSync.mockReturnValue(['invalid.json']);
      mockReadFileSync.mockReturnValue('{ invalid json }');

      const result = loadRules();

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Failed to load invalid.json');
    });

    it('should validate rule and reject missing name field', () => {
      const invalidRule = {
        // name is missing
        description: 'Test rule',
        eventType: 'test.event',
        targetFormat: 'custom-json',
        enabled: true,
        mappings: [{ source: '$.data', target: '$.output' }],
      };

      mockExistsSync.mockImplementation((p) => {
        if (p === mockRulesDir) return true;
        if (p === mockCustomDir) return true;
        return false;
      });

      mockReaddirSync.mockReturnValue(['rule.json']);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidRule));

      const result = loadRules();

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Missing required field: name');
    });

    it('should validate rule and reject missing eventType field', () => {
      const invalidRule = {
        name: 'test-rule',
        description: 'Test rule',
        // eventType is missing
        targetFormat: 'custom-json',
        enabled: true,
        mappings: [{ source: '$.data', target: '$.output' }],
      };

      mockExistsSync.mockImplementation((p) => {
        if (p === mockRulesDir) return true;
        if (p === mockCustomDir) return true;
        return false;
      });

      mockReaddirSync.mockReturnValue(['rule.json']);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidRule));

      const result = loadRules();

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Missing required field: eventType');
    });

    it('should validate rule and reject missing targetFormat field', () => {
      const invalidRule = {
        name: 'test-rule',
        description: 'Test rule',
        eventType: 'test.event',
        // targetFormat is missing
        enabled: true,
        mappings: [{ source: '$.data', target: '$.output' }],
      };

      mockExistsSync.mockImplementation((p) => {
        if (p === mockRulesDir) return true;
        if (p === mockCustomDir) return true;
        return false;
      });

      mockReaddirSync.mockReturnValue(['rule.json']);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidRule));

      const result = loadRules();

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain(
        'Missing required field: targetFormat'
      );
    });

    it('should validate rule and reject missing mappings array', () => {
      const invalidRule = {
        name: 'test-rule',
        description: 'Test rule',
        eventType: 'test.event',
        targetFormat: 'custom-json',
        enabled: true,
        // mappings is missing
      };

      mockExistsSync.mockImplementation((p) => {
        if (p === mockRulesDir) return true;
        if (p === mockCustomDir) return true;
        return false;
      });

      mockReaddirSync.mockReturnValue(['rule.json']);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidRule));

      const result = loadRules();

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain(
        'Missing or invalid field: mappings'
      );
    });

    it('should validate rule and reject empty mappings array', () => {
      const invalidRule = {
        name: 'test-rule',
        description: 'Test rule',
        eventType: 'test.event',
        targetFormat: 'custom-json',
        enabled: true,
        mappings: [], // Empty array
      };

      mockExistsSync.mockImplementation((p) => {
        if (p === mockRulesDir) return true;
        if (p === mockCustomDir) return true;
        return false;
      });

      mockReaddirSync.mockReturnValue(['rule.json']);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidRule));

      const result = loadRules();

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('mappings array cannot be empty');
    });

    it('should validate mapping and reject missing source field', () => {
      const invalidRule = {
        name: 'test-rule',
        description: 'Test rule',
        eventType: 'test.event',
        targetFormat: 'custom-json',
        enabled: true,
        mappings: [
          {
            // source is missing
            target: '$.output',
          },
        ],
      };

      mockExistsSync.mockImplementation((p) => {
        if (p === mockRulesDir) return true;
        if (p === mockCustomDir) return true;
        return false;
      });

      mockReaddirSync.mockReturnValue(['rule.json']);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidRule));

      const result = loadRules();

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Mapping 0: Missing required field: source');
    });

    it('should validate mapping and reject missing target field', () => {
      const invalidRule = {
        name: 'test-rule',
        description: 'Test rule',
        eventType: 'test.event',
        targetFormat: 'custom-json',
        enabled: true,
        mappings: [
          {
            source: '$.data',
            // target is missing
          },
        ],
      };

      mockExistsSync.mockImplementation((p) => {
        if (p === mockRulesDir) return true;
        if (p === mockCustomDir) return true;
        return false;
      });

      mockReaddirSync.mockReturnValue(['rule.json']);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidRule));

      const result = loadRules();

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Mapping 0: Missing required field: target');
    });

    it('should load multiple valid rules successfully', () => {
      const rule1: TransformationRule = {
        name: 'rule-1',
        description: 'First rule',
        eventType: 'event.type.1',
        targetFormat: 'custom-json',
        enabled: true,
        mappings: [{ source: '$.data', target: '$.output' }],
      };

      const rule2: TransformationRule = {
        name: 'rule-2',
        description: 'Second rule',
        eventType: 'event.type.2',
        targetFormat: 'custom-json',
        enabled: true,
        mappings: [{ source: '$.data', target: '$.output' }],
      };

      mockExistsSync.mockImplementation((p) => {
        if (p === mockRulesDir) return true;
        if (p === mockCustomDir) return true;
        return false;
      });

      mockReaddirSync.mockReturnValue(['rule1.json', 'rule2.json']);

      mockReadFileSync.mockImplementation((filePath: any) => {
        if (filePath.includes('rule1.json')) {
          return JSON.stringify(rule1);
        }
        if (filePath.includes('rule2.json')) {
          return JSON.stringify(rule2);
        }
        return '{}';
      });

      const result = loadRules();

      expect(result.success).toBe(true);
      expect(result.rules).toHaveLength(2);
      expect(result.rules![0].name).toBe('rule-1');
      expect(result.rules![1].name).toBe('rule-2');
    });

    it('should handle mix of valid and invalid rules', () => {
      const validRule: TransformationRule = {
        name: 'valid-rule',
        description: 'Valid rule',
        eventType: 'valid.event',
        targetFormat: 'custom-json',
        enabled: true,
        mappings: [{ source: '$.data', target: '$.output' }],
      };

      const invalidRule = {
        name: 'invalid-rule',
        // Missing required fields
      };

      mockExistsSync.mockImplementation((p) => {
        if (p === mockRulesDir) return true;
        if (p === mockCustomDir) return true;
        return false;
      });

      mockReaddirSync.mockReturnValue(['valid.json', 'invalid.json']);

      mockReadFileSync.mockImplementation((filePath: any) => {
        if (filePath.includes('valid.json')) {
          return JSON.stringify(validRule);
        }
        if (filePath.includes('invalid.json')) {
          return JSON.stringify(invalidRule);
        }
        return '{}';
      });

      const result = loadRules();

      expect(result.success).toBe(false); // Overall failure due to invalid rule
      expect(result.rules).toHaveLength(1); // But valid rule still loaded
      expect(result.rules![0].name).toBe('valid-rule');
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should handle file read errors gracefully', () => {
      mockExistsSync.mockImplementation((p) => {
        if (p === mockRulesDir) return true;
        if (p === mockCustomDir) return true;
        return false;
      });

      mockReaddirSync.mockReturnValue(['rule.json']);

      mockReadFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = loadRules();

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Failed to load rule.json');
      expect(result.errors![0]).toContain('Permission denied');
    });
  });

  describe('loadRuleByName', () => {
    it('should load a specific rule by name', () => {
      const rule1: TransformationRule = {
        name: 'patient-rule',
        description: 'Patient rule',
        eventType: 'patient.event',
        targetFormat: 'custom-json',
        enabled: true,
        mappings: [{ source: '$.data', target: '$.output' }],
      };

      const rule2: TransformationRule = {
        name: 'order-rule',
        description: 'Order rule',
        eventType: 'order.event',
        targetFormat: 'custom-json',
        enabled: true,
        mappings: [{ source: '$.data', target: '$.output' }],
      };

      mockExistsSync.mockImplementation((p) => {
        if (p === mockRulesDir) return true;
        if (p === mockCustomDir) return true;
        return false;
      });

      mockReaddirSync.mockReturnValue(['rule1.json', 'rule2.json']);

      mockReadFileSync.mockImplementation((filePath: any) => {
        if (filePath.includes('rule1.json')) {
          return JSON.stringify(rule1);
        }
        if (filePath.includes('rule2.json')) {
          return JSON.stringify(rule2);
        }
        return '{}';
      });

      const result = loadRuleByName('order-rule');

      expect(result).not.toBeNull();
      expect(result!.name).toBe('order-rule');
      expect(result!.eventType).toBe('order.event');
    });

    it('should return null if rule not found', () => {
      mockExistsSync.mockImplementation((p) => {
        if (p === mockRulesDir) return true;
        if (p === mockCustomDir) return true;
        return false;
      });

      mockReaddirSync.mockReturnValue(['rule.json']);

      const validRule: TransformationRule = {
        name: 'existing-rule',
        description: 'Existing rule',
        eventType: 'existing.event',
        targetFormat: 'custom-json',
        enabled: true,
        mappings: [{ source: '$.data', target: '$.output' }],
      };

      mockReadFileSync.mockReturnValue(JSON.stringify(validRule));

      const result = loadRuleByName('non-existent-rule');

      expect(result).toBeNull();
    });

    it('should return null if loadRules fails', () => {
      mockExistsSync.mockReturnValue(false);

      const result = loadRuleByName('any-rule');

      expect(result).toBeNull();
    });
  });
});
