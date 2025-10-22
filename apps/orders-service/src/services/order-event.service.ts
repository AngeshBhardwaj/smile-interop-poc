/**
 * Order Event Service
 *
 * Handles CloudEvent emission for order lifecycle events.
 * Provides business-focused event handling without PII/PHI concerns.
 */

import { EventEmitter } from '@smile/cloud-events';
import { logger } from '@smile/common';
import {
  OrderEventType,
  OrderEventMetadata,
  OrderEventData,
  OrderCloudEvent,
  OrderCreatedEventData,
  OrderStateTransitionEventData,
  OrderUpdatedEventData,
  OrderDeletedEventData,
  OrderApprovedEventData,
  OrderRejectedEventData,
  OrderShippedEventData,
  OrderReceivedEventData,
  OrderReturnedEventData,
  OrderFulfilledEventData,
  ORDER_EVENT_ROUTING,
} from '../types/order-events';
import { Order, RejectOrderRequest, InitiateReturnRequest } from '../types/order-types';
import { OrderStatus } from '../types/order-status';

export interface OrderEventServiceConfig {
  rabbitmqUrl: string;
  exchange: string;
  facilityId: string;
  facilityName: string;
  departmentId?: string;
  departmentName?: string;
}

export class OrderEventService {
  private eventEmitter: EventEmitter;
  private config: OrderEventServiceConfig;

  constructor(config: OrderEventServiceConfig) {
    this.config = config;
    this.eventEmitter = new EventEmitter({
      rabbitmqUrl: config.rabbitmqUrl,
      exchange: config.exchange,
    });
  }

  /**
   * Initialize the event service
   */
  async initialize(): Promise<void> {
    try {
      await this.eventEmitter.connect();
      logger.info('Order Event Service initialized successfully', {
        exchange: this.config.exchange,
        facility: this.config.facilityId,
      });
    } catch (error: any) {
      logger.error('Failed to initialize Order Event Service', { error });
      throw error;
    }
  }

  /**
   * Close the event service connections
   */
  async close(): Promise<void> {
    try {
      await this.eventEmitter.close();
      logger.info('Order Event Service closed successfully');
    } catch (error: any) {
      logger.error('Error closing Order Event Service', { error });
    }
  }

  /**
   * Emit order created event
   */
  async emitOrderCreated(
    order: Order,
    userId: string,
    correlationId?: string,
    sessionId?: string,
  ): Promise<void> {
    const eventData: OrderCreatedEventData = {
      orderId: order.orderId,
      orderType: order.orderType,
      priority: order.priority,
      status: order.status,
      requestedBy: order.requestedBy,
      requiredDate: order.requiredDate,
      itemCount: order.items.length,
      ...(order.financials?.totalAmount !== undefined && { estimatedValue: order.financials.totalAmount }),
      ...(order.vendor?.vendorId && { vendorId: order.vendor.vendorId }),
      ...(order.vendor?.vendorName && { vendorName: order.vendor.vendorName }),
      deliveryLocation: {
        facilityId: order.facilityId,
        ...(order.departmentId && { departmentId: order.departmentId }),
        ...(order.deliveryAddress.room && { room: order.deliveryAddress.room }),
      },
      ...(order.tags && { tags: order.tags }),
    };

    await this.emitEvent(
      OrderEventType.ORDER_CREATED,
      eventData,
      order.orderId,
      userId,
      correlationId,
      sessionId,
    );
  }

  /**
   * Emit order updated event
   */
  async emitOrderUpdated(
    order: Order,
    updatedFields: string[],
    previousValues: Record<string, any>,
    userId: string,
    correlationId?: string,
    sessionId?: string,
  ): Promise<void> {
    const eventData: OrderUpdatedEventData = {
      orderId: order.orderId,
      orderType: order.orderType,
      priority: order.priority,
      status: order.status,
      updatedBy: userId,
      updatedFields,
      previousValues,
      newValues: this.extractUpdatedValues(order, updatedFields),
      itemsAdded: 0, // Calculate based on comparison
      itemsRemoved: 0, // Calculate based on comparison
      itemsModified: 0, // Calculate based on comparison
    };

    await this.emitEvent(
      OrderEventType.ORDER_UPDATED,
      eventData,
      order.orderId,
      userId,
      correlationId,
      sessionId,
    );
  }

