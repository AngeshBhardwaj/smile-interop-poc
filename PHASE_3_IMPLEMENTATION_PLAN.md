# Phase 3: Mediator Services Implementation Plan

**Date Created**: 2025-10-14
**Status**: PLANNING
**Goal**: Demonstrate all 3 OpenHIM mediator types with data transformation capabilities

---

## 🎯 POC Objectives Review

### End Goal
Build a complete interoperability layer POC for SMILE application with OpenHIM at the core, demonstrating:
1. Event-driven architecture with CloudEvents
2. Protocol bridge (CloudEvents ↔ HTTP for OpenHIM)
3. All 3 OpenHIM mediator types (Pass-through, Adapter, Orchestrator)
4. Data transformation capabilities without code changes (configuration-based)
5. Complete end-to-end flow validation

### Current Achievement
✅ **Phase 1**: Foundation (CloudEvents, Security, RabbitMQ)
✅ **Phase 2**: Application Services (Health Service, Orders Service, Interop Layer)
✅ **Phase 2 Validation**: Complete E2E flow working (Orders API → RabbitMQ → Interop → OpenHIM → Transaction Logged)

---

## 🏗️ Architecture Understanding

### Complete Flow (From POC Diagram)
```
┌─────────────────┐
│ Nodejs Service A│ (Health Service - PII/PHI data)
│ (CloudEvent)    │
└────────┬────────┘
         │
┌─────────────────┐
│ Nodejs Service B│ (Orders Service - Transactional workflow)
│ (CloudEvent)    │
└────────┬────────┘
         │ Both publish to
         ▼
┌─────────────────┐
│ RabbitMQ Queue  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Event to HTTP   │ (Interop Layer - Protocol Bridge)
│ Bridge          │
└────────┬────────┘
         │ POST to OpenHIM channels
         ▼
┌─────────────────┐
│   OpenHIM       │ (Router + Transaction Logger)
│   Core          │
└────────┬────────┘
         │ Routes based on channel config
         ├─────────────┬─────────────┬──────────────┐
         │             │             │              │
         ▼             ▼             ▼              ▼
  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
  │Mediator  │  │Mediator  │  │Mediator  │        │
  │Pass-     │  │Adapter   │  │Orchestr- │        │
  │through   │  │          │  │ator      │        │
  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
       │             │             │              │
       ▼             ▼             ▼              ▼
  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │Mock      │  │Nodejs    │  │Mock      │  │webhook.  │
  │Webhook   │  │Server B  │  │Webhook   │  │site      │
  │          │  │(Client)  │  │          │  │(test)    │
  └──────────┘  └──────────┘  └──────────┘  └──────────┘
```

### Key Insight: Where Transformation Happens
**Mediators are separate HTTP microservices** that:
1. Receive requests from OpenHIM
2. Transform data structure (A → B)
3. Forward to final client systems
4. Return response to OpenHIM

---

## 🎯 Routing Strategy: Best Practices

### Approach: Pre-OpenHIM Routing (In Interop-Layer) ⭐ RECOMMENDED

**How it works:**
- Interop-layer examines CloudEvent (type, source, metadata)
- Routes to different OpenHIM channel URLs based on business logic
- Each channel configured with its specific mediator

**Implementation:**
```typescript
// apps/interop-layer/src/bridge/openhim-bridge.ts
public getChannelForEvent(event: CloudEvent): string {
  const baseUrl = 'https://openhim-core:5000';

  // Route based on event source and type
  if (event.source === 'smile.health-service') {
    return `${baseUrl}/passthrough`; // Pass-through mediator
  }

  if (event.source === 'smile.orders-service') {
    if (event.type === 'order.urgent') {
      return `${baseUrl}/orchestrator`; // Complex orchestration
    }
    return `${baseUrl}/adapter`; // Transform orders
  }

  return `${baseUrl}/smile-default`; // Fallback to webhook.site
}
```

**OpenHIM Channels Configuration:**
```javascript
// Channel 1: Pass-through (Health events)
{
  name: "Health Passthrough Channel",
  urlPattern: "^/passthrough$",
  routes: [{
    host: "passthrough-mediator",
    port: 3100,
    path: "/forward"
  }]
}

// Channel 2: Adapter (Order transformation)
{
  name: "Orders Adapter Channel",
  urlPattern: "^/adapter$",
  routes: [{
    host: "adapter-mediator",
    port: 3101,
    path: "/transform"
  }]
}

// Channel 3: Orchestrator (Complex workflows)
{
  name: "Orchestrator Channel",
  urlPattern: "^/orchestrator$",
  routes: [{
    host: "orchestrator-mediator",
    port: 3102,
    path: "/orchestrate"
  }]
}
```

