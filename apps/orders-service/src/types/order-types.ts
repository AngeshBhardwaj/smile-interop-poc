/**
 * Order Management Data Types
 *
 * Comprehensive type definitions for hospital order lifecycle management
 * covering medicines, equipment, supplies, and vaccines.
 */

import { OrderStatus, OrderType, OrderPriority } from './order-status';

/**
 * Address information for deliveries
 */
export interface Address {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  buildingName?: string;
  floor?: string;
  room?: string;
  deliveryInstructions?: string;
}

/**
 * Vendor/supplier information
 */
export interface VendorInfo {
  vendorId: string;
  vendorName: string;
  contactPerson?: string;
  phoneNumber?: string;
  email?: string;
  address?: Address;
  accountNumber?: string;
}

/**
 * Individual order item
 */
export interface OrderItem {
  itemId: string;
  name: string;
  description?: string;
  category: string;
  subcategory?: string;
  manufacturer?: string;
  modelNumber?: string;
  sku?: string;
  unitOfMeasure: string;
  quantityOrdered: number;
  quantityReceived?: number;
  unitPrice?: number;
  totalPrice?: number;
  specifications?: Record<string, any>;
  notes?: string;
}

/**
 * Medicine-specific item properties
 */
export interface MedicineItem extends OrderItem {
  activeIngredient: string;
  strength: string;
  dosageForm: string; // tablet, capsule, liquid, injection, etc.
  ndc?: string; // National Drug Code
  lotNumber?: string;
  expirationDate?: string;
  controlledSubstance?: boolean;
  prescriptionRequired?: boolean;
  genericAvailable?: boolean;
}

/**
 * Equipment-specific item properties
 */
export interface EquipmentItem extends OrderItem {
  equipmentType: string; // diagnostic, surgical, monitoring, etc.
  serialNumber?: string;
  warrantyInfo?: {
    warrantyPeriod: string;
    warrantyStartDate?: string;
    warrantyProvider: string;
  };
  installationRequired?: boolean;
  trainingRequired?: boolean;
  maintenanceSchedule?: string;
}

/**
 * Status change history tracking
 */
export interface StatusChange {
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  changedBy: string;
  changedAt: string;
  reason?: string;
  notes?: string;
  ipAddress?: string;
}

/**
 * Financial information
 */
export interface OrderFinancials {
  subtotal?: number;
  taxAmount?: number;
  shippingCost?: number;
  discountAmount?: number;
  totalAmount?: number;
  currency: string;
  paymentTerms?: string;
  budgetCode?: string;
  costCenter?: string;
}

/**
 * Delivery tracking information
 */
export interface DeliveryInfo {
  estimatedDeliveryDate?: string;
  actualDeliveryDate?: string;
  trackingNumber?: string;
  carrier?: string;
  shippingMethod?: string;
  deliveredBy?: string;
  receivedBy?: string;
  deliveryNotes?: string;
  signatureRequired?: boolean;
}

/**
 * Return information
 */
export interface ReturnInfo {
  returnReason: string;
  returnInitiatedBy: string;
  returnDate: string;
  returnType: 'damaged' | 'wrong_item' | 'quality_issue' | 'not_needed' | 'expired';
  returnedItems: {
    itemId: string;
    quantityReturned: number;
    condition: string;
    notes?: string;
  }[];
  vendorNotified?: boolean;
  refundAmount?: number;
  replacementOrderId?: string;
  returnCompletedDate?: string;
  returnCompletedBy?: string;
}

/**
 * Core Order entity
 */
export interface Order {
  // Core identification
  orderId: string;
  orderNumber?: string; // Human-readable order number
  facilityId: string;
  facilityName?: string;
  departmentId?: string;
  departmentName?: string;

  // Order metadata
  orderType: OrderType;
  priority: OrderPriority;
  status: OrderStatus;

  // Requestor information
  requestedBy: string;
  requestedByName?: string;
  requestedDate: string;
  requiredDate: string;

  // Approval workflow
  approvedBy?: string;
  approvedByName?: string;
  approvalDate?: string;
  rejectedBy?: string;
  rejectionDate?: string;
  rejectionReason?: string;

  // Order items and vendor
  items: OrderItem[];
  vendor?: VendorInfo;

  // Delivery information
  deliveryAddress: Address;
  deliveryInfo?: DeliveryInfo;

  // Financial information
  financials?: OrderFinancials;

  // Return information (if applicable)
  returnInfo?: ReturnInfo;

  // Audit trail
  statusHistory: StatusChange[];

  // Additional metadata
  notes?: string;
  internalNotes?: string;
  tags?: string[];
  customFields?: Record<string, any>;

  // System timestamps
  createdAt: string;
  updatedAt: string;
  lastModifiedBy: string;
}

/**
 * Order creation request (subset of Order for API)
 */
export interface CreateOrderRequest {
  facilityId: string;
  departmentId?: string;
  orderType: OrderType;
  priority: OrderPriority;
  requestedBy: string;
  requiredDate: string;
  items: Omit<OrderItem, 'itemId'>[];
  vendor?: Omit<VendorInfo, 'vendorId'>;
  deliveryAddress: Address;
  notes?: string;
  tags?: string[];
  customFields?: Record<string, any>;
}

/**
 * Order update request (for editable states)
 */
export interface UpdateOrderRequest {
  orderType?: OrderType;
  priority?: OrderPriority;
  requiredDate?: string;
  items?: Omit<OrderItem, 'itemId'>[];
  vendor?: Omit<VendorInfo, 'vendorId'>;
  deliveryAddress?: Address;
  notes?: string;
  tags?: string[];
  customFields?: Record<string, any>;
}

/**
 * Order filtering and search parameters
 */
export interface OrderFilters {
  facilityId?: string;
  departmentId?: string;
  orderType?: OrderType;
  status?: OrderStatus;
  priority?: OrderPriority;
  requestedBy?: string;
  approvedBy?: string;
  vendorId?: string;
  dateFrom?: string;
  dateTo?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'requiredDate' | 'priority';
  sortOrder?: 'asc' | 'desc';
}

/**
 * State transition request
 */
export interface StateTransitionRequest {
  newStatus: OrderStatus;
  reason?: string;
  notes?: string;
  userId: string;
}

/**
 * Rejection request with reason
 */
export interface RejectOrderRequest {
  rejectionReason: string;
  notes?: string;
  userId: string;
}

/**
 * Return initiation request
 */
export interface InitiateReturnRequest {
  returnReason: string;
  returnType: 'damaged' | 'wrong_item' | 'quality_issue' | 'not_needed' | 'expired';
  returnedItems: {
    itemId: string;
    quantityReturned: number;
    condition: string;
    notes?: string;
  }[];
  notes?: string;
  userId: string;
}