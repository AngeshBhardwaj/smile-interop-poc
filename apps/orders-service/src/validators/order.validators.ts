/**
 * Order Validation Schemas
 *
 * Joi validation schemas for order management operations.
 * Provides comprehensive validation for business rules and data integrity.
 */

import Joi from 'joi';
import { OrderType, OrderPriority, OrderStatus } from '../types/order-status';

/**
 * Common validation patterns
 */
const commonPatterns = {
  uuid: Joi.string().uuid({ version: 'uuidv4' }),
  isoDate: Joi.string().isoDate(),
  facilityId: Joi.string().min(3).max(50).required(),
  userId: Joi.string().min(3).max(50).required(),
  notes: Joi.string().max(2000).allow(''),
  tags: Joi.array().items(Joi.string().max(50)).max(10),
  customFields: Joi.object().unknown(true)
};

/**
 * Address validation schema
 */
const addressSchema = Joi.object({
  street: Joi.string().min(5).max(200).required(),
  city: Joi.string().min(2).max(100).required(),
  state: Joi.string().min(2).max(50).required(),
  zipCode: Joi.string().min(3).max(20).required(),
  country: Joi.string().min(2).max(50).required(),
  buildingName: Joi.string().max(100).optional(),
  floor: Joi.string().max(20).optional(),
  room: Joi.string().max(50).optional(),
  deliveryInstructions: Joi.string().max(500).optional()
});

/**
 * Vendor information validation schema
 */
const vendorSchema = Joi.object({
  vendorName: Joi.string().min(2).max(200).required(),
  contactPerson: Joi.string().max(100).optional(),
  phoneNumber: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/).optional(),
  email: Joi.string().email().optional(),
  address: addressSchema.optional(),
  accountNumber: Joi.string().max(50).optional()
});

/**
 * Order item validation schema
 */
const orderItemSchema = Joi.object({
  name: Joi.string().min(2).max(200).required(),
  description: Joi.string().max(1000).optional(),
  category: Joi.string().min(2).max(100).required(),
  subcategory: Joi.string().max(100).optional(),
  manufacturer: Joi.string().max(100).optional(),
  modelNumber: Joi.string().max(100).optional(),
  sku: Joi.string().max(100).optional(),
  unitOfMeasure: Joi.string().min(1).max(20).required(),
  quantityOrdered: Joi.number().integer().min(1).max(10000).required(),
  quantityReceived: Joi.number().integer().min(0).max(10000).optional(),
  unitPrice: Joi.number().positive().precision(2).optional(),
  totalPrice: Joi.number().positive().precision(2).optional(),
  specifications: Joi.object().unknown(true).optional(),
  notes: commonPatterns.notes.optional()
});

/**
 * Financial information validation schema
 */
const financialsSchema = Joi.object({
  subtotal: Joi.number().positive().precision(2).optional(),
  taxAmount: Joi.number().min(0).precision(2).optional(),
  shippingCost: Joi.number().min(0).precision(2).optional(),
  discountAmount: Joi.number().min(0).precision(2).optional(),
  totalAmount: Joi.number().positive().precision(2).optional(),
  currency: Joi.string().length(3).uppercase().default('USD'),
  paymentTerms: Joi.string().max(100).optional(),
  budgetCode: Joi.string().max(50).optional(),
  costCenter: Joi.string().max(50).optional()
});

/**
 * Create order request validation schema
 */
export const createOrderSchema = Joi.object({
  facilityId: commonPatterns.facilityId,
  departmentId: Joi.string().min(3).max(50).optional(),
  orderType: Joi.string().valid(...Object.values(OrderType)).required(),
  priority: Joi.string().valid(...Object.values(OrderPriority)).required(),
  requestedBy: commonPatterns.userId,
  requiredDate: commonPatterns.isoDate.required(),
  items: Joi.array().items(orderItemSchema).min(1).max(100).required(),
  vendor: vendorSchema.optional(),
  deliveryAddress: addressSchema.required(),
  financials: financialsSchema.optional(),
  notes: commonPatterns.notes.optional(),
  tags: commonPatterns.tags.optional(),
  customFields: commonPatterns.customFields.optional()
}).custom((value, helpers) => {
  // Custom validation: required date must be in the future
  const requiredDate = new Date(value.requiredDate);
  const now = new Date();
  if (requiredDate <= now) {
    return helpers.error('custom.requiredDateFuture');
  }

  // Custom validation: validate financial calculations if provided
  if (value.financials) {
    const { subtotal, taxAmount, shippingCost, discountAmount, totalAmount } = value.financials;
    if (subtotal && taxAmount && shippingCost && discountAmount && totalAmount) {
      const calculated = subtotal + taxAmount + shippingCost - discountAmount;
      if (Math.abs(calculated - totalAmount) > 0.01) {
        return helpers.error('custom.financialCalculation');
      }
    }
  }

  return value;
}).messages({
  'custom.requiredDateFuture': 'Required date must be in the future',
  'custom.financialCalculation': 'Total amount does not match calculated value'
});

/**
 * Update order request validation schema
 */
export const updateOrderSchema = Joi.object({
  orderType: Joi.string().valid(...Object.values(OrderType)).optional(),
  priority: Joi.string().valid(...Object.values(OrderPriority)).optional(),
  requiredDate: commonPatterns.isoDate.optional(),
  items: Joi.array().items(orderItemSchema).min(1).max(100).optional(),
  vendor: vendorSchema.optional(),
  deliveryAddress: addressSchema.optional(),
  financials: financialsSchema.optional(),
  notes: commonPatterns.notes.optional(),
  tags: commonPatterns.tags.optional(),
  customFields: commonPatterns.customFields.optional()
}).min(1).custom((value, helpers) => {
  // Custom validation: required date must be in the future if provided
  if (value.requiredDate) {
    const requiredDate = new Date(value.requiredDate);
    const now = new Date();
    if (requiredDate <= now) {
      return helpers.error('custom.requiredDateFuture');
    }
  }

  return value;
}).messages({
  'custom.requiredDateFuture': 'Required date must be in the future'
});

