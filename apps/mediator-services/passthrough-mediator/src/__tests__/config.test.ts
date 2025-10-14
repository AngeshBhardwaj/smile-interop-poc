import { loadConfig } from '../config';

describe('Configuration Loader', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('loadConfig', () => {
    it('should load valid configuration from environment variables', () => {
      process.env.NODE_ENV = 'development';
      process.env.MEDIATOR_PORT = '3100';
      process.env.LOG_LEVEL = 'info';
      process.env.OPENHIM_API_URL = 'https://localhost:8080';
      process.env.OPENHIM_USERNAME = 'test-user';
      process.env.OPENHIM_PASSWORD = 'test-password';
      process.env.OPENHIM_TRUST_SELF_SIGNED = 'true';
      process.env.WEBHOOK_URL = 'https://webhook.site/test';

      const config = loadConfig();

      expect(config).toEqual({
        port: 3100,
        env: 'development',
        logLevel: 'info',
        openhim: {
          apiURL: 'https://localhost:8080',
          username: 'test-user',
          password: 'test-password',
          trustSelfSigned: true,
        },
        webhook: {
          url: 'https://webhook.site/test',
          timeout: 10000,
          retryAttempts: 3,
        },
      });
    });

    it('should apply default values for optional fields', () => {
      delete process.env.NODE_ENV; // Remove to test default value
      delete process.env.LOG_LEVEL; // Remove to test default value
      process.env.OPENHIM_API_URL = 'https://localhost:8080';
      process.env.OPENHIM_USERNAME = 'test-user';
      process.env.OPENHIM_PASSWORD = 'test-password';
      process.env.WEBHOOK_URL = 'https://webhook.site/test';

      const config = loadConfig();

      expect(config.port).toBe(3100);
      expect(config.env).toBe('development');
      expect(config.logLevel).toBe('info');
      expect(config.openhim.trustSelfSigned).toBe(true);
      expect(config.webhook.timeout).toBe(10000);
      expect(config.webhook.retryAttempts).toBe(3);
    });

    it('should throw error if required OPENHIM_API_URL is missing', () => {
      delete process.env.OPENHIM_API_URL;
      process.env.OPENHIM_USERNAME = 'test-user';
      process.env.OPENHIM_PASSWORD = 'test-password';
      process.env.WEBHOOK_URL = 'https://webhook.site/test';

      expect(() => loadConfig()).toThrow('Configuration validation error');
    });

    it('should throw error if required OPENHIM_USERNAME is missing', () => {
      process.env.OPENHIM_API_URL = 'https://localhost:8080';
      delete process.env.OPENHIM_USERNAME;
      process.env.OPENHIM_PASSWORD = 'test-password';
      process.env.WEBHOOK_URL = 'https://webhook.site/test';

      expect(() => loadConfig()).toThrow('Configuration validation error');
    });

    it('should throw error if required OPENHIM_PASSWORD is missing', () => {
      process.env.OPENHIM_API_URL = 'https://localhost:8080';
      process.env.OPENHIM_USERNAME = 'test-user';
      delete process.env.OPENHIM_PASSWORD;
      process.env.WEBHOOK_URL = 'https://webhook.site/test';

      expect(() => loadConfig()).toThrow('Configuration validation error');
    });

    it('should throw error if required WEBHOOK_URL is missing', () => {
      process.env.OPENHIM_API_URL = 'https://localhost:8080';
      process.env.OPENHIM_USERNAME = 'test-user';
      process.env.OPENHIM_PASSWORD = 'test-password';
      delete process.env.WEBHOOK_URL;

      expect(() => loadConfig()).toThrow('Configuration validation error');
    });

    it('should validate MEDIATOR_PORT is a valid port number', () => {
      process.env.OPENHIM_API_URL = 'https://localhost:8080';
      process.env.OPENHIM_USERNAME = 'test-user';
      process.env.OPENHIM_PASSWORD = 'test-password';
      process.env.WEBHOOK_URL = 'https://webhook.site/test';
      process.env.MEDIATOR_PORT = '99999';

      expect(() => loadConfig()).toThrow('Configuration validation error');
    });

    it('should validate NODE_ENV is one of allowed values', () => {
      process.env.OPENHIM_API_URL = 'https://localhost:8080';
      process.env.OPENHIM_USERNAME = 'test-user';
      process.env.OPENHIM_PASSWORD = 'test-password';
      process.env.WEBHOOK_URL = 'https://webhook.site/test';
      process.env.NODE_ENV = 'invalid';

      expect(() => loadConfig()).toThrow('Configuration validation error');
    });

    it('should validate LOG_LEVEL is one of allowed values', () => {
      process.env.OPENHIM_API_URL = 'https://localhost:8080';
      process.env.OPENHIM_USERNAME = 'test-user';
      process.env.OPENHIM_PASSWORD = 'test-password';
      process.env.WEBHOOK_URL = 'https://webhook.site/test';
      process.env.LOG_LEVEL = 'invalid';

      expect(() => loadConfig()).toThrow('Configuration validation error');
    });

    it('should validate OPENHIM_API_URL is a valid URI', () => {
      process.env.OPENHIM_API_URL = 'not-a-valid-url';
      process.env.OPENHIM_USERNAME = 'test-user';
      process.env.OPENHIM_PASSWORD = 'test-password';
      process.env.WEBHOOK_URL = 'https://webhook.site/test';

      expect(() => loadConfig()).toThrow('Configuration validation error');
    });

    it('should validate WEBHOOK_URL is a valid URI', () => {
      process.env.OPENHIM_API_URL = 'https://localhost:8080';
      process.env.OPENHIM_USERNAME = 'test-user';
      process.env.OPENHIM_PASSWORD = 'test-password';
      process.env.WEBHOOK_URL = 'not-a-valid-url';

      expect(() => loadConfig()).toThrow('Configuration validation error');
    });

    it('should validate WEBHOOK_TIMEOUT is within allowed range', () => {
      process.env.OPENHIM_API_URL = 'https://localhost:8080';
      process.env.OPENHIM_USERNAME = 'test-user';
      process.env.OPENHIM_PASSWORD = 'test-password';
      process.env.WEBHOOK_URL = 'https://webhook.site/test';
      process.env.WEBHOOK_TIMEOUT = '500';

      expect(() => loadConfig()).toThrow('Configuration validation error');
    });

    it('should validate WEBHOOK_RETRY_ATTEMPTS is within allowed range', () => {
      process.env.OPENHIM_API_URL = 'https://localhost:8080';
      process.env.OPENHIM_USERNAME = 'test-user';
      process.env.OPENHIM_PASSWORD = 'test-password';
      process.env.WEBHOOK_URL = 'https://webhook.site/test';
      process.env.WEBHOOK_RETRY_ATTEMPTS = '10';

      expect(() => loadConfig()).toThrow('Configuration validation error');
    });
  });
});
