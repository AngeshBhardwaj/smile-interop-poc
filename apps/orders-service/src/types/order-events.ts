/**
 * Order CloudEvent Definitions
 *
 * Event types and schemas for order lifecycle events.
 * These events are emitted to RabbitMQ for downstream processing.
 */

import { OrderStatus, OrderType, OrderPriority } from './order-status';

/**
 * Order event types following domain.action pattern
 */
export enum OrderEventType {
  // Core lifecycle events
  ORDER_CREATED = 'order.created',
  ORDER_UPDATED = 'order.updated',
  ORDER_DELETED = 'order.deleted',

  // State transition events
  ORDER_SUBMITTED = 'order.submitted',
  ORDER_APPROVED = 'order.approved',
  ORDER_REJECTED = 'order.rejected',
  ORDER_PACKED = 'order.packed',
  ORDER_SHIPPED = 'order.shipped',
  ORDER_RECEIVED = 'order.received',
  ORDER_FULFILLED = 'order.fulfilled',

  // Return process events
  ORDER_RETURNED = 'order.returned',
  ORDER_RETURN_COMPLETED = 'order.return_completed',

  // Business events
  ORDER_OVERDUE = 'order.overdue',
  ORDER_URGENT_REMINDER = 'order.urgent_reminder',
  ORDER_BUDGET_EXCEEDED = 'order.budget_exceeded'
}

/**
 * Base event metadata for all order events
 */
export interface OrderEventMetadata {
  facilityId: string;
  facilityName?: string;
  departmentId?: string;
  departmentName?: string;
  userId: string;
  userName?: string;
  correlationId: string;
  sessionId?: string;
  service: 'orders-service';
  containsPII: boolean;
  dataClassification: 'public' | 'internal' | 'confidential';
  eventVersion: string;
  processingHints?: {
    priority?: OrderPriority;
    requiresApproval?: boolean;
    notificationRequired?: boolean;
  };
}

/**
 * Order creation event data
 */
export interface OrderCreatedEventData {
  orderId: string;
  orderType: OrderType;
  priority: OrderPriority;
  status: OrderStatus;
  requestedBy: string;
  requiredDate: string;
  itemCount: number;
  estimatedValue?: number;
  vendorId?: string;
  vendorName?: string;
  deliveryLocation: {
    facilityId: string;
    departmentId?: string;
    room?: string;
  };
  tags?: string[];
}

/**
 * Order state transition event data
 */
export interface OrderStateTransitionEventData {
  orderId: string;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  transitionedBy: string;
  transitionDate: string;
  reason?: string;
  notes?: string;
  orderType: OrderType;
  priority: OrderPriority;
  itemCount: number;
  estimatedValue?: number;
  vendorId?: string;
}

/**
 * Order update event data
 */
export interface OrderUpdatedEventData {
  orderId: string;
  orderType: OrderType;
  priority: OrderPriority;
  status: OrderStatus;
  updatedBy: string;
  updatedFields: string[];
  previousValues?: Record<string, any>;
  newValues?: Record<string, any>;
  itemsAdded?: number;
  itemsRemoved?: number;
  itemsModified?: number;
}

/**
 * Order deletion event data
 */
export interface OrderDeletedEventData {
  orderId: string;
  orderType: OrderType;
  status: OrderStatus;
  deletedBy: string;
  deletionReason?: string;
  itemCount: number;
  orderAge: number; // hours since creation
}

/**
 * Order approval event data
 */
export interface OrderApprovedEventData {
  orderId: string;
  orderType: OrderType;
  priority: OrderPriority;
  approvedBy: string;
  approvalDate: string;
  estimatedValue?: number;
  vendorId?: string;
  vendorName?: string;
  estimatedDeliveryDate?: string;
  approvalNotes?: string;
}

/**
 * Order rejection event data
 */
