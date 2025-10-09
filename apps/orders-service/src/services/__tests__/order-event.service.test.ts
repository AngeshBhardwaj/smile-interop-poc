/**
 * Order Event Service Unit Tests
 *
 * Tests for CloudEvents emission for order lifecycle events
 */

import { OrderEventService, OrderEventServiceConfig } from '../order-event.service';
import { EventEmitter } from '@smile/cloud-events';
import { OrderEventType } from '../../types/order-events';
import { Order } from '../../types/order-types';
import { OrderStatus, OrderType, OrderPriority } from '../../types/order-status';

// Mock dependencies
jest.mock('@smile/cloud-events');
jest.mock('@smile/common', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

describe('OrderEventService', () => {
  let service: OrderEventService;
  let mockEventEmitter: jest.Mocked<EventEmitter>;
  let config: OrderEventServiceConfig;

  // Sample order for testing
  const sampleOrder: Order = {
    orderId: 'order-123',
    facilityId: 'facility-001',
    departmentId: 'dept-001',
    orderType: OrderType.MEDICINE,
    priority: OrderPriority.HIGH,
    status: OrderStatus.DRAFT,
    requestedBy: 'user-123',
    requestedDate: '2025-10-09T10:00:00Z',
    requiredDate: '2025-10-16T10:00:00Z',
    items: [
      {
        itemId: 'item-001',
        name: 'Paracetamol 500mg',
        category: 'Pharmaceuticals',
        unitOfMeasure: 'box',
        quantityOrdered: 10,
        unitPrice: 5.99,
        totalPrice: 59.90
      }
    ],
    vendor: {
      vendorId: 'vendor-001',
      vendorName: 'Medical Supplies Inc'
    },
    deliveryAddress: {
      street: '123 Hospital Drive',
      city: 'Medical City',
      state: 'CA',
      zipCode: '90210',
      country: 'USA',
      room: 'Pharmacy Storage'
    },
    statusHistory: [
      {
        fromStatus: OrderStatus.DRAFT,
        toStatus: OrderStatus.DRAFT,
        changedBy: 'user-123',
        changedAt: '2025-10-09T10:00:00Z',
        reason: 'Order created'
      }
    ],
    createdAt: '2025-10-09T10:00:00Z',
    updatedAt: '2025-10-09T10:00:00Z',
    lastModifiedBy: 'user-123',
    tags: ['urgent', 'medical'],
    financials: {
      subtotal: 59.90,
      currency: 'USD',
      totalAmount: 59.90
    }
  };

  beforeEach(() => {
    // Create mock event emitter
    mockEventEmitter = {
      connect: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined)
    } as any;

    // Mock EventEmitter constructor
    (EventEmitter as jest.MockedClass<typeof EventEmitter>).mockImplementation(() => mockEventEmitter);

    config = {
      rabbitmqUrl: 'amqp://test:test@localhost:5672',
      exchange: 'orders.events',
      facilityId: 'facility-001',
      facilityName: 'Test Hospital',
      departmentId: 'dept-001',
      departmentName: 'Emergency Department'
    };

    service = new OrderEventService(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await service.initialize();

      expect(mockEventEmitter.connect).toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      mockEventEmitter.connect.mockRejectedValue(new Error('Connection failed'));

      await expect(service.initialize()).rejects.toThrow('Connection failed');
    });
  });

  describe('close', () => {
    it('should close successfully', async () => {
      await service.close();

      expect(mockEventEmitter.close).toHaveBeenCalled();
    });

    it('should handle close errors gracefully', async () => {
      mockEventEmitter.close.mockRejectedValue(new Error('Close failed'));

      await expect(service.close()).resolves.not.toThrow();
    });
  });

  describe('emitOrderCreated', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should emit order created event successfully', async () => {
      await service.emitOrderCreated(sampleOrder, 'user-123', 'corr-123', 'sess-123');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          specversion: '1.0',
          type: OrderEventType.ORDER_CREATED,
          source: 'smile.orders-service',
          id: 'corr-123',
          subject: 'order/order-123',
          datacontenttype: 'application/json',
          time: expect.any(String)
        })
      );
    });

    it('should include order details in event data', async () => {
      await service.emitOrderCreated(sampleOrder, 'user-123', 'corr-123');

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      expect(emittedEvent.data.eventData).toEqual(
        expect.objectContaining({
          orderId: 'order-123',
          orderType: OrderType.MEDICINE,
          priority: OrderPriority.HIGH,
          status: OrderStatus.DRAFT,
          requestedBy: 'user-123',
          requiredDate: '2025-10-16T10:00:00Z',
          itemCount: 1,
          estimatedValue: 59.90,
          vendorId: 'vendor-001',
          vendorName: 'Medical Supplies Inc',
          tags: ['urgent', 'medical']
        })
      );
    });

    it('should include metadata in event', async () => {
      await service.emitOrderCreated(sampleOrder, 'user-123', 'corr-123', 'sess-123');

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      expect(emittedEvent.data.metadata).toEqual(
        expect.objectContaining({
          facilityId: 'facility-001',
          facilityName: 'Test Hospital',
          departmentId: 'dept-001',
          departmentName: 'Emergency Department',
          userId: 'user-123',
          correlationId: 'corr-123',
          sessionId: 'sess-123',
          service: 'orders-service',
          containsPII: false,
          dataClassification: 'internal',
          eventVersion: '1.0'
        })
      );
    });

    it('should generate correlation ID when not provided', async () => {
      await service.emitOrderCreated(sampleOrder, 'user-123');

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      expect(emittedEvent.id).toMatch(/^order-\d+-[a-z0-9]+$/);
    });

    it('should handle optional fields correctly', async () => {
      const { departmentId, tags, financials, vendor, ...orderWithoutOptionals } = sampleOrder;

      await service.emitOrderCreated(orderWithoutOptionals as Order, 'user-123');

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      expect(emittedEvent.data.eventData).not.toHaveProperty('estimatedValue');
      expect(emittedEvent.data.eventData).not.toHaveProperty('vendorId');
      expect(emittedEvent.data.eventData).not.toHaveProperty('tags');
    });

    it('should handle emit errors', async () => {
      mockEventEmitter.emit.mockRejectedValue(new Error('Emit failed'));

      await expect(
        service.emitOrderCreated(sampleOrder, 'user-123', 'corr-123')
      ).rejects.toThrow('Emit failed');
    });
  });

  describe('emitOrderUpdated', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should emit order updated event', async () => {
      const updatedFields = ['priority', 'notes'];
      const previousValues = { priority: OrderPriority.NORMAL, notes: undefined };

      await service.emitOrderUpdated(
        { ...sampleOrder, priority: OrderPriority.HIGH, notes: 'Updated notes' },
        updatedFields,
        previousValues,
        'user-456',
        'corr-123'
      );

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: OrderEventType.ORDER_UPDATED,
          subject: 'order/order-123'
        })
      );
    });

    it('should include updated fields and values', async () => {
      const updatedFields = ['priority'];
      const previousValues = { priority: OrderPriority.NORMAL };

      await service.emitOrderUpdated(
        sampleOrder,
        updatedFields,
        previousValues,
        'user-456'
      );

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      expect(emittedEvent.data.eventData).toEqual(
        expect.objectContaining({
          orderId: 'order-123',
          updatedBy: 'user-456',
          updatedFields: ['priority'],
          previousValues: { priority: OrderPriority.NORMAL },
          newValues: expect.objectContaining({ priority: OrderPriority.HIGH })
        })
      );
    });
  });

  describe('emitOrderDeleted', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should emit order deleted event', async () => {
      await service.emitOrderDeleted(
        sampleOrder,
        'Duplicate order created by mistake',
        'user-123',
        'corr-123'
      );

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: OrderEventType.ORDER_DELETED,
          subject: 'order/order-123'
        })
      );
    });

    it('should include deletion details', async () => {
      await service.emitOrderDeleted(
        sampleOrder,
        'No longer needed',
        'user-123'
      );

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      expect(emittedEvent.data.eventData).toEqual(
        expect.objectContaining({
          orderId: 'order-123',
          orderType: OrderType.MEDICINE,
          status: OrderStatus.DRAFT,
          deletedBy: 'user-123',
          deletionReason: 'No longer needed',
          itemCount: 1,
          orderAge: expect.any(Number)
        })
      );
    });
  });

  describe('emitOrderSubmitted', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should emit order submitted event', async () => {
      const submittedOrder = { ...sampleOrder, status: OrderStatus.SUBMITTED };

      await service.emitOrderSubmitted(submittedOrder, 'user-123', 'corr-123');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: OrderEventType.ORDER_SUBMITTED,
          subject: 'order/order-123'
        })
      );
    });

    it('should include state transition details', async () => {
      const submittedOrder = { ...sampleOrder, status: OrderStatus.SUBMITTED };

      await service.emitOrderSubmitted(submittedOrder, 'user-123');

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      expect(emittedEvent.data.eventData).toEqual(
        expect.objectContaining({
          orderId: 'order-123',
          fromStatus: OrderStatus.DRAFT,
          toStatus: OrderStatus.SUBMITTED,
          transitionedBy: 'user-123',
          transitionDate: expect.any(String),
          orderType: OrderType.MEDICINE,
          priority: OrderPriority.HIGH
        })
      );
    });
  });

  describe('emitOrderApproved', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should emit order approved event', async () => {
      const approvedOrder = { ...sampleOrder, status: OrderStatus.APPROVED };
      const approvalData = {
        approvedBy: 'approver-123',
        approvalDate: '2025-10-09T11:00:00Z',
        notes: 'Approved for procurement'
      };

      await service.emitOrderApproved(approvedOrder, approvalData, 'approver-123', 'corr-123');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: OrderEventType.ORDER_APPROVED,
          subject: 'order/order-123'
        })
      );
    });

    it('should include approval details', async () => {
      const approvedOrder = { ...sampleOrder, status: OrderStatus.APPROVED };
      const approvalData = {
        approvedBy: 'approver-123',
        approvalDate: '2025-10-09T11:00:00Z',
        notes: 'Approved'
      };

      await service.emitOrderApproved(approvedOrder, approvalData, 'approver-123');

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      expect(emittedEvent.data.eventData).toEqual(
        expect.objectContaining({
          orderId: 'order-123',
          approvedBy: 'approver-123',
          approvalDate: '2025-10-09T11:00:00Z',
          approvalNotes: 'Approved',
          estimatedValue: 59.90,
          vendorId: 'vendor-001',
          vendorName: 'Medical Supplies Inc'
        })
      );
    });
  });

  describe('emitOrderRejected', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should emit order rejected event', async () => {
      const rejectedOrder = { ...sampleOrder, status: OrderStatus.REJECTED };
      const rejectionData = {
        rejectionReason: 'Budget constraints require additional approval',
        notes: 'Resubmit with cost analysis',
        userId: 'approver-123'
      };

      await service.emitOrderRejected(rejectedOrder, rejectionData, 'corr-123');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: OrderEventType.ORDER_REJECTED,
          subject: 'order/order-123'
        })
      );
    });

    it('should include rejection details with resubmit flag', async () => {
      const rejectedOrder = { ...sampleOrder, status: OrderStatus.REJECTED };
      const rejectionData = {
        rejectionReason: 'Insufficient justification',
        userId: 'approver-123'
      };

      await service.emitOrderRejected(rejectedOrder, rejectionData);

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      expect(emittedEvent.data.eventData).toEqual(
        expect.objectContaining({
          orderId: 'order-123',
          rejectedBy: 'approver-123',
          rejectionReason: 'Insufficient justification',
          canResubmit: true,
          estimatedValue: 59.90
        })
      );
    });
  });

  describe('emitOrderShipped', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should emit order shipped event', async () => {
      const shippedOrder = { ...sampleOrder, status: OrderStatus.SHIPPED };
      const shippingData = {
        trackingNumber: 'TRACK123456',
        carrier: 'FedEx',
        estimatedDelivery: '2025-10-12T10:00:00Z'
      };

      await service.emitOrderShipped(shippedOrder, shippingData, 'warehouse-123', 'corr-123');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: OrderEventType.ORDER_SHIPPED,
          subject: 'order/order-123'
        })
      );
    });

    it('should include shipping and delivery details', async () => {
      const shippedOrder = { ...sampleOrder, status: OrderStatus.SHIPPED };
      const shippingData = {
        trackingNumber: 'TRACK123',
        carrier: 'UPS'
      };

      await service.emitOrderShipped(shippedOrder, shippingData, 'warehouse-123');

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      expect(emittedEvent.data.eventData).toEqual(
        expect.objectContaining({
          orderId: 'order-123',
          orderType: OrderType.MEDICINE,
          trackingNumber: 'TRACK123',
          carrier: 'UPS',
          shippedDate: expect.any(String),
          vendorId: 'vendor-001',
          vendorName: 'Medical Supplies Inc',
          itemCount: 1,
          deliveryAddress: expect.objectContaining({
            facilityId: 'facility-001',
            departmentId: 'dept-001',
            room: 'Pharmacy Storage',
            city: 'Medical City',
            state: 'CA'
          })
        })
      );
    });
  });

  describe('emitOrderReceived', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should emit order received event', async () => {
      const receivedOrder = { ...sampleOrder, status: OrderStatus.RECEIVED };
      const receivedData = {
        receivedBy: 'staff-456',
        deliveredBy: 'FedEx Driver John',
        notes: 'All items in good condition'
      };

      await service.emitOrderReceived(receivedOrder, receivedData, 'receiver-123', 'corr-123');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: OrderEventType.ORDER_RECEIVED,
          subject: 'order/order-123'
        })
      );
    });

    it('should include received items details', async () => {
      const receivedOrder = { ...sampleOrder, status: OrderStatus.RECEIVED };
      const receivedData = {
        receivedBy: 'staff-456'
      };

      await service.emitOrderReceived(receivedOrder, receivedData, 'receiver-123');

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      expect(emittedEvent.data.eventData).toEqual(
        expect.objectContaining({
          orderId: 'order-123',
          receivedBy: 'staff-456',
          receivedDate: expect.any(String),
          itemsReceived: expect.arrayContaining([
            expect.objectContaining({
              itemId: 'item-001',
              name: 'Paracetamol 500mg',
              quantityOrdered: 10,
              quantityReceived: 10,
              condition: 'good'
            })
          ]),
          requiresInspection: true // Medicine requires inspection
        })
      );
    });

    it('should set requiresInspection true for medicine orders', async () => {
      const medicineOrder = { ...sampleOrder, orderType: OrderType.MEDICINE };
      await service.emitOrderReceived(medicineOrder, { receivedBy: 'staff-456' }, 'user-123');

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      expect(emittedEvent.data.eventData.requiresInspection).toBe(true);
    });

    it('should set requiresInspection true for equipment orders', async () => {
      const equipmentOrder = { ...sampleOrder, orderType: OrderType.EQUIPMENT };
      await service.emitOrderReceived(equipmentOrder, { receivedBy: 'staff-456' }, 'user-123');

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      expect(emittedEvent.data.eventData.requiresInspection).toBe(true);
    });

    it('should set requiresInspection false for supplies orders', async () => {
      const suppliesOrder = { ...sampleOrder, orderType: OrderType.SUPPLIES };
      await service.emitOrderReceived(suppliesOrder, { receivedBy: 'staff-456' }, 'user-123');

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      expect(emittedEvent.data.eventData.requiresInspection).toBe(false);
    });
  });

  describe('emitOrderFulfilled', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should emit order fulfilled event', async () => {
      const fulfilledOrder = { ...sampleOrder, status: OrderStatus.FULFILLED };
      const fulfillmentData = {
        satisfactionRating: 9,
        completionNotes: 'Excellent quality and timely delivery'
      };

      await service.emitOrderFulfilled(fulfilledOrder, fulfillmentData, 'requester-123', 'corr-123');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: OrderEventType.ORDER_FULFILLED,
          subject: 'order/order-123'
        })
      );
    });

    it('should include fulfillment details and order metrics', async () => {
      const fulfilledOrder = { ...sampleOrder, status: OrderStatus.FULFILLED };
      const fulfillmentData = {
        satisfactionRating: 8,
        completionNotes: 'Good service'
      };

      await service.emitOrderFulfilled(fulfilledOrder, fulfillmentData, 'requester-123');

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      expect(emittedEvent.data.eventData).toEqual(
        expect.objectContaining({
          orderId: 'order-123',
          fulfilledBy: 'requester-123',
          fulfilledDate: expect.any(String),
          orderDuration: expect.any(Number),
          vendorId: 'vendor-001',
          vendorName: 'Medical Supplies Inc',
          totalValue: 59.90,
          itemCount: 1,
          satisfactionRating: 8,
          completionNotes: 'Good service'
        })
      );
    });
  });

  describe('emitOrderReturned', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should emit order returned event', async () => {
      const returnedOrder = { ...sampleOrder, status: OrderStatus.RETURNED };
      const returnData = {
        returnReason: 'Items damaged during shipment',
        returnType: 'damaged' as const,
        returnedItems: [
          {
            itemId: 'item-001',
            quantityReturned: 5,
            condition: 'Damaged packaging',
            notes: 'Boxes crushed'
          }
        ],
        userId: 'receiver-123'
      };

      await service.emitOrderReturned(returnedOrder, returnData, 'corr-123');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: OrderEventType.ORDER_RETURNED,
          subject: 'order/order-123'
        })
      );
    });

    it('should include return details and replacement requirements', async () => {
      const returnedOrder = { ...sampleOrder, status: OrderStatus.RETURNED };
      const returnData = {
        returnReason: 'Wrong items shipped',
        returnType: 'wrong_item' as const,
        returnedItems: [
          {
            itemId: 'item-001',
            quantityReturned: 10,
            condition: 'Good but wrong'
          }
        ],
        userId: 'receiver-123'
      };

      await service.emitOrderReturned(returnedOrder, returnData);

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      expect(emittedEvent.data.eventData).toEqual(
        expect.objectContaining({
          orderId: 'order-123',
          returnInitiatedBy: 'receiver-123',
          returnReason: 'Wrong items shipped',
          returnType: 'wrong_item',
          itemsReturned: expect.arrayContaining([
            expect.objectContaining({
              itemId: 'item-001',
              name: 'Paracetamol 500mg',
              quantityReturned: 10,
              condition: 'Good but wrong'
            })
          ]),
          vendorNotified: true,
          refundExpected: true,
          replacementRequired: true // wrong_item requires replacement
        })
      );
    });

    it('should set replacementRequired true for damaged returns', async () => {
      const returnData = {
        returnReason: 'Damaged',
        returnType: 'damaged' as const,
        returnedItems: [{ itemId: 'item-001', quantityReturned: 1, condition: 'Damaged' }],
        userId: 'user-123'
      };

      await service.emitOrderReturned(sampleOrder, returnData);

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      expect(emittedEvent.data.eventData.replacementRequired).toBe(true);
    });

    it('should set replacementRequired false for not_needed returns', async () => {
      const returnData = {
        returnReason: 'No longer needed',
        returnType: 'not_needed' as const,
        returnedItems: [{ itemId: 'item-001', quantityReturned: 1, condition: 'New' }],
        userId: 'user-123'
      };

      await service.emitOrderReturned(sampleOrder, returnData);

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      expect(emittedEvent.data.eventData.replacementRequired).toBe(false);
    });
  });

  describe('Event metadata and structure', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should always set containsPII to false for order events', async () => {
      await service.emitOrderCreated(sampleOrder, 'user-123');

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      expect(emittedEvent.data.metadata.containsPII).toBe(false);
    });

    it('should set dataClassification to internal', async () => {
      await service.emitOrderCreated(sampleOrder, 'user-123');

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      expect(emittedEvent.data.metadata.dataClassification).toBe('internal');
    });

    it('should use CloudEvents 1.0 spec version', async () => {
      await service.emitOrderCreated(sampleOrder, 'user-123');

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      expect(emittedEvent.specversion).toBe('1.0');
    });

    it('should use smile.orders-service as source', async () => {
      await service.emitOrderCreated(sampleOrder, 'user-123');

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      expect(emittedEvent.source).toBe('smile.orders-service');
    });

    it('should use application/json as data content type', async () => {
      await service.emitOrderCreated(sampleOrder, 'user-123');

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      expect(emittedEvent.datacontenttype).toBe('application/json');
    });
  });

  describe('Configuration handling', () => {
    it('should work without optional department fields', async () => {
      const configWithoutDept = {
        rabbitmqUrl: 'amqp://localhost',
        exchange: 'orders.events',
        facilityId: 'facility-001',
        facilityName: 'Test Hospital'
      };

      const serviceWithoutDept = new OrderEventService(configWithoutDept);
      await serviceWithoutDept.initialize();
      await serviceWithoutDept.emitOrderCreated(sampleOrder, 'user-123');

      const emittedEvent = (mockEventEmitter.emit as jest.Mock).mock.calls[0]?.[0];
      expect(emittedEvent.data.metadata).not.toHaveProperty('departmentId');
      expect(emittedEvent.data.metadata).not.toHaveProperty('departmentName');
    });
  });
});
