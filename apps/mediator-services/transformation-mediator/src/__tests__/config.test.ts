import { loadConfig } from '../config';

describe('Configuration Loader', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('loadConfig', () => {
    it('should load valid configuration from environment variables', () => {
      process.env.MEDIATOR_PORT = '3101';
      process.env.NODE_ENV = 'development';
      process.env.LOG_LEVEL = 'info';
      process.env.OPENHIM_API_URL = 'https://localhost:8080';
      process.env.OPENHIM_USERNAME = 'root@openhim.org';
      process.env.OPENHIM_PASSWORD = 'password';
      process.env.OPENHIM_TRUST_SELF_SIGNED = 'true';
      process.env.RULES_DIRECTORY = './transformation-rules';
      process.env.ENABLE_RULE_CACHING = 'true';
      process.env.CACHE_TTL_SECONDS = '300';
      process.env.DEFAULT_DESTINATION = 'https://webhook.site/test';
      process.env.DEFAULT_TIMEOUT = '30000';
      process.env.DEFAULT_RETRY_ATTEMPTS = '3';

      const config = loadConfig();

      expect(config.service.port).toBe(3101);
      expect(config.service.env).toBe('development');
      expect(config.service.logLevel).toBe('info');
      expect(config.openhim.apiURL).toBe('https://localhost:8080');
      expect(config.openhim.username).toBe('root@openhim.org');
      expect(config.openhim.trustSelfSigned).toBe(true);
      expect(config.transformation.rulesDirectory).toBe('./transformation-rules');
      expect(config.transformation.enableCaching).toBe(true);
      expect(config.transformation.cacheTTL).toBe(300);
      expect(config.destination.defaultURL).toBe('https://webhook.site/test');
      expect(config.destination.timeout).toBe(30000);
      expect(config.destination.retryAttempts).toBe(3);
    });

    it('should apply default values for optional fields', () => {
      delete process.env.MEDIATOR_PORT;
      delete process.env.NODE_ENV;
      delete process.env.LOG_LEVEL;
      delete process.env.DEFAULT_DESTINATION;
      delete process.env.DEFAULT_TIMEOUT;
      delete process.env.DEFAULT_RETRY_ATTEMPTS;
      delete process.env.CACHE_TTL_SECONDS;

      process.env.OPENHIM_API_URL = 'https://localhost:8080';
      process.env.OPENHIM_USERNAME = 'test-user';
      process.env.OPENHIM_PASSWORD = 'test-password';
      process.env.RULES_DIRECTORY = './rules';

      const config = loadConfig();

      expect(config.service.port).toBe(3101);
      expect(config.service.env).toBe('development');
      expect(config.service.logLevel).toBe('info');
      expect(config.transformation.enableCaching).toBe(true);
      expect(config.transformation.cacheTTL).toBe(300);
      expect(config.destination.timeout).toBe(30000);
      expect(config.destination.retryAttempts).toBe(3);
      expect(config.destination.defaultURL).toBeUndefined();
    });

    it('should throw error if required OPENHIM_API_URL is missing', () => {
      delete process.env.OPENHIM_API_URL;
      process.env.OPENHIM_USERNAME = 'test-user';
      process.env.OPENHIM_PASSWORD = 'test-password';
      process.env.RULES_DIRECTORY = './rules';

      expect(() => loadConfig()).toThrow(/Configuration validation failed/);
      expect(() => loadConfig()).toThrow(/apiURL/);
    });

    it('should throw error if required OPENHIM_USERNAME is missing', () => {
      process.env.OPENHIM_API_URL = 'https://localhost:8080';
      delete process.env.OPENHIM_USERNAME;
      process.env.OPENHIM_PASSWORD = 'test-password';
      process.env.RULES_DIRECTORY = './rules';

      expect(() => loadConfig()).toThrow(/Configuration validation failed/);
      expect(() => loadConfig()).toThrow(/username/);
    });

    it('should throw error if required OPENHIM_PASSWORD is missing', () => {
      process.env.OPENHIM_API_URL = 'https://localhost:8080';
      process.env.OPENHIM_USERNAME = 'test-user';
      delete process.env.OPENHIM_PASSWORD;
      process.env.RULES_DIRECTORY = './rules';

      expect(() => loadConfig()).toThrow(/Configuration validation failed/);
      expect(() => loadConfig()).toThrow(/password/);
    });

    it('should throw error if required RULES_DIRECTORY is missing', () => {
      process.env.OPENHIM_API_URL = 'https://localhost:8080';
      process.env.OPENHIM_USERNAME = 'test-user';
      process.env.OPENHIM_PASSWORD = 'test-password';
      delete process.env.RULES_DIRECTORY;

      expect(() => loadConfig()).toThrow(/Configuration validation failed/);
      expect(() => loadConfig()).toThrow(/rulesDirectory/);
    });

    it('should validate port number is within valid range', () => {
      process.env.MEDIATOR_PORT = '99999';
      process.env.OPENHIM_API_URL = 'https://localhost:8080';
      process.env.OPENHIM_USERNAME = 'test-user';
      process.env.OPENHIM_PASSWORD = 'test-password';
      process.env.RULES_DIRECTORY = './rules';

      expect(() => loadConfig()).toThrow(/Configuration validation failed/);
      expect(() => loadConfig()).toThrow(/port/);
    });

    it('should validate NODE_ENV is one of allowed values', () => {
      process.env.NODE_ENV = 'invalid';
      process.env.OPENHIM_API_URL = 'https://localhost:8080';
      process.env.OPENHIM_USERNAME = 'test-user';
      process.env.OPENHIM_PASSWORD = 'test-password';
      process.env.RULES_DIRECTORY = './rules';

      expect(() => loadConfig()).toThrow(/Configuration validation failed/);
      expect(() => loadConfig()).toThrow(/env/);
    });

    it('should validate LOG_LEVEL is one of allowed values', () => {
      process.env.LOG_LEVEL = 'invalid';
      process.env.OPENHIM_API_URL = 'https://localhost:8080';
      process.env.OPENHIM_USERNAME = 'test-user';
      process.env.OPENHIM_PASSWORD = 'test-password';
      process.env.RULES_DIRECTORY = './rules';

      expect(() => loadConfig()).toThrow(/Configuration validation failed/);
      expect(() => loadConfig()).toThrow(/logLevel/);
    });

    it('should validate OPENHIM_API_URL is a valid URI', () => {
      process.env.OPENHIM_API_URL = 'not-a-valid-url';
      process.env.OPENHIM_USERNAME = 'test-user';
      process.env.OPENHIM_PASSWORD = 'test-password';
      process.env.RULES_DIRECTORY = './rules';

      expect(() => loadConfig()).toThrow(/Configuration validation failed/);
      expect(() => loadConfig()).toThrow(/apiURL/);
    });

    it('should validate DEFAULT_DESTINATION is a valid URI if provided', () => {
      process.env.OPENHIM_API_URL = 'https://localhost:8080';
      process.env.OPENHIM_USERNAME = 'test-user';
      process.env.OPENHIM_PASSWORD = 'test-password';
      process.env.RULES_DIRECTORY = './rules';
      process.env.DEFAULT_DESTINATION = 'not-a-valid-url';

      expect(() => loadConfig()).toThrow(/Configuration validation failed/);
      expect(() => loadConfig()).toThrow(/defaultURL/);
    });

    it('should validate timeout is within allowed range', () => {
      process.env.OPENHIM_API_URL = 'https://localhost:8080';
      process.env.OPENHIM_USERNAME = 'test-user';
      process.env.OPENHIM_PASSWORD = 'test-password';
      process.env.RULES_DIRECTORY = './rules';
      process.env.DEFAULT_TIMEOUT = '500'; // Too low (min 1000)

      expect(() => loadConfig()).toThrow(/Configuration validation failed/);
      expect(() => loadConfig()).toThrow(/timeout/);
    });

    it('should validate retry attempts is within allowed range', () => {
      process.env.OPENHIM_API_URL = 'https://localhost:8080';
      process.env.OPENHIM_USERNAME = 'test-user';
      process.env.OPENHIM_PASSWORD = 'test-password';
      process.env.RULES_DIRECTORY = './rules';
      process.env.DEFAULT_RETRY_ATTEMPTS = '10'; // Too high (max 5)

      expect(() => loadConfig()).toThrow(/Configuration validation failed/);
      expect(() => loadConfig()).toThrow(/retryAttempts/);
    });

    it('should handle OPENHIM_TRUST_SELF_SIGNED boolean correctly', () => {
      process.env.OPENHIM_API_URL = 'https://localhost:8080';
      process.env.OPENHIM_USERNAME = 'test-user';
      process.env.OPENHIM_PASSWORD = 'test-password';
      process.env.RULES_DIRECTORY = './rules';
      process.env.OPENHIM_TRUST_SELF_SIGNED = 'false';

      const config = loadConfig();

      expect(config.openhim.trustSelfSigned).toBe(false);
    });

    it('should handle ENABLE_RULE_CACHING=false correctly', () => {
      process.env.OPENHIM_API_URL = 'https://localhost:8080';
      process.env.OPENHIM_USERNAME = 'test-user';
      process.env.OPENHIM_PASSWORD = 'test-password';
      process.env.RULES_DIRECTORY = './rules';
      process.env.ENABLE_RULE_CACHING = 'false';

      const config = loadConfig();

      expect(config.transformation.enableCaching).toBe(false);
    });
  });
});