export interface OrderRejectedEventData {
  orderId: string;
  orderType: OrderType;
  priority: OrderPriority;
  rejectedBy: string;
  rejectionDate: string;
  rejectionReason: string;
  estimatedValue?: number;
  canResubmit: boolean;
  rejectionNotes?: string;
}

/**
 * Order shipping event data
 */
export interface OrderShippedEventData {
  orderId: string;
  orderType: OrderType;
  shippedDate: string;
  trackingNumber?: string;
  carrier?: string;
  estimatedDeliveryDate?: string;
  vendorId?: string;
  vendorName?: string;
  itemCount: number;
  deliveryAddress: {
    facilityId: string;
    departmentId?: string;
    room?: string;
    city: string;
    state: string;
  };
}

/**
 * Order received event data
 */
export interface OrderReceivedEventData {
  orderId: string;
  orderType: OrderType;
  receivedDate: string;
  receivedBy: string;
  deliveredBy?: string;
  itemsReceived: {
    itemId: string;
    name: string;
    quantityOrdered: number;
    quantityReceived: number;
    condition: 'good' | 'damaged' | 'partial';
  }[];
  deliveryNotes?: string;
  requiresInspection?: boolean;
}

/**
 * Order return event data
 */
export interface OrderReturnedEventData {
  orderId: string;
  orderType: OrderType;
  returnInitiatedBy: string;
  returnDate: string;
  returnReason: string;
  returnType: 'damaged' | 'wrong_item' | 'quality_issue' | 'not_needed' | 'expired';
  itemsReturned: {
    itemId: string;
    name: string;
    quantityReturned: number;
    condition: string;
  }[];
  vendorNotified: boolean;
  refundExpected?: boolean;
  replacementRequired?: boolean;
}

/**
 * Order fulfilled event data
 */
export interface OrderFulfilledEventData {
  orderId: string;
  orderType: OrderType;
  fulfilledDate: string;
  fulfilledBy: string;
  orderDuration: number; // days from creation to fulfillment
  vendorId?: string;
  vendorName?: string;
  totalValue?: number;
  itemCount: number;
  satisfactionRating?: number;
  completionNotes?: string;
}

/**
 * Business alert event data
 */
export interface OrderOverdueEventData {
  orderId: string;
  orderType: OrderType;
  priority: OrderPriority;
  status: OrderStatus;
  daysPastDue: number;
  requiredDate: string;
  requestedBy: string;
  vendorId?: string;
  estimatedValue?: number;
  escalationLevel: 'warning' | 'alert' | 'critical';
}

/**
 * Union type for all order event data
 */
export type OrderEventData =
  | OrderCreatedEventData
  | OrderStateTransitionEventData
  | OrderUpdatedEventData
  | OrderDeletedEventData
  | OrderApprovedEventData
  | OrderRejectedEventData
  | OrderShippedEventData
  | OrderReceivedEventData
  | OrderReturnedEventData
  | OrderFulfilledEventData
  | OrderOverdueEventData;

/**
 * Complete CloudEvent wrapper for order events
 */
export interface OrderCloudEvent {
  specversion: '1.0';
  type: OrderEventType;
  source: 'urn:smile:orders-service';
  id: string;
  time: string;
  datacontenttype: 'application/json';
  subject: string; // order/{orderId}
  data: {
    eventData: OrderEventData;
    metadata: OrderEventMetadata;
  };
}

/**
 * Event routing configuration
 */
export interface OrderEventRouting {
  eventType: OrderEventType;
  routingKey: string;
  exchange: string;
  priority?: number;
  deliveryMode?: 1 | 2; // 1 = non-persistent, 2 = persistent
  expiration?: number; // TTL in milliseconds
}

/**
 * Default routing configuration for order events
 */
