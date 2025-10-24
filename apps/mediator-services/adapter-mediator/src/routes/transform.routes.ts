/**
 * Adapter Transformation Routes
 * Transforms downstream requests (Pharmacy/Billing) to Orders Service format
 */

import { Router, Request, Response } from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { config } from '../config';

const router: Router = Router();
const transformLogger = logger.child({ context: 'transform-routes' });

/**
 * OpenHIM mediator response builder
 */
function buildMediatorResponse(
  status: 'Successful' | 'Failed',
  statusCode: number,
  message: string,
  body: any = {},
  orchestrations: any[] = []
) {
  return {
    'x-mediator-urn': 'urn:mediator:smile-adapter',
    status,
    response: {
      status: statusCode,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ message, data: body, timestamp: new Date().toISOString() }),
      timestamp: new Date().toISOString(),
    },
    orchestrations,
  };
}

/**
 * Transform pharmacy format to Orders Service JSON
 */
function transformPharmacyToOrders(pharmacyData: any): any {
  const items = (pharmacyData.items || []).map((item: any, idx: number) => {
    // Handle both string items (for display) and structured items (with medicineId, name, etc.)
    if (typeof item === 'string') {
      return {
        medicineId: `MED-${idx + 1}`,
        name: item,
        category: 'medicine-supplies',
        unitOfMeasure: 'units',
        quantityOrdered: 1,
      };
    }
    return {
      medicineId: item.medicineId || `MED-${idx + 1}`,
      name: item.name || item,
      category: item.category || 'medicine-supplies',
      unitOfMeasure: item.unitOfMeasure || 'units',
      quantityOrdered: item.quantity || item.quantityOrdered || 1,
    };
  });

  return {
    orderType: 'medicine',
    items,
    facilityId: pharmacyData.facility || 'unknown',
    departmentId: 'pharmacy',
    requestedBy: pharmacyData.requested_by || 'system',
    priority: pharmacyData.priority || 'normal',
    requiredDate: pharmacyData.requiredDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    deliveryAddress: {
      street: pharmacyData.deliveryAddress?.street || 'Main Street',
      city: pharmacyData.deliveryAddress?.city || pharmacyData.facility || 'Main City',
      state: pharmacyData.deliveryAddress?.state || 'ST',
      zipCode: pharmacyData.deliveryAddress?.zipCode || '12345',
      country: pharmacyData.deliveryAddress?.country || 'Country',
    },
    metadata: {
      source: 'pharmacy-system',
      sourceOrderId: pharmacyData.pharmacy_order_id,
      transformedAt: new Date().toISOString(),
    }
  };
}

/**
 * Transform billing format to Orders Service JSON
 */
function transformBillingToOrders(billingData: any): any {
  return {
    orderId: billingData.order_id, // Used to determine endpoint for PUT request
    financials: {
      totalAmount: billingData.cost,
      currency: billingData.currency || 'USD',
      paymentTerms: billingData.payment_status || 'pending',
      budgetCode: billingData.invoice_number,
    },
    metadata: {
      source: 'billing-system',
      sourceInvoiceNumber: billingData.invoice_number,
      paymentStatus: billingData.payment_status,
      action: billingData.action,
      transformedAt: new Date().toISOString(),
    }
  };
}

/**
 * Transform Orders Service response back to pharmacy format
 */
function transformOrdersToPharmacy(ordersResponse: any, originalData: any): any {
  return {
    status: 'success',
    pharmacy_order_id: originalData.pharmacy_order_id,
    orders_service_id: ordersResponse.orderId || ordersResponse.id,
    orders_status: ordersResponse.status,
    created_at: ordersResponse.createdAt || new Date().toISOString(),
    message: 'Order successfully created in Orders Service',
  };
}

/**
 * Transform Orders Service response back to billing format
 */
function transformOrdersToBilling(ordersResponse: any, originalData: any): any {
  return {
    status: 'success',
    order_id: originalData.order_id,
    orders_service_id: ordersResponse.order?.orderId || ordersResponse.orderId || ordersResponse.id,
    billing_status: 'recorded',
    updated_at: new Date().toISOString(),
    invoice_number: originalData.invoice_number,
    cost: originalData.cost,
    currency: originalData.currency,
    payment_status: originalData.payment_status,
    message: 'Billing information successfully recorded',
  };
}

/**
 * POST /transform-downstream
 * Transform downstream requests and forward to Orders Service
 */
