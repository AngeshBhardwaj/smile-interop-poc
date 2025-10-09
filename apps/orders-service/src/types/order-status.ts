/**
 * Order Status Management and State Transitions
 *
 * Defines the complete order lifecycle with validation rules
 * for state transitions and business logic enforcement.
 */

export enum OrderStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PACKED = 'PACKED',
  SHIPPED = 'SHIPPED',
  RECEIVED = 'RECEIVED',
  FULFILLED = 'FULFILLED',
  RETURNED = 'RETURNED',
  RETURN_COMPLETE = 'RETURN_COMPLETE'
}

export enum OrderType {
  MEDICINE = 'medicine',
  EQUIPMENT = 'equipment',
  SUPPLIES = 'supplies',
  VACCINES = 'vaccines'
}

export enum OrderPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent'
}

/**
 * Valid state transitions for order workflow
 */
export const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.DRAFT]: [OrderStatus.SUBMITTED],
  [OrderStatus.SUBMITTED]: [OrderStatus.APPROVED, OrderStatus.REJECTED],
  [OrderStatus.APPROVED]: [OrderStatus.PACKED],
  [OrderStatus.REJECTED]: [OrderStatus.DRAFT], // Allow editing and resubmission
  [OrderStatus.PACKED]: [OrderStatus.SHIPPED],
  [OrderStatus.SHIPPED]: [OrderStatus.RECEIVED],
  [OrderStatus.RECEIVED]: [OrderStatus.FULFILLED, OrderStatus.RETURNED],
  [OrderStatus.FULFILLED]: [], // Terminal state
  [OrderStatus.RETURNED]: [OrderStatus.RETURN_COMPLETE],
  [OrderStatus.RETURN_COMPLETE]: [] // Terminal state
};

/**
 * States that allow order modification
 */
export const EDITABLE_STATES = [OrderStatus.DRAFT, OrderStatus.REJECTED];

/**
 * States that allow order deletion
 */
export const DELETABLE_STATES = [OrderStatus.DRAFT];

/**
 * Terminal states (no further transitions allowed)
 */
export const TERMINAL_STATES = [OrderStatus.FULFILLED, OrderStatus.RETURN_COMPLETE];

/**
 * Validate if a state transition is allowed
 */
export function isValidTransition(currentStatus: OrderStatus, newStatus: OrderStatus): boolean {
  return VALID_TRANSITIONS[currentStatus]?.includes(newStatus) ?? false;
}

/**
 * Check if order can be edited in current state
 */
export function canEditOrder(status: OrderStatus): boolean {
  return EDITABLE_STATES.includes(status);
}

/**
 * Check if order can be deleted in current state
 */
export function canDeleteOrder(status: OrderStatus): boolean {
  return DELETABLE_STATES.includes(status);
}

/**
 * Check if order is in a terminal state
 */
export function isTerminalState(status: OrderStatus): boolean {
  return TERMINAL_STATES.includes(status);
}

/**
 * Get next possible states for current order status
 */
export function getNextStates(currentStatus: OrderStatus): OrderStatus[] {
  return VALID_TRANSITIONS[currentStatus] || [];
}