# Multi-Client Transformation Architecture - Implementation Plan

**Date Created**: October 15, 2025
**Status**: PLANNING COMPLETE - READY TO IMPLEMENT
**Decision**: Option B - Single Mediator with Multi-Client Fan-Out Support
**Scope**: Enhance transformation-mediator to support 3 mock clients with distinct transformations

---

## 🎯 GOALS

### Primary Goal
Demonstrate OpenHIM's capability to transform a single event format into multiple client-specific formats and distribute to multiple endpoints (fan-out pattern).

### Success Criteria
- ✅ Single Order CloudEvent triggers transformations for 3 different clients
- ✅ Each client receives data in their specific format
- ✅ All transformations are configuration-driven (no code changes to add clients)
- ✅ Complete E2E flow: Orders Service → RabbitMQ → Interop Layer → OpenHIM → Transformation Mediator → 3 Clients
- ✅ Transaction logging shows all client deliveries
- ✅ Routing configuration enables health events to passthrough mediator, order events to transformation mediator

---

## 📊 RESEARCH FINDINGS SUMMARY

### The Scenario
**Question**: How to handle 3 clients needing Order data in 3 different formats?
- Client A (Hospital): Needs FHIR R4 format
- Client B (Pharmacy): Needs HL7 v2 ORM format
- Client C (Warehouse): Needs custom JSON format

### Options Evaluated

#### Option A: Multiple Mediator Services (One per client)
- **Verdict**: ❌ Not scalable, too much duplication
- **Use Case**: Good for 2-5 very different clients with separate teams

#### Option B: Single Channel with Multiple Routes
- **Verdict**: ❌ Not OpenHIM's intended use case
- **Reason**: Routes are for orchestration, not fan-out

#### Option C: Single Mediator with Multi-Client Support ⭐
- **Verdict**: ✅ **SELECTED** - Industry standard pattern
- **Reason**: Scalable, configuration-driven, centralized management
- **Pattern**: Message Router + Content-Based Router + Message Translator + Recipient List

---

## 🏗️ ARCHITECTURE DESIGN

### Current State (Phase 3b Complete)
```
Order Event → RabbitMQ → Interop Layer → OpenHIM /transform
              → Transformation Mediator → Single Webhook
```

### Target State (Multi-Client Enhanced)
```
Order Event → RabbitMQ → Interop Layer → OpenHIM /transform
              → Transformation Mediator
                  ├─ Apply Rule: order-to-fhir-r4.json → Client A (Hospital)
                  ├─ Apply Rule: order-to-hl7-orm.json → Client B (Pharmacy)
                  └─ Apply Rule: order-to-warehouse-json.json → Client C (Warehouse)
```

### Data Flow
1. **Orders Service** emits standard CloudEvent with order data
2. **Interop Layer** routes to `/transform` channel (already fixed ✅)
3. **OpenHIM** forwards to transformation-mediator
4. **Transformation Mediator**:
   - Reads `clients.config.json` to find interested clients
   - Filters by event type subscriptions
   - Applies client-specific transformation rules
   - Forwards to each client endpoint
   - Aggregates results
5. **Mock Clients** receive and log transformed data
6. **OpenHIM** logs transaction with all orchestrations

---

## 📋 IMPLEMENTATION TASKS

### ✅ COMPLETED TASKS

#### Task 0: Routing Configuration Fix
- **Status**: ✅ COMPLETE
- **Changes Made**:
  ```yaml
  OPENHIM_HEALTH_ENDPOINT: "https://openhim-core:5000/passthrough"  # Was /smile-default
  OPENHIM_ORDERS_ENDPOINT: "https://openhim-core:5000/transform"    # Was /smile-default
  OPENHIM_DEFAULT_ENDPOINT: "https://openhim-core:5000/smile-default"
  ```
- **Result**: Health events → passthrough, Order events → transformation
- **Service**: interop-layer restarted with new config

---

### 🔨 PENDING TASKS

#### Task 1: Create Client Configuration System
**File**: `apps/mediator-services/transformation-mediator/clients.config.json`