  /**
   * Emit order deleted event
   */
  async emitOrderDeleted(
    order: Order,
    deletionReason: string,
    userId: string,
    correlationId?: string,
    sessionId?: string,
  ): Promise<void> {
    const eventData: OrderDeletedEventData = {
      orderId: order.orderId,
      orderType: order.orderType,
      status: order.status,
      deletedBy: userId,
      deletionReason,
      itemCount: order.items.length,
      orderAge: this.calculateOrderAge(order.createdAt),
    };

    await this.emitEvent(
      OrderEventType.ORDER_DELETED,
      eventData,
      order.orderId,
      userId,
      correlationId,
      sessionId,
    );
  }

  /**
   * Emit order submitted event
   */
  async emitOrderSubmitted(
    order: Order,
    userId: string,
    correlationId?: string,
    sessionId?: string,
  ): Promise<void> {
    const eventData: OrderStateTransitionEventData = {
      orderId: order.orderId,
      fromStatus: OrderStatus.DRAFT,
      toStatus: OrderStatus.SUBMITTED,
      transitionedBy: userId,
      transitionDate: new Date().toISOString(),
      orderType: order.orderType,
      priority: order.priority,
      itemCount: order.items.length,
      ...(order.financials?.totalAmount !== undefined && { estimatedValue: order.financials.totalAmount }),
      ...(order.vendor?.vendorId && { vendorId: order.vendor.vendorId }),
    };

    await this.emitEvent(
      OrderEventType.ORDER_SUBMITTED,
      eventData,
      order.orderId,
      userId,
      correlationId,
      sessionId,
    );
  }

  /**
   * Emit order approved event
   */
  async emitOrderApproved(
    order: Order,
    approvalData: { approvedBy: string; approvalDate: string; notes?: string },
    userId: string,
    correlationId?: string,
    sessionId?: string,
  ): Promise<void> {
    const eventData: OrderApprovedEventData = {
      orderId: order.orderId,
      orderType: order.orderType,
      priority: order.priority,
      approvedBy: approvalData.approvedBy,
      approvalDate: approvalData.approvalDate,
      ...(order.financials?.totalAmount !== undefined && { estimatedValue: order.financials.totalAmount }),
      ...(order.vendor?.vendorId && { vendorId: order.vendor.vendorId }),
      ...(order.vendor?.vendorName && { vendorName: order.vendor.vendorName }),
      ...(order.deliveryInfo?.estimatedDeliveryDate && { estimatedDeliveryDate: order.deliveryInfo.estimatedDeliveryDate }),
      ...(approvalData.notes && { approvalNotes: approvalData.notes }),
    };

    await this.emitEvent(
      OrderEventType.ORDER_APPROVED,
      eventData,
      order.orderId,
      userId,
      correlationId,
      sessionId,
    );
  }

  /**
   * Emit order rejected event
   */
  async emitOrderRejected(
    order: Order,
    rejectionData: RejectOrderRequest,
    correlationId?: string,
    sessionId?: string,
  ): Promise<void> {
    const eventData: OrderRejectedEventData = {
      orderId: order.orderId,
      orderType: order.orderType,
      priority: order.priority,
      rejectedBy: rejectionData.userId,
      rejectionDate: new Date().toISOString(),
      rejectionReason: rejectionData.rejectionReason,
      ...(order.financials?.totalAmount !== undefined && { estimatedValue: order.financials.totalAmount }),
      canResubmit: true,
      ...(rejectionData.notes && { rejectionNotes: rejectionData.notes }),
    };

    await this.emitEvent(
      OrderEventType.ORDER_REJECTED,
      eventData,
      order.orderId,
      rejectionData.userId,
      correlationId,
      sessionId,
    );
  }

