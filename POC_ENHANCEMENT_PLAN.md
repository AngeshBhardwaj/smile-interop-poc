# 🚀 POC Enhancement Plan: Downstream Integration + Orchestration Mediators

## Executive Summary

This plan enhances the SMILE Interoperability Layer POC to demonstrate OpenHIM's full capabilities:

1. **Bidirectional Integration**: Currently upstream only (Orders Service → Multiple Clients). Adding downstream (External Systems → Orders Service).
2. **Orchestration Workflows**: Currently simple transformations. Adding complex multi-step orchestration mediators.

**Estimated Scope**: 2-3 weeks of development
**Complexity**: Medium-High
**Impact**: Demonstrates complete health interoperability middleware capabilities

---

## 📊 Current State vs. Enhanced State

### Current Architecture (Upstream Only)
```
Orders Service (CloudEvent Emitter)
        ↓ RabbitMQ
    Interop Layer
        ↓
    OpenHIM Core (/transform channel)
        ↓ Routes
    ├─→ Warehouse Mediator → Warehouse Client
    ├─→ Finance Mediator → Finance Client
    └─→ Audit Mediator → Audit Client
```

### Enhanced Architecture (Bidirectional + Orchestration)
```
UPSTREAM (Current + Enhanced):
Orders Service → RabbitMQ → Interop Layer → OpenHIM → Multiple Clients

DOWNSTREAM (New):
Pharmacy Client ──┐
                  ├──→ OpenHIM (/orders inbound channel) ──→ Adapter Mediator
Billing Client ───┘                                          ↓
                                                      Orders Service

ORCHESTRATION (New):
Single Request → Orchestration Mediator ──┬──→ Warehouse System
                                           ├──→ Finance System
                                           ├──→ Audit System
                                           └──→ Orders Service
                                                    ↓
                                           Aggregated Response
```

---

## 🔄 Part 1: Downstream Integration

### 1.1 Overview

**Goal**: Enable external systems (Pharmacy, Billing) to request operations on Orders Service through OpenHIM.

**Architecture**:
```
External Client (Pharmacy/Billing)
        ↓ HTTPS POST/GET/PUT
OpenHIM Inbound Channel (/orders)
        ↓ (Validate URL + Client Auth)
Adapter Mediator (Transform request if needed)
        ↓
Orders Service HTTP Endpoints
        ↓
Response → Mediator Transform → OpenHIM → External Client
```

### 1.2 Components to Implement

#### A. Mock External Client Services (2 new Docker services)

**mock-client-pharmacy** (Port 4201)
- Represents external pharmacy system
- POST `/orders` - Submit orders in Pharmacy format
- GET `/orders` - Query submitted orders
- PUT `/orders/:id` - Update order status
- Swagger UI for easy testing
- Uses Basic Auth to authenticate with OpenHIM

**mock-client-billing** (Port 4202)
- Represents external billing system
- POST `/orders` - Submit orders in Billing format
- GET `/orders` - Query submitted orders
- PUT `/orders/:id` - Update billing status
- Swagger UI for easy testing
- Uses Basic Auth to authenticate with OpenHIM

**Key Differences**:
- Pharmacy sends data in "Pharmacy Format" (different field structure from Orders Service)
- Billing sends data in "Billing Format" (cost/invoice focused)
- Both need transformation before reaching Orders Service

#### B. OpenHIM Inbound Channel

**Channel Name**: `Orders Inbound` (or `/orders-inbound`)
**URL Pattern**: `^/orders-inbound$` or `^/orders-inbound/.*$`

**Routes**:
```
Primary Route:
├─ Name: "Adapter Mediator"
├─ Host: adapter-mediator (new)
├─ Port: 3204
└─ Path: /transform-downstream

No Secondary Routes (single destination)
```

**Client Configuration**:
```
Allowed Clients:
├─ pharmacy-system (credentials)
└─ billing-system (credentials)
```

#### C. Adapter Mediator for Downstream (New Mediator)

**Service**: `adapter-mediator` (Port 3204)

**Responsibilities**:
1. Receive request from OpenHIM (containing source client info)
2. Identify the client (Pharmacy or Billing)
3. Transform payload format:
   - Pharmacy Format → Orders Service JSON
   - Billing Format → Orders Service JSON
4. Forward to Orders Service with appropriate HTTP method
5. Transform response back to client format
6. Return to OpenHIM