**Advantages:**
- ✅ Explicit control in code
- ✅ Business logic stays in interop-layer
- ✅ Easy to test and debug
- ✅ Clear event → channel mapping

---

## 📋 Phase 3: Implementation Steps

### Phase 3a: Pass-Through Mediator (Type 1)
**Objective**: Simplest mediator - receives, logs, forwards as-is

**Implementation Tasks:**
1. Create mediator service structure
2. Implement OpenHIM registration with heartbeat
3. Create forward endpoint
4. Configure OpenHIM channel
5. Test with health-service events

**Files to Create:**
```
apps/mediator-services/passthrough-mediator/
├── package.json
├── tsconfig.json
├── Dockerfile
├── mediatorConfig.json              # OpenHIM registration config
└── src/
    ├── index.ts                     # Main entry point
    ├── config/
    │   └── openhim.config.ts        # OpenHIM connection
    ├── routes/
    │   └── forward.routes.ts        # POST /forward endpoint
    └── utils/
        └── registration.ts          # Register with OpenHIM
```

**Key Features:**
- Receives CloudEvent from OpenHIM
- Logs event details (correlation ID, type, source)
- Forwards to Mock Webhook without modification
- Returns 200 OK with transaction metadata
- Registers with OpenHIM using `openhim-mediator-utils`
- Implements heartbeat mechanism

**Success Criteria:**
- ✅ Mediator registers with OpenHIM
- ✅ Shows as "Available" in OpenHIM Console
- ✅ Health event flows: Interop → OpenHIM → Mediator → Webhook
- ✅ Transaction visible with mediator metadata

---

### Phase 3b: Adapter Mediator (Type 2)
**Objective**: Transform data structure from Orders Service format to Client format

**Implementation Tasks:**
1. Create mediator service with transformation logic
2. Implement configurable transformation mappings
3. Create transform endpoint
4. Configure OpenHIM channel for orders
5. Build webhook service to receive transformed data
6. Test with orders-service events

**Files to Create:**
```
apps/mediator-services/adapter-mediator/
├── package.json
├── mediatorConfig.json
└── src/
    ├── index.ts
    ├── config/
    │   ├── openhim.config.ts
    │   └── transformation.config.json   # Mapping rules
    ├── routes/
    │   └── transform.routes.ts          # POST /transform
    ├── transformers/
    │   ├── order-transformer.ts         # Transform logic
    │   └── mapping-engine.ts            # Config-based mapping
    └── utils/
        └── registration.ts

apps/webhook-services/order-receiver/
├── package.json
└── src/
    ├── index.ts
    └── routes/
        └── receive.routes.ts            # POST /orders endpoint
```

**Transformation Example:**
```javascript
// Input: Orders Service Format (Structure A)
{
  orderId: "ORD-12345",
  facilityId: "FAC-001",
  items: [
    {
      itemId: "ITEM-001",
      name: "Surgical Mask",
      quantityOrdered: 100,
      unitPrice: 0.50
    }
  ],
  status: "DRAFT",
  priority: "high"
}

// Output: Client Format (Structure B)
{
  order_reference: "ORD-12345",
  location_code: "FAC-001",
  line_items: [
    {
      sku: "ITEM-001",
      description: "Surgical Mask",
      qty: 100,
      unit_cost: 0.50
    }
  ],
  order_status: "pending",
  urgency_level: "high"
}
```

**Configuration-Based Transformation:**
```json
// transformation.config.json
{
  "mappings": {
    "order_reference": "orderId",
    "location_code": "facilityId",
    "order_status": {
      "source": "status",
      "transform": {
        "DRAFT": "pending",
        "SUBMITTED": "processing",
        "APPROVED": "confirmed"
      }
    },
    "line_items": {
      "source": "items",
      "itemMappings": {
        "sku": "itemId",
        "description": "name",
        "qty": "quantityOrdered",
        "unit_cost": "unitPrice"
      }
    }
  }
}
```

**Success Criteria:**
- ✅ Mediator transforms order structure correctly
- ✅ Configuration changes apply without code changes
- ✅ Transformed data reaches webhook service
- ✅ Validation proves Structure A → Structure B works

---

### Phase 3c: Orchestrator Mediator (Type 3)
**Objective**: Complex workflow orchestrating multiple system calls

**Implementation Tasks:**
1. Create orchestrator service with workflow engine
2. Implement multi-step workflow (inventory check, approval, notification)
3. Aggregate responses from multiple systems
4. Configure OpenHIM channel for urgent orders
5. Create mock services for workflow steps
6. Test with urgent order events

