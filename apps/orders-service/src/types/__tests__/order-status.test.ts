/**
 * Order Status and State Transition Tests
 *
 * Unit tests for order status management and state transition validation
 */

import {
  OrderStatus,
  OrderType,
  OrderPriority,
  VALID_TRANSITIONS,
  EDITABLE_STATES,
  DELETABLE_STATES,
  TERMINAL_STATES,
  isValidTransition,
  canEditOrder,
  canDeleteOrder,
  isTerminalState,
  getNextStates
} from '../order-status';

describe('OrderStatus Enums', () => {
  it('should have correct OrderStatus values', () => {
    expect(OrderStatus.DRAFT).toBe('DRAFT');
    expect(OrderStatus.SUBMITTED).toBe('SUBMITTED');
    expect(OrderStatus.APPROVED).toBe('APPROVED');
    expect(OrderStatus.REJECTED).toBe('REJECTED');
    expect(OrderStatus.PACKED).toBe('PACKED');
    expect(OrderStatus.SHIPPED).toBe('SHIPPED');
    expect(OrderStatus.RECEIVED).toBe('RECEIVED');
    expect(OrderStatus.FULFILLED).toBe('FULFILLED');
    expect(OrderStatus.RETURNED).toBe('RETURNED');
    expect(OrderStatus.RETURN_COMPLETE).toBe('RETURN_COMPLETE');
  });

  it('should have correct OrderType values', () => {
    expect(OrderType.MEDICINE).toBe('medicine');
    expect(OrderType.EQUIPMENT).toBe('equipment');
    expect(OrderType.SUPPLIES).toBe('supplies');
    expect(OrderType.VACCINES).toBe('vaccines');
  });

  it('should have correct OrderPriority values', () => {
    expect(OrderPriority.LOW).toBe('low');
    expect(OrderPriority.NORMAL).toBe('normal');
    expect(OrderPriority.HIGH).toBe('high');
    expect(OrderPriority.URGENT).toBe('urgent');
  });
});