**Structure**:
```json
{
  "clients": [
    {
      "id": "hospital-a-fhir",
      "name": "General Hospital - FHIR R4",
      "description": "Hospital system requiring FHIR R4 format",
      "endpoint": "http://mock-client-fhir:3201/orders",
      "transformationRules": ["order-to-fhir-r4"],
      "eventTypes": ["order.created", "order.approved", "order.shipped"],
      "enabled": true,
      "timeout": 30000,
      "retryAttempts": 2
    },
    {
      "id": "pharmacy-b-hl7",
      "name": "Central Pharmacy - HL7 v2",
      "description": "Pharmacy system requiring HL7 v2 ORM messages",
      "endpoint": "http://mock-client-hl7:3202/receive",
      "transformationRules": ["order-to-hl7-orm"],
      "eventTypes": ["order.created", "order.packed", "order.shipped"],
      "enabled": true,
      "timeout": 30000,
      "retryAttempts": 2
    },
    {
      "id": "warehouse-c-json",
      "name": "Distribution Warehouse - Custom JSON",
      "description": "Warehouse system with custom JSON format",
      "endpoint": "http://mock-client-warehouse:3203/api/inbound-orders",
      "transformationRules": ["order-to-warehouse-json"],
      "eventTypes": ["order.approved", "order.packed"],
      "enabled": true,
      "timeout": 30000,
      "retryAttempts": 2
    }
  ]
}
```

**Client Fields**:
- `id`: Unique identifier
- `name`: Display name
- `description`: Purpose/context
- `endpoint`: HTTP endpoint to forward transformed data
- `transformationRules`: Array of rule names to apply (supports multiple)
- `eventTypes`: Array of CloudEvent types this client subscribes to
- `enabled`: Boolean to enable/disable without deletion
- `timeout`: HTTP request timeout (ms)
- `retryAttempts`: Number of retries on failure

---

#### Task 2: Create 3 Order Transformation Rules

##### Rule 1: FHIR R4 Format
**File**: `transformation-rules/custom/order-to-fhir-r4.json`

**Purpose**: Transform order to FHIR R4 MedicationRequest resource

**Sample Output**:
```json
{
  "resourceType": "MedicationRequest",
  "id": "ORD-12345",
  "status": "active",
  "intent": "order",
  "medicationCodeableConcept": {
    "coding": [{
      "system": "http://snomed.info/sct",
      "code": "320176004",
      "display": "Surgical Mask"
    }]
  },
  "subject": {
    "reference": "Organization/FAC-001"
  },
  "authoredOn": "2025-10-15T16:00:00Z",
  "dosageInstruction": [{
    "text": "100 units"
  }]
}
```

**Key Mappings**:
- `orderId` → `id`
- `status` → `status` (mapped: DRAFT→draft, APPROVED→active, etc.)
- `items[0].name` → `medicationCodeableConcept.coding[0].display`
- `items[0].quantityOrdered` → `dosageInstruction[0].text`
- `facilityId` → `subject.reference`

##### Rule 2: HL7 v2 ORM Format (Simplified)
**File**: `transformation-rules/custom/order-to-hl7-orm.json`

**Purpose**: Transform order to HL7 v2 ORM^O01 message structure (as JSON)

**Sample Output**:
```json
{
  "messageType": "ORM^O01",
  "MSH": {
    "sendingApplication": "SMILE-ORDERS",
    "sendingFacility": "FAC-001",
    "messageDateTime": "20251015160000",
    "messageControlId": "ORD-12345"
  },
  "PID": {
    "patientId": "FAC-001",
    "patientName": "SMILE Medical Center"
  },
  "ORC": {
    "orderControl": "NW",
    "placerOrderNumber": "ORD-12345",
    "orderStatus": "A"
  },
  "OBR": {
    "setId": "1",
    "placerOrderNumber": "ORD-12345",
    "universalServiceId": "ITEM-001",
    "quantity": "100"
  }
}
```

**Key Mappings**:
- `orderId` → `MSH.messageControlId`, `ORC.placerOrderNumber`
- `facilityId` → `MSH.sendingFacility`, `PID.patientId`
- `status` → `ORC.orderStatus` (mapped: DRAFT→IP, APPROVED→A, etc.)
- `items[0]` → `OBR` segment