**Transformation Logic**:
```
Pharmacy Request → {
  Extract: [items[], facilityId, priority, requestedBy]
  Transform to Orders Service format
  POST /api/v1/orders
  Transform response
}

Billing Request → {
  Extract: [orderId, cost, invoiceNumber, paymentTerms]
  Transform to Orders Service format
  PUT /api/v1/orders/:id (update billing details)
  Transform response
}
```

### 1.3 Request/Response Flow

#### Example: Pharmacy System Creates Order
```
1. Pharmacy Client
   POST to OpenHIM:5001/orders-inbound
   {
     "action": "create_order",
     "pharmacy_order_id": "PHARM-2025-001",
     "items": ["Item1", "Item2"],
     "facility": "Clinic-A",
     "requested_by": "Dr. Smith",
     "Authorization": "Basic pharmacy:password"
   }

2. OpenHIM Inbound Channel (/orders-inbound)
   ✓ URL matches: ^/orders-inbound$
   ✓ Auth valid: pharmacy-system client authenticated
   ✓ Route to: Adapter Mediator (3204)

3. Adapter Mediator (/transform-downstream)
   ✓ Identify client: pharmacy-system
   ✓ Parse pharmacy format
   ✓ Transform to Orders Service JSON:
     {
       "items": ["Item1", "Item2"],
       "facilityId": "Clinic-A",
       "departmentId": "pharmacy",
       "requestedBy": "Dr. Smith",
       "priority": "normal"
     }
   ✓ POST to Orders Service: /api/v1/orders
   ✓ Receive response with orderId
   ✓ Transform back to pharmacy format:
     {
       "status": "success",
       "pharmacy_order_id": "PHARM-2025-001",
       "orders_service_id": "ORD-12345",
       "created_at": "2025-10-23T..."
     }

4. OpenHIM returns to Pharmacy Client
   {
     "status": "success",
     "pharmacy_order_id": "PHARM-2025-001",
     "orders_service_id": "ORD-12345",
     "created_at": "2025-10-23T..."
   }
```

#### Example: Billing System Updates Order
```
1. Billing Client
   PUT to OpenHIM:5001/orders-inbound
   {
     "action": "update_billing",
     "order_id": "ORD-12345",
     "cost": 1500,
     "currency": "USD",
     "invoice_number": "INV-2025-001",
     "payment_status": "pending",
     "Authorization": "Basic billing:password"
   }

2. OpenHIM validates and routes to Adapter Mediator

3. Adapter Mediator
   ✓ Identify client: billing-system
   ✓ Parse billing format
   ✓ Map to Orders Service update (custom endpoint or metadata update)
   ✓ PUT to Orders Service with billing details
   ✓ Transform response

4. Response returned to Billing Client
```

### 1.4 Configuration Required

**OpenHIM Console Changes**:
1. Create two Clients:
   - `pharmacy-system` with Basic Auth credentials
   - `billing-system` with Basic Auth credentials

2. Create Inbound Channel:
   - Channel Name: "Orders Inbound"
   - URL Pattern: `^/orders-inbound$`
   - HTTP Method: POST, PUT, GET
   - Allowed Clients: pharmacy-system, billing-system
   - Route: Adapter Mediator (3204)

**Environment Variables** (docker-compose):
```yaml
# Adapter Mediator
PORT: 3204
OPENHIM_API_URL: https://openhim-core:8080
CLIENT_ENDPOINT: http://orders-service:3005/api/v1/orders
MEDIATOR_TYPE: adapter
TRANSFORMATION_DIRECTION: downstream
```

---

## 🎯 Part 2: Orchestration Mediator

### 2.1 Overview

**Goal**: Demonstrate complex multi-step workflows where a single request triggers orchestrated calls to multiple systems.

**Use Case**: High-level order validation and enrichment workflow
```
Order Request → Orchestration Mediator
                   ├─ Step 1: Validate inventory (Warehouse)
                   ├─ Step 2: Get pricing (Finance)
                   ├─ Step 3: Check compliance (Audit)
                   └─ Step 4: Create order (Orders Service)
                        ↓
                   Aggregate all responses
                        ↓
                   Return comprehensive order confirmation
```

### 2.2 Components to Implement

#### A. Orchestration Mediator Service (New)

**Service**: `orchestration-mediator` (Port 3206)

**Responsibilities**:
1. Receive comprehensive order request
2. Execute orchestration workflow:
   - Call Warehouse Mediator (inventory check)
   - Call Finance Mediator (pricing calculation)
   - Call Audit Mediator (compliance check)
   - Call Orders Service (create order)
