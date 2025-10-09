/**
 * Order Service Unit Tests
 *
 * Comprehensive tests for order business logic and state management
 */

import {
  OrderService,
  OrderError,
  OrderNotFoundError,
  InvalidStateTransitionError,
  OrderNotEditableError,
} from '../order.service';
import { OrderEventService } from '../order-event.service';
import { OrderStatus, OrderType, OrderPriority } from '../../types/order-status';
import { CreateOrderRequest, UpdateOrderRequest } from '../../types/order-types';

// Mock dependencies
jest.mock('../order-event.service');
jest.mock('@smile/common', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('OrderService', () => {
  let orderService: OrderService;
  let mockEventService: jest.Mocked<OrderEventService>;

  beforeEach(() => {
    // Create mock event service
    mockEventService = {
      emitOrderCreated: jest.fn().mockResolvedValue(undefined),
      emitOrderUpdated: jest.fn().mockResolvedValue(undefined),
      emitOrderDeleted: jest.fn().mockResolvedValue(undefined),
      emitOrderSubmitted: jest.fn().mockResolvedValue(undefined),
      emitOrderApproved: jest.fn().mockResolvedValue(undefined),
      emitOrderRejected: jest.fn().mockResolvedValue(undefined),
      emitOrderShipped: jest.fn().mockResolvedValue(undefined),
      emitOrderReceived: jest.fn().mockResolvedValue(undefined),
      emitOrderFulfilled: jest.fn().mockResolvedValue(undefined),
      emitOrderReturned: jest.fn().mockResolvedValue(undefined),
      initialize: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    } as any;

    orderService = new OrderService(mockEventService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createOrder', () => {
    const validCreateRequest: CreateOrderRequest = {
      facilityId: 'facility-001',
      departmentId: 'dept-001',
      orderType: OrderType.MEDICINE,
      priority: OrderPriority.NORMAL,
      requestedBy: 'user-123',
      requiredDate: new Date(Date.now() + 86400000 * 7).toISOString(),
      items: [
        {
          name: 'Paracetamol 500mg',
          category: 'Pharmaceuticals',
          unitOfMeasure: 'box',
          quantityOrdered: 10,
        },
      ],
      deliveryAddress: {
        street: '123 Hospital Drive',
        city: 'Medical City',
        state: 'CA',
        zipCode: '90210',
        country: 'USA',
      },
    };

    it('should create order successfully with all required fields', async () => {
      const order = await orderService.createOrder(validCreateRequest, 'user-123');

      expect(order).toBeDefined();
      expect(order.orderId).toBeDefined();
      expect(order.status).toBe(OrderStatus.DRAFT);
      expect(order.facilityId).toBe('facility-001');
      expect(order.requestedBy).toBe('user-123');
      expect(order.items).toHaveLength(1);
      expect(order.items[0]?.itemId).toBeDefined();
      expect(order.statusHistory).toHaveLength(1);
      expect(order.createdAt).toBeDefined();
      expect(order.updatedAt).toBeDefined();
    });

    it('should emit order created event', async () => {
      const order = await orderService.createOrder(validCreateRequest, 'user-123', 'corr-123', 'sess-123');

      expect(mockEventService.emitOrderCreated).toHaveBeenCalledWith(
        order,
        'user-123',
        'corr-123',
        'sess-123',
      );
    });

    it('should generate unique IDs for items', async () => {
      const requestWithMultipleItems: CreateOrderRequest = {
        ...validCreateRequest,
        items: [
          { name: 'Item 1', category: 'Cat1', unitOfMeasure: 'unit', quantityOrdered: 1 },
          { name: 'Item 2', category: 'Cat2', unitOfMeasure: 'unit', quantityOrdered: 2 },
        ],
      };

      const order = await orderService.createOrder(requestWithMultipleItems, 'user-123');

      expect(order.items).toHaveLength(2);
      expect(order.items[0]?.itemId).toBeDefined();
      expect(order.items[1]?.itemId).toBeDefined();
      expect(order.items[0]?.itemId).not.toBe(order.items[1]?.itemId);
    });

    it('should include vendor information when provided', async () => {
      const requestWithVendor: CreateOrderRequest = {
        ...validCreateRequest,
        vendor: {
          vendorName: 'Medical Supplies Inc',
          contactPerson: 'John Vendor',
          email: 'vendor@example.com',
        },
      };

      const order = await orderService.createOrder(requestWithVendor, 'user-123');

      expect(order.vendor).toBeDefined();
      expect(order.vendor?.vendorId).toBeDefined();
      expect(order.vendor?.vendorName).toBe('Medical Supplies Inc');
    });

    it('should include optional fields when provided', async () => {
      const requestWithOptionals: CreateOrderRequest = {
        ...validCreateRequest,
        notes: 'Urgent order',
        tags: ['urgent', 'medical'],
        customFields: { projectCode: 'PROJ-001' },
      };

      const order = await orderService.createOrder(requestWithOptionals, 'user-123');

      expect(order.notes).toBe('Urgent order');
      expect(order.tags).toEqual(['urgent', 'medical']);
      expect(order.customFields).toEqual({ projectCode: 'PROJ-001' });
    });

    it('should initialize status history correctly', async () => {
      const order = await orderService.createOrder(validCreateRequest, 'user-123');

      expect(order.statusHistory).toHaveLength(1);
      expect(order.statusHistory[0]?.fromStatus).toBe(OrderStatus.DRAFT);
      expect(order.statusHistory[0]?.toStatus).toBe(OrderStatus.DRAFT);
      expect(order.statusHistory[0]?.changedBy).toBe('user-123');
      expect(order.statusHistory[0]?.reason).toBe('Order created');
    });
  });

  describe('getOrder', () => {
    it('should return order when it exists', async () => {
      const created = await orderService.createOrder({
        facilityId: 'facility-001',
        orderType: OrderType.SUPPLIES,
        priority: OrderPriority.NORMAL,
        requestedBy: 'user-123',
        requiredDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        items: [{ name: 'Test', category: 'Cat', unitOfMeasure: 'unit', quantityOrdered: 1 }],
        deliveryAddress: {
          street: '123 St',
          city: 'City',
          state: 'CA',
          zipCode: '12345',
          country: 'USA',
        },
      }, 'user-123');

      const retrieved = await orderService.getOrder(created.orderId);

      expect(retrieved).toBeDefined();
      expect(retrieved.orderId).toBe(created.orderId);
    });

    it('should throw OrderNotFoundError when order does not exist', async () => {
      await expect(
        orderService.getOrder('non-existent-id'),
      ).rejects.toThrow(OrderNotFoundError);
    });

    it('should include correct error code and status code', async () => {
      try {
        await orderService.getOrder('non-existent-id');
        fail('Should have thrown OrderNotFoundError');
      } catch (error: any) {
        expect(error.code).toBe('ORDER_NOT_FOUND');
        expect(error.statusCode).toBe(404);
      }
    });
  });

  describe('updateOrder', () => {
    it('should update order in DRAFT state', async () => {
      const created = await orderService.createOrder({
        facilityId: 'facility-001',
        orderType: OrderType.MEDICINE,
        priority: OrderPriority.NORMAL,
        requestedBy: 'user-123',
        requiredDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        items: [{ name: 'Item 1', category: 'Cat', unitOfMeasure: 'unit', quantityOrdered: 1 }],
        deliveryAddress: {
          street: '123 St',
          city: 'City',
          state: 'CA',
          zipCode: '12345',
          country: 'USA',
        },
      }, 'user-123');

      const updateRequest: UpdateOrderRequest = {
        priority: OrderPriority.HIGH,
        notes: 'Updated notes',
      };

      const updated = await orderService.updateOrder(created.orderId, updateRequest, 'user-456');

      expect(updated.priority).toBe(OrderPriority.HIGH);
      expect(updated.notes).toBe('Updated notes');
      expect(updated.lastModifiedBy).toBe('user-456');
      // updatedAt should be greater than or equal to createdAt (allowing for fast execution)
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.updatedAt).getTime());
    });

    it('should emit update event with changed fields', async () => {
      const created = await orderService.createOrder({
        facilityId: 'facility-001',
        orderType: OrderType.MEDICINE,
        priority: OrderPriority.NORMAL,
        requestedBy: 'user-123',
        requiredDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        items: [{ name: 'Item 1', category: 'Cat', unitOfMeasure: 'unit', quantityOrdered: 1 }],
        deliveryAddress: {
          street: '123 St',
          city: 'City',
          state: 'CA',
          zipCode: '12345',
          country: 'USA',
        },
      }, 'user-123');

      const updateRequest: UpdateOrderRequest = {
        priority: OrderPriority.HIGH,
      };

      await orderService.updateOrder(created.orderId, updateRequest, 'user-456', 'corr-123', 'sess-123');

      expect(mockEventService.emitOrderUpdated).toHaveBeenCalled();
      const callArgs = (mockEventService.emitOrderUpdated as jest.Mock).mock.calls[0];
      expect(callArgs[1]).toContain('priority');
      expect(callArgs[2]).toHaveProperty('priority', OrderPriority.NORMAL);
    });

    it('should not allow update in SUBMITTED state', async () => {
      const created = await orderService.createOrder({
        facilityId: 'facility-001',
        orderType: OrderType.MEDICINE,
        priority: OrderPriority.NORMAL,
        requestedBy: 'user-123',
        requiredDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        items: [{ name: 'Item 1', category: 'Cat', unitOfMeasure: 'unit', quantityOrdered: 1 }],
        deliveryAddress: {
          street: '123 St',
          city: 'City',
          state: 'CA',
          zipCode: '12345',
          country: 'USA',
        },
      }, 'user-123');

      // Submit the order
      await orderService.submitOrder(created.orderId, 'user-123');

      // Try to update
      await expect(
        orderService.updateOrder(created.orderId, { priority: OrderPriority.HIGH }, 'user-123'),
      ).rejects.toThrow(OrderNotEditableError);
    });

    it('should allow update in REJECTED state', async () => {
      const created = await orderService.createOrder({
        facilityId: 'facility-001',
        orderType: OrderType.MEDICINE,
        priority: OrderPriority.NORMAL,
        requestedBy: 'user-123',
        requiredDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        items: [{ name: 'Item 1', category: 'Cat', unitOfMeasure: 'unit', quantityOrdered: 1 }],
        deliveryAddress: {
          street: '123 St',
          city: 'City',
          state: 'CA',
          zipCode: '12345',
          country: 'USA',
        },
      }, 'user-123');

      // Submit and reject
      await orderService.submitOrder(created.orderId, 'user-123');
      await orderService.rejectOrder(
        created.orderId,
        { rejectionReason: 'Budget constraints need more information', userId: 'approver-123' },
      );

      // Should now be in DRAFT state after rejection workflow, so update should work
      const updated = await orderService.updateOrder(
        created.orderId,
        { priority: OrderPriority.LOW },
        'user-123',
      );

      expect(updated.priority).toBe(OrderPriority.LOW);
    });
  });

  describe('deleteOrder', () => {
    it('should delete order in DRAFT state', async () => {
      const created = await orderService.createOrder({
        facilityId: 'facility-001',
        orderType: OrderType.MEDICINE,
        priority: OrderPriority.NORMAL,
        requestedBy: 'user-123',
        requiredDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        items: [{ name: 'Item 1', category: 'Cat', unitOfMeasure: 'unit', quantityOrdered: 1 }],
        deliveryAddress: {
          street: '123 St',
          city: 'City',
          state: 'CA',
          zipCode: '12345',
          country: 'USA',
        },
      }, 'user-123');

      await orderService.deleteOrder(created.orderId, 'Duplicate order', 'user-123');

      await expect(
        orderService.getOrder(created.orderId),
      ).rejects.toThrow(OrderNotFoundError);
    });

    it('should emit deletion event before deleting', async () => {
      const created = await orderService.createOrder({
        facilityId: 'facility-001',
        orderType: OrderType.MEDICINE,
        priority: OrderPriority.NORMAL,
        requestedBy: 'user-123',
        requiredDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        items: [{ name: 'Item 1', category: 'Cat', unitOfMeasure: 'unit', quantityOrdered: 1 }],
        deliveryAddress: {
          street: '123 St',
          city: 'City',
          state: 'CA',
          zipCode: '12345',
          country: 'USA',
        },
      }, 'user-123');

      await orderService.deleteOrder(created.orderId, 'Duplicate', 'user-123', 'corr-123', 'sess-123');

      expect(mockEventService.emitOrderDeleted).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: created.orderId }),
        'Duplicate',
        'user-123',
        'corr-123',
        'sess-123',
      );
    });

    it('should not allow deletion in SUBMITTED state', async () => {
      const created = await orderService.createOrder({
        facilityId: 'facility-001',
        orderType: OrderType.MEDICINE,
        priority: OrderPriority.NORMAL,
        requestedBy: 'user-123',
        requiredDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        items: [{ name: 'Item 1', category: 'Cat', unitOfMeasure: 'unit', quantityOrdered: 1 }],
        deliveryAddress: {
          street: '123 St',
          city: 'City',
          state: 'CA',
          zipCode: '12345',
          country: 'USA',
        },
      }, 'user-123');

      await orderService.submitOrder(created.orderId, 'user-123');

      await expect(
        orderService.deleteOrder(created.orderId, 'Changed mind', 'user-123'),
      ).rejects.toThrow(OrderError);
    });
  });

  describe('listOrders', () => {
    beforeEach(async () => {
      // Create test orders
      await orderService.createOrder({
        facilityId: 'facility-001',
        orderType: OrderType.MEDICINE,
        priority: OrderPriority.NORMAL,
        requestedBy: 'user-123',
        requiredDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        items: [{ name: 'Item 1', category: 'Cat', unitOfMeasure: 'unit', quantityOrdered: 1 }],
        deliveryAddress: {
          street: '123 St',
          city: 'City',
          state: 'CA',
          zipCode: '12345',
          country: 'USA',
        },
        tags: ['urgent'],
      }, 'user-123');

      await orderService.createOrder({
        facilityId: 'facility-002',
        orderType: OrderType.EQUIPMENT,
        priority: OrderPriority.HIGH,
        requestedBy: 'user-456',
        requiredDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        items: [{ name: 'Item 2', category: 'Cat', unitOfMeasure: 'unit', quantityOrdered: 1 }],
        deliveryAddress: {
          street: '456 St',
          city: 'City',
          state: 'CA',
          zipCode: '12345',
          country: 'USA',
        },
      }, 'user-456');
    });

    it('should list all orders without filters', async () => {
      const result = await orderService.listOrders({});

      expect(result.orders).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter by facilityId', async () => {
      const result = await orderService.listOrders({ facilityId: 'facility-001' });

      expect(result.orders).toHaveLength(1);
      expect(result.orders[0]?.facilityId).toBe('facility-001');
    });

    it('should filter by orderType', async () => {
      const result = await orderService.listOrders({ orderType: OrderType.EQUIPMENT });

      expect(result.orders).toHaveLength(1);
      expect(result.orders[0]?.orderType).toBe(OrderType.EQUIPMENT);
    });

    it('should filter by priority', async () => {
      const result = await orderService.listOrders({ priority: OrderPriority.HIGH });

      expect(result.orders).toHaveLength(1);
      expect(result.orders[0]?.priority).toBe(OrderPriority.HIGH);
    });

    it('should filter by requestedBy', async () => {
      const result = await orderService.listOrders({ requestedBy: 'user-123' });

      expect(result.orders).toHaveLength(1);
      expect(result.orders[0]?.requestedBy).toBe('user-123');
    });

    it('should filter by tags', async () => {
      const result = await orderService.listOrders({ tags: ['urgent'] });

      expect(result.orders).toHaveLength(1);
      expect(result.orders[0]?.tags).toContain('urgent');
    });

    it('should apply limit', async () => {
      const result = await orderService.listOrders({ limit: 1 });

      expect(result.orders).toHaveLength(1);
      expect(result.total).toBe(2);
    });

    it('should apply offset', async () => {
      const result = await orderService.listOrders({ limit: 10, offset: 1 });

      expect(result.orders).toHaveLength(1);
      expect(result.total).toBe(2);
    });
  });

  describe('State Transitions', () => {
    let testOrder: any;

    beforeEach(async () => {
      testOrder = await orderService.createOrder({
        facilityId: 'facility-001',
        orderType: OrderType.MEDICINE,
        priority: OrderPriority.NORMAL,
        requestedBy: 'user-123',
        requiredDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        items: [{ name: 'Item 1', category: 'Cat', unitOfMeasure: 'unit', quantityOrdered: 1 }],
        deliveryAddress: {
          street: '123 St',
          city: 'City',
          state: 'CA',
          zipCode: '12345',
          country: 'USA',
        },
      }, 'user-123');
    });

    describe('submitOrder', () => {
      it('should submit order from DRAFT to SUBMITTED', async () => {
        const submitted = await orderService.submitOrder(testOrder.orderId, 'user-123');

        expect(submitted.status).toBe(OrderStatus.SUBMITTED);
        expect(submitted.statusHistory).toHaveLength(2);
        expect(submitted.statusHistory[1]?.toStatus).toBe(OrderStatus.SUBMITTED);
      });

      it('should emit submitted event', async () => {
        await orderService.submitOrder(testOrder.orderId, 'user-123', 'corr-123', 'sess-123');

        expect(mockEventService.emitOrderSubmitted).toHaveBeenCalled();
      });

      it('should not allow submitting already submitted order', async () => {
        await orderService.submitOrder(testOrder.orderId, 'user-123');

        await expect(
          orderService.submitOrder(testOrder.orderId, 'user-123'),
        ).rejects.toThrow(InvalidStateTransitionError);
      });
    });

    describe('approveOrder', () => {
      it('should approve submitted order', async () => {
        await orderService.submitOrder(testOrder.orderId, 'user-123');
        const approved = await orderService.approveOrder(
          testOrder.orderId,
          'Approved for procurement',
          'approver-123',
        );

        expect(approved.status).toBe(OrderStatus.APPROVED);
        expect(approved.statusHistory).toHaveLength(3);
      });

      it('should emit approval event', async () => {
        await orderService.submitOrder(testOrder.orderId, 'user-123');
        await orderService.approveOrder(
          testOrder.orderId,
          'Approved',
          'approver-123',
          'corr-123',
          'sess-123',
        );

        expect(mockEventService.emitOrderApproved).toHaveBeenCalledWith(
          expect.objectContaining({ status: OrderStatus.APPROVED }),
          expect.objectContaining({ approvedBy: 'approver-123', notes: 'Approved' }),
          'approver-123',
          'corr-123',
          'sess-123',
        );
      });

      it('should not allow approving draft order', async () => {
        await expect(
          orderService.approveOrder(testOrder.orderId, 'Approved', 'approver-123'),
        ).rejects.toThrow(InvalidStateTransitionError);
      });
    });

    describe('rejectOrder', () => {
      it('should reject submitted order', async () => {
        await orderService.submitOrder(testOrder.orderId, 'user-123');
        const rejected = await orderService.rejectOrder(
          testOrder.orderId,
          { rejectionReason: 'Budget constraints require additional approval', userId: 'approver-123' },
        );

        expect(rejected.rejectionReason).toBe('Budget constraints require additional approval');
        expect(rejected.rejectedBy).toBe('approver-123');
        expect(rejected.rejectionDate).toBeDefined();
      });

      it('should automatically transition to DRAFT after rejection', async () => {
        await orderService.submitOrder(testOrder.orderId, 'user-123');
        await orderService.rejectOrder(
          testOrder.orderId,
          { rejectionReason: 'Need more details about requirements', userId: 'approver-123' },
        );

        // Check the order is back in DRAFT state for editing
        const order = await orderService.getOrder(testOrder.orderId);
        expect(order.status).toBe(OrderStatus.DRAFT);
      });

      it('should emit rejection event', async () => {
        await orderService.submitOrder(testOrder.orderId, 'user-123');
        await orderService.rejectOrder(
          testOrder.orderId,
          { rejectionReason: 'Insufficient justification provided', userId: 'approver-123', notes: 'Need cost analysis' },
          'corr-123',
          'sess-123',
        );

        expect(mockEventService.emitOrderRejected).toHaveBeenCalled();
      });
    });

    describe('Full Happy Path Workflow', () => {
      it('should complete full order lifecycle: DRAFT -> SUBMITTED -> APPROVED -> PACKED -> SHIPPED -> RECEIVED -> FULFILLED', async () => {
        // Submit
        let order = await orderService.submitOrder(testOrder.orderId, 'user-123');
        expect(order.status).toBe(OrderStatus.SUBMITTED);

        // Approve
        order = await orderService.approveOrder(order.orderId, 'Approved', 'approver-123');
        expect(order.status).toBe(OrderStatus.APPROVED);

        // Pack
        order = await orderService.packOrder(order.orderId, 'warehouse-123');
        expect(order.status).toBe(OrderStatus.PACKED);

        // Ship
        order = await orderService.shipOrder(
          order.orderId,
          { trackingNumber: 'TRACK123', carrier: 'FedEx' },
          'warehouse-123',
        );
        expect(order.status).toBe(OrderStatus.SHIPPED);
        expect(order.deliveryInfo?.trackingNumber).toBe('TRACK123');

        // Receive
        order = await orderService.receiveOrder(
          order.orderId,
          { receivedBy: 'staff-456', deliveredBy: 'FedEx Driver' },
          'receiver-123',
        );
        expect(order.status).toBe(OrderStatus.RECEIVED);
        expect(order.deliveryInfo?.actualDeliveryDate).toBeDefined();

        // Fulfill
        order = await orderService.fulfillOrder(
          order.orderId,
          { satisfactionRating: 9, completionNotes: 'Excellent quality' },
          'requester-123',
        );
        expect(order.status).toBe(OrderStatus.FULFILLED);

        // Verify status history
        expect(order.statusHistory.length).toBeGreaterThanOrEqual(7);
      });
    });

    describe('Return Workflow', () => {
      it('should handle return from RECEIVED state', async () => {
        // Complete workflow to RECEIVED
        await orderService.submitOrder(testOrder.orderId, 'user-123');
        await orderService.approveOrder(testOrder.orderId, 'Approved', 'approver-123');
        await orderService.packOrder(testOrder.orderId, 'warehouse-123');
        await orderService.shipOrder(
          testOrder.orderId,
          { trackingNumber: 'TRACK123' },
          'warehouse-123',
        );
        let order = await orderService.receiveOrder(
          testOrder.orderId,
          { receivedBy: 'staff-456' },
          'receiver-123',
        );

        // Initiate return
        order = await orderService.returnOrder(
          order.orderId,
          {
            returnReason: 'Items damaged during shipment and packaging compromised',
            returnType: 'damaged',
            returnedItems: [
              {
                itemId: order.items[0]?.itemId || 'fallback-id',
                quantityReturned: 1,
                condition: 'Damaged packaging',
              },
            ],
            userId: 'receiver-123',
          },
        );

        expect(order.status).toBe(OrderStatus.RETURNED);
        expect(order.returnInfo).toBeDefined();
        expect(order.returnInfo?.returnReason).toContain('damaged');

        // Complete return
        order = await orderService.completeReturn(order.orderId, 'returns-dept-123');
        expect(order.status).toBe(OrderStatus.RETURN_COMPLETE);
      });

      it('should not allow return from DRAFT state', async () => {
        await expect(
          orderService.returnOrder(
            testOrder.orderId,
            {
              returnReason: 'Changed mind about requirements',
              returnType: 'not_needed',
              returnedItems: [{ itemId: testOrder.items[0].itemId, quantityReturned: 1, condition: 'New' }],
              userId: 'user-123',
            },
          ),
        ).rejects.toThrow(InvalidStateTransitionError);
      });
    });
  });

  describe('getNextStates', () => {
    it('should return correct next states for DRAFT order', async () => {
      const order = await orderService.createOrder({
        facilityId: 'facility-001',
        orderType: OrderType.MEDICINE,
        priority: OrderPriority.NORMAL,
        requestedBy: 'user-123',
        requiredDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        items: [{ name: 'Item 1', category: 'Cat', unitOfMeasure: 'unit', quantityOrdered: 1 }],
        deliveryAddress: {
          street: '123 St',
          city: 'City',
          state: 'CA',
          zipCode: '12345',
          country: 'USA',
        },
      }, 'user-123');

      const nextStates = orderService.getNextStates(order);

      expect(nextStates).toEqual([OrderStatus.SUBMITTED]);
    });

    it('should return empty array for FULFILLED order', async () => {
      const order = await orderService.createOrder({
        facilityId: 'facility-001',
        orderType: OrderType.MEDICINE,
        priority: OrderPriority.NORMAL,
        requestedBy: 'user-123',
        requiredDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        items: [{ name: 'Item 1', category: 'Cat', unitOfMeasure: 'unit', quantityOrdered: 1 }],
        deliveryAddress: {
          street: '123 St',
          city: 'City',
          state: 'CA',
          zipCode: '12345',
          country: 'USA',
        },
      }, 'user-123');

      // Complete full workflow
      await orderService.submitOrder(order.orderId, 'user-123');
      await orderService.approveOrder(order.orderId, 'Approved', 'approver-123');
      await orderService.packOrder(order.orderId, 'warehouse-123');
      await orderService.shipOrder(order.orderId, {}, 'warehouse-123');
      await orderService.receiveOrder(order.orderId, { receivedBy: 'staff-456' }, 'receiver-123');
      const fulfilled = await orderService.fulfillOrder(order.orderId, {}, 'requester-123');

      const nextStates = orderService.getNextStates(fulfilled);

      expect(nextStates).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    it('should include proper error codes in custom errors', () => {
      const error = new OrderError('Test error', 'TEST_CODE', 400);
      expect(error.code).toBe('TEST_CODE');
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('OrderError');
    });

    it('should handle not found error with proper details', () => {
      const error = new OrderNotFoundError('order-123');
      expect(error.message).toContain('order-123');
      expect(error.code).toBe('ORDER_NOT_FOUND');
      expect(error.statusCode).toBe(404);
    });

    it('should handle invalid transition error with state details', () => {
      const error = new InvalidStateTransitionError(OrderStatus.DRAFT, OrderStatus.APPROVED);
      expect(error.message).toContain('DRAFT');
      expect(error.message).toContain('APPROVED');
      expect(error.code).toBe('INVALID_STATE_TRANSITION');
      expect(error.statusCode).toBe(422);
    });

    it('should handle order not editable error', () => {
      const error = new OrderNotEditableError('order-123', OrderStatus.SUBMITTED);
      expect(error.message).toContain('order-123');
      expect(error.message).toContain('SUBMITTED');
      expect(error.code).toBe('ORDER_NOT_EDITABLE');
      expect(error.statusCode).toBe(422);
    });
  });
});
