export interface ServiceConfig {
  name: string;
  version: string;
  port: number;
  environment: 'development' | 'production' | 'test';
}

export interface HealthCheck {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
}