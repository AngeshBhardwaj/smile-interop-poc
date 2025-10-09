/**
 * Order Service
 *
 * Core business logic for order lifecycle management.
 * Handles CRUD operations, state transitions, and business rule enforcement.
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '@smile/common';
import {
  Order,
  CreateOrderRequest,
  UpdateOrderRequest,
  OrderFilters,
  RejectOrderRequest,
  InitiateReturnRequest,
  OrderItem,
  StatusChange
} from '../types/order-types';
import {
  OrderStatus,
  isValidTransition,
  canEditOrder,
  canDeleteOrder,
  getNextStates
} from '../types/order-status';
import { OrderEventService } from './order-event.service';

/**
 * Error types for order operations
 */
export class OrderError extends Error {
  constructor(message: string, public code: string, public statusCode: number = 400) {
    super(message);
    this.name = 'OrderError';
  }
}

export class OrderNotFoundError extends OrderError {
  constructor(orderId: string) {
    super(`Order not found: ${orderId}`, 'ORDER_NOT_FOUND', 404);
  }
}

export class InvalidStateTransitionError extends OrderError {
  constructor(fromStatus: OrderStatus, toStatus: OrderStatus) {
    super(
      `Invalid state transition from ${fromStatus} to ${toStatus}`,
      'INVALID_STATE_TRANSITION',
      422
    );
  }
}

export class OrderNotEditableError extends OrderError {
  constructor(orderId: string, status: OrderStatus) {
    super(
      `Order ${orderId} cannot be edited in ${status} state`,
      'ORDER_NOT_EDITABLE',
      422
    );
  }
}

/**
 * In-memory storage for demonstration purposes
 * In production, this would be replaced with a database
 */
class OrderRepository {
  private orders: Map<string, Order> = new Map();

  async create(order: Order): Promise<Order> {
    this.orders.set(order.orderId, order);
    return order;
  }

  async findById(orderId: string): Promise<Order | null> {
    return this.orders.get(orderId) || null;
  }

  async update(orderId: string, order: Order): Promise<Order> {
    this.orders.set(orderId, order);
    return order;
  }

  async delete(orderId: string): Promise<boolean> {
    return this.orders.delete(orderId);
  }

  async findMany(filters: OrderFilters): Promise<{ orders: Order[]; total: number }> {
    let filteredOrders = Array.from(this.orders.values());

    // Apply filters
    if (filters.facilityId) {
      filteredOrders = filteredOrders.filter(o => o.facilityId === filters.facilityId);
    }
    if (filters.departmentId) {
      filteredOrders = filteredOrders.filter(o => o.departmentId === filters.departmentId);
    }
    if (filters.orderType) {
      filteredOrders = filteredOrders.filter(o => o.orderType === filters.orderType);
    }
    if (filters.status) {
      filteredOrders = filteredOrders.filter(o => o.status === filters.status);
    }
    if (filters.priority) {
      filteredOrders = filteredOrders.filter(o => o.priority === filters.priority);
    }
    if (filters.requestedBy) {
      filteredOrders = filteredOrders.filter(o => o.requestedBy === filters.requestedBy);
    }
    if (filters.vendorId) {
      filteredOrders = filteredOrders.filter(o => o.vendor?.vendorId === filters.vendorId);
    }
    if (filters.dateFrom) {
      filteredOrders = filteredOrders.filter(o => o.createdAt >= filters.dateFrom!);
    }
    if (filters.dateTo) {
      filteredOrders = filteredOrders.filter(o => o.createdAt <= filters.dateTo!);
    }
    if (filters.tags && filters.tags.length > 0) {
      filteredOrders = filteredOrders.filter(o =>
        o.tags?.some(tag => filters.tags!.includes(tag))
      );
    }

    // Sort
    if (filters.sortBy) {
      filteredOrders.sort((a, b) => {
        const aValue = (a as any)[filters.sortBy!];
        const bValue = (b as any)[filters.sortBy!];
        const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        return filters.sortOrder === 'desc' ? -comparison : comparison;
      });
    }

    const total = filteredOrders.length;

    // Pagination
    if (filters.offset) {
      filteredOrders = filteredOrders.slice(filters.offset);
    }
    if (filters.limit) {
      filteredOrders = filteredOrders.slice(0, filters.limit);
    }

    return { orders: filteredOrders, total };
  }
}

