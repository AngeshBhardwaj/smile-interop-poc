/**
 * OpenHIM Channel Management
 * Programmatically creates channels from mediator defaultChannelConfig
 */

import axios from 'axios';
import https from 'https';
import { openhimConfig, getMediatorConfig } from '../config/openhim.config';
import { getLogger } from './logger';

const logger = getLogger('channel-manager');

// Create axios instance with self-signed cert support
const httpsAgent = new https.Agent({
  rejectUnauthorized: !openhimConfig.trustSelfSigned,
});

/**
 * Create default channels for this mediator
 */
export async function createDefaultChannels(): Promise<void> {
  try {
    logger.info({ msg: 'Starting channel creation process' });
    const mediatorConfig = getMediatorConfig();

    logger.info({
      msg: 'Loaded mediator config for channel creation',
      urn: mediatorConfig.urn,
      hasDefaultChannelConfig: !!mediatorConfig.defaultChannelConfig,
      defaultChannelCount: mediatorConfig.defaultChannelConfig?.length || 0,
    });

    // Check if defaultChannelConfig exists
    if (!mediatorConfig.defaultChannelConfig || mediatorConfig.defaultChannelConfig.length === 0) {
      logger.info({
        msg: 'No default channel configuration found in mediatorConfig',
        urn: mediatorConfig.urn,
      });
      return;
    }

    const auth = Buffer.from(`${openhimConfig.username}:${openhimConfig.password}`).toString('base64');

    // Create each channel defined in defaultChannelConfig
    for (const channelConfig of mediatorConfig.defaultChannelConfig) {
      try {
        logger.info({
          msg: 'Creating channel from defaultChannelConfig',
          channelName: channelConfig.name,
          urlPattern: channelConfig.urlPattern,
        });

        // POST channel to OpenHIM API
        // According to OpenHIM docs: POST {openhim_url}:8080/channels
        const channelEndpoint = openhimConfig.apiURL.replace('/api', '') + '/channels';

        logger.info({
          msg: 'Posting to channel endpoint',
          endpoint: channelEndpoint,
        });

        const response = await axios.post(
          channelEndpoint,
          channelConfig,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Basic ${auth}`,
            },
            httpsAgent,
            timeout: 5000,
          }
        );

        // Check response status (201 Created or 200 OK)
        logger.info({
          msg: 'Received response from channel creation API',
          channelName: channelConfig.name,
          status: response.status,
          responseData: response.data,
          responseHeaders: response.headers,
        });

        if (response.status === 201) {
          logger.info({
            msg: 'Channel created successfully (201)',
            channelName: channelConfig.name,
            status: response.status,
          });
        } else if (response.status === 200) {
          logger.warn({
            msg: 'Channel API returned 200 - may not have been created',
            channelName: channelConfig.name,
            status: response.status,
            response: response.data,
          });
        } else {
          logger.warn({
            msg: 'Unexpected response status when creating channel',
            channelName: channelConfig.name,
            status: response.status,
          });
        }
      } catch (channelError: any) {
        // Check if error is due to channel already existing
        if (channelError.response?.status === 409) {
          logger.info({
            msg: 'Channel already exists (409 Conflict)',
            channelName: channelConfig.name,
          });
        } else if (channelError.response?.status === 400) {
          // Channel might already exist with different error format
          logger.warn({
            msg: 'Channel creation returned 400 - may already exist',
            channelName: channelConfig.name,
            error: channelError.response?.data?.message || channelError.message,
          });
        } else {
          logger.error({
            msg: 'Failed to create channel',
            channelName: channelConfig.name,
            status: channelError.response?.status,
            error: channelError.message,
            responseData: channelError.response?.data,
          });
          // Don't throw - continue trying to create other channels
        }
      }
    }

    logger.info({
      msg: 'Channel creation process completed',
      totalChannels: mediatorConfig.defaultChannelConfig.length,
    });
  } catch (error: any) {
    logger.error({
      msg: 'Failed to create default channels',
      error: error.message,
      stack: error.stack,
    });
    // Don't throw - mediator can still function without channels
  }
}
