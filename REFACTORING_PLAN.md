# Multi-Mediator Refactoring Plan

## Objective
Implement OpenHIM-native multi-route orchestration pattern to demonstrate how a single event (order created) can be transformed into different formats for different business clients, with full transparency and audit trails via OpenHIM channel routing.

## Key Concept
**Single OpenHIM Channel with Multiple Routes**: A single order event is routed through multiple transformation mediators, each producing a different output format for different business purposes. This showcases OpenHIM's core value proposition - transparent, auditable multi-client orchestration.

## Current State Analysis

### Current Architecture (Smart Mediator)
```
OpenHIM (1 transaction)
  ↓
transformation-mediator:3101
  ├─ MultiClientTransformer (internal fan-out)
  ├─→ FHIR transformation → POST 3201
  ├─→ HL7 transformation  → POST 3202
  └─→ Custom transformation → POST 3203
  ↓
Returns aggregated result
```

**Problems:**
- ❌ OpenHIM only sees 1 transaction
- ❌ No per-client visibility
- ❌ Limited audit trail
- ❌ Defeats OpenHIM's core value

### Target Architecture (OpenHIM Orchestration)
```
Order Event (Single Input)
  ↓
OpenHIM Channel "/transform"
  ├─ Route 1 (secondary): warehouse-transformation-mediator:3301
  │    └─→ Order → Warehouse Summary (minimal fields)
  │        └─→ POST 3201 (warehouse-client)
  │
  ├─ Route 2 (secondary): finance-transformation-mediator:3302
  │    └─→ Order → Finance Details (with pricing/tax)
  │        └─→ POST 3202 (finance-client)
  │
  └─ Route 3 (primary): audit-transformation-mediator:3303
       └─→ Order → Audit Trail (status history)
           └─→ POST 3203 (audit-client)

OpenHIM logs 1 transaction with 3 route executions
Each route produces different output from same input
```

**Benefits:**
- ✅ Full transparency (3 routes visible in single transaction)
- ✅ Demonstrates single event → multiple business views
- ✅ Per-client metrics and visibility
- ✅ Independent success/failure tracking per route
- ✅ Easy client onboarding (add route to channel)
- ✅ Proper OpenHIM native pattern
- ✅ Clear POC demonstration value

---

## Reusable Components

### To Be Shared (create as common utilities):
```
packages/mediator-common/
├── src/
│   ├── utils/
│   │   ├── logger.ts
│   │   ├── mapper.ts
│   │   ├── forwarder.ts
│   │   └── registration.ts
│   ├── validators/
│   │   └── cloudevents.validator.ts
│   ├── rules/
│   │   ├── rule-loader.ts
│   │   ├── rule-engine.ts
│   │   └── types.ts
│   └── index.ts
```

### To Be Removed:
- `multi-client-transformer.ts` - OpenHIM does fan-out now
- `clients.config.json` - Each mediator has 1 client
- `client-loader.ts` - No longer needed

---

## New Mediator Services

### 1. warehouse-transformation-mediator

**Port:** 3301
**Purpose:** Transform Order Event → Warehouse Summary Format (minimal fields for fulfillment)
**Client:** warehouse-client:3201
**Use Case:** Order fulfillment, packing instructions, delivery logistics

**Output Format Example:**
```json
{
  "orderId": "ORD-001",
  "itemCount": 5,
  "totalWeight": "2.5kg",
  "deliveryAddress": "123 Main St",
  "deliveryDate": "2025-10-25"
}
```

**Structure:**
```
apps/mediator-services/warehouse-transformation-mediator/
├── src/
│   ├── index.ts (main entry point)
│   ├── config/
│   │   ├── index.ts
│   │   ├── types.ts
│   │   └── openhim.config.ts
│   ├── routes/
│   │   └── transform.routes.ts (simplified - single client)
│   ├── services/
│   │   └── transformer.service.ts
│   └── transformation-rules/
│       └── order-to-warehouse-summary.json
├── mediatorConfig.json (URN: urn:mediator:warehouse-transformation)
├── package.json
├── tsconfig.json
└── Dockerfile
```

**Environment Variables:**
```
PORT=3301
CLIENT_ENDPOINT=http://warehouse-client:3201/orders
CLIENT_NAME=Warehouse Fulfillment Client
OPENHIM_API_URL=https://openhim-core:8080
OPENHIM_USERNAME=warehouse-mediator
OPENHIM_PASSWORD=password
```

---

### 2. finance-transformation-mediator

