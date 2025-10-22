import fs from 'fs';
import path from 'path';
import { getLogger } from '../utils/logger';
import {
  ClientsConfiguration,
  ClientConfig,
  ClientFilter,
  CircuitBreakerState,
} from './types';

const logger = getLogger('client-loader');

/**
 * Client configuration loader with hot-reload support
 */
export class ClientLoader {
  private configPath: string;
  private configuration: ClientsConfiguration | null = null;
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private fileWatcher: fs.FSWatcher | null = null;
  private lastLoadTime: Date | null = null;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(process.cwd(), 'clients.config.json');
  }

  /**
   * Load client configuration from file
   */
  public async loadConfiguration(): Promise<ClientsConfiguration> {
    try {
      logger.info('Loading client configuration', { path: this.configPath });

      if (!fs.existsSync(this.configPath)) {
        throw new Error(`Client configuration file not found: ${this.configPath}`);
      }

      const fileContent = fs.readFileSync(this.configPath, 'utf-8');
      const config: ClientsConfiguration = JSON.parse(fileContent);

      // Validate configuration structure
      this.validateConfiguration(config);

      this.configuration = config;
      this.lastLoadTime = new Date();

      // Initialize circuit breakers for all clients
      config.clients.forEach(client => {
        if (!this.circuitBreakers.has(client.id)) {
          this.circuitBreakers.set(client.id, {
            clientId: client.id,
            isOpen: false,
            failureCount: 0,
          });
        }
      });

      logger.info('Client configuration loaded successfully', {
        version: config.version,
        clientCount: config.clients.length,
        enabledClients: config.clients.filter(c => c.enabled).length,
      });

      return config;
    } catch (error) {
      logger.error('Failed to load client configuration', {
        error: error instanceof Error ? error.message : String(error),
        path: this.configPath,
      });
      throw error;
    }
  }

  /**
   * Validate configuration structure
   */
  private validateConfiguration(config: ClientsConfiguration): void {
    if (!config.version) {
      throw new Error('Configuration version is required');
    }

    if (!Array.isArray(config.clients)) {
      throw new Error('Clients must be an array');
    }

    if (config.clients.length === 0) {
      throw new Error('At least one client configuration is required');
    }

    // Validate each client
    config.clients.forEach((client, index) => {
      if (!client.id) {
        throw new Error(`Client at index ${index} is missing required field: id`);
      }
      if (!client.name) {
        throw new Error(`Client ${client.id} is missing required field: name`);
      }
      if (!client.endpoint) {
        throw new Error(`Client ${client.id} is missing required field: endpoint`);
      }
      if (!Array.isArray(client.transformationRules)) {
        throw new Error(`Client ${client.id}: transformationRules must be an array`);
      }
      if (!Array.isArray(client.eventTypes)) {
        throw new Error(`Client ${client.id}: eventTypes must be an array`);
      }
      if (client.eventTypes.length === 0) {
        throw new Error(`Client ${client.id}: at least one event type is required`);
      }
    });

    // Check for duplicate client IDs
    const clientIds = config.clients.map(c => c.id);
    const duplicates = clientIds.filter((id, index) => clientIds.indexOf(id) !== index);
    if (duplicates.length > 0) {
      throw new Error(`Duplicate client IDs found: ${duplicates.join(', ')}`);
    }

    logger.info('Configuration validation passed');
  }

  /**
   * Get all clients matching the filter criteria
   */
  public getClients(filter?: ClientFilter): ClientConfig[] {
    if (!this.configuration) {
      throw new Error('Configuration not loaded. Call loadConfiguration() first.');
    }

    let clients = this.configuration.clients;

    // Filter by enabled status
    if (filter?.enabledOnly !== false) {
      clients = clients.filter(c => c.enabled);
    }

    // Filter by event type
    if (filter?.eventType) {
      const eventType = filter.eventType; // Store to maintain type narrowing
      clients = clients.filter(c => c.eventTypes.includes(eventType));
    }

    // Filter by client IDs
    if (filter?.clientIds && filter.clientIds.length > 0) {
      clients = clients.filter(c => filter.clientIds!.includes(c.id));
    }

    // Filter out clients with open circuit breakers
    if (this.configuration.globalSettings.enableCircuitBreaker) {
      clients = clients.filter(client => {
        const breaker = this.circuitBreakers.get(client.id);
        if (breaker?.isOpen) {
          // Check if enough time has passed to retry
          if (breaker.nextAttemptTime && new Date() < breaker.nextAttemptTime) {
            logger.warn('Circuit breaker is open, skipping client', {
              clientId: client.id,
              nextAttemptTime: breaker.nextAttemptTime,
            });
            return false;
          } else {
            // Time to retry, close the circuit breaker
            this.resetCircuitBreaker(client.id);
          }
        }
        return true;
      });
    }

    return clients;
  }

  /**
   * Get a specific client by ID
   */
  public getClientById(clientId: string): ClientConfig | undefined {
    if (!this.configuration) {
      throw new Error('Configuration not loaded. Call loadConfiguration() first.');
    }

    return this.configuration.clients.find(c => c.id === clientId);
  }

  /**
   * Get global settings
   */
  public getGlobalSettings() {
    if (!this.configuration) {
      throw new Error('Configuration not loaded. Call loadConfiguration() first.');
    }

    return this.configuration.globalSettings;
  }

  /**
   * Record a client failure and update circuit breaker
   */
  public recordFailure(clientId: string): void {
    const breaker = this.circuitBreakers.get(clientId);
    if (!breaker) {
      logger.warn('Circuit breaker not found for client', { clientId });
      return;
    }

    breaker.failureCount++;
    breaker.lastFailureTime = new Date();

    const globalSettings = this.getGlobalSettings();

    if (globalSettings.enableCircuitBreaker &&
        breaker.failureCount >= globalSettings.circuitBreakerThreshold) {
      breaker.isOpen = true;
      breaker.nextAttemptTime = new Date(
        Date.now() + globalSettings.circuitBreakerTimeout
      );

      logger.error('Circuit breaker opened for client', {
        clientId,
        failureCount: breaker.failureCount,
        nextAttemptTime: breaker.nextAttemptTime,
      });
    }
  }

  /**
   * Record a client success and reset failure count
   */
  public recordSuccess(clientId: string): void {
    const breaker = this.circuitBreakers.get(clientId);
    if (breaker) {
      breaker.failureCount = 0;
      breaker.isOpen = false;
      breaker.lastFailureTime = undefined;
      breaker.nextAttemptTime = undefined;
    }
  }

  /**
   * Reset circuit breaker for a client
   */
  public resetCircuitBreaker(clientId: string): void {
    const breaker = this.circuitBreakers.get(clientId);
    if (breaker) {
      breaker.isOpen = false;
      breaker.failureCount = 0;
      breaker.lastFailureTime = undefined;
      breaker.nextAttemptTime = undefined;

      logger.info('Circuit breaker reset for client', { clientId });
    }
  }

  /**
   * Get circuit breaker state for a client
   */
  public getCircuitBreakerState(clientId: string): CircuitBreakerState | undefined {
    return this.circuitBreakers.get(clientId);
  }

  /**
   * Enable file watching for hot-reload
   */
  public enableHotReload(): void {
    if (this.fileWatcher) {
      logger.warn('File watcher already enabled');
      return;
    }

    this.fileWatcher = fs.watch(this.configPath, (eventType) => {
      if (eventType === 'change') {
        logger.info('Client configuration file changed, reloading...', {
          path: this.configPath,
        });

        // Add a small delay to ensure file write is complete
        setTimeout(async () => {
          try {
            await this.loadConfiguration();
            logger.info('Client configuration reloaded successfully');
          } catch (error) {
            logger.error('Failed to reload client configuration', {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }, 500);
      }
    });

    logger.info('Hot-reload enabled for client configuration', {
      path: this.configPath,
    });
  }

  /**
   * Disable file watching
   */
  public disableHotReload(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
      logger.info('Hot-reload disabled for client configuration');
    }
  }

  /**
   * Get configuration metadata
   */
  public getMetadata() {
    if (!this.configuration) {
      return null;
    }

    return {
      version: this.configuration.version,
      lastUpdated: this.configuration.lastUpdated,
      lastLoadTime: this.lastLoadTime,
      configPath: this.configPath,
      clientCount: this.configuration.clients.length,
      enabledClients: this.configuration.clients.filter(c => c.enabled).length,
      disabledClients: this.configuration.clients.filter(c => !c.enabled).length,
    };
  }

  /**
   * Reload configuration manually
   */
  public async reload(): Promise<void> {
    await this.loadConfiguration();
  }

  /**
   * Shutdown and cleanup
   */
  public shutdown(): void {
    this.disableHotReload();
    this.configuration = null;
    this.circuitBreakers.clear();
    logger.info('Client loader shutdown complete');
  }
}

// Singleton instance
let clientLoaderInstance: ClientLoader | null = null;

/**
 * Get or create singleton client loader instance
 */
export function getClientLoader(configPath?: string): ClientLoader {
  if (!clientLoaderInstance) {
    clientLoaderInstance = new ClientLoader(configPath);
  }
  return clientLoaderInstance;
}