export class OrderService {
  private repository: OrderRepository;
  private eventService: OrderEventService;

  constructor(eventService: OrderEventService) {
    this.repository = new OrderRepository();
    this.eventService = eventService;
  }

  /**
   * Create a new order
   */
  async createOrder(
    request: CreateOrderRequest,
    userId: string,
    correlationId?: string,
    sessionId?: string
  ): Promise<Order> {
    try {
      const orderId = uuidv4();
      const now = new Date().toISOString();

      // Generate order items with IDs
      const items: OrderItem[] = request.items.map(item => ({
        ...item,
        itemId: uuidv4()
      }));

      // Create initial status change
      const initialStatusChange: StatusChange = {
        fromStatus: OrderStatus.DRAFT,
        toStatus: OrderStatus.DRAFT,
        changedBy: userId,
        changedAt: now,
        reason: 'Order created'
      };

      const order: Order = {
        orderId,
        facilityId: request.facilityId,
        ...(request.departmentId && { departmentId: request.departmentId }),
        orderType: request.orderType,
        priority: request.priority,
        status: OrderStatus.DRAFT,
        requestedBy: request.requestedBy,
        requestedDate: now,
        requiredDate: request.requiredDate,
        items,
        ...(request.vendor && { vendor: { ...request.vendor, vendorId: uuidv4() } }),
        deliveryAddress: request.deliveryAddress,
        statusHistory: [initialStatusChange],
        ...(request.notes && { notes: request.notes }),
        ...(request.tags && { tags: request.tags }),
        ...(request.customFields && { customFields: request.customFields }),
        createdAt: now,
        updatedAt: now,
        lastModifiedBy: userId
      };

      const createdOrder = await this.repository.create(order);

      // Emit creation event
      await this.eventService.emitOrderCreated(
        createdOrder,
        userId,
        correlationId,
        sessionId
      );

      logger.info('Order created successfully', {
        orderId,
        orderType: request.orderType,
        priority: request.priority,
        userId
      });

      return createdOrder;

    } catch (error: any) {
      logger.error('Failed to create order', { error, userId });
      throw error;
    }
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId: string): Promise<Order> {
    const order = await this.repository.findById(orderId);
    if (!order) {
      throw new OrderNotFoundError(orderId);
    }
    return order;
  }

  /**
   * Update an existing order
   */
  async updateOrder(
    orderId: string,
    request: UpdateOrderRequest,
    userId: string,
    correlationId?: string,
    sessionId?: string
  ): Promise<Order> {
    try {
      const existingOrder = await this.getOrder(orderId);

      // Check if order can be edited
      if (!canEditOrder(existingOrder.status)) {
        throw new OrderNotEditableError(orderId, existingOrder.status);
      }

      // Track changes
      const updatedFields: string[] = [];
      const previousValues: Record<string, any> = {};

      // Update fields and track changes
      if (request.orderType && request.orderType !== existingOrder.orderType) {
        updatedFields.push('orderType');
        previousValues.orderType = existingOrder.orderType;
        existingOrder.orderType = request.orderType;
      }

      if (request.priority && request.priority !== existingOrder.priority) {
        updatedFields.push('priority');
        previousValues.priority = existingOrder.priority;
        existingOrder.priority = request.priority;
      }

      if (request.requiredDate && request.requiredDate !== existingOrder.requiredDate) {
        updatedFields.push('requiredDate');
        previousValues.requiredDate = existingOrder.requiredDate;
        existingOrder.requiredDate = request.requiredDate;
      }

      if (request.items) {
        updatedFields.push('items');
        previousValues.items = existingOrder.items;
        existingOrder.items = request.items.map(item => ({
          ...item,
          itemId: uuidv4()
        }));
      }

      if (request.vendor) {
        updatedFields.push('vendor');
        previousValues.vendor = existingOrder.vendor;
        existingOrder.vendor = { ...request.vendor, vendorId: uuidv4() };
      }

      if (request.deliveryAddress) {
        updatedFields.push('deliveryAddress');
        previousValues.deliveryAddress = existingOrder.deliveryAddress;
        existingOrder.deliveryAddress = request.deliveryAddress;
      }

      if (request.notes !== undefined) {
        updatedFields.push('notes');
        previousValues.notes = existingOrder.notes;
        existingOrder.notes = request.notes;
      }

      if (request.tags) {
        updatedFields.push('tags');
        previousValues.tags = existingOrder.tags;
        existingOrder.tags = request.tags;
      }

      if (request.customFields) {
        updatedFields.push('customFields');
        previousValues.customFields = existingOrder.customFields;
        existingOrder.customFields = request.customFields;
      }

      // Update metadata
      existingOrder.updatedAt = new Date().toISOString();
      existingOrder.lastModifiedBy = userId;

      const updatedOrder = await this.repository.update(orderId, existingOrder);

      // Emit update event if changes were made
      if (updatedFields.length > 0) {
        await this.eventService.emitOrderUpdated(
          updatedOrder,
          updatedFields,
          previousValues,
          userId,
          correlationId,
          sessionId
        );

        logger.info('Order updated successfully', {
          orderId,
          updatedFields,
          userId
        });
      }

      return updatedOrder;

    } catch (error: any) {
      logger.error('Failed to update order', { error, orderId, userId });
      throw error;
    }
  }