**Port:** 3302
**Purpose:** Transform Order Event → Finance Details Format (pricing, tax, accounting)
**Client:** finance-client:3202
**Use Case:** Accounting, invoicing, revenue tracking, payment processing

**Output Format Example:**
```json
{
  "orderId": "ORD-001",
  "items": [
    {"itemId": "ITEM-001", "unitPrice": 10.50, "quantity": 2, "subtotal": 21.00}
  ],
  "subtotal": 21.00,
  "tax": 1.68,
  "total": 22.68,
  "paymentStatus": "pending",
  "paymentMethod": "credit-card"
}
```

**Structure:**
```
apps/mediator-services/finance-transformation-mediator/
├── src/
│   ├── index.ts
│   ├── config/
│   │   ├── index.ts
│   │   ├── types.ts
│   │   └── openhim.config.ts
│   ├── routes/
│   │   └── transform.routes.ts
│   ├── services/
│   │   └── transformer.service.ts
│   └── transformation-rules/
│       └── order-to-finance-details.json
├── mediatorConfig.json (URN: urn:mediator:finance-transformation)
├── package.json
├── tsconfig.json
└── Dockerfile
```

**Environment Variables:**
```
PORT=3302
CLIENT_ENDPOINT=http://finance-client:3202/orders
CLIENT_NAME=Finance Accounting Client
OPENHIM_API_URL=https://openhim-core:8080
OPENHIM_USERNAME=finance-mediator
OPENHIM_PASSWORD=password
```

---

### 3. audit-transformation-mediator

**Port:** 3303
**Purpose:** Transform Order Event → Audit Trail Format (compliance, history tracking)
**Client:** audit-client:3203
**Use Case:** Regulatory compliance, audit trails, status history, accountability

**Output Format Example:**
```json
{
  "orderId": "ORD-001",
  "statusHistory": [
    {"status": "created", "timestamp": "2025-10-22T10:00:00Z", "actor": "system", "reason": "Order created"}
  ],
  "eventTimestamp": "2025-10-22T10:00:00Z",
  "eventSource": "orders-service",
  "correlationId": "corr-123",
  "compliance": {
    "auditRequired": true,
    "dataClassification": "sensitive"
  }
}
```

**Structure:**
```
apps/mediator-services/audit-transformation-mediator/
├── src/
│   ├── index.ts
│   ├── config/
│   │   ├── index.ts
│   │   ├── types.ts
│   │   └── openhim.config.ts
│   ├── routes/
│   │   └── transform.routes.ts
│   ├── services/
│   │   └── transformer.service.ts
│   └── transformation-rules/
│       └── order-to-audit-trail.json
├── mediatorConfig.json (URN: urn:mediator:audit-transformation)
├── package.json
├── tsconfig.json
└── Dockerfile
```

**Environment Variables:**
```
PORT=3303
CLIENT_ENDPOINT=http://audit-client:3203/orders
CLIENT_NAME=Audit Compliance Client
OPENHIM_API_URL=https://openhim-core:8080
OPENHIM_USERNAME=audit-mediator
OPENHIM_PASSWORD=password
```

---

## OpenHIM Configuration

### Channel Configuration (via API or Console)

**Channel Purpose**: Single order event routed to three different transformation mediators for different business purposes (warehouse fulfillment, finance accounting, compliance audit)

```json
{
  "name": "Transform Channel",
  "urlPattern": "^/transform$",
  "type": "http",
  "allow": ["smile-poc"],
  "methods": ["POST"],
  "routes": [
    {
      "name": "Warehouse Transformation Route",
      "description": "Order → Warehouse Summary (fulfillment, packing, delivery)",
      "host": "warehouse-transformation-mediator",
      "port": 3301,
      "path": "/transform",
      "primary": false,
      "type": "http"
    },
    {
      "name": "Finance Transformation Route",
      "description": "Order → Finance Details (accounting, invoicing, payment)",
      "host": "finance-transformation-mediator",
      "port": 3302,
      "path": "/transform",
      "primary": false,
      "type": "http"
    },
    {
      "name": "Audit Transformation Route",
      "description": "Order → Audit Trail (compliance, history, accountability)",
      "host": "audit-transformation-mediator",
      "port": 3303,
      "path": "/transform",
      "primary": true,
      "type": "http"
    }
  ],
  "authType": "private"
}
```

