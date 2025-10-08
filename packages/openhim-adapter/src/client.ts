import axios, { AxiosInstance } from 'axios';
import { logger } from '@smile/common';

export interface OpenHIMClientConfig {
  apiUrl: string;
  username: string;
  password: string;
}

export class OpenHIMClient {
  private client: AxiosInstance;

  constructor(private config: OpenHIMClientConfig) {
    this.client = axios.create({
      baseURL: config.apiUrl,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async authenticate(): Promise<string> {
    try {
      const response = await this.client.post('/authenticate', {
        username: this.config.username,
        password: this.config.password,
      });

      const token = response.data.token;
      this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      logger.info('Successfully authenticated with OpenHIM');
      return token;
    } catch (error) {
      logger.error('Failed to authenticate with OpenHIM', { error });
      throw error;
    }
  }

  async sendTransaction(transaction: unknown): Promise<unknown> {
    try {
      const response = await this.client.post('/transactions', transaction);
      return response.data;
    } catch (error) {
      logger.error('Failed to send transaction to OpenHIM', { error });
      throw error;
    }
  }

  async getChannels(): Promise<unknown[]> {
    try {
      const response = await this.client.get('/channels');
      return response.data;
    } catch (error) {
      logger.error('Failed to get channels from OpenHIM', { error });
      throw error;
    }
  }
}