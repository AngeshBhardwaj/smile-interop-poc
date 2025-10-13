/**
 * RoutingConfigLoader
 *
 * Loads and validates routing configuration from YAML files with:
 * - YAML file parsing
 * - Configuration validation
 * - Route filtering
 * - Settings access
 */

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { logger } from '@smile/common';
import {
  RoutingConfig,
  RoutingSettings,
  RouteDefinition,
} from '../messaging/types';

/**
 * Routing configuration loader
 */
export class RoutingConfigLoader {
  private config: RoutingConfig | null = null;

  /**
   * Load routing configuration from YAML file
   *
   * @param filePath - Path to YAML configuration file
   * @returns Loaded and validated configuration
   * @throws Error if file cannot be read or configuration is invalid
   */
  public async loadFromFile(filePath: string): Promise<RoutingConfig> {
    try {
      logger.info('Loading routing configuration from file', { filePath });

      const fileContent = fs.readFileSync(filePath, 'utf8');
      const config = this.loadFromString(fileContent);

      // Validate configuration
      const errors = this.validate(config);
      if (errors.length > 0) {
        throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
      }

      this.config = config;

      logger.info('Routing configuration loaded successfully', {
        version: config.metadata.version,
        routeCount: config.routes.length,
      });

      return config;
    } catch (error) {
      logger.error('Failed to load routing configuration', {
        error: (error as Error).message,
        filePath,
      });
      throw new Error(`Failed to load routing configuration: ${(error as Error).message}`);
    }
  }

  /**
   * Load routing configuration from YAML string
   *
   * @param yamlString - YAML configuration string
   * @returns Parsed configuration
   * @throws Error if YAML is invalid
   */
  public loadFromString(yamlString: string): RoutingConfig {
    try {
      const config = yaml.load(yamlString) as RoutingConfig;
      return config;
    } catch (error) {
      logger.error('Failed to parse YAML configuration', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Validate routing configuration
   *
   * @param config - Configuration to validate
   * @returns Array of validation error messages (empty if valid)
   */
  public validate(config: RoutingConfig): string[] {
    const errors: string[] = [];

    // Validate metadata
    if (!config.metadata) {
      errors.push('Missing required field: metadata');
    } else {
      if (!config.metadata.version) {
        errors.push('Missing required field: metadata.version');
      }
      if (!config.metadata.lastUpdated) {
        errors.push('Missing required field: metadata.lastUpdated');
      }
      if (!config.metadata.description) {
        errors.push('Missing required field: metadata.description');
      }
    }

    // Validate settings
    if (!config.settings) {
      errors.push('Missing required field: settings');
    } else {
      if (!config.settings.fallbackBehavior) {
        errors.push('Missing required field: settings.fallbackBehavior');
      }
      if (config.settings.validateOnLoad === undefined) {
        errors.push('Missing required field: settings.validateOnLoad');
      }
      if (config.settings.dynamicReload === undefined) {
        errors.push('Missing required field: settings.dynamicReload');
      }
      if (!config.settings.reloadInterval) {
        errors.push('Missing required field: settings.reloadInterval');
      }
      if (config.settings.enableMetrics === undefined) {
        errors.push('Missing required field: settings.enableMetrics');
      }
    }

    // Validate routes
    if (!config.routes) {
      errors.push('Missing required field: routes');
    } else if (!Array.isArray(config.routes)) {
      errors.push('Field routes must be an array');
    } else {
      if (config.routes.length === 0) {
        errors.push('Configuration must have at least one route');
      }

      // Check for duplicate route names
      const routeNames = new Set<string>();
      for (const route of config.routes) {
        if (routeNames.has(route.name)) {
          errors.push(`duplicate route name: ${route.name}`);
        }
        routeNames.add(route.name);
      }

      // Validate each route
      config.routes.forEach((route, index) => {
        const routeErrors = this.validateRoute(route, index);
        errors.push(...routeErrors);
      });
    }

    return errors;
  }

  /**
   * Validate a single route definition
   *
   * @param route - Route to validate
   * @param index - Route index (for error messages)
   * @returns Array of validation error messages
   */
  private validateRoute(route: RouteDefinition, index: number): string[] {
    const errors: string[] = [];
    const prefix = `Route ${index} (${route.name || 'unnamed'})`;

    // Validate required fields
    if (!route.name || route.name.trim() === '') {
      errors.push(`${prefix}: Missing or empty route name`);
    }

    if (route.enabled === undefined) {
      errors.push(`${prefix}: Missing required field: enabled`);
    }

    if (!route.source) {
      errors.push(`${prefix}: Missing required field: source`);
    }

    if (!route.type) {
      errors.push(`${prefix}: Missing required field: type`);
    }

    if (!route.strategy) {
      errors.push(`${prefix}: Missing required field: strategy`);
    }

    if (route.priority === undefined) {
      errors.push(`${prefix}: Missing required field: priority`);
    } else {
      // Validate priority range (0-10)
      if (route.priority < 0 || route.priority > 10) {
        errors.push(`${prefix}: priority must be between 0 and 10, got ${route.priority}`);
      }
    }

    if (!route.destination) {
      errors.push(`${prefix}: Missing required field: destination`);
    } else {
      // Validate destination based on type
      if (route.destination.type === 'http') {
        if (!route.destination.endpoint) {
          errors.push(`${prefix}: HTTP destination requires endpoint`);
        }
      }

      if (route.destination.type === 'queue' || route.destination.type === 'topic') {
        if (!route.destination.queue) {
          errors.push(`${prefix}: Queue/topic destination requires queue name`);
        }
      }
    }

    return errors;
  }

  /**
   * Set configuration manually (for testing or programmatic use)
   *
   * @param config - Configuration to set
   */
  public setConfig(config: RoutingConfig): void {
    this.config = config;
  }

  /**
   * Get all routes
   *
   * @param enabledOnly - If true, return only enabled routes
   * @returns Array of route definitions
   * @throws Error if configuration not loaded
   */
  public getRoutes(enabledOnly: boolean = false): RouteDefinition[] {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadFromFile() first.');
    }

    if (enabledOnly) {
      return this.config.routes.filter((route) => route.enabled);
    }

    return this.config.routes;
  }

  /**
   * Get routing settings
   *
   * @returns Routing settings
   * @throws Error if configuration not loaded
   */
  public getSettings(): RoutingSettings {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadFromFile() first.');
    }

    return this.config.settings;
  }

  /**
   * Get full configuration
   *
   * @returns Complete routing configuration
   * @throws Error if configuration not loaded
   */
  public getConfig(): RoutingConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadFromFile() first.');
    }

    return this.config;
  }
}