**Files to Create:**
```
apps/mediator-services/orchestrator-mediator/
├── package.json
├── mediatorConfig.json
└── src/
    ├── index.ts
    ├── config/
    │   ├── openhim.config.ts
    │   └── workflow.config.json         # Workflow definitions
    ├── routes/
    │   └── orchestrate.routes.ts        # POST /orchestrate
    ├── orchestrator/
    │   ├── workflow-engine.ts           # Execute workflows
    │   ├── steps/
    │   │   ├── check-inventory.ts       # Step 1
    │   │   ├── auto-approve.ts          # Step 2
    │   │   └── send-notification.ts     # Step 3
    │   └── aggregator.ts                # Combine responses
    └── utils/
        └── registration.ts
```

**Workflow Example:**
```javascript
// Urgent Order Workflow
async function orchestrateUrgentOrder(order) {
  const results = {
    order,
    workflow: []
  };

  // Step 1: Check inventory
  const inventory = await checkInventorySystem(order.items);
  results.workflow.push({
    step: 'inventory_check',
    status: inventory.available ? 'success' : 'warning',
    data: inventory
  });

  // Step 2: Auto-approve if urgent and available
  if (order.priority === 'urgent' && inventory.available) {
    const approval = await autoApprovalSystem(order);
    results.workflow.push({
      step: 'auto_approval',
      status: 'success',
      data: approval
    });
  }

  // Step 3: Send notifications
  const notification = await notificationSystem({
    type: 'urgent_order',
    orderId: order.orderId,
    status: 'processing'
  });
  results.workflow.push({
    step: 'notification',
    status: 'success',
    data: notification
  });

  // Aggregate and return
  return {
    success: true,
    workflow_results: results,
    final_status: 'orchestrated'
  };
}
```

**Success Criteria:**
- ✅ Mediator orchestrates multiple system calls
- ✅ Responses aggregated correctly
- ✅ Complex workflow completes successfully
- ✅ Demonstrates orchestration capabilities

---

## 🔧 OpenHIM Mediator Registration

### Using openhim-mediator-utils

**Installation:**
```bash
pnpm add openhim-mediator-utils express body-parser
```

**Mediator Config Structure:**
```json
{
  "urn": "urn:mediator:smile-passthrough",
  "version": "1.0.0",
  "name": "SMILE Pass-through Mediator",
  "description": "Forwards CloudEvents without transformation",
  "defaultChannelConfig": [
    {
      "name": "Health Passthrough Channel",
      "urlPattern": "^/passthrough$",
      "routes": [
        {
          "name": "Passthrough Route",
          "host": "passthrough-mediator",
          "port": 3100,
          "path": "/forward",
          "primary": true,
          "type": "http"
        }
      ],
      "allow": ["cloudevents-client"],
      "type": "http"
    }
  ],
  "endpoints": [
    {
      "name": "Passthrough Endpoint",
      "host": "passthrough-mediator",
      "port": 3100,
      "path": "/forward",
      "type": "http"
    }
  ]
}
```

**Registration Code:**
```typescript
import { registerMediator, activateHeartbeat } from 'openhim-mediator-utils';

const openhimConfig = {
  apiURL: process.env.OPENHIM_API_URL,
  username: process.env.OPENHIM_USERNAME,
  password: process.env.OPENHIM_PASSWORD,
  trustSelfSigned: true
};

// Register on startup
registerMediator(openhimConfig, mediatorConfig, (err) => {
  if (err) {
    console.error('Failed to register mediator:', err);
    process.exit(1);
  }

  console.log('Mediator registered successfully');

  // Start heartbeat
  activateHeartbeat(openhimConfig);
});
```

---

## 🐳 Docker Configuration

### Update docker-compose.yml

```yaml
services:
  # Existing services...

  # Pass-through Mediator
  passthrough-mediator:
    build:
      context: .
      dockerfile: apps/mediator-services/passthrough-mediator/Dockerfile
    container_name: smile-passthrough-mediator
    ports:
      - "3100:3100"
    environment:
      MEDIATOR_PORT: 3100
      OPENHIM_API_URL: https://openhim-core:8080
      OPENHIM_USERNAME: smile-poc
      OPENHIM_PASSWORD: password
      WEBHOOK_URL: https://webhook.site/e0bf3b4a-4914-4e44-a97e-fa9fd179909c
    depends_on:
      openhim-core:
        condition: service_healthy
    networks:
      - smile-network

  # Adapter Mediator
  adapter-mediator:
    build:
      context: .
      dockerfile: apps/mediator-services/adapter-mediator/Dockerfile
    container_name: smile-adapter-mediator
    ports:
      - "3101:3101"
    environment:
      MEDIATOR_PORT: 3101
      OPENHIM_API_URL: https://openhim-core:8080
      OPENHIM_USERNAME: smile-poc
      OPENHIM_PASSWORD: password
      CLIENT_WEBHOOK_URL: http://order-receiver:3200/orders
    depends_on:
      openhim-core:
        condition: service_healthy
    networks:
      - smile-network

  # Orchestrator Mediator
  orchestrator-mediator:
    build:
      context: .
      dockerfile: apps/mediator-services/orchestrator-mediator/Dockerfile
    container_name: smile-orchestrator-mediator
    ports:
      - "3102:3102"
    environment:
      MEDIATOR_PORT: 3102
      OPENHIM_API_URL: https://openhim-core:8080
      OPENHIM_USERNAME: smile-poc
      OPENHIM_PASSWORD: password
      INVENTORY_SERVICE_URL: http://mock-inventory:3300
      APPROVAL_SERVICE_URL: http://mock-approval:3301
      NOTIFICATION_SERVICE_URL: http://mock-notification:3302
    depends_on:
      openhim-core:
        condition: service_healthy
    networks:
      - smile-network

  # Order Receiver (Webhook Service)
  order-receiver:
    build:
      context: .
      dockerfile: apps/webhook-services/order-receiver/Dockerfile
    container_name: smile-order-receiver
    ports:
      - "3200:3200"
    environment:
      PORT: 3200
    networks:
      - smile-network
```