##### Rule 3: Warehouse Custom JSON Format
**File**: `transformation-rules/custom/order-to-warehouse-json.json`

**Purpose**: Transform order to warehouse-specific format

**Sample Output**:
```json
{
  "warehouse_order": {
    "order_number": "ORD-12345",
    "facility_code": "FAC-001",
    "order_date": "2025-10-15",
    "status_code": "APPROVED",
    "priority": "STANDARD",
    "line_items": [
      {
        "sku": "ITEM-001",
        "item_description": "Surgical Mask",
        "quantity_ordered": 100,
        "unit_price": 0.50,
        "total_amount": 50.00
      }
    ],
    "delivery_instructions": {
      "requires_refrigeration": false,
      "fragile": false,
      "special_handling": null
    }
  },
  "metadata": {
    "source_system": "SMILE",
    "created_at": "2025-10-15T16:00:00Z",
    "version": "1.0"
  }
}
```

**Key Mappings**:
- `orderId` → `warehouse_order.order_number`
- `facilityId` → `warehouse_order.facility_code`
- `status` → `warehouse_order.status_code` (uppercase)
- `priority` → `warehouse_order.priority` (mapped: high→URGENT, etc.)
- `items[]` → `warehouse_order.line_items[]`

---

#### Task 3: Enhance Transformation Mediator

##### 3.1: Create Client Loader
**File**: `src/clients/client-loader.ts`

**Responsibilities**:
- Load `clients.config.json` on startup
- Validate client configuration
- Provide client lookup functions
- Support hot-reload (optional)

**Key Functions**:
```typescript
export function loadClients(): ClientConfig[];
export function getEnabledClients(): ClientConfig[];
export function getClientsForEventType(eventType: string): ClientConfig[];
export function getClientById(id: string): ClientConfig | null;
```

##### 3.2: Create Client Types
**File**: `src/clients/types.ts`

```typescript
export interface ClientConfig {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  transformationRules: string[];
  eventTypes: string[];
  enabled: boolean;
  timeout: number;
  retryAttempts: number;
}

export interface ClientDeliveryResult {
  clientId: string;
  clientName: string;
  success: boolean;
  statusCode?: number;
  transformedData?: any;
  error?: string;
  duration: number;
  timestamp: string;
}
```

##### 3.3: Create Multi-Client Transformer Service
**File**: `src/services/multi-client-transformer.ts`

**Responsibilities**:
- Orchestrate fan-out to multiple clients
- Apply client-specific transformation rules
- Forward to client endpoints
- Aggregate results
- Handle failures gracefully

**Key Function**:
```typescript
export async function transformAndDistribute(
  cloudEvent: CloudEvent
): Promise<{
  success: boolean;
  deliveries: ClientDeliveryResult[];
  summary: {
    totalClients: number;
    successful: number;
    failed: number;
    duration: number;
  };
}>;
```

**Algorithm**:
1. Load all enabled clients
2. Filter by event type subscription
3. For each client:
   - Apply transformation rule(s)
   - Validate output
   - Forward to endpoint
   - Collect result
4. Aggregate all results
5. Return summary

##### 3.4: Update Transform Routes
**File**: `src/routes/transform.routes.ts`

**Changes**:
- Replace single-destination forwarding with multi-client fan-out
- Use `transformAndDistribute()` instead of `transform()` + `forwardData()`
- Include all client deliveries in orchestrations
- Return aggregated results

**Orchestrations Structure**:
```json
{
  "orchestrations": [
    {
      "name": "Transform for Client: hospital-a-fhir",
      "request": {...},
      "response": {...}
    },
    {
      "name": "Forward to Client: hospital-a-fhir",
      "request": {...},
      "response": {...}
    },
    {
      "name": "Transform for Client: pharmacy-b-hl7",
      "request": {...},
      "response": {...}
    },
    {
      "name": "Forward to Client: pharmacy-b-hl7",
      "request": {...},
      "response": {...}
    },
    ...
  ]
}
```

---

#### Task 4: Create 3 Mock Client Services

##### 4.1: Mock Client FHIR (Port 3201)
**Location**: `apps/webhook-services/mock-client-fhir/`