**What Happens When Order Event Arrives at `/transform`:**
1. OpenHIM creates transaction
2. Executes Route 1 → warehouse-transformation-mediator:3301 transforms order to warehouse summary → POSTs to warehouse-client:3201
3. Executes Route 2 → finance-transformation-mediator:3302 transforms order to finance details → POSTs to finance-client:3202
4. Executes Route 3 (primary) → audit-transformation-mediator:3303 transforms order to audit trail → POSTs to audit-client:3203
5. Aggregates all responses
6. Logs transaction with all route details
7. Returns aggregated response

**Note:** Each mediator will register itself with OpenHIM, but the routes must be manually added to the channel (or configured programmatically).

---

## Docker Compose Updates

```yaml
services:
  # Warehouse Transformation Mediator
  warehouse-transformation-mediator:
    build:
      context: .
      dockerfile: apps/mediator-services/warehouse-transformation-mediator/Dockerfile
    container_name: smile-warehouse-transformation-mediator
    ports:
      - "3301:3301"
    environment:
      PORT: 3301
      CLIENT_ENDPOINT: "http://warehouse-client:3201/orders"
      CLIENT_NAME: "Warehouse Fulfillment Client"
      OPENHIM_API_URL: "https://openhim-core:8080"
      OPENHIM_USERNAME: "warehouse-mediator"
      OPENHIM_PASSWORD: "password"
    depends_on:
      openhim-core:
        condition: service_healthy
    networks:
      - smile-network

  # Finance Transformation Mediator
  finance-transformation-mediator:
    build:
      context: .
      dockerfile: apps/mediator-services/finance-transformation-mediator/Dockerfile
    container_name: smile-finance-transformation-mediator
    ports:
      - "3302:3302"
    environment:
      PORT: 3302
      CLIENT_ENDPOINT: "http://finance-client:3202/orders"
      CLIENT_NAME: "Finance Accounting Client"
      OPENHIM_API_URL: "https://openhim-core:8080"
      OPENHIM_USERNAME: "finance-mediator"
      OPENHIM_PASSWORD: "password"
    depends_on:
      openhim-core:
        condition: service_healthy
    networks:
      - smile-network

  # Audit Transformation Mediator
  audit-transformation-mediator:
    build:
      context: .
      dockerfile: apps/mediator-services/audit-transformation-mediator/Dockerfile
    container_name: smile-audit-transformation-mediator
    ports:
      - "3303:3303"
    environment:
      PORT: 3303
      CLIENT_ENDPOINT: "http://audit-client:3203/orders"
      CLIENT_NAME: "Audit Compliance Client"
      OPENHIM_API_URL: "https://openhim-core:8080"
      OPENHIM_USERNAME: "audit-mediator"
      OPENHIM_PASSWORD: "password"
    depends_on:
      openhim-core:
        condition: service_healthy
    networks:
      - smile-network

  # Mock Clients
  warehouse-client:
    build:
      context: .
      dockerfile: apps/webhook-services/warehouse-client/Dockerfile
    container_name: smile-warehouse-client
    ports:
      - "3201:3201"
    environment:
      PORT: 3201
      CLIENT_NAME: "Warehouse Fulfillment"
    networks:
      - smile-network

  finance-client:
    build:
      context: .
      dockerfile: apps/webhook-services/finance-client/Dockerfile
    container_name: smile-finance-client
    ports:
      - "3202:3202"
    environment:
      PORT: 3202
      CLIENT_NAME: "Finance Accounting"
    networks:
      - smile-network

  audit-client:
    build:
      context: .
      dockerfile: apps/webhook-services/audit-client/Dockerfile
    container_name: smile-audit-client
    ports:
      - "3203:3203"
    environment:
      PORT: 3203
      CLIENT_NAME: "Audit Compliance"
    networks:
      - smile-network
```

---

## Implementation Steps

### Phase 1: Prepare Common Mediator Package ⏳ CURRENT
1. Create `packages/mediator-common` directory structure
2. Extract reusable utilities:
   - Logger (from custom-transformation-mediator/src/utils/logger.ts)
   - Registration (from custom-transformation-mediator/src/utils/registration.ts)
   - Channel Manager (from custom-transformation-mediator/src/utils/channel-manager.ts)
   - Forwarder (new - client HTTP forwarding logic)
   - CloudEvents Validator (from custom-transformation-mediator)
   - Rule Loader (from custom-transformation-mediator)
   - Rule Engine (from custom-transformation-mediator)
   - Types and interfaces
3. Create package.json and tsconfig.json
4. Build package: `pnpm --filter=@smile/mediator-common build`
5. Test common package