3. Aggregate all responses
4. Handle failures gracefully (fallbacks, partial success)
5. Return unified response with all orchestrated data

**Workflow Details**:
```
Orchestration Steps:

Step 1: Validate & Extract
├─ Extract order items
├─ Validate basic structure
└─ Generate correlation ID

Step 2: Inventory Check (Warehouse Mediator)
├─ Call Warehouse → /validate-items
├─ Get availability status
├─ If not available → Handle failure or suggest alternatives
└─ Extract: availability[], backorder_items[]

Step 3: Pricing & Tax (Finance Mediator)
├─ Call Finance → /calculate-pricing
├─ Get itemized pricing
├─ Calculate taxes based on facility location
├─ Extract: subtotal, tax, total, price_breakdown[]

Step 4: Compliance Check (Audit Mediator)
├─ Call Audit → /validate-compliance
├─ Get compliance status
├─ Extract: compliance_status, required_approvals[]

Step 5: Create Order (Orders Service)
├─ Call Orders → POST /api/v1/orders
├─ Include all validated/enriched data
├─ Extract: orderId, status, created_at

Step 6: Aggregate Response
├─ Combine all 4 responses
├─ Include orchestration metadata
└─ Return to requestor
```

#### B. OpenHIM Inbound Channel for Orchestration

**Channel Name**: `Orders Orchestrated` (or `/orders-orchestrated`)
**URL Pattern**: `^/orders-orchestrated$`

**Routes**:
```
Primary Route:
├─ Name: "Orchestration Mediator"
├─ Host: orchestration-mediator
├─ Port: 3206
└─ Path: /orchestrate
```

**Allowed Clients**: Same as other channels (smile-poc, pharmacy-system, billing-system)

### 2.3 Request/Response Flow

#### Example: Orchestrated Order Processing
```
1. Client Request (Pharmacy or Orders Service)
   POST to OpenHIM:5001/orders-orchestrated
   {
     "items": [
       {
         "itemId": "ITEM-001",
         "description": "Medicine A",
         "quantity": 100,
         "unitPrice": 10.00
       },
       {
         "itemId": "ITEM-002",
         "description": "Supply B",
         "quantity": 50,
         "unitPrice": 5.00
       }
     ],
     "facilityId": "FAC-001",
     "departmentId": "DEPT-001",
     "requestedBy": "Dr. Smith",
     "priority": "normal"
   }

2. OpenHIM Routes to Orchestration Mediator

3. Orchestration Mediator (/orchestrate)

   Correlation ID: corr-12345

   3a. Validate Request
       ✓ Items count: 2
       ✓ Facility exists: FAC-001

   3b. Call Warehouse Mediator (3301)
       POST /validate-items
       {
         "items": [
           {"itemId": "ITEM-001", "quantity": 100},
           {"itemId": "ITEM-002", "quantity": 50}
         ]
       }
       Response:
       {
         "available": [
           {"itemId": "ITEM-001", "available_quantity": 150},
           {"itemId": "ITEM-002", "available_quantity": 80}
         ],
         "status": "all_available"
       }

   3c. Call Finance Mediator (3302)
       POST /calculate-pricing
       {
         "items": [
           {"itemId": "ITEM-001", "quantity": 100, "unitPrice": 10.00},
           {"itemId": "ITEM-002", "quantity": 50, "unitPrice": 5.00}
         ],
         "facilityId": "FAC-001"
       }
       Response:
       {
         "itemized_pricing": [
           {"itemId": "ITEM-001", "subtotal": 1000.00},
           {"itemId": "ITEM-002", "subtotal": 250.00}
         ],
         "subtotal": 1250.00,
         "tax": 100.00,
         "total": 1350.00,
         "tax_rate": "8%"
       }

   3d. Call Audit Mediator (3303)
       POST /validate-compliance
       {
         "items": ["ITEM-001", "ITEM-002"],
         "facilityId": "FAC-001",
         "requestedBy": "Dr. Smith"
       }
       Response:
       {
         "compliance_status": "approved",
         "audit_trail_id": "AUDIT-54321",
         "approvals_required": false
       }

   3e. Call Orders Service (3005)
       POST /api/v1/orders
       {
         "items": [...],
         "facilityId": "FAC-001",
         "departmentId": "DEPT-001",
         "requestedBy": "Dr. Smith",
         "priority": "normal",
         "metadata": {
           "orchestration_id": "corr-12345",
           "source": "orchestration-mediator"
         }
       }
       Response:
       {
         "orderId": "ORD-12345",
         "status": "DRAFT",
         "createdAt": "2025-10-23T..."
       }

   3f. Aggregate All Responses
       {
         "orchestration_id": "corr-12345",
         "status": "success",
         "order": {
           "orderId": "ORD-12345",
           "status": "DRAFT",
           "createdAt": "2025-10-23T..."
         },
         "inventory": {
           "status": "all_available",
           "available_items": [...]
         },
         "pricing": {
           "subtotal": 1250.00,
           "tax": 100.00,
           "total": 1350.00,
           "tax_rate": "8%"
         },
         "compliance": {
           "status": "approved",
           "audit_trail_id": "AUDIT-54321"
         },
         "execution_time_ms": 245,
         "steps_executed": 4,
         "failures": []
       }

4. OpenHIM returns aggregated response to client
```

