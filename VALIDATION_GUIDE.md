# Multi-Client Fan-Out Validation Guide

This guide shows you how to validate the multi-client fan-out implementation by checking what each client received.

## Available Endpoints

Each mock client (FHIR, HL7, Warehouse) now has these endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/stats` | GET | Service statistics |
| `/orders` | GET | Get all received orders |
| `/orders/latest` | GET | Get the most recent order |
| `/orders` | POST | Receive an order (used by mediator) |
| `/orders` | DELETE | Clear all orders (for testing) |

## Client Ports

- **Hospital FHIR Client**: http://localhost:3201
- **Pharmacy HL7 Client**: http://localhost:3202
- **Warehouse Client**: http://localhost:3203

## Step-by-Step Validation

### Step 1: Send a Test Order to the Transformation Mediator

```bash
curl -X POST http://localhost:3101/transform \
  -H "Content-Type: application/cloudevents+json" \
  -d '{
    "specversion": "1.0",
    "type": "order.created",
    "source": "http://orders-service",
    "id": "test-order-123",
    "time": "2025-10-16T10:30:00Z",
    "datacontenttype": "application/json",
    "data": {
      "orderId": "ORD-123",
      "orderType": "medicines",
      "status": "SUBMITTED",
      "priority": "urgent",
      "facilityId": "FACILITY-A",
      "orderDate": "2025-10-16T10:30:00Z",
      "requestedDeliveryDate": "2025-10-17T10:30:00Z",
      "createdBy": "Dr. Smith",
      "notes": "Urgent delivery required",
      "items": [
        {
          "itemId": "MED-001",
          "name": "Insulin 100IU/ml",
          "quantityOrdered": 10,
          "unit": "vials",
          "unitPrice": 25.00
        }
      ]
    }
  }'
```

### Step 2: Check What the Warehouse Client Received

```bash
# Get all orders received by warehouse
curl http://localhost:3203/orders

# OR get just the latest order
curl http://localhost:3203/orders/latest
```

**Expected Response:**
```json
{
  "service": "mock-client-warehouse",
  "system": "Warehouse Management System",
  "order": {
    "requestNumber": 1,
    "receivedAt": "2025-10-16T10:45:41.789Z",
    "headers": { ... },
    "body": {
      "shipmentId": "ORD-123",
      "externalOrderRef": "test-order-123",
      "orderType": "medicines",
      "fulfillmentStatus": "SUBMITTED",
      "priority": "urgent",
      "requestedDate": "2025-10-16T10:30:00Z",
      "requiredDeliveryDate": "2025-10-17T10:30:00Z",
      "destination": {
        "facilityCode": "FACILITY-A",
        "facilityName": "FACILITY-A",
        "contactPerson": "Dr. Smith",
        "specialInstructions": "Urgent delivery required"
      },
      "orderMetadata": {
        "eventId": "test-order-123",
        "eventType": "order.created"
      }
    }
  }
}
```

### Step 3: Check What the FHIR Client Received

```bash
# Get all orders received by FHIR client
curl http://localhost:3201/orders

# OR get just the latest order
curl http://localhost:3201/orders/latest
```

**Expected Response:**
Currently, FHIR transformation is not implemented, so you'll see:
```json
{
  "service": "mock-client-fhir",
  "totalOrders": 0,
  "orders": []
}
```

**OR**
```json
{
  "message": "No orders received yet",
  "service": "mock-client-fhir"
}
```

### Step 4: Check What the HL7 Client Received

```bash
# Get all orders received by HL7 client
curl http://localhost:3202/orders

# OR get just the latest order
curl http://localhost:3202/orders/latest
```

**Expected Response:**
Currently, HL7 transformation is not implemented, so you'll see:
```json
{
  "service": "mock-client-hl7",
  "totalOrders": 0,
  "orders": []
}
```

### Step 5: Check Service Statistics

```bash
# Warehouse statistics
curl http://localhost:3203/stats

# FHIR statistics
curl http://localhost:3201/stats

# HL7 statistics
curl http://localhost:3202/stats
```

**Example Response:**
```json
{
  "service": "mock-client-warehouse",
  "system": "Warehouse Management System",
  "statistics": {
    "totalRequestsReceived": 1,
    "uptime": 123.456,
    "memoryUsage": { ... }
  }
}
```

## Using Browser for Validation

You can also open these URLs in your browser:

- **Warehouse Latest Order**: http://localhost:3203/orders/latest
- **Warehouse All Orders**: http://localhost:3203/orders
- **Warehouse Stats**: http://localhost:3203/stats
- **FHIR Latest Order**: http://localhost:3201/orders/latest
- **HL7 Latest Order**: http://localhost:3202/orders/latest

## Clearing Test Data

To clear all received orders from a client (useful for testing):

```bash
# Clear warehouse orders
curl -X DELETE http://localhost:3203/orders

# Clear FHIR orders
curl -X DELETE http://localhost:3201/orders

# Clear HL7 orders
curl -X DELETE http://localhost:3202/orders
```

## Checking Docker Logs (Alternative Method)

You can also check what clients received via Docker logs:

```bash
# Warehouse logs
docker logs smile-mock-client-warehouse --tail 50

