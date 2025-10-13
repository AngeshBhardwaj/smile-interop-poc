/**
 * RouteMatchEngine Unit Tests
 *
 * TDD approach: Write tests first, then implement engine
 */

import { RouteMatchEngine } from '../route-match-engine';
import { RouteDefinition } from '../../messaging/types';

describe('RouteMatchEngine', () => {
  let engine: RouteMatchEngine;

  beforeEach(() => {
    engine = new RouteMatchEngine();
  });

  describe('matchPattern()', () => {
    it('should match exact string', () => {
      expect(engine.matchPattern('health.patient.registered', 'health.patient.registered')).toBe(
        true,
      );
    });

    it('should not match different strings', () => {
      expect(engine.matchPattern('health.patient.registered', 'health.patient.updated')).toBe(
        false,
      );
    });

    it('should match wildcard *', () => {
      expect(engine.matchPattern('health.patient.registered', '*')).toBe(true);
      expect(engine.matchPattern('order.created', '*')).toBe(true);
      expect(engine.matchPattern('anything', '*')).toBe(true);
    });

    it('should match pattern with trailing wildcard', () => {
      expect(engine.matchPattern('health.patient.registered', 'health.patient.*')).toBe(true);
      expect(engine.matchPattern('health.patient.updated', 'health.patient.*')).toBe(true);
      expect(engine.matchPattern('health.patient.deleted', 'health.patient.*')).toBe(true);
    });

    it('should not match incorrect pattern with trailing wildcard', () => {
      expect(engine.matchPattern('health.vitals.recorded', 'health.patient.*')).toBe(false);
      expect(engine.matchPattern('order.created', 'health.patient.*')).toBe(false);
    });

    it('should match pattern with leading wildcard', () => {
      expect(engine.matchPattern('health.patient.registered', '*.registered')).toBe(true);
      expect(engine.matchPattern('order.item.registered', '*.registered')).toBe(true);
    });

    it('should match pattern with middle wildcard', () => {
      expect(engine.matchPattern('health.patient.registered', 'health.*.registered')).toBe(true);
      expect(engine.matchPattern('health.vitals.registered', 'health.*.registered')).toBe(true);
    });

    it('should match multiple wildcards', () => {
      expect(engine.matchPattern('health.patient.registered.v1', 'health.*.*.v1')).toBe(true);
      expect(engine.matchPattern('order.item.created.v2', '*.item.*.v2')).toBe(true);
    });

    it('should be case-sensitive', () => {
      expect(engine.matchPattern('Health.Patient.Registered', 'health.patient.registered')).toBe(
        false,
      );
    });

    it('should handle empty strings', () => {
      expect(engine.matchPattern('', '')).toBe(true);
      expect(engine.matchPattern('', '*')).toBe(true);
      expect(engine.matchPattern('test', '')).toBe(false);
    });
  });

  describe('matchRoute()', () => {
    const route: RouteDefinition = {
      name: 'test-route',
      enabled: true,
      source: 'smile.health-service',
      type: 'health.patient.*',
      strategy: 'type',
      priority: 5,
      destination: {
        type: 'http',
        endpoint: 'http://localhost:3000',
      },
    };

    const event = {
      specversion: '1.0',
      type: 'health.patient.registered',
      source: 'smile.health-service',
      id: 'test-123',
      data: { patientId: '123' },
    };

    it('should match event with matching route', () => {
      const result = engine.matchRoute(event, route);

      expect(result).toBe(true);
    });

    it('should not match event with different source', () => {
      const differentEvent = { ...event, source: 'smile.orders-service' };

      expect(engine.matchRoute(differentEvent, route)).toBe(false);
    });

    it('should not match event with different type', () => {
      const differentEvent = { ...event, type: 'health.vitals.recorded' };

      expect(engine.matchRoute(differentEvent, route)).toBe(false);
    });

    it('should not match disabled route', () => {
      const disabledRoute: RouteDefinition = { ...route, enabled: false };

      expect(engine.matchRoute(event, disabledRoute)).toBe(false);
    });

    it('should match with wildcard source', () => {
      const wildcardRoute: RouteDefinition = { ...route, source: '*' };

      expect(engine.matchRoute(event, wildcardRoute)).toBe(true);
    });

    it('should match with wildcard type', () => {
      const wildcardRoute: RouteDefinition = { ...route, type: '*' };

      expect(engine.matchRoute(event, wildcardRoute)).toBe(true);
    });
  });

  describe('evaluateCondition()', () => {
    const event = {
      specversion: '1.0',
      type: 'order.created',
      source: 'smile.orders-service',
      id: 'test-123',
      data: {
        eventData: {
          orderId: '123',
          priority: 'urgent',
          quantity: 10,
          tags: ['medical', 'urgent'],
        },
      },
    };

    it('should evaluate equals condition (true)', () => {
      const result = engine.evaluateCondition(event, {
        field: 'data.eventData.priority',
        operator: 'equals',
        value: 'urgent',
      });

      expect(result).toBe(true);
    });

    it('should evaluate equals condition (false)', () => {
      const result = engine.evaluateCondition(event, {
        field: 'data.eventData.priority',
        operator: 'equals',
        value: 'normal',
      });

      expect(result).toBe(false);
    });

    it('should evaluate notEquals condition', () => {
      const result = engine.evaluateCondition(event, {
        field: 'data.eventData.priority',
        operator: 'notEquals',
        value: 'normal',
      });

      expect(result).toBe(true);
    });

    it('should evaluate greaterThan condition', () => {
      const result = engine.evaluateCondition(event, {
        field: 'data.eventData.quantity',
        operator: 'greaterThan',
        value: 5,
      });

      expect(result).toBe(true);
    });

    it('should evaluate lessThan condition', () => {
      const result = engine.evaluateCondition(event, {
        field: 'data.eventData.quantity',
        operator: 'lessThan',
        value: 20,
      });

      expect(result).toBe(true);
    });

    it('should evaluate contains condition for arrays', () => {
      const result = engine.evaluateCondition(event, {
        field: 'data.eventData.tags',
        operator: 'contains',
        value: 'urgent',
      });

      expect(result).toBe(true);
    });

    it('should evaluate contains condition for strings', () => {
      const result = engine.evaluateCondition(event, {
        field: 'data.eventData.priority',
        operator: 'contains',
        value: 'urg',
      });

      expect(result).toBe(true);
    });

    it('should evaluate regex condition', () => {
      const result = engine.evaluateCondition(event, {
        field: 'data.eventData.priority',
        operator: 'regex',
        value: '^urgent$',
      });

      expect(result).toBe(true);
    });

    it('should return false for missing field', () => {
      const result = engine.evaluateCondition(event, {
        field: 'data.eventData.nonexistent',
        operator: 'equals',
        value: 'test',
      });

      expect(result).toBe(false);
    });

    it('should handle nested field access', () => {
      const result = engine.evaluateCondition(event, {
        field: 'data.eventData.orderId',
        operator: 'equals',
        value: '123',
      });

      expect(result).toBe(true);
    });
  });

  describe('findMatchingRoute()', () => {
    const routes: RouteDefinition[] = [
      {
        name: 'urgent-orders',
        enabled: true,
        source: 'smile.orders-service',
        type: 'order.*',
        strategy: 'content',
        priority: 9,
        condition: {
          field: 'data.eventData.priority',
          operator: 'equals',
          value: 'urgent',
        },
        destination: {
          type: 'queue',
          queue: 'orders.urgent',
        },
      },
      {
        name: 'patient-events',
        enabled: true,
        source: 'smile.health-service',
        type: 'health.patient.*',
        strategy: 'type',
        priority: 6,
        destination: {
          type: 'http',
          endpoint: 'http://localhost:3010/fhir/patient',
        },
      },
      {
        name: 'all-orders',
        enabled: true,
        source: 'smile.orders-service',
        type: 'order.*',
        strategy: 'type',
        priority: 5,
        destination: {
          type: 'http',
          endpoint: 'http://localhost:3011/procurement',
        },
      },
      {
        name: 'fallback',
        enabled: true,
        source: '*',
        type: '*',
        strategy: 'fallback',
        priority: 0,
        destination: {
          type: 'queue',
          queue: 'interop.unrouted',
        },
      },
    ];

    it('should find highest priority matching route', () => {
      const urgentOrder = {
        specversion: '1.0',
        type: 'order.created',
        source: 'smile.orders-service',
        id: 'test-123',
        data: {
          eventData: {
            orderId: '123',
            priority: 'urgent',
          },
        },
      };

      const result = engine.findMatchingRoute(urgentOrder, routes);

      expect(result.matched).toBe(true);
      expect(result.route?.name).toBe('urgent-orders');
      expect(result.route?.priority).toBe(9);
    });

    it('should find type-based route when condition does not match', () => {
      const normalOrder = {
        specversion: '1.0',
        type: 'order.created',
        source: 'smile.orders-service',
        id: 'test-456',
        data: {
          eventData: {
            orderId: '456',
            priority: 'normal',
          },
        },
      };

      const result = engine.findMatchingRoute(normalOrder, routes);

      expect(result.matched).toBe(true);
      expect(result.route?.name).toBe('all-orders');
      expect(result.route?.priority).toBe(5);
    });

    it('should find patient route', () => {
      const patientEvent = {
        specversion: '1.0',
        type: 'health.patient.registered',
        source: 'smile.health-service',
        id: 'test-789',
      };

      const result = engine.findMatchingRoute(patientEvent, routes);

      expect(result.matched).toBe(true);
      expect(result.route?.name).toBe('patient-events');
    });

    it('should use fallback route when no specific match', () => {
      const unknownEvent = {
        specversion: '1.0',
        type: 'unknown.event',
        source: 'unknown.service',
        id: 'test-999',
      };

      const result = engine.findMatchingRoute(unknownEvent, routes);

      expect(result.matched).toBe(true);
      expect(result.route?.name).toBe('fallback');
      expect(result.route?.priority).toBe(0);
    });

    it('should return no match when no routes enabled', () => {
      const disabledRoutes = routes.map((r) => ({ ...r, enabled: false }));
      const event = {
        specversion: '1.0',
        type: 'test.event',
        source: 'test.source',
        id: 'test-111',
      };

      const result = engine.findMatchingRoute(event, disabledRoutes);

      expect(result.matched).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('should skip disabled routes', () => {
      const mixedRoutes = [...routes];
      if (mixedRoutes[0]) {
        mixedRoutes[0].enabled = false; // Disable urgent-orders
      }

      const urgentOrder = {
        specversion: '1.0',
        type: 'order.created',
        source: 'smile.orders-service',
        id: 'test-123',
        data: {
          eventData: {
            orderId: '123',
            priority: 'urgent',
          },
        },
      };

      const result = engine.findMatchingRoute(urgentOrder, mixedRoutes);

      expect(result.matched).toBe(true);
      expect(result.route?.name).toBe('all-orders'); // Falls back to next matching route
    });
  });

  describe('sortRoutesByPriority()', () => {
    it('should sort routes by priority descending', () => {
      const routes: RouteDefinition[] = [
        { name: 'low', priority: 1 } as RouteDefinition,
        { name: 'high', priority: 9 } as RouteDefinition,
        { name: 'medium', priority: 5 } as RouteDefinition,
        { name: 'highest', priority: 10 } as RouteDefinition,
      ];

      const sorted = engine.sortRoutesByPriority(routes);

      expect(sorted).toHaveLength(4);
      expect(sorted[0]!.name).toBe('highest');
      expect(sorted[1]!.name).toBe('high');
      expect(sorted[2]!.name).toBe('medium');
      expect(sorted[3]!.name).toBe('low');
    });

    it('should maintain stable sort for equal priorities', () => {
      const routes: RouteDefinition[] = [
        { name: 'first', priority: 5 } as RouteDefinition,
        { name: 'second', priority: 5 } as RouteDefinition,
        { name: 'third', priority: 5 } as RouteDefinition,
      ];

      const sorted = engine.sortRoutesByPriority(routes);

      expect(sorted).toHaveLength(3);
      expect(sorted[0]!.name).toBe('first');
      expect(sorted[1]!.name).toBe('second');
      expect(sorted[2]!.name).toBe('third');
    });

    it('should handle empty array', () => {
      const sorted = engine.sortRoutesByPriority([]);

      expect(sorted).toEqual([]);
    });
  });
});