---

## ✅ Testing Strategy

### Phase 3a Testing (Pass-through)
1. Create health event via health-service API
2. Verify event flows to RabbitMQ
3. Verify interop-layer routes to `/passthrough` channel
4. Verify OpenHIM routes to pass-through mediator
5. Verify mediator forwards to webhook
6. Check OpenHIM Console for transaction with mediator metadata

### Phase 3b Testing (Adapter)
1. Create order via orders-service API
2. Verify event flows to RabbitMQ
3. Verify interop-layer routes to `/adapter` channel
4. Verify OpenHIM routes to adapter mediator
5. Verify transformation: Structure A → Structure B
6. Verify transformed data reaches order-receiver webhook
7. Validate field mappings are correct

### Phase 3c Testing (Orchestrator)
1. Create urgent order via orders-service API
2. Verify interop-layer routes to `/orchestrator` channel
3. Verify orchestrator calls multiple services
4. Verify responses aggregated correctly
5. Verify final result returned to OpenHIM
6. Check workflow execution logs

---

## 📝 Development Workflow

### Established Practices (CRITICAL)
1. **One step at a time** - Complete development, run tests, validate, commit
2. **No skipping steps/milestones** - User validation required
3. **No rush** - Quality over speed
4. **Build verification**: Build and test before each commit
5. **Documentation first**: Update plans before coding

### Implementation Sequence
1. **Phase 3a**: Pass-through mediator (simplest)
2. **Validate & Commit**: Full E2E testing
3. **Phase 3b**: Adapter mediator (transformation)
4. **Validate & Commit**: Transformation testing
5. **Phase 3c**: Orchestrator mediator (complex)
6. **Validate & Commit**: Orchestration testing
7. **Final Integration**: All mediators working together

---

## 🎯 Success Criteria for Phase 3

### Phase 3a Complete When:
- ✅ Pass-through mediator registered with OpenHIM
- ✅ Shows as "Available" in OpenHIM Console
- ✅ Health events flow through mediator
- ✅ Transaction visible with mediator metadata
- ✅ All tests passing
- ✅ Code committed

### Phase 3b Complete When:
- ✅ Adapter mediator transforms order data
- ✅ Configuration-based transformation works
- ✅ Transformed data reaches webhook service
- ✅ Validation proves Structure A → Structure B
- ✅ All tests passing
- ✅ Code committed

### Phase 3c Complete When:
- ✅ Orchestrator handles complex workflows
- ✅ Multiple system calls orchestrated
- ✅ Responses aggregated correctly
- ✅ All workflow steps logged
- ✅ All tests passing
- ✅ Code committed

### Phase 3 Fully Complete When:
- ✅ All 3 mediator types working
- ✅ Routing logic in interop-layer functional
- ✅ OpenHIM channels configured correctly
- ✅ Complete E2E validation successful
- ✅ Documentation updated
- ✅ POC objectives achieved

---

## 📚 References

- OpenHIM Mediator Tutorial: https://openhim.org/docs/tutorial/mediators/basic-scaffold/
- OpenHIM Bootstrap Samples: https://github.com/jembi?utf8=%E2%9C%93&q=bootstrap
- OpenHIM Mediator Configuration: https://openhim.org/docs/configuration/mediators
- OpenHIM Developer Guide: https://openhim.org/docs/dev-guide/developing-mediators

---

## 🚀 Next Actions

1. **Review this plan** with user for approval
2. **Start Phase 3a** (Pass-through Mediator)
3. **Create mediator service structure**
4. **Implement OpenHIM registration**
5. **Test and validate**
6. **Commit working code**
7. **Repeat for Phase 3b and 3c**

---

**Status**: READY TO START
**Next Step**: Phase 3a - Pass-Through Mediator Implementation