### 2.4 Error Handling & Partial Success

**Scenario 1: Inventory Not Available**
```
Warehouse Response: "ITEM-001 not available (requested: 100, available: 50)"

Orchestration Mediator:
├─ Decision: Continue or Fail?
├─ Option A: Fail entire orchestration
├─ Option B: Partial fulfillment (reduce quantity)
├─ Option C: Alternative suggestions
└─ Include failure details in final response
```

**Scenario 2: Finance System Down**
```
Finance Mediator: Timeout/Error

Orchestration Mediator:
├─ Retry logic (3 attempts with backoff)
├─ If still fails: Use cached pricing
├─ Mark response as: "pricing_estimated"
└─ Continue with other steps
```

**Scenario 3: Orders Service Rejects**
```
Orders Service: Validation error

Orchestration Mediator:
├─ Capture error details
├─ Attempt remediation if possible
├─ Return failure with all collected data
└─ Client can retry or modify request
```

**Response Format with Errors**:
```json
{
  "orchestration_id": "corr-12345",
  "status": "partial_success",
  "order": { /* ... */ },
  "inventory": { /* ... */ },
  "pricing": {
    "status": "estimated",
    "note": "Finance system temporarily unavailable, using cached pricing"
  },
  "compliance": { /* ... */ },
  "failures": [
    {
      "step": 3,
      "service": "finance-mediator",
      "error": "Connection timeout",
      "retry_attempts": 3,
      "mitigation": "Used cached pricing"
    }
  ]
}
```

### 2.5 Configuration Required

**OpenHIM Console**:
1. Create Inbound Channel:
   - Channel Name: "Orders Orchestrated"
   - URL Pattern: `^/orders-orchestrated$`
   - Route: Orchestration Mediator (3206)

**Environment Variables** (docker-compose):
```yaml
# Orchestration Mediator
PORT: 3206
OPENHIM_API_URL: https://openhim-core:8080
WAREHOUSE_ENDPOINT: http://warehouse-transformation-mediator:3301
FINANCE_ENDPOINT: http://finance-transformation-mediator:3302
AUDIT_ENDPOINT: http://audit-transformation-mediator:3303
ORDERS_ENDPOINT: http://orders-service:3005
MEDIATOR_TYPE: orchestration
ORCHESTRATION_TIMEOUT: 30000
RETRY_ATTEMPTS: 3
RETRY_BACKOFF_MS: 1000
```

---

## 📈 Implementation Roadmap

### Phase 1: Downstream Integration (Week 1)
- [ ] Create mock-client-pharmacy service
- [ ] Create mock-client-billing service
- [ ] Create adapter-mediator service (3204)
- [ ] Configure inbound channels in OpenHIM
- [ ] Register pharmacy-system and billing-system clients
- [ ] Implement request/response transformation logic
- [ ] Test end-to-end downstream flow
- [ ] Document downstream integration

### Phase 2: Orchestration Mediator (Week 2)
- [ ] Create orchestration-mediator service (3206)
- [ ] Implement multi-step orchestration workflow
- [ ] Add error handling and fallback logic
- [ ] Implement retry mechanisms
- [ ] Configure orchestration channel in OpenHIM
- [ ] Test orchestration flows (success, partial success, failures)
- [ ] Add response aggregation and formatting
- [ ] Document orchestration mediator

### Phase 3: Integration & Testing (Week 3)
- [ ] End-to-end testing: Upstream + Downstream + Orchestration
- [ ] Performance testing under load
- [ ] Error scenario testing (service failures)
- [ ] Security testing (authentication, authorization)
- [ ] Update README with new capabilities
- [ ] Create Swagger documentation for new clients
- [ ] Final validation and cleanup