# FHIR logs
docker logs smile-mock-client-fhir --tail 50

# HL7 logs
docker logs smile-mock-client-hl7 --tail 50

# Transformation mediator logs
docker logs smile-transformation-mediator --tail 50
```

## Complete Validation Flow

Here's a complete test script you can run:

```bash
#!/bin/bash

echo "=========================================="
echo "Multi-Client Fan-Out Validation Test"
echo "=========================================="

# Step 1: Clear all existing orders
echo -e "\n1. Clearing existing orders..."
curl -X DELETE http://localhost:3203/orders -s | jq -r '.message'
curl -X DELETE http://localhost:3201/orders -s | jq -r '.message'
curl -X DELETE http://localhost:3202/orders -s | jq -r '.message'

# Step 2: Send test order
echo -e "\n2. Sending test order..."
curl -X POST http://localhost:3101/transform \
  -H "Content-Type: application/cloudevents+json" \
  -d '{
    "specversion": "1.0",
    "type": "order.created",
    "source": "http://orders-service",
    "id": "test-'.$(date +%s)'",
    "time": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "datacontenttype": "application/json",
    "data": {
      "orderId": "ORD-'.$(date +%s)'",
      "orderType": "medicines",
      "status": "SUBMITTED",
      "priority": "urgent",
      "facilityId": "FACILITY-A",
      "orderDate": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
      "requestedDeliveryDate": "'$(date -u -d '+1 day' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v+1d +%Y-%m-%dT%H:%M:%SZ)'",
      "createdBy": "Dr. Smith",
      "notes": "Test order for validation",
      "items": [
        {
          "itemId": "MED-001",
          "name": "Test Medicine",
          "quantityOrdered": 10,
          "unit": "boxes",
          "unitPrice": 15.00
        }
      ]
    }
  }' -s | jq -r '.response.body' | jq '.fanOutResult | "Total Clients: \(.totalClients), Successful: \(.successfulDeliveries), Failed: \(.failedDeliveries)"'

# Step 3: Check what each client received
echo -e "\n3. Checking Warehouse Client..."
curl http://localhost:3203/orders/latest -s | jq '.order.body | {shipmentId, orderType, fulfillmentStatus, priority}'

echo -e "\n4. Checking FHIR Client..."
curl http://localhost:3201/orders/latest -s | jq 'if .message then .message else .order.body.resourceType end'

echo -e "\n5. Checking HL7 Client..."
curl http://localhost:3202/orders/latest -s | jq 'if .message then .message else .order.body end'

echo -e "\n6. Service Statistics:"
echo "  Warehouse: $(curl http://localhost:3203/stats -s | jq -r '.statistics.totalRequestsReceived') orders received"
echo "  FHIR: $(curl http://localhost:3201/stats -s | jq -r '.statistics.totalRequestsReceived') orders received"
echo "  HL7: $(curl http://localhost:3202/stats -s | jq -r '.statistics.totalRequestsReceived') orders received"

echo -e "\n=========================================="
echo "Validation Complete!"
echo "=========================================="
```

## What to Expect

### Current State (as of October 16, 2025)

✅ **Warehouse Client**: Successfully receives transformed custom JSON format
- Field mappings are applied correctly
- Order data is properly transformed
- All destination and metadata fields are populated

❌ **FHIR Client**: Transformation not yet implemented
- Will show "No orders received yet"
- FHIR R4 transformer needs to be implemented in the transformation engine

❌ **HL7 Client**: Transformation not yet implemented
- Will show "No orders received yet"
- HL7 v2 transformer needs to be implemented in the transformation engine

### Success Criteria

For the **Warehouse Client**, you should see:
- ✅ CloudEvent successfully transformed to custom JSON
- ✅ Order ID mapped to `shipmentId`
- ✅ Status correctly transformed (e.g., SUBMITTED → SUBMITTED for warehouse)
- ✅ Priority correctly transformed (e.g., urgent → 0 for warehouse)
- ✅ Destination fields populated from order data
- ✅ Metadata includes eventId and eventType

## Troubleshooting

### Problem: No orders received by any client

**Solution**: Check if all services are running:
```bash
docker ps --filter "name=smile"
```

All services should show status "Up (healthy)".

### Problem: Transformation mediator returns 500 error

**Solution**: Check mediator logs:
```bash
docker logs smile-transformation-mediator --tail 50
```

### Problem: Can't access client endpoints

**Solution**: Verify ports are mapped correctly:
```bash
docker ps --format "table {{.Names}}\t{{.Ports}}"
```

Should show:
- mock-client-fhir: 0.0.0.0:3201->3201/tcp
- mock-client-hl7: 0.0.0.0:3202->3202/tcp
- mock-client-warehouse: 0.0.0.0:3203->3203/tcp

## Next Steps

Once FHIR R4 and HL7 v2 transformers are implemented, all three clients will receive data:
- Hospital FHIR client will receive FHIR R4 ServiceRequest resources
- Pharmacy HL7 client will receive HL7 v2.5.1 ORM^O01 messages
- Warehouse client will continue receiving custom JSON format
