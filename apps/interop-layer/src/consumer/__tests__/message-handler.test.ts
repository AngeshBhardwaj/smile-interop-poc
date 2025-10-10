/**
 * Message Handler Unit Tests
 *
 * TDD approach: Write tests first, then implement handler
 */

import * as amqp from 'amqplib';
import { MessageHandler } from '../message-handler';
import { ConsumerOptions } from '../../messaging/types';

// Mock logger
jest.mock('@smile/common', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('MessageHandler', () => {
  let handler: MessageHandler;
  let mockChannel: any;
  let mockMessage: amqp.ConsumeMessage;

  beforeEach(() => {
    // Setup mock channel
    mockChannel = {
      ack: jest.fn(),
      nack: jest.fn(),
      reject: jest.fn(),
    };

    // Setup mock message
    mockMessage = {
      content: Buffer.from(JSON.stringify({
        specversion: '1.0',
        type: 'test.event',
        source: 'test',
        id: 'msg-123',
        data: { test: 'data' },
      })),
      fields: {
        deliveryTag: 1,
        redelivered: false,
        exchange: 'test-exchange',
        routingKey: 'test.key',
      },
      properties: {
        contentType: 'application/json',
        correlationId: 'corr-123',
        messageId: 'msg-123',
        timestamp: Date.now(),
        headers: {},
      },
    } as any;

    const options: ConsumerOptions = {
      autoAck: false,
      ackOnSuccess: true,
      requeueOnFailure: false,
      enableDeduplication: false,
    };

    handler = new MessageHandler(options);
    jest.clearAllMocks();
  });

  describe('parseMessage()', () => {
    it('should parse valid JSON message', () => {
      const result = handler.parseMessage(mockMessage);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        specversion: '1.0',
        type: 'test.event',
        source: 'test',
        id: 'msg-123',
        data: { test: 'data' },
      });
    });

    it('should handle invalid JSON', () => {
      mockMessage.content = Buffer.from('invalid json');

      const result = handler.parseMessage(mockMessage);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Failed to parse JSON');
    });

    it('should handle empty content', () => {
      mockMessage.content = Buffer.from('');

      const result = handler.parseMessage(mockMessage);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle non-JSON content type gracefully', () => {
      mockMessage.properties.contentType = 'text/plain';

      const result = handler.parseMessage(mockMessage);

      // Should still try to parse as JSON
      expect(result.success).toBe(true);
    });
  });

  describe('acknowledgeMessage()', () => {
    it('should acknowledge message when ackOnSuccess is true', async () => {
      await handler.acknowledgeMessage(mockChannel, mockMessage, true);

      expect(mockChannel.ack).toHaveBeenCalledWith(mockMessage);
      expect(mockChannel.nack).not.toHaveBeenCalled();
    });

    it('should not acknowledge when autoAck is enabled', async () => {
      const autoAckHandler = new MessageHandler({ autoAck: true });

      await autoAckHandler.acknowledgeMessage(mockChannel, mockMessage, true);

      expect(mockChannel.ack).not.toHaveBeenCalled();
    });

    it('should nack message on failure without requeue by default', async () => {
      await handler.acknowledgeMessage(mockChannel, mockMessage, false);

      expect(mockChannel.nack).toHaveBeenCalledWith(mockMessage, false, false);
      expect(mockChannel.ack).not.toHaveBeenCalled();
    });

    it('should requeue message when requeueOnFailure is true', async () => {
      const requeueHandler = new MessageHandler({
        autoAck: false,
        requeueOnFailure: true,
      });

      await requeueHandler.acknowledgeMessage(mockChannel, mockMessage, false);

      expect(mockChannel.nack).toHaveBeenCalledWith(mockMessage, false, true);
    });

    it('should handle channel errors gracefully', async () => {
      mockChannel.ack.mockImplementation(() => {
        throw new Error('Channel closed');
      });

      await expect(
        handler.acknowledgeMessage(mockChannel, mockMessage, true),
      ).resolves.not.toThrow();
    });
  });

  describe('extractContext()', () => {
    it('should extract message context correctly', () => {
      const context = handler.extractContext(mockMessage, 'test-queue', 'consumer-tag-1');

      expect(context.message).toBe(mockMessage);
      expect(context.queue).toBe('test-queue');
      expect(context.consumerTag).toBe('consumer-tag-1');
      expect(context.correlationId).toBe('corr-123');
      expect(context.receivedAt).toBeInstanceOf(Date);
    });

    it('should extract correlationId from message properties', () => {
      const context = handler.extractContext(mockMessage, 'test-queue', 'tag-1');

      expect(context.correlationId).toBe('corr-123');
    });

    it('should use messageId as fallback for correlationId', () => {
      delete mockMessage.properties.correlationId;

      const context = handler.extractContext(mockMessage, 'test-queue', 'tag-1');

      expect(context.correlationId).toBe('msg-123');
    });

    it('should use deliveryTag as ultimate fallback for correlationId', () => {
      delete mockMessage.properties.correlationId;
      delete mockMessage.properties.messageId;

      const context = handler.extractContext(mockMessage, 'test-queue', 'tag-1');

      expect(context.correlationId).toBe('1');
    });
  });

  describe('isDuplicate()', () => {
    it('should return false when deduplication is disabled', () => {
      const isDupe = handler.isDuplicate('msg-123');

      expect(isDupe).toBe(false);
    });

    it('should detect duplicate messages when enabled', () => {
      const dedupHandler = new MessageHandler({
        enableDeduplication: true,
        deduplicationWindow: 60000,
      });

      const firstCall = dedupHandler.isDuplicate('msg-456');
      const secondCall = dedupHandler.isDuplicate('msg-456');

      expect(firstCall).toBe(false);
      expect(secondCall).toBe(true);
    });

    it('should not detect duplicate after deduplication window expires', async () => {
      const dedupHandler = new MessageHandler({
        enableDeduplication: true,
        deduplicationWindow: 100, // 100ms window
      });

      const firstCall = dedupHandler.isDuplicate('msg-789');
      expect(firstCall).toBe(false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      const secondCall = dedupHandler.isDuplicate('msg-789');
      expect(secondCall).toBe(false); // Should not be duplicate anymore
    });

    it('should handle different message IDs independently', () => {
      const dedupHandler = new MessageHandler({
        enableDeduplication: true,
      });

      const msg1 = dedupHandler.isDuplicate('msg-1');
      const msg2 = dedupHandler.isDuplicate('msg-2');
      const msg3 = dedupHandler.isDuplicate('msg-3');

      expect(msg1).toBe(false);
      expect(msg2).toBe(false);
      expect(msg3).toBe(false);
    });
  });

  describe('getStats()', () => {
    it('should return initial stats', () => {
      const stats = handler.getStats();

      expect(stats.messagesProcessed).toBe(0);
      expect(stats.messagesFailed).toBe(0);
      expect(stats.messagesDuplicate).toBe(0);
      expect(stats.totalProcessingTime).toBe(0);
      expect(stats.averageProcessingTime).toBe(0);
    });

    it('should track successful message processing', () => {
      handler.recordSuccess(50);

      const stats = handler.getStats();

      expect(stats.messagesProcessed).toBe(1);
      expect(stats.messagesFailed).toBe(0);
      expect(stats.totalProcessingTime).toBe(50);
      expect(stats.averageProcessingTime).toBe(50);
    });

    it('should track failed message processing', () => {
      handler.recordFailure(30);

      const stats = handler.getStats();

      expect(stats.messagesProcessed).toBe(0);
      expect(stats.messagesFailed).toBe(1);
      expect(stats.totalProcessingTime).toBe(30);
    });

    it('should track duplicate messages', () => {
      handler.recordDuplicate();

      const stats = handler.getStats();

      expect(stats.messagesDuplicate).toBe(1);
    });

    it('should calculate average processing time correctly', () => {
      handler.recordSuccess(100);
      handler.recordSuccess(200);
      handler.recordSuccess(300);

      const stats = handler.getStats();

      expect(stats.messagesProcessed).toBe(3);
      expect(stats.totalProcessingTime).toBe(600);
      expect(stats.averageProcessingTime).toBe(200);
    });

    it('should handle zero messages for average calculation', () => {
      const stats = handler.getStats();

      expect(stats.averageProcessingTime).toBe(0);
    });
  });

  describe('resetStats()', () => {
    it('should reset all statistics', () => {
      handler.recordSuccess(100);
      handler.recordFailure(50);
      handler.recordDuplicate();

      handler.resetStats();

      const stats = handler.getStats();

      expect(stats.messagesProcessed).toBe(0);
      expect(stats.messagesFailed).toBe(0);
      expect(stats.messagesDuplicate).toBe(0);
      expect(stats.totalProcessingTime).toBe(0);
      expect(stats.averageProcessingTime).toBe(0);
    });
  });
});
