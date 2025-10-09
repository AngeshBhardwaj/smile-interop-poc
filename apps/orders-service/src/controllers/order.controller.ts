/**
 * Order Controller
 *
 * REST API controller for order lifecycle management.
 * Provides comprehensive endpoints for CRUD operations and state transitions.
 */

import { Request, Response } from 'express';
import { logger } from '@smile/common';
import { BusinessRequest } from '../middleware/business.middleware';
import { OrderService } from '../services/order.service';
import { validators } from '../validators/order.validators';

export class OrderController {
  constructor(private orderService: OrderService) {}

  /**
   * @swagger
   * /api/v1/orders:
   *   get:
   *     summary: List orders with filtering and pagination
   *     tags: [Orders]
   *     security:
   *       - BearerAuth: []
   *       - ApiKeyAuth: []
   *     parameters:
   *       - in: query
   *         name: facilityId
   *         schema:
   *           type: string
   *         description: Filter by facility ID
   *       - in: query
   *         name: departmentId
   *         schema:
   *           type: string
   *         description: Filter by department ID
   *       - in: query
   *         name: orderType
   *         schema:
   *           type: string
   *           enum: [medicine, equipment, supplies, vaccines]
   *         description: Filter by order type
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [DRAFT, SUBMITTED, APPROVED, REJECTED, PACKED, SHIPPED, RECEIVED, FULFILLED, RETURNED, RETURN_COMPLETE]
   *         description: Filter by order status
   *       - in: query
   *         name: priority
   *         schema:
   *           type: string
   *           enum: [low, normal, high, urgent]
   *         description: Filter by priority
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 1000
   *           default: 50
   *         description: Maximum number of orders to return
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           minimum: 0
   *           default: 0
   *         description: Number of orders to skip
   *       - in: query
   *         name: sortBy
   *         schema:
   *           type: string
   *           enum: [createdAt, updatedAt, requiredDate, priority]
   *           default: createdAt
   *         description: Field to sort by
   *       - in: query
   *         name: sortOrder
   *         schema:
   *           type: string
   *           enum: [asc, desc]
   *           default: desc
   *         description: Sort order
   *     responses:
   *       200:
   *         description: Orders retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 orders:
   *                   type: array
   *                   items:
   *                     type: object
   *                 total:
   *                   type: integer
   *                 limit:
   *                   type: integer
   *                 offset:
   *                   type: integer
   *       400:
   *         description: Invalid query parameters
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Insufficient permissions
   */
  public listOrders = async (req: BusinessRequest, res: Response): Promise<void> => {
    try {
      const filters = validators.orderFilters(req.query);

      const result = await this.orderService.listOrders(filters);

      res.status(200).json({
        orders: result.orders,
        total: result.total,
        limit: filters.limit,
        offset: filters.offset,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      logger.error('Failed to list orders', {
        error: error.message,
        correlationId: req.correlationId,
        userId: req.user?.userId
      });

      res.status(500).json({
        error: 'Failed to retrieve orders',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * @swagger
   * /api/v1/orders/{orderId}:
   *   get:
   *     summary: Get order by ID
   *     tags: [Orders]
   *     security:
   *       - BearerAuth: []
   *       - ApiKeyAuth: []
   *     parameters:
   *       - in: path
   *         name: orderId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Order ID
   *     responses:
   *       200:
   *         description: Order retrieved successfully
   *       404:
   *         description: Order not found
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Insufficient permissions
   */
  public getOrder = async (req: BusinessRequest, res: Response): Promise<void> => {
    try {
      const { orderId } = validators.orderId(req.params);

      const order = await this.orderService.getOrder(orderId);

      res.status(200).json({
        order,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      logger.error('Failed to get order', {
        error: error.message,
        orderId: req.params.orderId,
        correlationId: req.correlationId,
        userId: req.user?.userId
      });

      if (error.name === 'OrderNotFoundError') {
        res.status(404).json({
          error: 'Order not found',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(500).json({
          error: 'Failed to retrieve order',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        });
      }
    }
  };

  /**
   * @swagger
   * /api/v1/orders:
   *   post:
   *     summary: Create a new order
   *     tags: [Orders]
   *     security:
   *       - BearerAuth: []
   *       - ApiKeyAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [facilityId, orderType, priority, requestedBy, requiredDate, items, deliveryAddress]
   *             properties:
   *               facilityId:
   *                 type: string
   *                 example: "facility-001"
   *               departmentId:
   *                 type: string
   *                 example: "purchasing"
   *               orderType:
   *                 type: string
   *                 enum: [medicine, equipment, supplies, vaccines]
   *                 example: "supplies"
   *               priority:
   *                 type: string
   *                 enum: [low, normal, high, urgent]
   *                 example: "normal"
   *               requestedBy:
   *                 type: string
   *                 example: "user-001"
   *               requiredDate:
   *                 type: string
   *                 format: date-time
   *                 example: "2025-12-15T10:00:00Z"
   *               items:
   *                 type: array
   *                 minItems: 1
   *                 items:
   *                   type: object
   *                   properties:
   *                     name:
   *                       type: string
   *                       example: "Surgical Gloves"
   *                     description:
   *                       type: string
   *                       example: "Nitrile examination gloves, powder-free"
   *                     category:
   *                       type: string
   *                       example: "medical-supplies"
   *                     unitOfMeasure:
   *                       type: string
   *                       example: "box"
   *                     quantityOrdered:
   *                       type: integer
   *                       example: 50
   *                     unitPrice:
   *                       type: number
   *                       example: 12.99
   *               deliveryAddress:
   *                 type: object
   *                 properties:
   *                   street:
   *                     type: string
   *                     example: "123 Hospital Drive"
   *                   city:
   *                     type: string
   *                     example: "Medical City"
   *                   state:
   *                     type: string
   *                     example: "CA"
   *                   zipCode:
   *                     type: string
   *                     example: "90210"
   *                   country:
   *                     type: string
   *                     example: "USA"
   *               notes:
   *                 type: string
   *                 example: "Urgent delivery required for OR supplies"
   *     responses:
   *       201:
   *         description: Order created successfully
   *       400:
   *         description: Validation error
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Insufficient permissions
   */
  public createOrder = async (req: BusinessRequest, res: Response): Promise<void> => {
    try {
      const orderData = validators.createOrder(req.body);

      const order = await this.orderService.createOrder(
        orderData,
        req.user!.userId,
        req.correlationId,
        req.sessionId
      );

      res.status(201).json({
        message: 'Order created successfully',
        order,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      logger.error('Failed to create order', {
        error: error.message,
        correlationId: req.correlationId,
        userId: req.user?.userId
      });

      res.status(400).json({
        error: 'Failed to create order',
        message: error.message,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * @swagger
   * /api/v1/orders/{orderId}:
   *   put:
   *     summary: Update an existing order
   *     tags: [Orders]
   *     security:
   *       - BearerAuth: []
   *       - ApiKeyAuth: []
   *     parameters:
   *       - in: path
   *         name: orderId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Order ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               orderType:
   *                 type: string
   *                 enum: [medicine, equipment, supplies, vaccines]
   *               priority:
   *                 type: string
   *                 enum: [low, normal, high, urgent]
   *               requiredDate:
   *                 type: string
   *                 format: date-time
   *               notes:
   *                 type: string
   *     responses:
   *       200:
   *         description: Order updated successfully
   *       400:
   *         description: Validation error
   *       404:
   *         description: Order not found
   *       422:
   *         description: Order cannot be edited in current state
   */
  public updateOrder = async (req: BusinessRequest, res: Response): Promise<void> => {
    try {
      const { orderId } = validators.orderId(req.params);
      const updateData = validators.updateOrder(req.body);

      const order = await this.orderService.updateOrder(
        orderId,
        updateData,
        req.user!.userId,
        req.correlationId,
        req.sessionId
      );

      res.status(200).json({
        message: 'Order updated successfully',
        order,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      logger.error('Failed to update order', {
        error: error.message,
        orderId: req.params.orderId,
        correlationId: req.correlationId,
        userId: req.user?.userId
      });

      const statusCode = error.name === 'OrderNotFoundError' ? 404 :
                        error.name === 'OrderNotEditableError' ? 422 : 400;

      res.status(statusCode).json({
        error: 'Failed to update order',
        message: error.message,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * @swagger
   * /api/v1/orders/{orderId}:
   *   delete:
   *     summary: Delete an order
   *     tags: [Orders]
   *     security:
   *       - BearerAuth: []
   *       - ApiKeyAuth: []
   *     parameters:
   *       - in: path
   *         name: orderId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Order ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [deletionReason]
   *             properties:
   *               deletionReason:
   *                 type: string
   *                 example: "Order no longer needed"
   *     responses:
   *       204:
   *         description: Order deleted successfully
   *       400:
   *         description: Validation error
   *       404:
   *         description: Order not found
   *       422:
   *         description: Order cannot be deleted in current state
   */
  public deleteOrder = async (req: BusinessRequest, res: Response): Promise<void> => {
    try {
      const { orderId } = validators.orderId(req.params);
      const { deletionReason } = validators.deleteOrder(req.body);

      await this.orderService.deleteOrder(
        orderId,
        deletionReason,
        req.user!.userId,
        req.correlationId,
        req.sessionId
      );

      res.status(204).send();

    } catch (error: any) {
      logger.error('Failed to delete order', {
        error: error.message,
        orderId: req.params.orderId,
        correlationId: req.correlationId,
        userId: req.user?.userId
      });

      const statusCode = error.name === 'OrderNotFoundError' ? 404 : 422;

      res.status(statusCode).json({
        error: 'Failed to delete order',
        message: error.message,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * @swagger
   * /api/v1/orders/{orderId}/submit:
   *   post:
   *     summary: Submit order for approval
   *     tags: [Order Workflow]
   *     security:
   *       - BearerAuth: []
   *       - ApiKeyAuth: []
   *     parameters:
   *       - in: path
   *         name: orderId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Order ID
   *     responses:
   *       200:
   *         description: Order submitted successfully
   *       404:
   *         description: Order not found
   *       422:
   *         description: Invalid state transition
   */
  public submitOrder = async (req: BusinessRequest, res: Response): Promise<void> => {
    try {
      const { orderId } = validators.orderId(req.params);

      const order = await this.orderService.submitOrder(
        orderId,
        req.user!.userId,
        req.correlationId,
        req.sessionId
      );

      res.status(200).json({
        message: 'Order submitted for approval',
        order,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      this.handleStateTransitionError(error, req, res, 'submit order');
    }
  };

  /**
   * @swagger
   * /api/v1/orders/{orderId}/approve:
   *   post:
   *     summary: Approve order
   *     tags: [Order Workflow]
   *     security:
   *       - BearerAuth: []
   *       - ApiKeyAuth: []
   *     parameters:
   *       - in: path
   *         name: orderId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Order ID
   *     requestBody:
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               notes:
   *                 type: string
   *                 example: "Approved for procurement"
   *     responses:
   *       200:
   *         description: Order approved successfully
   *       404:
   *         description: Order not found
   *       422:
   *         description: Invalid state transition
   */
  public approveOrder = async (req: BusinessRequest, res: Response): Promise<void> => {
    try {
      const { orderId } = validators.orderId(req.params);
      // Add userId from auth context to request body before validation
      const approvalData = validators.approveOrder({
        ...req.body,
        userId: req.user!.userId
      });

      const order = await this.orderService.approveOrder(
        orderId,
        approvalData.notes || '',
        approvalData.userId,
        req.correlationId,
        req.sessionId
      );

      res.status(200).json({
        message: 'Order approved successfully',
        order,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      this.handleStateTransitionError(error, req, res, 'approve order');
    }
  };

  /**
   * @swagger
   * /api/v1/orders/{orderId}/reject:
   *   post:
   *     summary: Reject order
   *     tags: [Order Workflow]
   *     security:
   *       - BearerAuth: []
   *       - ApiKeyAuth: []
   *     parameters:
   *       - in: path
   *         name: orderId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Order ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [rejectionReason]
   *             properties:
   *               rejectionReason:
   *                 type: string
   *                 example: "Budget not approved for this quarter"
   *               notes:
   *                 type: string
   *                 example: "Please resubmit with lower quantity"
   *     responses:
   *       200:
   *         description: Order rejected successfully
   *       404:
   *         description: Order not found
   *       422:
   *         description: Invalid state transition
   */
  public rejectOrder = async (req: BusinessRequest, res: Response): Promise<void> => {
    try {
      const { orderId } = validators.orderId(req.params);
      // Add userId from auth context to request body before validation
      const rejectionData = validators.rejectOrder({
        ...req.body,
        userId: req.user!.userId
      });

      const order = await this.orderService.rejectOrder(
        orderId,
        rejectionData,
        req.correlationId,
        req.sessionId
      );

      res.status(200).json({
        message: 'Order rejected and returned to draft for editing',
        order,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      this.handleStateTransitionError(error, req, res, 'reject order');
    }
  };

  /**
   * @swagger
   * /api/v1/orders/{orderId}/pack:
   *   post:
   *     summary: Mark order as packed
   *     tags: [Order Fulfillment]
   *     security:
   *       - BearerAuth: []
   *       - ApiKeyAuth: []
   *     parameters:
   *       - in: path
   *         name: orderId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Order ID
   *     responses:
   *       200:
   *         description: Order marked as packed successfully
   */
  public packOrder = async (req: BusinessRequest, res: Response): Promise<void> => {
    try {
      const { orderId } = validators.orderId(req.params);

      const order = await this.orderService.packOrder(
        orderId,
        req.user!.userId,
        req.correlationId,
        req.sessionId
      );

      res.status(200).json({
        message: 'Order packed and ready for shipping',
        order,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      this.handleStateTransitionError(error, req, res, 'pack order');
    }
  };

  /**
   * @swagger
   * /api/v1/orders/{orderId}/ship:
   *   post:
   *     summary: Mark order as shipped
   *     tags: [Order Fulfillment]
   *     security:
   *       - BearerAuth: []
   *       - ApiKeyAuth: []
   *     parameters:
   *       - in: path
   *         name: orderId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Order ID
   *     requestBody:
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               trackingNumber:
   *                 type: string
   *                 example: "1Z999AA1234567890"
   *               carrier:
   *                 type: string
   *                 example: "UPS"
   *               estimatedDelivery:
   *                 type: string
   *                 format: date-time
   *                 example: "2024-02-18T14:00:00Z"
   *     responses:
   *       200:
   *         description: Order marked as shipped successfully
   */
  public shipOrder = async (req: BusinessRequest, res: Response): Promise<void> => {
    try {
      const { orderId } = validators.orderId(req.params);
      // Add userId from auth context to request body before validation
      const shippingData = validators.shippingData({
        ...req.body,
        userId: req.user!.userId
      });

      const order = await this.orderService.shipOrder(
        orderId,
        shippingData,
        req.user!.userId,
        req.correlationId,
        req.sessionId
      );

      res.status(200).json({
        message: 'Order shipped successfully',
        order,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      this.handleStateTransitionError(error, req, res, 'ship order');
    }
  };

  /**
   * @swagger
   * /api/v1/orders/{orderId}/receive:
   *   post:
   *     summary: Mark order as received
   *     tags: [Order Fulfillment]
   *     security:
   *       - BearerAuth: []
   *       - ApiKeyAuth: []
   *     parameters:
   *       - in: path
   *         name: orderId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Order ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [receivedBy]
   *             properties:
   *               receivedBy:
   *                 type: string
   *                 example: "user-002"
   *               deliveredBy:
   *                 type: string
   *                 example: "John Driver"
   *               notes:
   *                 type: string
   *                 example: "All items received in good condition"
   *     responses:
   *       200:
   *         description: Order marked as received successfully
   */
  public receiveOrder = async (req: BusinessRequest, res: Response): Promise<void> => {
    try {
      const { orderId } = validators.orderId(req.params);
      // Add userId from auth context to request body before validation
      const receivedData = validators.receivedData({
        ...req.body,
        userId: req.user!.userId
      });

      const order = await this.orderService.receiveOrder(
        orderId,
        receivedData,
        req.user!.userId,
        req.correlationId,
        req.sessionId
      );

      res.status(200).json({
        message: 'Order received successfully',
        order,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      this.handleStateTransitionError(error, req, res, 'receive order');
    }
  };

  /**
   * @swagger
   * /api/v1/orders/{orderId}/fulfill:
   *   post:
   *     summary: Mark order as fulfilled
   *     tags: [Order Fulfillment]
   *     security:
   *       - BearerAuth: []
   *       - ApiKeyAuth: []
   *     parameters:
   *       - in: path
   *         name: orderId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Order ID
   *     requestBody:
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               satisfactionRating:
   *                 type: integer
   *                 minimum: 1
   *                 maximum: 10
   *                 example: 8
   *               completionNotes:
   *                 type: string
   *                 example: "Order completed successfully, excellent vendor service"
   *     responses:
   *       200:
   *         description: Order marked as fulfilled successfully
   */
  public fulfillOrder = async (req: BusinessRequest, res: Response): Promise<void> => {
    try {
      const { orderId } = validators.orderId(req.params);
      // Add userId from auth context to request body before validation
      const fulfillmentData = validators.fulfillmentData({
        ...req.body,
        userId: req.user!.userId
      });

      const order = await this.orderService.fulfillOrder(
        orderId,
        fulfillmentData,
        req.user!.userId,
        req.correlationId,
        req.sessionId
      );

      res.status(200).json({
        message: 'Order fulfilled successfully',
        order,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      this.handleStateTransitionError(error, req, res, 'fulfill order');
    }
  };

  /**
   * @swagger
   * /api/v1/orders/{orderId}/return:
   *   post:
   *     summary: Initiate order return
   *     tags: [Order Returns]
   *     security:
   *       - BearerAuth: []
   *       - ApiKeyAuth: []
   *     parameters:
   *       - in: path
   *         name: orderId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Order ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [returnReason, returnType, returnedItems]
   *             properties:
   *               returnReason:
   *                 type: string
   *                 example: "Items damaged during shipping"
   *               returnType:
   *                 type: string
   *                 enum: [damaged, wrong_item, quality_issue, not_needed, expired]
   *                 example: "damaged"
   *               returnedItems:
   *                 type: array
   *                 items:
   *                   type: object
   *                   properties:
   *                     itemId:
   *                       type: string
   *                       format: uuid
   *                     quantityReturned:
   *                       type: integer
   *                       minimum: 1
   *                     condition:
   *                       type: string
   *                       example: "damaged"
   *               notes:
   *                 type: string
   *     responses:
   *       200:
   *         description: Return initiated successfully
   */
  public returnOrder = async (req: BusinessRequest, res: Response): Promise<void> => {
    try {
      const { orderId } = validators.orderId(req.params);
      // Add userId from auth context to request body before validation
      const returnData = validators.returnRequest({
        ...req.body,
        userId: req.user!.userId
      });

      const order = await this.orderService.returnOrder(
        orderId,
        returnData,
        req.correlationId,
        req.sessionId
      );

      res.status(200).json({
        message: 'Order return initiated successfully',
        order,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      this.handleStateTransitionError(error, req, res, 'initiate return');
    }
  };

  /**
   * @swagger
   * /api/v1/orders/{orderId}/complete-return:
   *   post:
   *     summary: Complete order return process
   *     tags: [Order Returns]
   *     security:
   *       - BearerAuth: []
   *       - ApiKeyAuth: []
   *     parameters:
   *       - in: path
   *         name: orderId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Order ID
   *     responses:
   *       200:
   *         description: Return completed successfully
   */
  public completeReturn = async (req: BusinessRequest, res: Response): Promise<void> => {
    try {
      const { orderId } = validators.orderId(req.params);

      const order = await this.orderService.completeReturn(
        orderId,
        req.user!.userId,
        req.correlationId,
        req.sessionId
      );

      res.status(200).json({
        message: 'Order return completed successfully',
        order,
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      this.handleStateTransitionError(error, req, res, 'complete return');
    }
  };

  /**
   * Health check endpoint for monitoring
   */
  public healthCheck = async (req: Request, res: Response): Promise<void> => {
    res.status(200).json({
      status: 'healthy',
      service: 'orders-service',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      correlationId: (req as BusinessRequest).correlationId || 'health-check'
    });
  };

  /**
   * Common error handler for state transitions
   */
  private handleStateTransitionError(
    error: any,
    req: BusinessRequest,
    res: Response,
    operation: string
  ): void {
    logger.error(`Failed to ${operation}`, {
      error: error.message,
      orderId: req.params.orderId,
      correlationId: req.correlationId,
      userId: req.user?.userId
    });

    let statusCode = 500;
    if (error.name === 'OrderNotFoundError') {
      statusCode = 404;
    } else if (error.name === 'InvalidStateTransitionError' || error.name === 'OrderNotEditableError') {
      statusCode = 422;
    }

    res.status(statusCode).json({
      error: `Failed to ${operation}`,
      message: error.message,
      correlationId: req.correlationId,
      timestamp: new Date().toISOString()
    });
  }
}