export const ORDER_EVENT_ROUTING: Record<OrderEventType, OrderEventRouting> = {
  [OrderEventType.ORDER_CREATED]: {
    eventType: OrderEventType.ORDER_CREATED,
    routingKey: 'orders.lifecycle.created',
    exchange: 'orders.events',
    priority: 5,
    deliveryMode: 2,
  },
  [OrderEventType.ORDER_UPDATED]: {
    eventType: OrderEventType.ORDER_UPDATED,
    routingKey: 'orders.lifecycle.updated',
    exchange: 'orders.events',
    priority: 3,
    deliveryMode: 2,
  },
  [OrderEventType.ORDER_DELETED]: {
    eventType: OrderEventType.ORDER_DELETED,
    routingKey: 'orders.lifecycle.deleted',
    exchange: 'orders.events',
    priority: 4,
    deliveryMode: 2,
  },
  [OrderEventType.ORDER_SUBMITTED]: {
    eventType: OrderEventType.ORDER_SUBMITTED,
    routingKey: 'orders.workflow.submitted',
    exchange: 'orders.events',
    priority: 6,
    deliveryMode: 2,
  },
  [OrderEventType.ORDER_APPROVED]: {
    eventType: OrderEventType.ORDER_APPROVED,
    routingKey: 'orders.workflow.approved',
    exchange: 'orders.events',
    priority: 7,
    deliveryMode: 2,
  },
  [OrderEventType.ORDER_REJECTED]: {
    eventType: OrderEventType.ORDER_REJECTED,
    routingKey: 'orders.workflow.rejected',
    exchange: 'orders.events',
    priority: 6,
    deliveryMode: 2,
  },
  [OrderEventType.ORDER_PACKED]: {
    eventType: OrderEventType.ORDER_PACKED,
    routingKey: 'orders.fulfillment.packed',
    exchange: 'orders.events',
    priority: 5,
    deliveryMode: 2,
  },
  [OrderEventType.ORDER_SHIPPED]: {
    eventType: OrderEventType.ORDER_SHIPPED,
    routingKey: 'orders.fulfillment.shipped',
    exchange: 'orders.events',
    priority: 7,
    deliveryMode: 2,
  },
  [OrderEventType.ORDER_RECEIVED]: {
    eventType: OrderEventType.ORDER_RECEIVED,
    routingKey: 'orders.fulfillment.received',
    exchange: 'orders.events',
    priority: 6,
    deliveryMode: 2,
  },
  [OrderEventType.ORDER_FULFILLED]: {
    eventType: OrderEventType.ORDER_FULFILLED,
    routingKey: 'orders.fulfillment.fulfilled',
    exchange: 'orders.events',
    priority: 5,
    deliveryMode: 2,
  },
  [OrderEventType.ORDER_RETURNED]: {
    eventType: OrderEventType.ORDER_RETURNED,
    routingKey: 'orders.returns.initiated',
    exchange: 'orders.events',
    priority: 7,
    deliveryMode: 2,
  },
  [OrderEventType.ORDER_RETURN_COMPLETED]: {
    eventType: OrderEventType.ORDER_RETURN_COMPLETED,
    routingKey: 'orders.returns.completed',
    exchange: 'orders.events',
    priority: 5,
    deliveryMode: 2,
  },
  [OrderEventType.ORDER_OVERDUE]: {
    eventType: OrderEventType.ORDER_OVERDUE,
    routingKey: 'orders.alerts.overdue',
    exchange: 'orders.events',
    priority: 8,
    deliveryMode: 2,
  },
  [OrderEventType.ORDER_URGENT_REMINDER]: {
    eventType: OrderEventType.ORDER_URGENT_REMINDER,
    routingKey: 'orders.alerts.urgent',
    exchange: 'orders.events',
    priority: 9,
    deliveryMode: 2,
  },
  [OrderEventType.ORDER_BUDGET_EXCEEDED]: {
    eventType: OrderEventType.ORDER_BUDGET_EXCEEDED,
    routingKey: 'orders.alerts.budget',
    exchange: 'orders.events',
    priority: 8,
    deliveryMode: 2,
  },
};