/**
 * RoutingConfigLoader Unit Tests
 *
 * TDD approach: Write tests first, then implement loader
 */

import { RoutingConfigLoader } from '../routing-config-loader';
import { RoutingConfig } from '../../messaging/types';
import * as fs from 'fs';

// Mock fs module
jest.mock('fs');

describe('RoutingConfigLoader', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;
  let loader: RoutingConfigLoader;

  beforeEach(() => {
    jest.clearAllMocks();
    loader = new RoutingConfigLoader();
  });

  describe('loadFromFile()', () => {
    const validYaml = `
metadata:
  version: "1.0.0"
  lastUpdated: "2025-10-10T00:00:00Z"
  description: "Test routing configuration"

settings:
  fallbackBehavior: "route-to-fallback-queue"
  validateOnLoad: true
  dynamicReload: false
  reloadInterval: 60000
  enableMetrics: true

routes:
  - name: "test-route"
    description: "Test route"
    enabled: true
    source: "smile.health-service"
    type: "health.patient.*"
    strategy: "type"
    priority: 5
    destination:
      type: "http"
      endpoint: "http://localhost:3000"
      method: "POST"
      timeout: 5000
`;

    it('should load valid YAML configuration', async () => {
      mockFs.readFileSync.mockReturnValue(validYaml);

      const config = await loader.loadFromFile('/path/to/config.yml');

      expect(config.metadata.version).toBe('1.0.0');
      expect(config.settings.fallbackBehavior).toBe('route-to-fallback-queue');
      expect(config.routes).toHaveLength(1);
      expect(config.routes[0]?.name).toBe('test-route');
    });

    it('should throw error for non-existent file', async () => {
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      await expect(loader.loadFromFile('/path/to/nonexistent.yml')).rejects.toThrow(
        'Failed to load routing configuration',
      );
    });

    it('should throw error for invalid YAML', async () => {
      mockFs.readFileSync.mockReturnValue('invalid: yaml: content:');

      await expect(loader.loadFromFile('/path/to/invalid.yml')).rejects.toThrow();
    });

    it('should use UTF-8 encoding', async () => {
      mockFs.readFileSync.mockReturnValue(validYaml);

      await loader.loadFromFile('/path/to/config.yml');

      expect(mockFs.readFileSync).toHaveBeenCalledWith('/path/to/config.yml', 'utf8');
    });
  });

  describe('loadFromString()', () => {
    it('should load configuration from YAML string', () => {
      const yamlString = `
metadata:
  version: "1.0.0"
  lastUpdated: "2025-10-10T00:00:00Z"
  description: "String config"
settings:
  fallbackBehavior: "drop"
  validateOnLoad: false
  dynamicReload: true
  reloadInterval: 30000
  enableMetrics: false
routes:
  - name: "route1"
    enabled: true
    source: "*"
    type: "*"
    strategy: "fallback"
    priority: 0
    destination:
      type: "queue"
      queue: "test"
`;

      const config = loader.loadFromString(yamlString);

      expect(config.metadata.version).toBe('1.0.0');
      expect(config.settings.fallbackBehavior).toBe('drop');
      expect(config.routes).toHaveLength(1);
    });

    it('should throw error for invalid YAML string', () => {
      expect(() => loader.loadFromString('invalid: yaml: :')).toThrow();
    });
  });

  describe('validate()', () => {
    const validConfig: RoutingConfig = {
      metadata: {
        version: '1.0.0',
        lastUpdated: '2025-10-10T00:00:00Z',
        description: 'Test',
      },
      settings: {
        fallbackBehavior: 'route-to-fallback-queue',
        validateOnLoad: true,
        dynamicReload: false,
        reloadInterval: 60000,
        enableMetrics: true,
      },
      routes: [
        {
          name: 'test',
          enabled: true,
          source: '*',
          type: '*',
          strategy: 'fallback',
          priority: 0,
          destination: {
            type: 'queue',
            queue: 'test',
          },
        },
      ],
    };

    it('should validate correct configuration', () => {
      const errors = loader.validate(validConfig);

      expect(errors).toHaveLength(0);
    });

    it('should detect missing metadata', () => {
      const invalidConfig = { ...validConfig, metadata: undefined } as any;

      const errors = loader.validate(invalidConfig);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('metadata'))).toBe(true);
    });

    it('should detect missing settings', () => {
      const invalidConfig = { ...validConfig, settings: undefined } as any;

      const errors = loader.validate(invalidConfig);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('settings'))).toBe(true);
    });

    it('should detect missing routes', () => {
      const invalidConfig = { ...validConfig, routes: undefined } as any;

      const errors = loader.validate(invalidConfig);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('routes'))).toBe(true);
    });

    it('should detect empty routes array', () => {
      const invalidConfig = { ...validConfig, routes: [] };

      const errors = loader.validate(invalidConfig);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('at least one route'))).toBe(true);
    });

    it('should detect duplicate route names', () => {
      const invalidConfig = {
        ...validConfig,
        routes: [
          ...validConfig.routes,
          { ...validConfig.routes[0]!, name: 'test' }, // Same name as first route
        ],
      };

      const errors = loader.validate(invalidConfig);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('duplicate') && e.includes('test'))).toBe(true);
    });

    it('should detect invalid priority range', () => {
      const invalidConfig = {
        ...validConfig,
        routes: [{ ...validConfig.routes[0]!, priority: 11 }], // Max is 10
      };

      const errors = loader.validate(invalidConfig);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('priority'))).toBe(true);
    });

    it('should detect negative priority', () => {
      const invalidConfig = {
        ...validConfig,
        routes: [{ ...validConfig.routes[0]!, priority: -1 }],
      };

      const errors = loader.validate(invalidConfig);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('priority'))).toBe(true);
    });

    it('should detect missing route name', () => {
      const invalidConfig = {
        ...validConfig,
        routes: [{ ...validConfig.routes[0]!, name: '' }],
      };

      const errors = loader.validate(invalidConfig);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('name'))).toBe(true);
    });

    it('should detect missing destination', () => {
      const invalidConfig = {
        ...validConfig,
        routes: [{ ...validConfig.routes[0]!, destination: undefined }] as any,
      };

      const errors = loader.validate(invalidConfig);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('destination'))).toBe(true);
    });

    it('should detect invalid HTTP destination (missing endpoint)', () => {
      const invalidConfig = {
        ...validConfig,
        routes: [
          {
            ...validConfig.routes[0]!,
            destination: { type: 'http' },
          },
        ],
      } as any;

      const errors = loader.validate(invalidConfig);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('endpoint'))).toBe(true);
    });

    it('should detect invalid queue destination (missing queue)', () => {
      const invalidConfig = {
        ...validConfig,
        routes: [
          {
            ...validConfig.routes[0]!,
            destination: { type: 'queue' },
          },
        ],
      } as any;

      const errors = loader.validate(invalidConfig);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('queue'))).toBe(true);
    });
  });

  describe('getRoutes()', () => {
    it('should return all routes', () => {
      const config: RoutingConfig = {
        metadata: {
          version: '1.0.0',
          lastUpdated: '2025-10-10T00:00:00Z',
          description: 'Test',
        },
        settings: {
          fallbackBehavior: 'route-to-fallback-queue',
          validateOnLoad: true,
          dynamicReload: false,
          reloadInterval: 60000,
          enableMetrics: true,
        },
        routes: [
          {
            name: 'route1',
            enabled: true,
            source: '*',
            type: '*',
            strategy: 'fallback',
            priority: 0,
            destination: { type: 'queue', queue: 'test1' },
          },
          {
            name: 'route2',
            enabled: true,
            source: '*',
            type: '*',
            strategy: 'fallback',
            priority: 1,
            destination: { type: 'queue', queue: 'test2' },
          },
        ],
      };

      loader.setConfig(config);
      const routes = loader.getRoutes();

      expect(routes).toHaveLength(2);
      expect(routes[0]!.name).toBe('route1');
      expect(routes[1]!.name).toBe('route2');
    });

    it('should return only enabled routes when filter applied', () => {
      const config: RoutingConfig = {
        metadata: {
          version: '1.0.0',
          lastUpdated: '2025-10-10T00:00:00Z',
          description: 'Test',
        },
        settings: {
          fallbackBehavior: 'route-to-fallback-queue',
          validateOnLoad: true,
          dynamicReload: false,
          reloadInterval: 60000,
          enableMetrics: true,
        },
        routes: [
          {
            name: 'enabled-route',
            enabled: true,
            source: '*',
            type: '*',
            strategy: 'fallback',
            priority: 0,
            destination: { type: 'queue', queue: 'test1' },
          },
          {
            name: 'disabled-route',
            enabled: false,
            source: '*',
            type: '*',
            strategy: 'fallback',
            priority: 1,
            destination: { type: 'queue', queue: 'test2' },
          },
        ],
      };

      loader.setConfig(config);
      const routes = loader.getRoutes(true);

      expect(routes).toHaveLength(1);
      expect(routes[0]!.name).toBe('enabled-route');
    });

    it('should throw error if configuration not loaded', () => {
      expect(() => loader.getRoutes()).toThrow('Configuration not loaded');
    });
  });

  describe('getSettings()', () => {
    it('should return settings', () => {
      const config: RoutingConfig = {
        metadata: {
          version: '1.0.0',
          lastUpdated: '2025-10-10T00:00:00Z',
          description: 'Test',
        },
        settings: {
          fallbackBehavior: 'error',
          validateOnLoad: false,
          dynamicReload: true,
          reloadInterval: 30000,
          enableMetrics: false,
        },
        routes: [
          {
            name: 'test',
            enabled: true,
            source: '*',
            type: '*',
            strategy: 'fallback',
            priority: 0,
            destination: { type: 'queue', queue: 'test' },
          },
        ],
      };

      loader.setConfig(config);
      const settings = loader.getSettings();

      expect(settings.fallbackBehavior).toBe('error');
      expect(settings.dynamicReload).toBe(true);
      expect(settings.reloadInterval).toBe(30000);
    });

    it('should throw error if configuration not loaded', () => {
      expect(() => loader.getSettings()).toThrow('Configuration not loaded');
    });
  });
});
