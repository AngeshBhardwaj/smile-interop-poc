/**
 * Tests for rule-engine module
 */

import {
  getRules,
  findRuleByEventType,
  findRuleByName,
  matchRule,
  clearRuleCache,
  getCacheStats,
} from '../../rules/rule-engine';
import * as ruleLoader from '../../rules/rule-loader';
import { TransformationRule } from '../../rules/types';
import { CloudEvent } from '../../config/types';

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

// Mock rule-loader
jest.mock('../../rules/rule-loader');

describe('Rule Engine', () => {
  const mockRules: TransformationRule[] = [
    {
      name: 'patient-registration-rule',
      description: 'Transform patient registration events',
      eventType: 'health.patient.registered',
      targetFormat: 'custom-json',
      enabled: true,
      mappings: [
        {
          source: '$.data.patient.id',
          target: '$.patientId',
        },
      ],
    },
    {
      name: 'order-created-rule',
      description: 'Transform order creation events',
      eventType: 'health.order.created',
      targetFormat: 'custom-json',
      enabled: true,
      mappings: [
        {
          source: '$.data.order.id',
          target: '$.orderId',
        },
      ],
    },
    {
      name: 'disabled-rule',
      description: 'Disabled rule for testing',
      eventType: 'health.test.event',
      targetFormat: 'custom-json',
      enabled: false, // Disabled
      mappings: [
        {
          source: '$.data',
          target: '$.output',
        },
      ],
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    clearRuleCache(); // Clear cache before each test
  });

  describe('getRules', () => {
    it('should load rules from rule-loader on first call', () => {
      (ruleLoader.loadRules as jest.Mock).mockReturnValue({
        success: true,
        rules: mockRules,
      });

      const rules = getRules();

      expect(ruleLoader.loadRules).toHaveBeenCalledTimes(1);
      expect(rules).toHaveLength(3);
      expect(rules[0].name).toBe('patient-registration-rule');
    });

    it('should return cached rules on subsequent calls within TTL', () => {
      (ruleLoader.loadRules as jest.Mock).mockReturnValue({
        success: true,
        rules: mockRules,
      });

      // First call - loads from file
      const rules1 = getRules();
      expect(ruleLoader.loadRules).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const rules2 = getRules();
      expect(ruleLoader.loadRules).toHaveBeenCalledTimes(1); // Still 1, not called again
      expect(rules2).toEqual(rules1);
    });

    it('should force reload when forceReload is true', () => {
      (ruleLoader.loadRules as jest.Mock).mockReturnValue({
        success: true,
        rules: mockRules,
      });

      // First call
      getRules();
      expect(ruleLoader.loadRules).toHaveBeenCalledTimes(1);

      // Force reload
      getRules(true);
      expect(ruleLoader.loadRules).toHaveBeenCalledTimes(2);
    });

    it('should return cached rules if loadRules fails and cache exists', () => {
      (ruleLoader.loadRules as jest.Mock)
        .mockReturnValueOnce({
          success: true,
          rules: mockRules,
        })
        .mockReturnValueOnce({
          success: false,
          errors: ['Failed to read directory'],
        });

      // First call - loads successfully
      const rules1 = getRules();
      expect(rules1).toHaveLength(3);

      // Force reload - fails, but should return cached rules
      const rules2 = getRules(true);
      expect(rules2).toHaveLength(3);
      expect(rules2).toEqual(rules1);
    });

    it('should return empty array if loadRules fails and no cache exists', () => {
      (ruleLoader.loadRules as jest.Mock).mockReturnValue({
        success: false,
        errors: ['Rules directory not found'],
      });

      const rules = getRules();

      expect(rules).toEqual([]);
    });

    it('should update cache with new rules on reload', () => {
      const initialRules = [mockRules[0]];
      const updatedRules = [...mockRules];

      (ruleLoader.loadRules as jest.Mock)
        .mockReturnValueOnce({
          success: true,
          rules: initialRules,
        })
        .mockReturnValueOnce({
          success: true,
          rules: updatedRules,
        });

      // First load
      const rules1 = getRules();
      expect(rules1).toHaveLength(1);

      // Force reload with updated rules
      const rules2 = getRules(true);
      expect(rules2).toHaveLength(3);
    });
  });

  describe('findRuleByEventType', () => {
    beforeEach(() => {
      (ruleLoader.loadRules as jest.Mock).mockReturnValue({
        success: true,
        rules: mockRules,
      });
    });

    it('should find enabled rule by event type', () => {
      const result = findRuleByEventType('health.patient.registered');

      expect(result.matched).toBe(true);
      expect(result.rule).toBeDefined();
      expect(result.rule!.name).toBe('patient-registration-rule');
      expect(result.error).toBeUndefined();
    });

    it('should return error if no enabled rule found for event type', () => {
      const result = findRuleByEventType('health.nonexistent.event');

      expect(result.matched).toBe(false);
      expect(result.rule).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error).toContain('No enabled rule found');
      expect(result.error).toContain('health.nonexistent.event');
    });

    it('should not match disabled rules', () => {
      const result = findRuleByEventType('health.test.event');

      expect(result.matched).toBe(false);
      expect(result.error).toContain('No enabled rule found');
    });

    it('should return first matching rule if multiple rules match', () => {
      const duplicateRules: TransformationRule[] = [
        {
          name: 'rule-1',
          description: 'First rule',
          eventType: 'duplicate.event',
          targetFormat: 'custom-json',
          enabled: true,
          mappings: [{ source: '$.data', target: '$.output1' }],
        },
        {
          name: 'rule-2',
          description: 'Second rule',
          eventType: 'duplicate.event',
          targetFormat: 'custom-json',
          enabled: true,
          mappings: [{ source: '$.data', target: '$.output2' }],
        },
      ];

      (ruleLoader.loadRules as jest.Mock).mockReturnValue({
        success: true,
        rules: duplicateRules,
      });

      clearRuleCache(); // Clear cache to force reload

      const result = findRuleByEventType('duplicate.event');

      expect(result.matched).toBe(true);
      expect(result.rule!.name).toBe('rule-1'); // First one wins
    });
  });

  describe('findRuleByName', () => {
    beforeEach(() => {
      (ruleLoader.loadRules as jest.Mock).mockReturnValue({
        success: true,
        rules: mockRules,
      });
    });

    it('should find rule by name', () => {
      const result = findRuleByName('order-created-rule');

      expect(result.matched).toBe(true);
      expect(result.rule).toBeDefined();
      expect(result.rule!.name).toBe('order-created-rule');
      expect(result.rule!.eventType).toBe('health.order.created');
      expect(result.error).toBeUndefined();
    });

    it('should return error if rule not found', () => {
      const result = findRuleByName('nonexistent-rule');

      expect(result.matched).toBe(false);
      expect(result.rule).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Rule not found');
      expect(result.error).toContain('nonexistent-rule');
    });

    it('should return error if rule is disabled', () => {
      const result = findRuleByName('disabled-rule');

      expect(result.matched).toBe(false);
      expect(result.rule).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Rule is disabled');
      expect(result.error).toContain('disabled-rule');
    });

    it('should be case-sensitive for rule names', () => {
      const result = findRuleByName('PATIENT-REGISTRATION-RULE');

      expect(result.matched).toBe(false);
      expect(result.error).toContain('Rule not found');
    });
  });

  describe('matchRule', () => {
    const mockCloudEvent: CloudEvent = {
      specversion: '1.0',
      type: 'health.patient.registered',
      source: 'health-service',
      id: 'test-event-123',
      time: new Date().toISOString(),
      data: {
        patient: {
          id: 'P001',
          name: 'John Doe',
        },
      },
    };

    beforeEach(() => {
      (ruleLoader.loadRules as jest.Mock).mockReturnValue({
        success: true,
        rules: mockRules,
      });
    });

    it('should match rule by name when ruleName is provided', () => {
      const result = matchRule(mockCloudEvent, 'order-created-rule');

      expect(result.matched).toBe(true);
      expect(result.rule!.name).toBe('order-created-rule');
    });

    it('should match rule by event type when ruleName is not provided', () => {
      const result = matchRule(mockCloudEvent);

      expect(result.matched).toBe(true);
      expect(result.rule!.name).toBe('patient-registration-rule');
      expect(result.rule!.eventType).toBe('health.patient.registered');
    });

    it('should prefer explicit ruleName over event type matching', () => {
      const result = matchRule(mockCloudEvent, 'order-created-rule');

      // Even though event type is 'health.patient.registered',
      // it should return the explicitly named rule
      expect(result.matched).toBe(true);
      expect(result.rule!.name).toBe('order-created-rule');
      expect(result.rule!.eventType).toBe('health.order.created');
    });

    it('should return error when no matching rule found by event type', () => {
      const unmatchedEvent: CloudEvent = {
        ...mockCloudEvent,
        type: 'unknown.event.type',
      };

      const result = matchRule(unmatchedEvent);

      expect(result.matched).toBe(false);
      expect(result.error).toContain('No enabled rule found');
    });

    it('should return error when named rule not found', () => {
      const result = matchRule(mockCloudEvent, 'nonexistent-rule');

      expect(result.matched).toBe(false);
      expect(result.error).toContain('Rule not found');
    });

    it('should return error when named rule is disabled', () => {
      const result = matchRule(mockCloudEvent, 'disabled-rule');

      expect(result.matched).toBe(false);
      expect(result.error).toContain('Rule is disabled');
    });
  });

  describe('clearRuleCache', () => {
    beforeEach(() => {
      (ruleLoader.loadRules as jest.Mock).mockReturnValue({
        success: true,
        rules: mockRules,
      });
    });

    it('should clear the rule cache', () => {
      // Load rules to populate cache
      getRules();
      expect(ruleLoader.loadRules).toHaveBeenCalledTimes(1);

      // Verify cache has content
      let stats = getCacheStats();
      expect(stats.cachedRules).toBe(3);

      // Clear cache
      clearRuleCache();

      // Verify cache is empty
      stats = getCacheStats();
      expect(stats.cachedRules).toBe(0);
      expect(stats.lastRefresh).toBe(0);

      // Next getRules should reload from file
      getRules();
      expect(ruleLoader.loadRules).toHaveBeenCalledTimes(2);
    });

    it('should reset lastRefresh timestamp', () => {
      // Load rules
      getRules();

      const statsBefore = getCacheStats();
      expect(statsBefore.lastRefresh).toBeGreaterThan(0);

      // Clear cache
      clearRuleCache();

      const statsAfter = getCacheStats();
      expect(statsAfter.lastRefresh).toBe(0);
    });
  });

  describe('getCacheStats', () => {
    beforeEach(() => {
      (ruleLoader.loadRules as jest.Mock).mockReturnValue({
        success: true,
        rules: mockRules,
      });
    });

    it('should return correct cache statistics', () => {
      // Before loading
      const emptyStats = getCacheStats();
      expect(emptyStats.cachedRules).toBe(0);
      expect(emptyStats.lastRefresh).toBe(0);
      expect(emptyStats.cacheAge).toBeGreaterThanOrEqual(0);

      // After loading
      getRules();
      const loadedStats = getCacheStats();
      expect(loadedStats.cachedRules).toBe(3);
      expect(loadedStats.lastRefresh).toBeGreaterThan(0);
      expect(loadedStats.cacheAge).toBeGreaterThanOrEqual(0);
    });

    it('should calculate cacheAge correctly', (done) => {
      getRules();

      const stats1 = getCacheStats();
      const age1 = stats1.cacheAge;

      // Wait a bit and check age increased
      setTimeout(() => {
        const stats2 = getCacheStats();
        const age2 = stats2.cacheAge;

        expect(age2).toBeGreaterThanOrEqual(age1);
        done();
      }, 50);
    });

    it('should show zero cache age immediately after loading', () => {
      getRules();

      const stats = getCacheStats();

      // Cache age should be very small (< 100ms) immediately after load
      expect(stats.cacheAge).toBeLessThan(100);
    });

    it('should update cachedRules count correctly', () => {
      const singleRuleArray = [mockRules[0]];

      (ruleLoader.loadRules as jest.Mock).mockReturnValueOnce({
        success: true,
        rules: singleRuleArray,
      });

      getRules();
      let stats = getCacheStats();
      expect(stats.cachedRules).toBe(1);

      // Force reload with more rules
      (ruleLoader.loadRules as jest.Mock).mockReturnValueOnce({
        success: true,
        rules: mockRules,
      });

      getRules(true);
      stats = getCacheStats();
      expect(stats.cachedRules).toBe(3);
    });
  });

  describe('Cache TTL behavior', () => {
    beforeEach(() => {
      (ruleLoader.loadRules as jest.Mock).mockReturnValue({
        success: true,
        rules: mockRules,
      });
    });

    it('should not reload rules within TTL window', () => {
      // First load
      getRules();
      expect(ruleLoader.loadRules).toHaveBeenCalledTimes(1);

      // Multiple calls within TTL (300 seconds = 300000ms)
      getRules();
      getRules();
      getRules();

      // Should still only have loaded once
      expect(ruleLoader.loadRules).toHaveBeenCalledTimes(1);
    });

    it('should respect forceReload flag even within TTL', () => {
      getRules();
      expect(ruleLoader.loadRules).toHaveBeenCalledTimes(1);

      getRules(true);
      expect(ruleLoader.loadRules).toHaveBeenCalledTimes(2);

      getRules(true);
      expect(ruleLoader.loadRules).toHaveBeenCalledTimes(3);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty rules array gracefully', () => {
      (ruleLoader.loadRules as jest.Mock).mockReturnValue({
        success: true,
        rules: [],
      });

      const rules = getRules();
      expect(rules).toEqual([]);

      const result = findRuleByEventType('any.event');
      expect(result.matched).toBe(false);

      const stats = getCacheStats();
      expect(stats.cachedRules).toBe(0);
    });

    it('should handle rules with optional fields', () => {
      const minimalRule: TransformationRule = {
        name: 'minimal-rule',
        description: 'Minimal rule',
        eventType: 'minimal.event',
        targetFormat: 'custom-json',
        enabled: true,
        mappings: [{ source: '$.data', target: '$.output' }],
        // No optional fields like outputSchema, destination, metadata
      };

      (ruleLoader.loadRules as jest.Mock).mockReturnValue({
        success: true,
        rules: [minimalRule],
      });

      clearRuleCache();

      const result = findRuleByEventType('minimal.event');
      expect(result.matched).toBe(true);
      expect(result.rule!.name).toBe('minimal-rule');
    });

    it('should handle rules with all optional fields populated', () => {
      const fullRule: TransformationRule = {
        name: 'full-rule',
        description: 'Rule with all fields',
        eventType: 'full.event',
        targetFormat: 'custom-json',
        enabled: true,
        mappings: [{ source: '$.data', target: '$.output' }],
        outputSchema: './schemas/output.json',
        destination: 'https://example.com/endpoint',
        metadata: {
          version: '1.0.0',
          author: 'Test Author',
          created: '2024-01-01',
          modified: '2024-01-15',
          tags: ['test', 'full'],
        },
      };

      (ruleLoader.loadRules as jest.Mock).mockReturnValue({
        success: true,
        rules: [fullRule],
      });

      clearRuleCache();

      const result = findRuleByEventType('full.event');
      expect(result.matched).toBe(true);
      expect(result.rule!.outputSchema).toBe('./schemas/output.json');
      expect(result.rule!.destination).toBe('https://example.com/endpoint');
      expect(result.rule!.metadata?.version).toBe('1.0.0');
    });
  });
});