describe('State Transition Validation', () => {
  describe('isValidTransition', () => {
    it('should allow DRAFT -> SUBMITTED transition', () => {
      expect(isValidTransition(OrderStatus.DRAFT, OrderStatus.SUBMITTED)).toBe(true);
    });

    it('should not allow DRAFT -> APPROVED transition (skipping SUBMITTED)', () => {
      expect(isValidTransition(OrderStatus.DRAFT, OrderStatus.APPROVED)).toBe(false);
    });

    it('should allow SUBMITTED -> APPROVED transition', () => {
      expect(isValidTransition(OrderStatus.SUBMITTED, OrderStatus.APPROVED)).toBe(true);
    });

    it('should allow SUBMITTED -> REJECTED transition', () => {
      expect(isValidTransition(OrderStatus.SUBMITTED, OrderStatus.REJECTED)).toBe(true);
    });

    it('should not allow SUBMITTED -> PACKED transition (must be approved first)', () => {
      expect(isValidTransition(OrderStatus.SUBMITTED, OrderStatus.PACKED)).toBe(false);
    });

    it('should allow APPROVED -> PACKED transition', () => {
      expect(isValidTransition(OrderStatus.APPROVED, OrderStatus.PACKED)).toBe(true);
    });

    it('should not allow APPROVED -> SHIPPED transition (must be packed first)', () => {
      expect(isValidTransition(OrderStatus.APPROVED, OrderStatus.SHIPPED)).toBe(false);
    });

    it('should allow REJECTED -> DRAFT transition (resubmission)', () => {
      expect(isValidTransition(OrderStatus.REJECTED, OrderStatus.DRAFT)).toBe(true);
    });

    it('should not allow REJECTED -> SUBMITTED transition (must edit first)', () => {
      expect(isValidTransition(OrderStatus.REJECTED, OrderStatus.SUBMITTED)).toBe(false);
    });

    it('should allow PACKED -> SHIPPED transition', () => {
      expect(isValidTransition(OrderStatus.PACKED, OrderStatus.SHIPPED)).toBe(true);
    });

    it('should allow SHIPPED -> RECEIVED transition', () => {
      expect(isValidTransition(OrderStatus.SHIPPED, OrderStatus.RECEIVED)).toBe(true);
    });

    it('should allow RECEIVED -> FULFILLED transition', () => {
      expect(isValidTransition(OrderStatus.RECEIVED, OrderStatus.FULFILLED)).toBe(true);
    });

    it('should allow RECEIVED -> RETURNED transition', () => {
      expect(isValidTransition(OrderStatus.RECEIVED, OrderStatus.RETURNED)).toBe(true);
    });

    it('should not allow FULFILLED -> any transition (terminal state)', () => {
      expect(isValidTransition(OrderStatus.FULFILLED, OrderStatus.RETURNED)).toBe(false);
      expect(isValidTransition(OrderStatus.FULFILLED, OrderStatus.DRAFT)).toBe(false);
    });

    it('should allow RETURNED -> RETURN_COMPLETE transition', () => {
      expect(isValidTransition(OrderStatus.RETURNED, OrderStatus.RETURN_COMPLETE)).toBe(true);
    });

    it('should not allow RETURN_COMPLETE -> any transition (terminal state)', () => {
      expect(isValidTransition(OrderStatus.RETURN_COMPLETE, OrderStatus.DRAFT)).toBe(false);
      expect(isValidTransition(OrderStatus.RETURN_COMPLETE, OrderStatus.FULFILLED)).toBe(false);
    });

    it('should not allow backward transitions except REJECTED -> DRAFT', () => {
      expect(isValidTransition(OrderStatus.SHIPPED, OrderStatus.PACKED)).toBe(false);
      expect(isValidTransition(OrderStatus.PACKED, OrderStatus.APPROVED)).toBe(false);
      expect(isValidTransition(OrderStatus.APPROVED, OrderStatus.SUBMITTED)).toBe(false);
      expect(isValidTransition(OrderStatus.SUBMITTED, OrderStatus.DRAFT)).toBe(false);
    });
  });

  describe('getNextStates', () => {
    it('should return correct next states for DRAFT', () => {
      const nextStates = getNextStates(OrderStatus.DRAFT);
      expect(nextStates).toEqual([OrderStatus.SUBMITTED]);
    });

    it('should return correct next states for SUBMITTED', () => {
      const nextStates = getNextStates(OrderStatus.SUBMITTED);
      expect(nextStates).toContain(OrderStatus.APPROVED);
      expect(nextStates).toContain(OrderStatus.REJECTED);
      expect(nextStates.length).toBe(2);
    });

    it('should return correct next states for RECEIVED', () => {
      const nextStates = getNextStates(OrderStatus.RECEIVED);
      expect(nextStates).toContain(OrderStatus.FULFILLED);
      expect(nextStates).toContain(OrderStatus.RETURNED);
      expect(nextStates.length).toBe(2);
    });

    it('should return empty array for terminal states', () => {
      expect(getNextStates(OrderStatus.FULFILLED)).toEqual([]);
      expect(getNextStates(OrderStatus.RETURN_COMPLETE)).toEqual([]);
    });

    it('should return single next state for REJECTED', () => {
      const nextStates = getNextStates(OrderStatus.REJECTED);
      expect(nextStates).toEqual([OrderStatus.DRAFT]);
    });
  });
});