### Phase 2: Create Warehouse Transformation Mediator
1. Create directory: `apps/mediator-services/warehouse-transformation-mediator`
2. Copy structure from custom-transformation-mediator
3. Import mediator-common package
4. Create mediatorConfig.json (URN: urn:mediator:warehouse-transformation)
5. Create transformation rule: order-to-warehouse-summary.json
6. Simplify routes (single client at warehouse-client:3201)
7. Create Dockerfile
8. Test independently: POST to /transform with order CloudEvent
9. Verify warehouse-client receives summary format

### Phase 3: Create Finance Transformation Mediator
1. Create directory: `apps/mediator-services/finance-transformation-mediator`
2. Copy structure from warehouse mediator
3. Import mediator-common package
4. Create mediatorConfig.json (URN: urn:mediator:finance-transformation)
5. Create transformation rule: order-to-finance-details.json
6. Simplify routes (single client at finance-client:3202)
7. Create Dockerfile
8. Test independently: POST to /transform with order CloudEvent
9. Verify finance-client receives finance format

### Phase 4: Create Audit Transformation Mediator
1. Create directory: `apps/mediator-services/audit-transformation-mediator`
2. Copy structure from warehouse mediator
3. Import mediator-common package
4. Create mediatorConfig.json (URN: urn:mediator:audit-transformation)
5. Create transformation rule: order-to-audit-trail.json
6. Simplify routes (single client at audit-client:3203)
7. Create Dockerfile
8. Test independently: POST to /transform with order CloudEvent
9. Verify audit-client receives audit format

### Phase 5: Update OpenHIM Channel Configuration
1. Get current channel configuration from OpenHIM
2. Add Route 1: warehouse-transformation-mediator:3301
3. Add Route 2: finance-transformation-mediator:3302
4. Add Route 3: audit-transformation-mediator:3303 (primary)
5. Verify routes are configured in OpenHIM Console
6. Test each route individually

### Phase 6: E2E Testing - Single Order to 3 Clients
1. Create test order via orders-service API
2. Verify OpenHIM transaction created with transaction ID
3. Verify OpenHIM shows 3 route executions:
   - Route 1: Warehouse transformation → 200 OK
   - Route 2: Finance transformation → 200 OK
   - Route 3: Audit transformation → 200 OK
4. Verify all 3 clients received data:
   - warehouse-client received order summary
   - finance-client received financial details
   - audit-client received audit trail
5. Verify each client logged the received data correctly
6. Document test results and transaction IDs

### Phase 7: Documentation and Finalization
1. Create MULTI_MEDIATOR_COMPLETE.md
2. Update DEVELOPMENT_STATE.md with completion status
3. Update RESUME_HERE.md with what was accomplished
4. Update docker-compose.yml documentation
5. Create git commit with all changes
6. Document lessons learned

---

## Testing Criteria

### Unit Tests
- ✅ Each transformer works independently
- ✅ CloudEvent validation
- ✅ Client forwarding logic

### Integration Tests
- ✅ Each mediator processes CloudEvent
- ✅ Each mediator transforms correctly
- ✅ Each mediator forwards to client

### E2E Tests
- ✅ OpenHIM receives 1 CloudEvent
- ✅ OpenHIM creates 1 transaction with 3 routes
- ✅ All 3 mediators called in parallel
- ✅ All 3 clients receive transformed data
- ✅ Transaction log shows success/failure per route

---

## Success Metrics

1. **Transparency:** OpenHIM transaction shows 3 route executions
2. **Auditability:** Each route has full request/response logs
3. **Isolation:** One route failure doesn't affect others
4. **Manageability:** Adding new client = adding new route
5. **Performance:** All routes execute in parallel

---

## Rollback Plan

If refactoring fails:
1. Keep current transformation-mediator running
2. Run new mediators in parallel for testing
3. Can switch back by updating channel routes
4. No data loss or downtime

---

## Timeline Estimate

- Phase 1 (Common Package): 1 hour
- Phase 2 (FHIR Mediator): 1 hour
- Phase 3 (HL7 Mediator): 1 hour
- Phase 4 (Custom Mediator): 1 hour
- Phase 5 (OpenHIM Config): 30 minutes
- Phase 6 (E2E Testing): 1 hour
- Phase 7 (Documentation): 30 minutes

**Total:** ~6 hours

---

## Notes

- Each mediator is independently deployable
- Can scale each mediator based on load
- OpenHIM handles orchestration and aggregation
- Easy to add new transformation types
- Follows OpenHIM best practices