router.post('/transform-downstream', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();
  const orchestrations: any[] = [];

  try {
    transformLogger.info('Received downstream transformation request', {
      correlationId,
      contentType: req.headers['content-type'],
      method: req.method,
      url: req.url,
    });

    const requestBody = req.body;

    // Log request details
    transformLogger.debug('Request body received', {
      correlationId,
      bodyKeys: Object.keys(requestBody || {}),
    });

    // Identify client type and transform accordingly
    let clientType: string;
    let transformedData: any;
    let clientFormat: any;

    if (requestBody.pharmacy_order_id) {
      // Pharmacy request
      clientType = 'pharmacy';
      transformedData = transformPharmacyToOrders(requestBody);
      clientFormat = requestBody;

      transformLogger.info('Identified PHARMACY request', {
        correlationId,
        pharmacy_order_id: requestBody.pharmacy_order_id,
      });
    } else if (requestBody.order_id && requestBody.action === 'update_billing') {
      // Billing request
      clientType = 'billing';
      transformedData = transformBillingToOrders(requestBody);
      clientFormat = requestBody;

      transformLogger.info('Identified BILLING request', {
        correlationId,
        order_id: requestBody.order_id,
      });
    } else {
      // Unknown format
      const response = buildMediatorResponse(
        'Failed',
        400,
        'Unable to identify request type (expected pharmacy_order_id or billing update)',
        {},
        orchestrations
      );

      transformLogger.warn('Unknown request type', { correlationId });
      res.status(400).json(response);
      return;
    }

    transformLogger.debug('Transformed data created', {
      correlationId,
      clientType,
      transformedDataKeys: Object.keys(transformedData || {}),
    });

    // Determine HTTP method and endpoint
    let httpMethod = 'POST';
    let endpoint = config.client.endpoint;

    if (clientType === 'billing' && transformedData.orderId) {
      httpMethod = 'PUT';
      endpoint = `${config.client.endpoint}/${transformedData.orderId}`;
    }

    transformLogger.info('Forwarding to Orders Service', {
      correlationId,
      method: httpMethod,
      endpoint,
    });

    // Forward to Orders Service
    let ordersResponse: any;
    try {
      if (httpMethod === 'POST') {
        const response = await axios.post(endpoint, transformedData, {
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': correlationId,
            'Authorization': 'Bearer mock-jwt-token',
          },
          timeout: config.client.timeout,
        });
        ordersResponse = response.data;
      } else if (httpMethod === 'PUT') {
        const response = await axios.put(endpoint, transformedData, {
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': correlationId,
            'Authorization': 'Bearer mock-jwt-token',
          },
          timeout: config.client.timeout,
        });
        ordersResponse = response.data;
      }

      transformLogger.info('Orders Service responded successfully', {
        correlationId,
        orderId: ordersResponse?.orderId || ordersResponse?.id,
      });

      // Record orchestration call
      orchestrations.push({
        name: 'Orders Service',
        request: {
          path: endpoint,
          method: httpMethod,
          headers: { 'X-Request-ID': correlationId },
          body: transformedData,
        },
        response: {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: ordersResponse,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (forwardError: any) {
      transformLogger.error('Failed to forward to Orders Service', {
        correlationId,
        error: forwardError.message,
        endpoint,
      });

      const response = buildMediatorResponse(
        'Failed',
        502,
        `Failed to forward request to Orders Service: ${forwardError.message}`,
        { error: forwardError.message },
        orchestrations
      );

      res.status(502).json(response);
      return;
    }

    // Transform response back to client format
    let transformedResponse: any;
    if (clientType === 'pharmacy') {
      transformedResponse = transformOrdersToPharmacy(ordersResponse, clientFormat);
    } else if (clientType === 'billing') {
      transformedResponse = transformOrdersToBilling(ordersResponse, clientFormat);
    } else {
      transformedResponse = ordersResponse;
    }

    transformLogger.debug('Response transformed', {
      correlationId,
      clientType,
      transformedResponseKeys: Object.keys(transformedResponse || {}),
    });

    const duration = Date.now() - startTime;

    // Return successful OpenHIM mediator response
    const response = buildMediatorResponse(
      'Successful',
      200,
      `${clientType.charAt(0).toUpperCase() + clientType.slice(1)} request transformed and processed successfully`,
      transformedResponse,
      orchestrations
    );

    transformLogger.info('Transformation completed successfully', {
      correlationId,
      clientType,
      duration,
      statusCode: 200,
    });

    res.status(200).json(response);

  } catch (error: any) {
    transformLogger.error('Unexpected error during transformation', {
      correlationId,
      error: error.message,
      stack: error.stack,
    });

    const response = buildMediatorResponse(
      'Failed',
      500,
      `Internal server error: ${error.message}`,
      {},
      orchestrations
    );

    res.status(500).json(response);
  }
});

/**
 * GET /health
 */
router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    service: 'adapter-mediator',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

export default router;