  /**
   * Delete an order
   */
  async deleteOrder(
    orderId: string,
    deletionReason: string,
    userId: string,
    correlationId?: string,
    sessionId?: string
  ): Promise<void> {
    try {
      const order = await this.getOrder(orderId);

      // Check if order can be deleted
      if (!canDeleteOrder(order.status)) {
        throw new OrderError(
          `Order ${orderId} cannot be deleted in ${order.status} state`,
          'ORDER_NOT_DELETABLE',
          422
        );
      }

      // Emit deletion event before deleting
      await this.eventService.emitOrderDeleted(
        order,
        deletionReason,
        userId,
        correlationId,
        sessionId
      );

      await this.repository.delete(orderId);

      logger.info('Order deleted successfully', {
        orderId,
        deletionReason,
        userId
      });

    } catch (error: any) {
      logger.error('Failed to delete order', { error, orderId, userId });
      throw error;
    }
  }

  /**
   * List orders with filtering
   */
  async listOrders(filters: OrderFilters): Promise<{ orders: Order[]; total: number }> {
    try {
      return await this.repository.findMany(filters);
    } catch (error: any) {
      logger.error('Failed to list orders', { error, filters });
      throw error;
    }
  }

  /**
   * Submit order for approval
   */
  async submitOrder(
    orderId: string,
    userId: string,
    correlationId?: string,
    sessionId?: string
  ): Promise<Order> {
    return this.transitionOrderState(
      orderId,
      OrderStatus.SUBMITTED,
      'Submitted for approval',
      userId,
      correlationId,
      sessionId
    );
  }

  /**
   * Approve order
   */
  async approveOrder(
    orderId: string,
    notes: string,
    userId: string,
    correlationId?: string,
    sessionId?: string
  ): Promise<Order> {
    const order = await this.transitionOrderState(
      orderId,
      OrderStatus.APPROVED,
      'Order approved',
      userId,
      correlationId,
      sessionId
    );

    // Emit approval event with additional data
    await this.eventService.emitOrderApproved(
      order,
      {
        approvedBy: userId,
        approvalDate: new Date().toISOString(),
        notes
      },
      userId,
      correlationId,
      sessionId
    );

    return order;
  }

