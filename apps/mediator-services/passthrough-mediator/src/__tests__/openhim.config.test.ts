describe('OpenHIM Configuration', () => {
  describe('getMediatorConfig', () => {
    beforeEach(() => {
      // Clear module cache to allow config reload
      jest.resetModules();
      // Set required environment variables
      process.env.WEBHOOK_URL = 'https://webhook.site/test-unique-id';
    });

    it('should return mediator configuration', () => {
      // Import fresh after setting env vars
      const { getMediatorConfig } = require('../config/openhim.config');
      const config = getMediatorConfig();

      expect(config).toHaveProperty('urn', 'urn:mediator:smile-passthrough');
      expect(config).toHaveProperty('version', '1.0.0');
      expect(config).toHaveProperty('name', 'SMILE Pass-through Mediator');
      expect(config).toHaveProperty('description');
    });

    it('should include default channel configuration', () => {
      const { getMediatorConfig } = require('../config/openhim.config');
      const config = getMediatorConfig();

      expect(config).toHaveProperty('defaultChannelConfig');
      expect(Array.isArray(config.defaultChannelConfig)).toBe(true);
      expect(config.defaultChannelConfig.length).toBeGreaterThan(0);

      const channel = config.defaultChannelConfig[0];
      expect(channel).toHaveProperty('name', 'Health Passthrough Channel');
      expect(channel).toHaveProperty('urlPattern', '^/passthrough$');
      expect(channel).toHaveProperty('routes');
      expect(Array.isArray(channel.routes)).toBe(true);
    });

    it('should include endpoints configuration', () => {
      const { getMediatorConfig } = require('../config/openhim.config');
      const config = getMediatorConfig();

      expect(config).toHaveProperty('endpoints');
      expect(Array.isArray(config.endpoints)).toBe(true);
      expect(config.endpoints.length).toBeGreaterThan(0);
    });

    it('should include webhook URL from environment in config', () => {
      const { getMediatorConfig } = require('../config/openhim.config');
      const config = getMediatorConfig();

      expect(config).toHaveProperty('config');
      expect(config.config).toHaveProperty('webhookUrl', 'https://webhook.site/test-unique-id');
    });

    it('should handle different webhook URLs from environment', () => {
      process.env.WEBHOOK_URL = 'https://example.com/webhook';
      // Need to reload modules after changing env var
      jest.resetModules();
      const { getMediatorConfig } = require('../config/openhim.config');
      const config = getMediatorConfig();

      expect(config.config.webhookUrl).toBe('https://example.com/webhook');
    });
  });
});
