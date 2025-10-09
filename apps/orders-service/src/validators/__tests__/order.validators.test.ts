/**
 * Order Validators Unit Tests
 *
 * Comprehensive tests for Joi validation schemas and business rules
 */

import { validators } from '../order.validators';
import { OrderType, OrderPriority, OrderStatus } from '../../types/order-status';

describe('Order Validators', () => {
  describe('createOrder validator', () => {
    const validOrderData = {
      facilityId: 'facility-001',
      departmentId: 'dept-001',
      orderType: OrderType.MEDICINE,
      priority: OrderPriority.NORMAL,
      requestedBy: 'user-123',
      requiredDate: new Date(Date.now() + 86400000 * 7).toISOString(), // 7 days from now
      items: [
        {
          name: 'Paracetamol 500mg',
          description: 'Pain relief medication',
          category: 'Pharmaceuticals',
          subcategory: 'Analgesics',
          manufacturer: 'PharmaCorp',
          sku: 'PAR-500-100',
          unitOfMeasure: 'box',
          quantityOrdered: 10,
          unitPrice: 5.99,
          totalPrice: 59.90
        }
      ],
      deliveryAddress: {
        street: '123 Hospital Drive',
        city: 'Medical City',
        state: 'CA',
        zipCode: '90210',
        country: 'USA',
        buildingName: 'Main Building',
        floor: '3rd Floor',
        room: 'Pharmacy Storage',
        deliveryInstructions: 'Use service elevator'
      },
      notes: 'Urgent requirement for emergency department',
      tags: ['emergency', 'pharmaceutical']
    };

    it('should validate valid order creation data', () => {
      const result = validators.createOrder(validOrderData);
      expect(result).toBeDefined();
      expect(result.facilityId).toBe('facility-001');
      expect(result.items).toHaveLength(1);
    });

    it('should reject order without facilityId', () => {
      const invalidData = { ...validOrderData };
      delete (invalidData as any).facilityId;

      expect(() => validators.createOrder(invalidData)).toThrow(/Validation failed/);
    });

    it('should reject order without requestedBy', () => {
      const invalidData = { ...validOrderData };
      delete (invalidData as any).requestedBy;

      expect(() => validators.createOrder(invalidData)).toThrow(/Validation failed/);
    });

    it('should reject order without items', () => {
      const invalidData = { ...validOrderData };
      delete (invalidData as any).items;

      expect(() => validators.createOrder(invalidData)).toThrow(/Validation failed/);
    });

    it('should reject order with empty items array', () => {
      const invalidData = { ...validOrderData, items: [] };

      expect(() => validators.createOrder(invalidData)).toThrow(/Validation failed/);
    });

    it('should reject order without deliveryAddress', () => {
      const invalidData = { ...validOrderData };
      delete (invalidData as any).deliveryAddress;

      expect(() => validators.createOrder(invalidData)).toThrow(/Validation failed/);
    });

    it('should reject order with invalid orderType', () => {
      const invalidData = { ...validOrderData, orderType: 'invalid-type' };

      expect(() => validators.createOrder(invalidData)).toThrow(/Validation failed/);
    });

    it('should reject order with invalid priority', () => {
      const invalidData = { ...validOrderData, priority: 'super-urgent' };

      expect(() => validators.createOrder(invalidData)).toThrow(/Validation failed/);
    });

    it('should reject order with requiredDate in the past', () => {
      const invalidData = {
        ...validOrderData,
        requiredDate: new Date(Date.now() - 86400000).toISOString() // yesterday
      };

      expect(() => validators.createOrder(invalidData)).toThrow(/Required date must be in the future/);
    });

    it('should reject order with requiredDate being now', () => {
      const invalidData = {
        ...validOrderData,
        requiredDate: new Date().toISOString()
      };

      expect(() => validators.createOrder(invalidData)).toThrow(/Required date must be in the future/);
    });

    it('should accept order with departmentId optional', () => {
      const dataWithoutDept = { ...validOrderData };
      delete (dataWithoutDept as any).departmentId;

      const result = validators.createOrder(dataWithoutDept);
      expect(result).toBeDefined();
      expect(result).not.toHaveProperty('departmentId');
    });

    it('should accept order with vendor information', () => {
      const dataWithVendor = {
        ...validOrderData,
        vendor: {
          vendorName: 'Medical Supplies Inc',
          contactPerson: 'John Vendor',
          phoneNumber: '+14155551234',
          email: 'vendor@example.com',
          accountNumber: 'ACC-12345'
        }
      };

      const result = validators.createOrder(dataWithVendor);
      expect(result).toBeDefined();
      expect(result.vendor).toBeDefined();
      expect(result.vendor?.vendorName).toBe('Medical Supplies Inc');
    });

    it('should reject items with quantity less than 1', () => {
      const invalidData = {
        ...validOrderData,
        items: [{ ...validOrderData.items[0], quantityOrdered: 0 }]
      };

      expect(() => validators.createOrder(invalidData)).toThrow(/Validation failed/);
    });

    it('should reject items with negative price', () => {
      const invalidData = {
        ...validOrderData,
        items: [{ ...validOrderData.items[0], unitPrice: -5.99 }]
      };

      expect(() => validators.createOrder(invalidData)).toThrow(/Validation failed/);
    });

    it('should validate financial calculations correctly', () => {
      const dataWithFinancials = {
        ...validOrderData,
        financials: {
          subtotal: 100.00,
          taxAmount: 10.00,
          shippingCost: 15.00,
          discountAmount: 5.00,
          totalAmount: 120.00,
          currency: 'USD'
        }
      };

      const result = validators.createOrder(dataWithFinancials);
      expect(result).toBeDefined();
      expect(result.financials?.totalAmount).toBe(120.00);
    });

    it('should reject incorrect financial calculations', () => {
      const dataWithBadFinancials = {
        ...validOrderData,
        financials: {
          subtotal: 100.00,
          taxAmount: 10.00,
          shippingCost: 15.00,
          discountAmount: 5.00,
          totalAmount: 200.00, // Wrong calculation
          currency: 'USD'
        }
      };

      expect(() => validators.createOrder(dataWithBadFinancials)).toThrow(/Total amount does not match calculated value/);
    });

    it('should accept valid tags array', () => {
      const dataWithTags = {
        ...validOrderData,
        tags: ['urgent', 'high-priority', 'medical']
      };

      const result = validators.createOrder(dataWithTags);
      expect(result.tags).toEqual(['urgent', 'high-priority', 'medical']);
    });

    it('should reject more than 10 tags', () => {
      const dataWithTooManyTags = {
        ...validOrderData,
        tags: Array(11).fill('tag')
      };

      expect(() => validators.createOrder(dataWithTooManyTags)).toThrow(/Validation failed/);
    });

    it('should accept custom fields', () => {
      const dataWithCustomFields = {
        ...validOrderData,
        customFields: {
          projectCode: 'PROJ-001',
          costCenter: 'CC-123',
          metadata: { foo: 'bar' }
        }
      };

      const result = validators.createOrder(dataWithCustomFields);
      expect(result.customFields).toBeDefined();
      expect(result.customFields?.projectCode).toBe('PROJ-001');
    });
  });

  describe('updateOrder validator', () => {
    it('should validate partial update with only priority', () => {
      const updateData = {
        priority: OrderPriority.HIGH
      };

      const result = validators.updateOrder(updateData);
      expect(result.priority).toBe(OrderPriority.HIGH);
    });

    it('should validate partial update with only requiredDate', () => {
      const futureDate = new Date(Date.now() + 86400000 * 10).toISOString();
      const updateData = {
        requiredDate: futureDate
      };

      const result = validators.updateOrder(updateData);
      expect(result.requiredDate).toBe(futureDate);
    });

    it('should reject requiredDate in the past for updates', () => {
      const updateData = {
        requiredDate: new Date(Date.now() - 86400000).toISOString()
      };

      expect(() => validators.updateOrder(updateData)).toThrow(/Required date must be in the future/);
    });

    it('should reject empty update object', () => {
      expect(() => validators.updateOrder({})).toThrow(/Validation failed/);
    });

    it('should allow updating items', () => {
      const updateData = {
        items: [
          {
            name: 'Updated Item',
            category: 'Medical',
            unitOfMeasure: 'unit',
            quantityOrdered: 5
          }
        ]
      };

      const result = validators.updateOrder(updateData);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Updated Item');
    });

    it('should allow updating delivery address', () => {
      const updateData = {
        deliveryAddress: {
          street: '456 New Street',
          city: 'New City',
          state: 'NY',
          zipCode: '10001',
          country: 'USA'
        }
      };

      const result = validators.updateOrder(updateData);
      expect(result.deliveryAddress?.city).toBe('New City');
    });
  });

  describe('orderFilters validator', () => {
    it('should validate empty filters with defaults', () => {
      const result = validators.orderFilters({});
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
      expect(result.sortBy).toBe('createdAt');
      expect(result.sortOrder).toBe('desc');
    });

    it('should validate facilityId filter', () => {
      const filters = { facilityId: 'facility-001' };
      const result = validators.orderFilters(filters);
      expect(result.facilityId).toBe('facility-001');
    });

    it('should validate status filter', () => {
      const filters = { status: OrderStatus.APPROVED };
      const result = validators.orderFilters(filters);
      expect(result.status).toBe(OrderStatus.APPROVED);
    });

    it('should validate date range filter', () => {
      const filters = {
        dateFrom: '2024-01-01T00:00:00Z',
        dateTo: '2024-12-31T23:59:59Z'
      };

      const result = validators.orderFilters(filters);
      expect(result.dateFrom).toBeDefined();
      expect(result.dateTo).toBeDefined();
      expect(new Date(result.dateFrom!).getTime()).toBe(new Date('2024-01-01T00:00:00Z').getTime());
      expect(new Date(result.dateTo!).getTime()).toBe(new Date('2024-12-31T23:59:59Z').getTime());
    });

    it('should reject invalid date range (from >= to)', () => {
      const filters = {
        dateFrom: '2024-12-31T00:00:00Z',
        dateTo: '2024-01-01T00:00:00Z'
      };

      expect(() => validators.orderFilters(filters)).toThrow(/dateFrom must be before dateTo/);
    });

    it('should validate limit and offset', () => {
      const filters = { limit: 100, offset: 50 };
      const result = validators.orderFilters(filters);
      expect(result.limit).toBe(100);
      expect(result.offset).toBe(50);
    });

    it('should reject limit greater than 1000', () => {
      const filters = { limit: 1001 };
      expect(() => validators.orderFilters(filters)).toThrow(/Validation failed/);
    });

    it('should reject negative offset', () => {
      const filters = { offset: -1 };
      expect(() => validators.orderFilters(filters)).toThrow(/Validation failed/);
    });

    it('should validate sortBy and sortOrder', () => {
      const filters = { sortBy: 'priority' as const, sortOrder: 'asc' as const };
      const result = validators.orderFilters(filters);
      expect(result.sortBy).toBe('priority');
      expect(result.sortOrder).toBe('asc');
    });

    it('should reject invalid sortBy value', () => {
      const filters = { sortBy: 'invalidField' };
      expect(() => validators.orderFilters(filters)).toThrow(/Validation failed/);
    });
  });

  describe('rejectOrder validator', () => {
    it('should validate rejection with reason', () => {
      const rejectData = {
        rejectionReason: 'Budget constraints - need approval from finance department',
        notes: 'Will reconsider next quarter',
        userId: 'approver-123'
      };

      const result = validators.rejectOrder(rejectData);
      expect(result.rejectionReason).toBeDefined();
      expect(result.userId).toBe('approver-123');
    });

    it('should reject without rejection reason', () => {
      const invalidData = {
        notes: 'Some notes',
        userId: 'approver-123'
      };

      expect(() => validators.rejectOrder(invalidData)).toThrow(/Validation failed/);
    });

    it('should reject with too short rejection reason', () => {
      const invalidData = {
        rejectionReason: 'Short',
        userId: 'approver-123'
      };

      expect(() => validators.rejectOrder(invalidData)).toThrow(/Validation failed/);
    });

    it('should reject without userId', () => {
      const invalidData = {
        rejectionReason: 'Valid reason with enough characters'
      };

      expect(() => validators.rejectOrder(invalidData)).toThrow(/Validation failed/);
    });
  });

  describe('approveOrder validator', () => {
    it('should validate approval with only userId', () => {
      const approveData = { userId: 'approver-123' };
      const result = validators.approveOrder(approveData);
      expect(result.userId).toBe('approver-123');
    });

    it('should validate approval with notes', () => {
      const approveData = {
        userId: 'approver-123',
        notes: 'Approved for Q1 budget'
      };

      const result = validators.approveOrder(approveData);
      expect(result.notes).toBe('Approved for Q1 budget');
    });

    it('should reject approval without userId', () => {
      expect(() => validators.approveOrder({})).toThrow(/Validation failed/);
    });
  });

  describe('returnRequest validator', () => {
    const validReturnData = {
      returnReason: 'Items arrived damaged during shipment and cannot be used safely',
      returnType: 'damaged' as const,
      returnedItems: [
        {
          itemId: '550e8400-e29b-41d4-a716-446655440000', // Valid UUIDv4
          quantityReturned: 5,
          condition: 'Boxes crushed, contents compromised',
          notes: 'Visible damage to outer packaging'
        }
      ],
      notes: 'Will need urgent replacement',
      userId: 'receiver-123'
    };

    it('should validate valid return request', () => {
      const result = validators.returnRequest(validReturnData);
      expect(result.returnType).toBe('damaged');
      expect(result.returnedItems).toHaveLength(1);
    });

    it('should accept all valid return types', () => {
      const returnTypes: Array<'damaged' | 'wrong_item' | 'quality_issue' | 'not_needed' | 'expired'> = [
        'damaged',
        'wrong_item',
        'quality_issue',
        'not_needed',
        'expired'
      ];

      returnTypes.forEach(returnType => {
        const data = { ...validReturnData, returnType };
        const result = validators.returnRequest(data);
        expect(result.returnType).toBe(returnType);
      });
    });

    it('should reject invalid return type', () => {
      const invalidData = { ...validReturnData, returnType: 'unknown_reason' };
      expect(() => validators.returnRequest(invalidData)).toThrow(/Validation failed/);
    });

    it('should reject without returnedItems', () => {
      const invalidData = { ...validReturnData };
      delete (invalidData as any).returnedItems;
      expect(() => validators.returnRequest(invalidData)).toThrow(/Validation failed/);
    });

    it('should reject with empty returnedItems array', () => {
      const invalidData = { ...validReturnData, returnedItems: [] };
      expect(() => validators.returnRequest(invalidData)).toThrow(/Validation failed/);
    });

    it('should reject returnedItems without valid UUID itemId', () => {
      const invalidData = {
        ...validReturnData,
        returnedItems: [
          {
            itemId: 'not-a-uuid',
            quantityReturned: 5,
            condition: 'Damaged'
          }
        ]
      };

      expect(() => validators.returnRequest(invalidData)).toThrow(/Validation failed/);
    });

    it('should reject returnedItems with quantity less than 1', () => {
      const invalidData = {
        ...validReturnData,
        returnedItems: [
          {
            ...validReturnData.returnedItems[0],
            quantityReturned: 0
          }
        ]
      };

      expect(() => validators.returnRequest(invalidData)).toThrow(/Validation failed/);
    });
  });

  describe('shippingData validator', () => {
    it('should validate shipping data with tracking number', () => {
      const shippingData = {
        trackingNumber: 'TRACK123456789',
        carrier: 'FedEx',
        estimatedDelivery: new Date(Date.now() + 86400000 * 3).toISOString(),
        userId: 'warehouse-123'
      };

      const result = validators.shippingData(shippingData);
      expect(result.trackingNumber).toBe('TRACK123456789');
      expect(result.carrier).toBe('FedEx');
    });

    it('should validate shipping data with only userId', () => {
      const shippingData = { userId: 'warehouse-123' };
      const result = validators.shippingData(shippingData);
      expect(result.userId).toBe('warehouse-123');
    });

    it('should reject without userId', () => {
      const invalidData = { trackingNumber: 'TRACK123' };
      expect(() => validators.shippingData(invalidData)).toThrow(/Validation failed/);
    });
  });

  describe('receivedData validator', () => {
    it('should validate received data', () => {
      const receivedData = {
        receivedBy: 'staff-456',
        deliveredBy: 'FedEx Driver John',
        notes: 'All items received in good condition',
        userId: 'receiver-123'
      };

      const result = validators.receivedData(receivedData);
      expect(result.receivedBy).toBe('staff-456');
      expect(result.deliveredBy).toBe('FedEx Driver John');
    });

    it('should require receivedBy field', () => {
      const invalidData = {
        notes: 'Received',
        userId: 'receiver-123'
      };

      expect(() => validators.receivedData(invalidData)).toThrow(/Validation failed/);
    });

    it('should require userId field', () => {
      const invalidData = {
        receivedBy: 'staff-456'
      };

      expect(() => validators.receivedData(invalidData)).toThrow(/Validation failed/);
    });
  });

  describe('fulfillmentData validator', () => {
    it('should validate fulfillment data with satisfaction rating', () => {
      const fulfillmentData = {
        satisfactionRating: 9,
        completionNotes: 'Order completed successfully, excellent quality',
        userId: 'requester-123'
      };

      const result = validators.fulfillmentData(fulfillmentData);
      expect(result.satisfactionRating).toBe(9);
    });

    it('should validate fulfillment data with only userId', () => {
      const fulfillmentData = { userId: 'requester-123' };
      const result = validators.fulfillmentData(fulfillmentData);
      expect(result.userId).toBe('requester-123');
    });

    it('should reject satisfaction rating less than 1', () => {
      const invalidData = {
        satisfactionRating: 0,
        userId: 'requester-123'
      };

      expect(() => validators.fulfillmentData(invalidData)).toThrow(/Validation failed/);
    });

    it('should reject satisfaction rating greater than 10', () => {
      const invalidData = {
        satisfactionRating: 11,
        userId: 'requester-123'
      };

      expect(() => validators.fulfillmentData(invalidData)).toThrow(/Validation failed/);
    });
  });

  describe('deleteOrder validator', () => {
    it('should validate deletion with reason', () => {
      const deleteData = {
        deletionReason: 'Duplicate order created by mistake',
        userId: 'requester-123'
      };

      const result = validators.deleteOrder(deleteData);
      expect(result.deletionReason).toBeDefined();
      expect(result.userId).toBe('requester-123');
    });

    it('should reject deletion without reason', () => {
      const invalidData = { userId: 'requester-123' };
      expect(() => validators.deleteOrder(invalidData)).toThrow(/Validation failed/);
    });

    it('should reject deletion with short reason', () => {
      const invalidData = {
        deletionReason: 'Dup',
        userId: 'requester-123'
      };

      expect(() => validators.deleteOrder(invalidData)).toThrow(/Validation failed/);
    });
  });

  describe('Edge Cases and Security', () => {
    it('should strip unknown fields from createOrder', () => {
      const dataWithUnknown = {
        facilityId: 'facility-001',
        orderType: OrderType.MEDICINE,
        priority: OrderPriority.NORMAL,
        requestedBy: 'user-123',
        requiredDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        items: [
          {
            name: 'Test Item',
            category: 'Medical',
            unitOfMeasure: 'unit',
            quantityOrdered: 1
          }
        ],
        deliveryAddress: {
          street: '123 St',
          city: 'City',
          state: 'CA',
          zipCode: '12345',
          country: 'USA'
        },
        maliciousField: 'should be removed',
        anotherBadField: { evil: 'payload' }
      } as any;

      const result = validators.createOrder(dataWithUnknown);
      expect(result).not.toHaveProperty('maliciousField');
      expect(result).not.toHaveProperty('anotherBadField');
    });

    it('should handle very long notes strings gracefully', () => {
      const dataWithLongNotes = {
        facilityId: 'facility-001',
        orderType: OrderType.MEDICINE,
        priority: OrderPriority.NORMAL,
        requestedBy: 'user-123',
        requiredDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        items: [
          {
            name: 'Test Item',
            category: 'Medical',
            unitOfMeasure: 'unit',
            quantityOrdered: 1
          }
        ],
        deliveryAddress: {
          street: '123 St',
          city: 'City',
          state: 'CA',
          zipCode: '12345',
          country: 'USA'
        },
        notes: 'x'.repeat(2001) // Exceeds 2000 character limit
      };

      expect(() => validators.createOrder(dataWithLongNotes)).toThrow(/Validation failed/);
    });

    it('should validate email format in vendor info', () => {
      const dataWithInvalidEmail = {
        facilityId: 'facility-001',
        orderType: OrderType.MEDICINE,
        priority: OrderPriority.NORMAL,
        requestedBy: 'user-123',
        requiredDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        items: [
          {
            name: 'Test Item',
            category: 'Medical',
            unitOfMeasure: 'unit',
            quantityOrdered: 1
          }
        ],
        deliveryAddress: {
          street: '123 St',
          city: 'City',
          state: 'CA',
          zipCode: '12345',
          country: 'USA'
        },
        vendor: {
          vendorName: 'Test Vendor',
          email: 'not-an-email'
        }
      };

      expect(() => validators.createOrder(dataWithInvalidEmail)).toThrow(/Validation failed/);
    });

    it('should validate phone number format in vendor info', () => {
      const dataWithInvalidPhone = {
        facilityId: 'facility-001',
        orderType: OrderType.MEDICINE,
        priority: OrderPriority.NORMAL,
        requestedBy: 'user-123',
        requiredDate: new Date(Date.now() + 86400000 * 7).toISOString(),
        items: [
          {
            name: 'Test Item',
            category: 'Medical',
            unitOfMeasure: 'unit',
            quantityOrdered: 1
          }
        ],
        deliveryAddress: {
          street: '123 St',
          city: 'City',
          state: 'CA',
          zipCode: '12345',
          country: 'USA'
        },
        vendor: {
          vendorName: 'Test Vendor',
          phoneNumber: 'abc-def-ghij' // Invalid format
        }
      };

      expect(() => validators.createOrder(dataWithInvalidPhone)).toThrow(/Validation failed/);
    });
  });
});