describe('Order Editability', () => {
  describe('canEditOrder', () => {
    it('should allow editing in DRAFT state', () => {
      expect(canEditOrder(OrderStatus.DRAFT)).toBe(true);
    });

    it('should allow editing in REJECTED state', () => {
      expect(canEditOrder(OrderStatus.REJECTED)).toBe(true);
    });

    it('should not allow editing in SUBMITTED state', () => {
      expect(canEditOrder(OrderStatus.SUBMITTED)).toBe(false);
    });

    it('should not allow editing in APPROVED state', () => {
      expect(canEditOrder(OrderStatus.APPROVED)).toBe(false);
    });

    it('should not allow editing in PACKED state', () => {
      expect(canEditOrder(OrderStatus.PACKED)).toBe(false);
    });

    it('should not allow editing in SHIPPED state', () => {
      expect(canEditOrder(OrderStatus.SHIPPED)).toBe(false);
    });

    it('should not allow editing in RECEIVED state', () => {
      expect(canEditOrder(OrderStatus.RECEIVED)).toBe(false);
    });

    it('should not allow editing in FULFILLED state', () => {
      expect(canEditOrder(OrderStatus.FULFILLED)).toBe(false);
    });

    it('should not allow editing in RETURNED state', () => {
      expect(canEditOrder(OrderStatus.RETURNED)).toBe(false);
    });

    it('should not allow editing in RETURN_COMPLETE state', () => {
      expect(canEditOrder(OrderStatus.RETURN_COMPLETE)).toBe(false);
    });
  });

  describe('EDITABLE_STATES constant', () => {
    it('should only contain DRAFT and REJECTED', () => {
      expect(EDITABLE_STATES).toEqual([OrderStatus.DRAFT, OrderStatus.REJECTED]);
      expect(EDITABLE_STATES.length).toBe(2);
    });
  });
});

describe('Order Deletability', () => {
  describe('canDeleteOrder', () => {
    it('should allow deletion in DRAFT state', () => {
      expect(canDeleteOrder(OrderStatus.DRAFT)).toBe(true);
    });

    it('should not allow deletion in REJECTED state', () => {
      expect(canDeleteOrder(OrderStatus.REJECTED)).toBe(false);
    });

    it('should not allow deletion in SUBMITTED state', () => {
      expect(canDeleteOrder(OrderStatus.SUBMITTED)).toBe(false);
    });

    it('should not allow deletion in any other state', () => {
      expect(canDeleteOrder(OrderStatus.APPROVED)).toBe(false);
      expect(canDeleteOrder(OrderStatus.PACKED)).toBe(false);
      expect(canDeleteOrder(OrderStatus.SHIPPED)).toBe(false);
      expect(canDeleteOrder(OrderStatus.RECEIVED)).toBe(false);
      expect(canDeleteOrder(OrderStatus.FULFILLED)).toBe(false);
      expect(canDeleteOrder(OrderStatus.RETURNED)).toBe(false);
      expect(canDeleteOrder(OrderStatus.RETURN_COMPLETE)).toBe(false);
    });
  });

  describe('DELETABLE_STATES constant', () => {
    it('should only contain DRAFT', () => {
      expect(DELETABLE_STATES).toEqual([OrderStatus.DRAFT]);
      expect(DELETABLE_STATES.length).toBe(1);
    });
  });
});

describe('Terminal States', () => {
  describe('isTerminalState', () => {
    it('should identify FULFILLED as terminal state', () => {
      expect(isTerminalState(OrderStatus.FULFILLED)).toBe(true);
    });

    it('should identify RETURN_COMPLETE as terminal state', () => {
      expect(isTerminalState(OrderStatus.RETURN_COMPLETE)).toBe(true);
    });

    it('should not identify DRAFT as terminal state', () => {
      expect(isTerminalState(OrderStatus.DRAFT)).toBe(false);
    });

    it('should not identify RECEIVED as terminal state', () => {
      expect(isTerminalState(OrderStatus.RECEIVED)).toBe(false);
    });

    it('should not identify RETURNED as terminal state', () => {
      expect(isTerminalState(OrderStatus.RETURNED)).toBe(false);
    });

    it('should not identify any non-terminal states as terminal', () => {
      expect(isTerminalState(OrderStatus.SUBMITTED)).toBe(false);
      expect(isTerminalState(OrderStatus.APPROVED)).toBe(false);
      expect(isTerminalState(OrderStatus.REJECTED)).toBe(false);
      expect(isTerminalState(OrderStatus.PACKED)).toBe(false);
      expect(isTerminalState(OrderStatus.SHIPPED)).toBe(false);
    });
  });

  describe('TERMINAL_STATES constant', () => {
    it('should contain FULFILLED and RETURN_COMPLETE only', () => {
      expect(TERMINAL_STATES).toContain(OrderStatus.FULFILLED);
      expect(TERMINAL_STATES).toContain(OrderStatus.RETURN_COMPLETE);
      expect(TERMINAL_STATES.length).toBe(2);
    });
  });
});

