# Swagger Documentation Setup - Complete

## Overview

Swagger/OpenAPI documentation has been added to all three mock client services for easy API exploration and testing.

## Swagger UI URLs

Once the services are running, access Swagger UI at:

- **Warehouse Client**: http://localhost:3203/api-docs
- **FHIR Client**: http://localhost:3201/api-docs
- **HL7 Client**: http://localhost:3202/api-docs

## What's Included

Each Swagger UI provides:

✅ **Interactive API Documentation**
- Complete API specification
- Request/response schemas
- Example payloads
- Try-it-out functionality

✅ **All Endpoints Documented**
- POST /orders - Receive order
- GET /orders - Get all received orders
- GET /orders/latest - Get latest order
- DELETE /orders - Clear all orders
- GET /health - Health check
- GET /stats - Service statistics

## Warehouse Client Example

The warehouse client Swagger is fully configured with:

### OpenAPI Specification

```yaml
openapi: 3.0.0
info:
  title: Mock Warehouse Client API
  version: 1.0.0
  description: Mock warehouse management system for testing multi-client fan-out

servers:
  - url: http://localhost:3203
    description: Local development server

tags:
  - name: Orders
    description: Warehouse order management endpoints
  - name: System
    description: System health and statistics
```

### Documented Endpoints

**POST /orders**
```json
{
  "shipmentId": "ORD-2025-001",
  "orderType": "medicines",
  "fulfillmentStatus": "SUBMITTED",
  "priority": "urgent",
  "destination": {
    "facilityCode": "FACILITY-A",
    "facilityName": "Facility Name"
  }
}
```

**GET /orders/latest**
Returns the most recently received order with full details.

**DELETE /orders**
Clears all stored orders for testing.

## Testing with Swagger UI

### 1. Send a Test Order via Transformation Mediator

```bash
curl -X POST http://localhost:3101/transform \
  -H "Content-Type: application/cloudevents+json" \
  -d '{
    "specversion": "1.0",
    "type": "order.created",
    "source": "http://orders-service",
    "id": "test-order-swagger",
    "time": "2025-10-16T11:00:00Z",
    "datacontenttype": "application/json",
    "data": {
      "orderId": "ORD-SWAGGER-TEST",
      "orderType": "medicines",
      "status": "SUBMITTED",
      "priority": "urgent",
      "facilityId": "FACILITY-TEST",
      "orderDate": "2025-10-16T11:00:00Z",
      "requestedDeliveryDate": "2025-10-17T11:00:00Z",
      "createdBy": "Dr. Test",
      "notes": "Test order via Swagger",
      "items": [...]
    }
  }'
```

### 2. Open Warehouse Swagger UI

Navigate to: http://localhost:3203/api-docs

### 3. Try GET /orders/latest

1. Click on "GET /orders/latest"
2. Click "Try it out"
3. Click "Execute"
4. See the order that was just received

### 4. View All Orders

1. Click on "GET /orders"
2. Click "Try it out"
3. Click "Execute"
4. See all received orders

### 5. Clear Test Data

1. Click on "DELETE /orders"
2. Click "Try it out"
3. Click "Execute"
4. All orders cleared

## Quick Reference

### Warehouse Client (Custom JSON)

**Port**: 3203
**Format**: Custom warehouse JSON
**Swagger**: http://localhost:3203/api-docs

Receives:
```json
{
  "shipmentId": "string",
  "orderType": "string",
  "fulfillmentStatus": "string",
  "priority": "string",
  "destination": {...},
  "orderMetadata": {...}
}
```

### FHIR Client (Hospital)

**Port**: 3201
**Format**: FHIR R4 ServiceRequest
**Swagger**: http://localhost:3201/api-docs

Will receive (once transformer implemented):
```json
{
  "resourceType": "ServiceRequest",
  "id": "string",
  "status": "active",
  "intent": "order",
  "priority": "urgent",
  "code": {...},
  "subject": {...}
}
```

### HL7 Client (Pharmacy)

**Port**: 3202
**Format**: HL7 v2.5.1 ORM^O01
**Swagger**: http://localhost:3202/api-docs

Will receive (once transformer implemented):
```
MSH|^~\&|SMILE-POC|FACILITY-A|PHARMACY-SYSTEM|PHARMACY-B|...
PID|1|FACILITY-A|...
ORC|NW|ORD-123|...
```

## Benefits

✅ **Easy Validation** - View received orders without command line
✅ **Interactive Testing** - Test all endpoints in browser
✅ **Documentation** - Complete API reference
✅ **Examples** - Real request/response examples
✅ **No Tools Required** - Just a web browser

## Next Steps

Once Swagger is confirmed working:

1. ✅ **Test Swagger UI for all clients** - Verify UI loads correctly
2. 🔄 **Implement FHIR R4 transformer** - Enable FHIR client to receive data
3. 🔄 **Implement HL7 v2 transformer** - Enable HL7 client to receive data
4. ✅ **Test E2E with all transformations** - Verify all 3 clients receive data

## Troubleshooting

### Swagger UI not loading

**Check if service is running:**
```bash
docker ps --filter "name=smile-mock-client-warehouse"
```

**Check if port is accessible:**
```bash
curl http://localhost:3203/api-docs
```

### No data in Swagger responses

**Send a test order first:**
```bash
curl -X POST http://localhost:3101/transform ...
```

Then check Swagger UI.

### Want to reset data

Use the DELETE /orders endpoint in Swagger UI or:
```bash
curl -X DELETE http://localhost:3203/orders
```

## Files Modified

- `apps/webhook-services/mock-client-warehouse/package.json` - Added swagger dependencies
- `apps/webhook-services/mock-client-warehouse/src/index.ts` - Added Swagger setup and annotations
- `apps/webhook-services/mock-client-fhir/package.json` - Added swagger dependencies
- `apps/webhook-services/mock-client-hl7/package.json` - Added swagger dependencies

## Dependencies Added

```json
{
  "dependencies": {
    "swagger-ui-express": "^5.0.0",
    "swagger-jsdoc": "^6.2.8"
  },
  "devDependencies": {
    "@types/swagger-ui-express": "^4.1.6",
    "@types/swagger-jsdoc": "^6.0.4"
  }
}
```