  /**
   * Reject order
   */
  async rejectOrder(
    orderId: string,
    rejectionData: RejectOrderRequest,
    correlationId?: string,
    sessionId?: string
  ): Promise<Order> {
    const order = await this.getOrder(orderId);

    // Validate transition
    if (!isValidTransition(order.status, OrderStatus.REJECTED)) {
      throw new InvalidStateTransitionError(order.status, OrderStatus.REJECTED);
    }

    // Update order status and add rejection details
    order.status = OrderStatus.REJECTED;
    order.rejectedBy = rejectionData.userId;
    order.rejectionDate = new Date().toISOString();
    order.rejectionReason = rejectionData.rejectionReason;
    order.updatedAt = new Date().toISOString();
    order.lastModifiedBy = rejectionData.userId;

    // Add status change
    const statusChange: StatusChange = {
      fromStatus: order.statusHistory[order.statusHistory.length - 1]?.toStatus || order.status,
      toStatus: OrderStatus.REJECTED,
      changedBy: rejectionData.userId,
      changedAt: new Date().toISOString(),
      reason: rejectionData.rejectionReason,
      ...(rejectionData.notes && { notes: rejectionData.notes })
    };
    order.statusHistory.push(statusChange);

    const updatedOrder = await this.repository.update(orderId, order);

    // Emit rejection event
    await this.eventService.emitOrderRejected(
      updatedOrder,
      rejectionData,
      correlationId,
      sessionId
    );

    // Automatically transition back to DRAFT for editing
    await this.transitionOrderState(
      orderId,
      OrderStatus.DRAFT,
      'Returned to draft for editing after rejection',
      rejectionData.userId,
      correlationId,
      sessionId
    );

    return updatedOrder;
  }

  /**
   * Mark order as packed
   */
  async packOrder(
    orderId: string,
    userId: string,
    correlationId?: string,
    sessionId?: string
  ): Promise<Order> {
    return this.transitionOrderState(
      orderId,
      OrderStatus.PACKED,
      'Order packed and ready for shipping',
      userId,
      correlationId,
      sessionId
    );
  }

  /**
   * Mark order as shipped
   */
  async shipOrder(
    orderId: string,
    shippingData: { trackingNumber?: string; carrier?: string; estimatedDelivery?: string },
    userId: string,
    correlationId?: string,
    sessionId?: string
  ): Promise<Order> {
    const order = await this.transitionOrderState(
      orderId,
      OrderStatus.SHIPPED,
      'Order shipped',
      userId,
      correlationId,
      sessionId
    );

    // Update delivery info
    order.deliveryInfo = {
      ...order.deliveryInfo,
      ...(shippingData.trackingNumber && { trackingNumber: shippingData.trackingNumber }),
      ...(shippingData.carrier && { carrier: shippingData.carrier }),
      ...(shippingData.estimatedDelivery && { estimatedDeliveryDate: shippingData.estimatedDelivery })
    };
    order.updatedAt = new Date().toISOString();

    const updatedOrder = await this.repository.update(orderId, order);

    // Emit shipping event
    await this.eventService.emitOrderShipped(
      updatedOrder,
      shippingData,
      userId,
      correlationId,
      sessionId
    );

    return updatedOrder;
  }

  /**
   * Mark order as received
   */
  async receiveOrder(
    orderId: string,
    receivedData: { receivedBy: string; deliveredBy?: string; notes?: string },
    userId: string,
    correlationId?: string,
    sessionId?: string
  ): Promise<Order> {
    const order = await this.transitionOrderState(
      orderId,
      OrderStatus.RECEIVED,
      'Order received',
      userId,
      correlationId,
      sessionId
    );

    // Update delivery info
    order.deliveryInfo = {
      ...order.deliveryInfo,
      actualDeliveryDate: new Date().toISOString(),
      ...(receivedData.deliveredBy && { deliveredBy: receivedData.deliveredBy }),
      receivedBy: receivedData.receivedBy,
      ...(receivedData.notes && { deliveryNotes: receivedData.notes })
    };
    order.updatedAt = new Date().toISOString();

    const updatedOrder = await this.repository.update(orderId, order);

    // Emit received event
    await this.eventService.emitOrderReceived(
      updatedOrder,
      receivedData,
      userId,
      correlationId,
      sessionId
    );

    return updatedOrder;
  }