**Endpoint**: `POST /orders`

**Functionality**:
- Receive FHIR R4 MedicationRequest
- Validate structure (basic)
- Log received data
- Return 200 OK with acknowledgment

**Response**:
```json
{
  "status": "accepted",
  "clientId": "hospital-a-fhir",
  "orderId": "ORD-12345",
  "receivedAt": "2025-10-15T16:00:00Z",
  "format": "FHIR R4"
}
```

##### 4.2: Mock Client HL7 (Port 3202)
**Location**: `apps/webhook-services/mock-client-hl7/`

**Endpoint**: `POST /receive`

**Functionality**:
- Receive HL7 v2 ORM structure (JSON)
- Validate message segments
- Log received data
- Return 200 OK with HL7 ACK structure

**Response**:
```json
{
  "status": "acknowledged",
  "clientId": "pharmacy-b-hl7",
  "messageControlId": "ORD-12345",
  "receivedAt": "2025-10-15T16:00:00Z",
  "format": "HL7 v2 ORM"
}
```

##### 4.3: Mock Client Warehouse (Port 3203)
**Location**: `apps/webhook-services/mock-client-warehouse/`

**Endpoint**: `POST /api/inbound-orders`

**Functionality**:
- Receive warehouse custom JSON
- Validate structure
- Log received data
- Return 200 OK with tracking number

**Response**:
```json
{
  "status": "received",
  "clientId": "warehouse-c-json",
  "orderNumber": "ORD-12345",
  "warehouseTrackingId": "WH-2025-1015-001",
  "receivedAt": "2025-10-15T16:00:00Z",
  "format": "Warehouse JSON"
}
```

##### 4.4: Shared Mock Client Structure
Each mock client will have:
```
mock-client-{type}/
├── src/
│   ├── index.ts           # Express server
│   ├── routes/
│   │   └── receive.routes.ts
│   └── validators/
│       └── {type}.validator.ts
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md
```

##### 4.5: Docker Compose Configuration
Add 3 services to `docker-compose.yml`:
```yaml
mock-client-fhir:
  build: apps/webhook-services/mock-client-fhir
  ports: ["3201:3201"]
  networks: [smile-network]

mock-client-hl7:
  build: apps/webhook-services/mock-client-hl7
  ports: ["3202:3202"]
  networks: [smile-network]

mock-client-warehouse:
  build: apps/webhook-services/mock-client-warehouse
  ports: ["3203:3203"]
  networks: [smile-network]
```

---

#### Task 5: Testing Strategy

##### 5.1: Unit Tests
- Client loader tests
- Multi-client transformer tests
- Client filtering logic tests
- Mock client endpoint tests

##### 5.2: Integration Tests
- Single client delivery
- Multi-client fan-out
- Partial failure handling (1 client fails, others succeed)
- All clients fail scenario

##### 5.3: E2E Test Scenarios

**Scenario 1: All Clients Receive Order Created Event**
1. Create order via orders-service API
2. Verify RabbitMQ receives event
3. Verify interop-layer routes to `/transform`
4. Verify transformation-mediator fans out to 3 clients
5. Verify each client receives data in correct format
6. Verify OpenHIM transaction shows all 6 orchestrations (3 transforms + 3 forwards)

**Scenario 2: Selective Delivery Based on Event Type**
1. Create `order.approved` event (subscribed by Hospital & Warehouse, NOT Pharmacy)
2. Verify only 2 clients receive data
3. Verify correct clients (Hospital & Warehouse)

**Scenario 3: Client Failure Handling**
1. Stop mock-client-hl7
2. Create order event
3. Verify FHIR and Warehouse clients succeed
4. Verify HL7 client shows error but doesn't block others
5. Verify transaction shows partial success

**Scenario 4: Disabled Client**
1. Set `hospital-a-fhir.enabled = false` in config
2. Restart mediator
3. Create order event
4. Verify only 2 clients receive data

---

#### Task 6: Documentation

##### 6.1: Update README
- Explain multi-client architecture
- Document client configuration format
- Provide examples of adding new clients

