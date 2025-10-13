import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SMILE Interop Layer API',
      version: '1.0.0',
      description: 'API documentation for the SMILE Interop Layer',
    },
    servers: [
      {
        url: 'http://localhost:3002',
        description: 'Development server',
      },
    ],
  },
  apis: ['./src/index.ts'], // Path to the API docs
};

export const swaggerSpec = swaggerJsdoc(options);