  /**
   * Mark order as fulfilled
   */
  async fulfillOrder(
    orderId: string,
    fulfillmentData: { satisfactionRating?: number; completionNotes?: string },
    userId: string,
    correlationId?: string,
    sessionId?: string
  ): Promise<Order> {
    const order = await this.transitionOrderState(
      orderId,
      OrderStatus.FULFILLED,
      'Order fulfilled',
      userId,
      correlationId,
      sessionId
    );

    // Emit fulfillment event
    await this.eventService.emitOrderFulfilled(
      order,
      fulfillmentData,
      userId,
      correlationId,
      sessionId
    );

    return order;
  }

  /**
   * Initiate order return
   */
  async returnOrder(
    orderId: string,
    returnData: InitiateReturnRequest,
    correlationId?: string,
    sessionId?: string
  ): Promise<Order> {
    const order = await this.getOrder(orderId);

    // Validate transition
    if (!isValidTransition(order.status, OrderStatus.RETURNED)) {
      throw new InvalidStateTransitionError(order.status, OrderStatus.RETURNED);
    }

    // Update order with return information
    order.status = OrderStatus.RETURNED;
    order.returnInfo = {
      returnReason: returnData.returnReason,
      returnInitiatedBy: returnData.userId,
      returnDate: new Date().toISOString(),
      returnType: returnData.returnType,
      returnedItems: returnData.returnedItems
    };
    order.updatedAt = new Date().toISOString();
    order.lastModifiedBy = returnData.userId;

    // Add status change
    const statusChange: StatusChange = {
      fromStatus: order.statusHistory[order.statusHistory.length - 1]?.toStatus || order.status,
      toStatus: OrderStatus.RETURNED,
      changedBy: returnData.userId,
      changedAt: new Date().toISOString(),
      reason: returnData.returnReason,
      ...(returnData.notes && { notes: returnData.notes })
    };
    order.statusHistory.push(statusChange);

    const updatedOrder = await this.repository.update(orderId, order);

    // Emit return event
    await this.eventService.emitOrderReturned(
      updatedOrder,
      returnData,
      correlationId,
      sessionId
    );

    return updatedOrder;
  }

  /**
   * Complete order return
   */
  async completeReturn(
    orderId: string,
    userId: string,
    correlationId?: string,
    sessionId?: string
  ): Promise<Order> {
    return this.transitionOrderState(
      orderId,
      OrderStatus.RETURN_COMPLETE,
      'Return processing completed',
      userId,
      correlationId,
      sessionId
    );
  }

  /**
   * Get next available states for an order
   */
  getNextStates(order: Order): OrderStatus[] {
    return getNextStates(order.status);
  }

  /**
   * Generic state transition method
   */
  private async transitionOrderState(
    orderId: string,
    newStatus: OrderStatus,
    reason: string,
    userId: string,
    correlationId?: string,
    sessionId?: string
  ): Promise<Order> {
    try {
      const order = await this.getOrder(orderId);

      // Validate transition
      if (!isValidTransition(order.status, newStatus)) {
        throw new InvalidStateTransitionError(order.status, newStatus);
      }

      const previousStatus = order.status;
      order.status = newStatus;
      order.updatedAt = new Date().toISOString();
      order.lastModifiedBy = userId;

      // Add status change to history
      const statusChange: StatusChange = {
        fromStatus: previousStatus,
        toStatus: newStatus,
        changedBy: userId,
        changedAt: new Date().toISOString(),
        reason
      };
      order.statusHistory.push(statusChange);

      const updatedOrder = await this.repository.update(orderId, order);

      // Emit appropriate event based on new status
      switch (newStatus) {
        case OrderStatus.SUBMITTED:
          await this.eventService.emitOrderSubmitted(
            updatedOrder,
            userId,
            correlationId,
            sessionId
          );
          break;
        // Other specific events are handled by their dedicated methods
      }

      logger.info('Order state transition completed', {
        orderId,
        fromStatus: previousStatus,
        toStatus: newStatus,
        userId
      });

      return updatedOrder;

    } catch (error: any) {
      logger.error('Failed to transition order state', {
        error,
        orderId,
        newStatus,
        userId
      });
      throw error;
    }
  }
}