describe('VALID_TRANSITIONS Configuration', () => {
  it('should have entries for all order statuses', () => {
    const allStatuses = Object.values(OrderStatus);
    allStatuses.forEach(status => {
      expect(VALID_TRANSITIONS).toHaveProperty(status);
    });
  });

  it('should have empty arrays for terminal states', () => {
    expect(VALID_TRANSITIONS[OrderStatus.FULFILLED]).toEqual([]);
    expect(VALID_TRANSITIONS[OrderStatus.RETURN_COMPLETE]).toEqual([]);
  });

  it('should not allow self-transitions', () => {
    Object.entries(VALID_TRANSITIONS).forEach(([status, nextStates]) => {
      expect(nextStates).not.toContain(status);
    });
  });

  it('should define complete workflow from DRAFT to FULFILLED', () => {
    // Main happy path: DRAFT -> SUBMITTED -> APPROVED -> PACKED -> SHIPPED -> RECEIVED -> FULFILLED
    expect(VALID_TRANSITIONS[OrderStatus.DRAFT]).toContain(OrderStatus.SUBMITTED);
    expect(VALID_TRANSITIONS[OrderStatus.SUBMITTED]).toContain(OrderStatus.APPROVED);
    expect(VALID_TRANSITIONS[OrderStatus.APPROVED]).toContain(OrderStatus.PACKED);
    expect(VALID_TRANSITIONS[OrderStatus.PACKED]).toContain(OrderStatus.SHIPPED);
    expect(VALID_TRANSITIONS[OrderStatus.SHIPPED]).toContain(OrderStatus.RECEIVED);
    expect(VALID_TRANSITIONS[OrderStatus.RECEIVED]).toContain(OrderStatus.FULFILLED);
  });

  it('should define rejection and resubmission workflow', () => {
    // Rejection flow: SUBMITTED -> REJECTED -> DRAFT -> SUBMITTED
    expect(VALID_TRANSITIONS[OrderStatus.SUBMITTED]).toContain(OrderStatus.REJECTED);
    expect(VALID_TRANSITIONS[OrderStatus.REJECTED]).toContain(OrderStatus.DRAFT);
  });

  it('should define return workflow', () => {
    // Return flow: RECEIVED -> RETURNED -> RETURN_COMPLETE
    expect(VALID_TRANSITIONS[OrderStatus.RECEIVED]).toContain(OrderStatus.RETURNED);
    expect(VALID_TRANSITIONS[OrderStatus.RETURNED]).toContain(OrderStatus.RETURN_COMPLETE);
  });
});

describe('Edge Cases', () => {
  it('should handle undefined status gracefully in isValidTransition', () => {
    expect(isValidTransition(undefined as any, OrderStatus.DRAFT)).toBe(false);
    expect(isValidTransition(OrderStatus.DRAFT, undefined as any)).toBe(false);
  });

  it('should handle invalid status strings in isValidTransition', () => {
    expect(isValidTransition('INVALID' as OrderStatus, OrderStatus.DRAFT)).toBe(false);
    expect(isValidTransition(OrderStatus.DRAFT, 'INVALID' as OrderStatus)).toBe(false);
  });

  it('should handle undefined status in getNextStates', () => {
    expect(getNextStates(undefined as any)).toEqual([]);
  });

  it('should handle invalid status in getNextStates', () => {
    expect(getNextStates('INVALID' as OrderStatus)).toEqual([]);
  });
});