##### 6.2: Create MULTI_CLIENT_COMPLETE.md
- Architecture overview
- Implementation details
- Test results
- Client configuration examples
- Troubleshooting guide

##### 6.3: Update DEVELOPMENT_STATE.md
- Mark multi-client enhancement complete
- Update Phase 3b status
- Document new capabilities

---

## 📊 VALIDATION CHECKLIST

### Configuration-Driven Operation
- [ ] Add new client by editing `clients.config.json` only (no code changes)
- [ ] Disable client by setting `enabled: false`
- [ ] Change endpoint URL without code changes
- [ ] Add/remove event type subscriptions without code changes

### Transformation Capabilities
- [ ] Each client receives data in correct format
- [ ] FHIR R4 output validates against sample
- [ ] HL7 v2 output has correct segments
- [ ] Warehouse JSON matches specification

### Reliability
- [ ] Single client failure doesn't block others
- [ ] Retry logic works for transient failures
- [ ] Timeout handling prevents hanging
- [ ] All errors logged properly

### Observability
- [ ] OpenHIM transaction shows all client deliveries
- [ ] Each orchestration has clear name
- [ ] Success/failure visible per client
- [ ] Response times tracked per client

### E2E Flow
- [ ] Order created event reaches all 3 clients
- [ ] Health event still routes to passthrough mediator
- [ ] Unknown events route to default channel
- [ ] Transaction logs visible in OpenHIM Console

---

## 🎯 IMPLEMENTATION SEQUENCE

### Phase 1: Foundation (2-3 hours)
1. Create `clients.config.json` with 3 clients
2. Create client loader and types
3. Write unit tests for client loader
4. Verify configuration loads correctly

### Phase 2: Transformation Rules (2-3 hours)
1. Create `order-to-fhir-r4.json`
2. Create `order-to-hl7-orm.json`
3. Create `order-to-warehouse-json.json`
4. Test each rule independently
5. Verify outputs match specifications

### Phase 3: Multi-Client Service (3-4 hours)
1. Implement `multi-client-transformer.ts`
2. Update transform routes
3. Write unit tests
4. Test with mock data

### Phase 4: Mock Clients (2-3 hours)
1. Create 3 mock client services
2. Add to docker-compose
3. Test each client independently
4. Verify health endpoints

### Phase 5: Integration & E2E Testing (2-3 hours)
1. Start all services
2. Run E2E test scenarios
3. Verify OpenHIM transactions
4. Check client logs
5. Test failure scenarios

### Phase 6: Documentation (1-2 hours)
1. Write README sections
2. Create completion document
3. Update DEVELOPMENT_STATE.md
4. Add troubleshooting guide

**Total Estimated Time**: 12-18 hours

---

## 🚀 BENEFITS DEMONSTRATED

### For POC
- Showcases OpenHIM's power in real-world scenarios
- Demonstrates scalability (easy to add clients)
- Shows configuration-driven architecture
- Proves event-driven fan-out pattern

### For Production
- Ready to scale to 100+ clients
- No code changes to onboard new clients
- Clear separation of concerns
- Industry-standard integration patterns

---

## 📝 NOTES & CONSIDERATIONS

### Routing Fix Already Applied ✅
- Health events now route to `/passthrough`
- Order events now route to `/transform`
- Service restarted with new configuration

### Design Decisions
- **Why JSON for HL7?**: Simplified for POC demonstration; production would use actual HL7 pipe-delimited format
- **Why Simplified FHIR?**: Full FHIR validation would require additional libraries; basic structure demonstrates concept
- **Why Mock Clients?**: Allows complete E2E testing without external dependencies

### Future Enhancements (Beyond POC)
- RabbitMQ-based pub-sub (instead of HTTP fan-out)
- Client-specific rate limiting
- Circuit breaker pattern per client
- Client health monitoring
- Automatic retry queues
- Transformation rule versioning
- A/B testing capabilities

---

## ✅ READY TO IMPLEMENT

This plan is comprehensive and ready for execution. All architectural decisions have been made based on research and industry best practices.

**Next Step**: Begin Phase 1 - Foundation (Client Configuration System)

**Document Version**: 1.0
**Last Updated**: October 15, 2025, 17:30 UTC