---

## 🏗️ Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     SMILE Interoperability POC                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│ UPSTREAM (Existing):                                              │
│ ═══════════════════════════════════════════════════════════════  │
│ Orders Service → RabbitMQ → Interop Layer → OpenHIM             │
│                                              ↓ Routes            │
│                              ├→ Warehouse Mediator → Warehouse Client
│                              ├→ Finance Mediator → Finance Client
│                              └→ Audit Mediator → Audit Client     │
│                                                                   │
│ DOWNSTREAM (New):                                                 │
│ ═══════════════════════════════════════════════════════════════  │
│ Pharmacy Client ──┐                                              │
│ Billing Client ───┼→ OpenHIM (/orders-inbound) → Adapter         │
│                  │  (5001)                      Mediator        │
│                  └─────────────────────────────→ (3204)          │
│                                                    ↓             │
│                                          Orders Service         │
│                                                                   │
│ ORCHESTRATION (New):                                              │
│ ═══════════════════════════════════════════════════════════════  │
│ Client → OpenHIM (/orders-orchestrated) → Orchestration Mediator
│ (Any)    (5001)                          (3206)                 │
│                                             ├→ Warehouse (3301)  │
│                                             ├→ Finance (3302)    │
│                                             ├→ Audit (3303)      │
│                                             └→ Orders (3005)     │
│                                             ↓                    │
│                                          Aggregated Response     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📋 Services Summary

### New Services to Create

| Service | Port | Type | Purpose |
|---------|------|------|---------|
| mock-client-pharmacy | 4201 | Mock External Client | Pharmacy system sending orders |
| mock-client-billing | 4202 | Mock External Client | Billing system sending orders |
| adapter-mediator | 3204 | Adapter Mediator | Transform downstream requests |
| orchestration-mediator | 3206 | Orchestration Mediator | Multi-step workflow orchestration |

### Existing Services (Reused)

| Service | Port | Usage |
|---------|------|-------|
| Orders Service | 3005 | Target endpoint for all flows |
| Warehouse Mediator | 3301 | Inventory checks in orchestration |
| Finance Mediator | 3302 | Pricing in orchestration |
| Audit Mediator | 3303 | Compliance checks in orchestration |
| OpenHIM Core | 5000, 5001, 8080 | Central routing, inbound channels |

---

## 🔐 Security Considerations

1. **Client Authentication**
   - Pharmacy & Billing systems authenticate with Basic Auth
   - Credentials stored securely in OpenHIM
   - Separate credentials per client

2. **Request Validation**
   - URL pattern matching
   - Client authorization checks
   - Payload validation before forwarding

3. **Audit Trail**
   - All orchestration steps logged
   - Correlation IDs track requests
   - Audit mediator validates compliance

4. **Error Handling**
   - Failures don't expose sensitive data
   - Proper error codes and messages
   - Fallback mechanisms in place

---

## 📊 Success Criteria

### Downstream Integration
- [ ] Pharmacy client can submit orders via OpenHIM
- [ ] Billing client can submit orders via OpenHIM
- [ ] Adapter mediator correctly transforms requests
- [ ] Orders service receives properly formatted data
- [ ] Responses returned to external clients
- [ ] Swagger UIs accessible for all new clients

### Orchestration Mediator
- [ ] Single request triggers 4 parallel/sequential calls
- [ ] Responses aggregated correctly
- [ ] Error handling works for failed steps
- [ ] Correlation IDs track full workflow
- [ ] Performance metrics < 2 seconds total

### Integration
- [ ] Upstream + Downstream + Orchestration coexist
- [ ] All 3 mediator types functional
- [ ] Full bidirectional flow demonstrated
- [ ] Documentation complete

---

## 📝 Next Steps

1. **Review this plan** - Confirm scope and approach
2. **Create detailed specs** for each component
3. **Implement Phase 1** (Downstream Integration)
4. **Test Phase 1** thoroughly
5. **Implement Phase 2** (Orchestration Mediator)
6. **Final integration testing**
7. **Update documentation and README**

---

## 📚 References

- OpenHIM Channel Configuration: http://openhim.org/docs/configuration/channels/
- OpenHIM Mediators: https://openhim.org/docs/dev-guide/developing-mediators/
- Orchestration Mediator Tutorial: https://openhim.org/docs/tutorial/mediators/orchestrator/
- OpenHIM Clients & Authentication: http://openhim.org/docs/configuration/authentication/
