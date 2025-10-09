/**
 * Order Controller Unit Tests
 *
 * Tests for REST API endpoints
 */

import { Request, Response } from 'express';
import { OrderController } from '../order.controller';
import { OrderService } from '../../services/order.service';
import { OrderStatus, OrderType, OrderPriority } from '../../types/order-status';
import { BusinessRequest } from '../../middleware/business.middleware';
import { validators } from '../../validators/order.validators';

// Mock dependencies
jest.mock('../../services/order.service');
jest.mock('../../validators/order.validators');
jest.mock('@smile/common', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('OrderController', () => {
  let controller: OrderController;
  let mockOrderService: jest.Mocked<OrderService>;
  let mockRequest: Partial<BusinessRequest>;
  let mockResponse: Partial<Response>;
  let jsonMock: jest.Mock;
  let sendMock: jest.Mock;
  let statusMock: jest.Mock;

  const sampleOrder = {
    orderId: 'order-123',
    facilityId: 'facility-001',
    orderType: OrderType.MEDICINE,
    priority: OrderPriority.NORMAL,
    status: OrderStatus.DRAFT,
    requestedBy: 'user-123',
    requestedDate: '2025-10-09T10:00:00Z',
    requiredDate: '2025-10-16T10:00:00Z',
    items: [
      {
        itemId: 'item-001',
        name: 'Test Item',
        category: 'Medical',
        unitOfMeasure: 'box',
        quantityOrdered: 10,
      },
    ],
    deliveryAddress: {
      street: '123 St',
      city: 'City',
      state: 'CA',
      zipCode: '12345',
      country: 'USA',
    },
    statusHistory: [],
    createdAt: '2025-10-09T10:00:00Z',
    updatedAt: '2025-10-09T10:00:00Z',
    lastModifiedBy: 'user-123',
  };

  beforeEach(() => {
    // Create mocks
    mockOrderService = {
      createOrder: jest.fn(),
      getOrder: jest.fn(),
      updateOrder: jest.fn(),
      deleteOrder: jest.fn(),
      listOrders: jest.fn(),
      submitOrder: jest.fn(),
      approveOrder: jest.fn(),
      rejectOrder: jest.fn(),
      packOrder: jest.fn(),
      shipOrder: jest.fn(),
      receiveOrder: jest.fn(),
      fulfillOrder: jest.fn(),
      returnOrder: jest.fn(),
      completeReturn: jest.fn(),
      getNextStates: jest.fn(),
    } as any;

    // Mock validators to pass through data
    (validators.orderFilters as jest.Mock) = jest.fn((data) => ({
      ...data,
      limit: parseInt(data.limit as string) || 50,
      offset: parseInt(data.offset as string) || 0,
    }));
    (validators.orderId as jest.Mock) = jest.fn((params) => ({ orderId: params.orderId }));
    (validators.createOrder as jest.Mock) = jest.fn((data) => data);
    (validators.updateOrder as jest.Mock) = jest.fn((data) => data);
    (validators.deleteOrder as jest.Mock) = jest.fn((data) => data);
    (validators.approveOrder as jest.Mock) = jest.fn((data) => data);
    (validators.rejectOrder as jest.Mock) = jest.fn((data) => data);
    (validators.shippingData as jest.Mock) = jest.fn((data) => data);
    (validators.receivedData as jest.Mock) = jest.fn((data) => data);
    (validators.fulfillmentData as jest.Mock) = jest.fn((data) => data);
    (validators.returnRequest as jest.Mock) = jest.fn((data) => data);

    jsonMock = jest.fn();
    sendMock = jest.fn();
    statusMock = jest.fn().mockReturnThis();

    mockRequest = {
      user: {
        userId: 'user-123',
        roles: ['order-manager', 'approver'],
        facilityId: 'facility-001',
      },
      correlationId: 'corr-123',
      sessionId: 'sess-123',
      params: {},
      query: {},
      body: {},
    };

    mockResponse = {
      status: statusMock,
      json: jsonMock,
      send: sendMock,
    };

    controller = new OrderController(mockOrderService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listOrders', () => {
    it('should list orders successfully', async () => {
      mockRequest.query = { facilityId: 'facility-001', limit: '10', offset: '0' };
      mockOrderService.listOrders.mockResolvedValue({
        orders: [sampleOrder],
        total: 1,
      });

      await controller.listOrders(mockRequest as BusinessRequest, mockResponse as Response);

      expect(mockOrderService.listOrders).toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          orders: [sampleOrder],
          total: 1,
          correlationId: 'corr-123',
        }),
      );
    });

    it('should handle errors in listing orders', async () => {
      mockOrderService.listOrders.mockRejectedValue(new Error('Database error'));

      await controller.listOrders(mockRequest as BusinessRequest, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Failed to retrieve orders',
          correlationId: 'corr-123',
        }),
      );
    });
  });

  describe('getOrder', () => {
    it('should get order successfully', async () => {
      mockRequest.params = { orderId: 'order-123' };
      mockOrderService.getOrder.mockResolvedValue(sampleOrder as any);

      await controller.getOrder(mockRequest as BusinessRequest, mockResponse as Response);

      expect(mockOrderService.getOrder).toHaveBeenCalledWith('order-123');
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          order: sampleOrder,
          correlationId: 'corr-123',
        }),
      );
    });

    it('should return 404 when order not found', async () => {
      mockRequest.params = { orderId: 'non-existent' };
      const error = new Error('Order not found');
      (error as any).name = 'OrderNotFoundError';
      mockOrderService.getOrder.mockRejectedValue(error);

      await controller.getOrder(mockRequest as BusinessRequest, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Order not found',
          correlationId: 'corr-123',
        }),
      );
    });

    it('should handle other errors', async () => {
      mockRequest.params = { orderId: 'order-123' };
      mockOrderService.getOrder.mockRejectedValue(new Error('Database error'));

      await controller.getOrder(mockRequest as BusinessRequest, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
    });
  });

  describe('createOrder', () => {
    it('should create order successfully', async () => {
      mockRequest.body = {
        facilityId: 'facility-001',
        orderType: OrderType.MEDICINE,
        priority: OrderPriority.NORMAL,
        requestedBy: 'user-123',
        requiredDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        items: [{ name: 'Item', category: 'Cat', unitOfMeasure: 'box', quantityOrdered: 1 }],
        deliveryAddress: { street: '123', city: 'City', state: 'CA', zipCode: '12345', country: 'USA' },
      };
      mockOrderService.createOrder.mockResolvedValue(sampleOrder as any);

      await controller.createOrder(mockRequest as BusinessRequest, mockResponse as Response);

      expect(mockOrderService.createOrder).toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Order created successfully',
          order: sampleOrder,
          correlationId: 'corr-123',
        }),
      );
    });

    it('should handle validation errors', async () => {
      mockRequest.body = { invalid: 'data' };
      (validators.createOrder as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Validation failed');
      });

      await controller.createOrder(mockRequest as BusinessRequest, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Failed to create order',
        }),
      );
    });
  });

  describe('updateOrder', () => {
    it('should update order successfully', async () => {
      mockRequest.params = { orderId: 'order-123' };
      mockRequest.body = { priority: OrderPriority.HIGH };
      mockOrderService.updateOrder.mockResolvedValue({ ...sampleOrder, priority: OrderPriority.HIGH } as any);

      await controller.updateOrder(mockRequest as BusinessRequest, mockResponse as Response);

      expect(mockOrderService.updateOrder).toHaveBeenCalledWith('order-123', expect.any(Object), 'user-123', 'corr-123', 'sess-123');
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Order updated successfully',
        }),
      );
    });

    it('should return 404 when updating non-existent order', async () => {
      mockRequest.params = { orderId: 'non-existent' };
      mockRequest.body = { priority: OrderPriority.HIGH };
      const error = new Error('Order not found');
      (error as any).name = 'OrderNotFoundError';
      mockOrderService.updateOrder.mockRejectedValue(error);

      await controller.updateOrder(mockRequest as BusinessRequest, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
    });

    it('should return 422 when order not editable', async () => {
      mockRequest.params = { orderId: 'order-123' };
      mockRequest.body = { priority: OrderPriority.HIGH };
      const error = new Error('Order not editable');
      (error as any).name = 'OrderNotEditableError';
      mockOrderService.updateOrder.mockRejectedValue(error);

      await controller.updateOrder(mockRequest as BusinessRequest, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(422);
    });
  });

  describe('deleteOrder', () => {
    it('should delete order successfully', async () => {
      mockRequest.params = { orderId: 'order-123' };
      mockRequest.body = { deletionReason: 'No longer needed' };
      mockOrderService.deleteOrder.mockResolvedValue(undefined);

      await controller.deleteOrder(mockRequest as BusinessRequest, mockResponse as Response);

      expect(mockOrderService.deleteOrder).toHaveBeenCalledWith('order-123', 'No longer needed', 'user-123', 'corr-123', 'sess-123');
      expect(statusMock).toHaveBeenCalledWith(204);
      expect(sendMock).toHaveBeenCalled();
    });

    it('should return 404 when deleting non-existent order', async () => {
      mockRequest.params = { orderId: 'non-existent' };
      mockRequest.body = { deletionReason: 'Test' };
      const error = new Error('Order not found');
      (error as any).name = 'OrderNotFoundError';
      mockOrderService.deleteOrder.mockRejectedValue(error);

      await controller.deleteOrder(mockRequest as BusinessRequest, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
    });

    it('should return 422 when order cannot be deleted', async () => {
      mockRequest.params = { orderId: 'order-123' };
      mockRequest.body = { deletionReason: 'Test' };
      mockOrderService.deleteOrder.mockRejectedValue(new Error('Cannot delete'));

      await controller.deleteOrder(mockRequest as BusinessRequest, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(422);
    });
  });

  describe('submitOrder', () => {
    it('should submit order successfully', async () => {
      mockRequest.params = { orderId: 'order-123' };
      const submittedOrder = { ...sampleOrder, status: OrderStatus.SUBMITTED };
      mockOrderService.submitOrder.mockResolvedValue(submittedOrder as any);

      await controller.submitOrder(mockRequest as BusinessRequest, mockResponse as Response);

      expect(mockOrderService.submitOrder).toHaveBeenCalledWith('order-123', 'user-123', 'corr-123', 'sess-123');
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Order submitted for approval',
          order: submittedOrder,
        }),
      );
    });

    it('should handle invalid state transition', async () => {
      mockRequest.params = { orderId: 'order-123' };
      const error = new Error('Invalid state transition');
      (error as any).name = 'InvalidStateTransitionError';
      mockOrderService.submitOrder.mockRejectedValue(error);

      await controller.submitOrder(mockRequest as BusinessRequest, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(422);
    });
  });

  describe('approveOrder', () => {
    it('should approve order successfully', async () => {
      mockRequest.params = { orderId: 'order-123' };
      mockRequest.body = { notes: 'Approved for procurement' };
      const approvedOrder = { ...sampleOrder, status: OrderStatus.APPROVED };
      mockOrderService.approveOrder.mockResolvedValue(approvedOrder as any);

      await controller.approveOrder(mockRequest as BusinessRequest, mockResponse as Response);

      expect(mockOrderService.approveOrder).toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Order approved successfully',
        }),
      );
    });

    it('should handle missing notes in approval', async () => {
      mockRequest.params = { orderId: 'order-123' };
      mockRequest.body = {};
      const approvedOrder = { ...sampleOrder, status: OrderStatus.APPROVED };
      mockOrderService.approveOrder.mockResolvedValue(approvedOrder as any);

      await controller.approveOrder(mockRequest as BusinessRequest, mockResponse as Response);

      expect(mockOrderService.approveOrder).toHaveBeenCalledWith('order-123', '', 'user-123', 'corr-123', 'sess-123');
      expect(statusMock).toHaveBeenCalledWith(200);
    });
  });

  describe('rejectOrder', () => {
    it('should reject order successfully', async () => {
      mockRequest.params = { orderId: 'order-123' };
      mockRequest.body = { rejectionReason: 'Budget not approved', notes: 'Resubmit next quarter' };
      const rejectedOrder = { ...sampleOrder, status: OrderStatus.REJECTED };
      mockOrderService.rejectOrder.mockResolvedValue(rejectedOrder as any);

      await controller.rejectOrder(mockRequest as BusinessRequest, mockResponse as Response);

      expect(mockOrderService.rejectOrder).toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Order rejected and returned to draft for editing',
        }),
      );
    });
  });

  describe('packOrder', () => {
    it('should pack order successfully', async () => {
      mockRequest.params = { orderId: 'order-123' };
      const packedOrder = { ...sampleOrder, status: OrderStatus.PACKED };
      mockOrderService.packOrder.mockResolvedValue(packedOrder as any);

      await controller.packOrder(mockRequest as BusinessRequest, mockResponse as Response);

      expect(mockOrderService.packOrder).toHaveBeenCalledWith('order-123', 'user-123', 'corr-123', 'sess-123');
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Order packed and ready for shipping',
        }),
      );
    });
  });

  describe('shipOrder', () => {
    it('should ship order successfully', async () => {
      mockRequest.params = { orderId: 'order-123' };
      mockRequest.body = { trackingNumber: 'TRACK123', carrier: 'FedEx' };
      const shippedOrder = { ...sampleOrder, status: OrderStatus.SHIPPED };
      mockOrderService.shipOrder.mockResolvedValue(shippedOrder as any);

      await controller.shipOrder(mockRequest as BusinessRequest, mockResponse as Response);

      expect(mockOrderService.shipOrder).toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Order shipped successfully',
        }),
      );
    });
  });

  describe('receiveOrder', () => {
    it('should receive order successfully', async () => {
      mockRequest.params = { orderId: 'order-123' };
      mockRequest.body = { receivedBy: 'staff-456', deliveredBy: 'FedEx Driver', notes: 'All good' };
      const receivedOrder = { ...sampleOrder, status: OrderStatus.RECEIVED };
      mockOrderService.receiveOrder.mockResolvedValue(receivedOrder as any);

      await controller.receiveOrder(mockRequest as BusinessRequest, mockResponse as Response);

      expect(mockOrderService.receiveOrder).toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Order received successfully',
        }),
      );
    });
  });

  describe('fulfillOrder', () => {
    it('should fulfill order successfully', async () => {
      mockRequest.params = { orderId: 'order-123' };
      mockRequest.body = { satisfactionRating: 9, completionNotes: 'Excellent' };
      const fulfilledOrder = { ...sampleOrder, status: OrderStatus.FULFILLED };
      mockOrderService.fulfillOrder.mockResolvedValue(fulfilledOrder as any);

      await controller.fulfillOrder(mockRequest as BusinessRequest, mockResponse as Response);

      expect(mockOrderService.fulfillOrder).toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Order fulfilled successfully',
        }),
      );
    });
  });

  describe('returnOrder', () => {
    it('should initiate return successfully', async () => {
      mockRequest.params = { orderId: 'order-123' };
      mockRequest.body = {
        returnReason: 'Damaged items',
        returnType: 'damaged',
        returnedItems: [{ itemId: 'item-001', quantityReturned: 5, condition: 'Damaged' }],
      };
      const returnedOrder = { ...sampleOrder, status: OrderStatus.RETURNED };
      mockOrderService.returnOrder.mockResolvedValue(returnedOrder as any);

      await controller.returnOrder(mockRequest as BusinessRequest, mockResponse as Response);

      expect(mockOrderService.returnOrder).toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Order return initiated successfully',
        }),
      );
    });
  });

  describe('completeReturn', () => {
    it('should complete return successfully', async () => {
      mockRequest.params = { orderId: 'order-123' };
      const completedOrder = { ...sampleOrder, status: OrderStatus.RETURN_COMPLETE };
      mockOrderService.completeReturn.mockResolvedValue(completedOrder as any);

      await controller.completeReturn(mockRequest as BusinessRequest, mockResponse as Response);

      expect(mockOrderService.completeReturn).toHaveBeenCalledWith('order-123', 'user-123', 'corr-123', 'sess-123');
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Order return completed successfully',
        }),
      );
    });
  });

  describe('healthCheck', () => {
    it('should return health status', async () => {
      mockRequest.correlationId = 'health-123';

      await controller.healthCheck(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
          service: 'orders-service',
          version: '1.0.0',
        }),
      );
    });

    it('should use default correlationId if not present', async () => {
      delete mockRequest.correlationId;

      await controller.healthCheck(mockRequest as Request, mockResponse as Response);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: 'health-check',
        }),
      );
    });
  });
});