  /**
   * Emit order shipped event
   */
  async emitOrderShipped(
    order: Order,
    shippingData: { trackingNumber?: string; carrier?: string; estimatedDelivery?: string },
    userId: string,
    correlationId?: string,
    sessionId?: string,
  ): Promise<void> {
    const eventData: OrderShippedEventData = {
      orderId: order.orderId,
      orderType: order.orderType,
      shippedDate: new Date().toISOString(),
      ...(shippingData.trackingNumber && { trackingNumber: shippingData.trackingNumber }),
      ...(shippingData.carrier && { carrier: shippingData.carrier }),
      ...(shippingData.estimatedDelivery && { estimatedDeliveryDate: shippingData.estimatedDelivery }),
      ...(order.vendor?.vendorId && { vendorId: order.vendor.vendorId }),
      ...(order.vendor?.vendorName && { vendorName: order.vendor.vendorName }),
      itemCount: order.items.length,
      deliveryAddress: {
        facilityId: order.facilityId,
        ...(order.departmentId && { departmentId: order.departmentId }),
        ...(order.deliveryAddress.room && { room: order.deliveryAddress.room }),
        city: order.deliveryAddress.city,
        state: order.deliveryAddress.state,
      },
    };

    await this.emitEvent(
      OrderEventType.ORDER_SHIPPED,
      eventData,
      order.orderId,
      userId,
      correlationId,
      sessionId,
    );
  }

  /**
   * Emit order received event
   */
  async emitOrderReceived(
    order: Order,
    receivedData: { receivedBy: string; deliveredBy?: string; notes?: string },
    userId: string,
    correlationId?: string,
    sessionId?: string,
  ): Promise<void> {
    const eventData: OrderReceivedEventData = {
      orderId: order.orderId,
      orderType: order.orderType,
      receivedDate: new Date().toISOString(),
      receivedBy: receivedData.receivedBy,
      ...(receivedData.deliveredBy && { deliveredBy: receivedData.deliveredBy }),
      itemsReceived: order.items.map(item => ({
        itemId: item.itemId,
        name: item.name,
        quantityOrdered: item.quantityOrdered,
        quantityReceived: item.quantityReceived || item.quantityOrdered,
        condition: 'good', // Would be determined during receiving process
      })),
      ...(receivedData.notes && { deliveryNotes: receivedData.notes }),
      requiresInspection: this.requiresInspection(order),
    };

    await this.emitEvent(
      OrderEventType.ORDER_RECEIVED,
      eventData,
      order.orderId,
      userId,
      correlationId,
      sessionId,
    );
  }

  /**
   * Emit order fulfilled event
   */
  async emitOrderFulfilled(
    order: Order,
    fulfillmentData: { satisfactionRating?: number; completionNotes?: string },
    userId: string,
    correlationId?: string,
    sessionId?: string,
  ): Promise<void> {
    const eventData: OrderFulfilledEventData = {
      orderId: order.orderId,
      orderType: order.orderType,
      fulfilledDate: new Date().toISOString(),
      fulfilledBy: userId,
      orderDuration: this.calculateOrderDuration(order.createdAt),
      ...(order.vendor?.vendorId && { vendorId: order.vendor.vendorId }),
      ...(order.vendor?.vendorName && { vendorName: order.vendor.vendorName }),
      ...(order.financials?.totalAmount !== undefined && { totalValue: order.financials.totalAmount }),
      itemCount: order.items.length,
      ...(fulfillmentData.satisfactionRating !== undefined && { satisfactionRating: fulfillmentData.satisfactionRating }),
      ...(fulfillmentData.completionNotes && { completionNotes: fulfillmentData.completionNotes }),
    };

    await this.emitEvent(
      OrderEventType.ORDER_FULFILLED,
      eventData,
      order.orderId,
      userId,
      correlationId,
      sessionId,
    );
  }