/**
 * Order filters validation schema
 */
export const orderFiltersSchema = Joi.object({
  facilityId: Joi.string().min(3).max(50).optional(),
  departmentId: Joi.string().min(3).max(50).optional(),
  orderType: Joi.string().valid(...Object.values(OrderType)).optional(),
  status: Joi.string().valid(...Object.values(OrderStatus)).optional(),
  priority: Joi.string().valid(...Object.values(OrderPriority)).optional(),
  requestedBy: Joi.string().min(3).max(50).optional(),
  approvedBy: Joi.string().min(3).max(50).optional(),
  vendorId: commonPatterns.uuid.optional(),
  dateFrom: commonPatterns.isoDate.optional(),
  dateTo: commonPatterns.isoDate.optional(),
  tags: Joi.array().items(Joi.string().max(50)).max(10).optional(),
  limit: Joi.number().integer().min(1).max(1000).default(50),
  offset: Joi.number().integer().min(0).default(0),
  sortBy: Joi.string().valid('createdAt', 'updatedAt', 'requiredDate', 'priority').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
}).custom((value, helpers) => {
  // Custom validation: date range validation
  if (value.dateFrom && value.dateTo) {
    const from = new Date(value.dateFrom);
    const to = new Date(value.dateTo);
    if (from >= to) {
      return helpers.error('custom.invalidDateRange');
    }
  }

  return value;
}).messages({
  'custom.invalidDateRange': 'dateFrom must be before dateTo'
});

/**
 * State transition validation schema
 */
export const stateTransitionSchema = Joi.object({
  newStatus: Joi.string().valid(...Object.values(OrderStatus)).required(),
  reason: Joi.string().min(5).max(500).optional(),
  notes: commonPatterns.notes.optional(),
  userId: commonPatterns.userId
});

/**
 * Rejection request validation schema
 */
export const rejectOrderSchema = Joi.object({
  rejectionReason: Joi.string().min(10).max(500).required(),
  notes: commonPatterns.notes.optional(),
  userId: commonPatterns.userId
});

/**
 * Approval request validation schema
 */
export const approveOrderSchema = Joi.object({
  notes: commonPatterns.notes.optional(),
  userId: commonPatterns.userId
});

/**
 * Shipping data validation schema
 */
export const shippingDataSchema = Joi.object({
  trackingNumber: Joi.string().min(5).max(100).optional(),
  carrier: Joi.string().min(2).max(100).optional(),
  estimatedDelivery: commonPatterns.isoDate.optional(),
  userId: commonPatterns.userId
});

/**
 * Received data validation schema
 */
export const receivedDataSchema = Joi.object({
  receivedBy: commonPatterns.userId.required(),
  deliveredBy: Joi.string().max(100).optional(),
  notes: commonPatterns.notes.optional(),
  userId: commonPatterns.userId
});

/**
 * Fulfillment data validation schema
 */
export const fulfillmentDataSchema = Joi.object({
  satisfactionRating: Joi.number().integer().min(1).max(10).optional(),
  completionNotes: commonPatterns.notes.optional(),
  userId: commonPatterns.userId
});

/**
 * Return request validation schema
 */
export const returnRequestSchema = Joi.object({
  returnReason: Joi.string().min(10).max(500).required(),
  returnType: Joi.string().valid('damaged', 'wrong_item', 'quality_issue', 'not_needed', 'expired').required(),
  returnedItems: Joi.array().items(
    Joi.object({
      itemId: commonPatterns.uuid.required(),
      quantityReturned: Joi.number().integer().min(1).max(10000).required(),
      condition: Joi.string().min(3).max(200).required(),
      notes: Joi.string().max(500).optional()
    })
  ).min(1).max(100).required(),
  notes: commonPatterns.notes.optional(),
  userId: commonPatterns.userId
});

/**
 * Order ID parameter validation schema
 */
export const orderIdSchema = Joi.object({
  orderId: commonPatterns.uuid.required()
});

/**
 * Deletion request validation schema
 */
export const deleteOrderSchema = Joi.object({
  deletionReason: Joi.string().min(5).max(500).required(),
  userId: commonPatterns.userId
});

/**
 * Common validation middleware helper
 */
export function validateSchema(schema: Joi.Schema) {
  return (data: any) => {
    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      throw new Error(`Validation failed: ${JSON.stringify(validationErrors)}`);
    }

    return value;
  };
}

/**
 * Specific validation functions for each operation
 */
export const validators = {
  createOrder: validateSchema(createOrderSchema),
  updateOrder: validateSchema(updateOrderSchema),
  orderFilters: validateSchema(orderFiltersSchema),
  stateTransition: validateSchema(stateTransitionSchema),
  rejectOrder: validateSchema(rejectOrderSchema),
  approveOrder: validateSchema(approveOrderSchema),
  shippingData: validateSchema(shippingDataSchema),
  receivedData: validateSchema(receivedDataSchema),
  fulfillmentData: validateSchema(fulfillmentDataSchema),
  returnRequest: validateSchema(returnRequestSchema),
  orderId: validateSchema(orderIdSchema),
  deleteOrder: validateSchema(deleteOrderSchema)
};