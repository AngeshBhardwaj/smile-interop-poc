// Jest setup file
// Add any global test setup here

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.MEDIATOR_PORT = '3101';
process.env.LOG_LEVEL = 'error';
process.env.OPENHIM_API_URL = 'https://localhost:8080';
process.env.OPENHIM_USERNAME = 'test-user';
process.env.OPENHIM_PASSWORD = 'test-password';
process.env.RULES_DIRECTORY = './transformation-rules';
process.env.DEFAULT_DESTINATION = 'https://webhook.site/test';