  /**
   * Emit order returned event
   */
  async emitOrderReturned(
    order: Order,
    returnData: InitiateReturnRequest,
    correlationId?: string,
    sessionId?: string,
  ): Promise<void> {
    const eventData: OrderReturnedEventData = {
      orderId: order.orderId,
      orderType: order.orderType,
      returnInitiatedBy: returnData.userId,
      returnDate: new Date().toISOString(),
      returnReason: returnData.returnReason,
      returnType: returnData.returnType,
      itemsReturned: returnData.returnedItems.map(item => ({
        itemId: item.itemId,
        name: order.items.find(i => i.itemId === item.itemId)?.name || 'Unknown',
        quantityReturned: item.quantityReturned,
        condition: item.condition,
      })),
      vendorNotified: true, // Would be set by business logic
      refundExpected: true,
      replacementRequired: returnData.returnType === 'damaged' || returnData.returnType === 'wrong_item',
    };

    await this.emitEvent(
      OrderEventType.ORDER_RETURNED,
      eventData,
      order.orderId,
      returnData.userId,
      correlationId,
      sessionId,
    );
  }

  /**
   * Core event emission method
   */
  private async emitEvent(
    eventType: OrderEventType,
    eventData: OrderEventData,
    resourceId: string,
    userId: string,
    correlationId?: string,
    sessionId?: string,
  ): Promise<void> {
    try {
      const eventId = correlationId || this.generateCorrelationId();
      const metadata: OrderEventMetadata = {
        facilityId: this.config.facilityId,
        ...(this.config.facilityName && { facilityName: this.config.facilityName }),
        ...(this.config.departmentId && { departmentId: this.config.departmentId }),
        ...(this.config.departmentName && { departmentName: this.config.departmentName }),
        userId,
        correlationId: eventId,
        ...(sessionId && { sessionId }),
        service: 'orders-service',
        containsPII: false, // Orders don't contain PII/PHI
        dataClassification: 'internal',
        eventVersion: '1.0',
      };

      const cloudEvent: OrderCloudEvent = {
        specversion: '1.0',
        type: eventType,
        source: 'urn:smile:orders-service',
        id: eventId,
        time: new Date().toISOString(),
        datacontenttype: 'application/json',
        subject: `order/${resourceId}`,
        data: {
          eventData,
          metadata,
        },
      };

      // Get the routing key from ORDER_EVENT_ROUTING configuration
      const routingConfig = ORDER_EVENT_ROUTING[eventType];
      const routingKey = routingConfig?.routingKey;

      await this.eventEmitter.emit(cloudEvent as any, routingKey);

      logger.info('Order event emitted successfully', {
        eventType,
        orderId: resourceId,
        correlationId: eventId,
        userId,
        routingKey,
      });

    } catch (error: any) {
      logger.error('Failed to emit order event', {
        eventType,
        orderId: resourceId,
        error,
        userId,
      });
      throw error;
    }
  }

  /**
   * Generate correlation ID for event tracking
   */
  private generateCorrelationId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `order-${timestamp}-${random}`;
  }

  /**
   * Extract updated values from order for change tracking
   */
  private extractUpdatedValues(order: Order, updatedFields: string[]): Record<string, any> {
    const values: Record<string, any> = {};
    updatedFields.forEach(field => {
      if (field in order) {
        values[field] = (order as any)[field];
      }
    });
    return values;
  }

  /**
   * Calculate order age in hours
   */
  private calculateOrderAge(createdAt: string): number {
    const created = new Date(createdAt);
    const now = new Date();
    return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60));
  }

  /**
   * Calculate order duration in days
   */
  private calculateOrderDuration(createdAt: string): number {
    const created = new Date(createdAt);
    const now = new Date();
    return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  }

  /**
   * Determine if order requires inspection upon receipt
   */
  private requiresInspection(order: Order): boolean {
    // Business logic: medicines and equipment require inspection
    return order.orderType === 'medicine' || order.orderType === 'equipment';
  }
}