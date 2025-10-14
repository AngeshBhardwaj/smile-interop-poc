import { registerWithOpenHIM, unregisterFromOpenHIM } from '../utils/registration';
import * as openhimMediatorUtils from 'openhim-mediator-utils';

// Mock openhim-mediator-utils
jest.mock('openhim-mediator-utils');

// Mock logger
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('OpenHIM Registration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set required environment variables
    process.env.OPENHIM_API_URL = 'https://localhost:8080';
    process.env.OPENHIM_USERNAME = 'test-user';
    process.env.OPENHIM_PASSWORD = 'test-password';
    process.env.WEBHOOK_URL = 'https://webhook.site/test';
  });

  describe('registerWithOpenHIM', () => {
    it('should successfully register mediator with OpenHIM', async () => {
      const mockRegisterMediator = openhimMediatorUtils.registerMediator as jest.Mock;
      const mockActivateHeartbeat = openhimMediatorUtils.activateHeartbeat as jest.Mock;

      // Mock successful registration
      mockRegisterMediator.mockImplementation((openhimConfig, mediatorConfig, callback) => {
        callback();
      });
      mockActivateHeartbeat.mockReturnValue(30000);

      await expect(registerWithOpenHIM()).resolves.toBeUndefined();

      expect(mockRegisterMediator).toHaveBeenCalledTimes(1);
      expect(mockActivateHeartbeat).toHaveBeenCalledTimes(1);
    });

    it('should reject if registration fails', async () => {
      const mockRegisterMediator = openhimMediatorUtils.registerMediator as jest.Mock;
      const registrationError = new Error('Connection refused');

      // Mock failed registration
      mockRegisterMediator.mockImplementation((openhimConfig, mediatorConfig, callback) => {
        callback(registrationError);
      });

      await expect(registerWithOpenHIM()).rejects.toThrow('Connection refused');
    });

    it('should continue if heartbeat activation fails', async () => {
      const mockRegisterMediator = openhimMediatorUtils.registerMediator as jest.Mock;
      const mockActivateHeartbeat = openhimMediatorUtils.activateHeartbeat as jest.Mock;

      // Mock successful registration but failed heartbeat
      mockRegisterMediator.mockImplementation((openhimConfig, mediatorConfig, callback) => {
        callback();
      });
      mockActivateHeartbeat.mockImplementation(() => {
        throw new Error('Heartbeat failed');
      });

      // Should still resolve even if heartbeat fails
      await expect(registerWithOpenHIM()).resolves.toBeUndefined();

      expect(mockRegisterMediator).toHaveBeenCalledTimes(1);
      expect(mockActivateHeartbeat).toHaveBeenCalledTimes(1);
    });

    it('should call registerMediator with correct config', async () => {
      const mockRegisterMediator = openhimMediatorUtils.registerMediator as jest.Mock;
      const mockActivateHeartbeat = openhimMediatorUtils.activateHeartbeat as jest.Mock;

      mockRegisterMediator.mockImplementation((openhimConfig, mediatorConfig, callback) => {
        expect(openhimConfig).toHaveProperty('apiURL');
        expect(openhimConfig).toHaveProperty('username');
        expect(openhimConfig).toHaveProperty('password');
        expect(openhimConfig).toHaveProperty('trustSelfSigned');
        expect(mediatorConfig).toHaveProperty('urn', 'urn:mediator:smile-passthrough');
        callback();
      });
      mockActivateHeartbeat.mockReturnValue(30000);

      await registerWithOpenHIM();

      expect(mockRegisterMediator).toHaveBeenCalled();
    });
  });

  describe('unregisterFromOpenHIM', () => {
    it('should execute without error', () => {
      expect(() => unregisterFromOpenHIM()).not.toThrow();
    });

    it('should be callable multiple times', () => {
      expect(() => {
        unregisterFromOpenHIM();
        unregisterFromOpenHIM();
        unregisterFromOpenHIM();
      }).not.toThrow();
    });
  });
});
