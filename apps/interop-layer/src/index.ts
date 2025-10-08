import 'dotenv/config';
import express, { Express } from 'express';
import cors from 'cors';
import { ServiceConfig, HealthCheck } from '@smile/common';

const config: ServiceConfig = {
  name: 'interop-layer',
  version: '1.0.0',
  port: parseInt(process.env.INTEROP_LAYER_PORT ?? '3002', 10),
  environment: (process.env.NODE_ENV as 'development' | 'production' | 'test') ?? 'development',
};

const app: Express = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  const health: HealthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: config.version,
  };
  res.json(health);
});

app.get('/', (_req, res) => {
  res.json({
    service: config.name,
    version: config.version,
    message: 'SMILE Interop Layer - Event Router and Mediator',
  });
});

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`🚀 ${config.name} running on port ${config.port}`);
  });
}

export default app;