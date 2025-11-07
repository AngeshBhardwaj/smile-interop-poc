# SMILE Orchestration Mediator

OpenHIM mediator that orchestrates complex multi-step workflows, coordinating calls to Warehouse, Finance, Audit mediators and the Orders Service.

## Overview

The Orchestration Mediator demonstrates the **orchestration mediator pattern** in OpenHIM, where a single request triggers coordinated calls to multiple systems in a controlled workflow.

### 4-Phase Execution Model

```
PHASE 1: Validation (Sequential)
├─ Validate request structure
├─ Generate correlation ID
└─ Create execution context

PHASE 2: Parallel Execution (Concurrent)
├─ Warehouse Call: Inventory validation (timeout: 5s, retries: 3)
├─ Finance Call: Pricing calculation (timeout: 5s, retries: 3, cache fallback)
├─ Audit Call: Compliance check (timeout: 5s, retries: 3, non-critical)
└─ Wait for all to complete (Promise.all)

PHASE 3: Order Creation (Sequential, Depends on Phase 2)
├─ Format enriched order with Phase 2 data
├─ POST to Orders Service (timeout: 5s, retries: 3)
└─ Validate order was created

PHASE 4: Response Aggregation (Sequential, Final)
├─ Combine all step results
├─ Calculate execution metrics
├─ Build OpenHIM mediator response
└─ Return to client
```

## Configuration

### Environment Variables

```bash
# Service Configuration
PORT=3206
NODE_ENV=development
LOG_LEVEL=info

# OpenHIM Configuration
OPENHIM_API_URL=https://openhim-core:8080
OPENHIM_USERNAME=root@openhim.org
OPENHIM_PASSWORD=password
OPENHIM_TRUST_SELF_SIGNED=true

# Mediator Endpoints
WAREHOUSE_ENDPOINT=http://warehouse-transformation-mediator:3301/transform
WAREHOUSE_TIMEOUT=5000
FINANCE_ENDPOINT=http://finance-transformation-mediator:3302/transform
FINANCE_TIMEOUT=5000
AUDIT_ENDPOINT=http://audit-transformation-mediator:3303/transform
AUDIT_TIMEOUT=5000

# Orders Service
ORDERS_ENDPOINT=http://orders-service:3005/api/v1/orders
ORDERS_TIMEOUT=5000
ORDERS_AUTH_TOKEN=mock-jwt-token

# Orchestration Settings
MAX_RETRIES=3
RETRY_JITTER=true
MAX_TOTAL_EXECUTION_MS=30000
```

### Docker Compose

```yaml
orchestration-mediator:
  build:
    context: .
    dockerfile: apps/mediator-services/orchestration-mediator/Dockerfile
  container_name: smile-orchestration-mediator
  ports:
    - "3206:3206"
  environment:
    # ... environment variables from above ...
  depends_on:
    openhim-core:
      condition: service_healthy
    warehouse-transformation-mediator:
      condition: service_started
    finance-transformation-mediator:
      condition: service_started
    audit-transformation-mediator:
      condition: service_started
    orders-service:
      condition: service_started
```

## API Usage

### Orchestration Request

**Endpoint**: `POST http://localhost:3206/orchestrate` (via OpenHIM)

**Headers**:
```
Content-Type: application/json
Authorization: Basic smile-poc:password  (for OpenHIM)
X-Correlation-ID: optional-correlation-id
```

**Request Body**:
```json
{
  "items": [
    {
      "itemId": "ITEM-001",
      "name": "Medicine A",
      "quantity": 100,
      "unitPrice": 10.00
    },
    {
      "itemId": "ITEM-002",
      "name": "Supply B",
      "quantity": 50,
      "unitPrice": 5.00
    }
  ],
  "facilityId": "FAC-001",
  "departmentId": "DEPT-001",
  "requestedBy": "Dr. Smith",
  "priority": "normal"
}
```

### Orchestration Response (Success)

**Status**: 200 OK

```json
{
  "x-mediator-urn": "urn:mediator:smile-orchestration",
  "status": "Successful",
  "response": {
    "status": 200,
    "headers": { "content-type": "application/json" },
    "body": "{...aggregated response...}",
    "timestamp": "2025-10-30T12:34:56.789Z"
  },
  "orchestrations": [...]
}
```

**Aggregated Response Body**:
```json
{
  "orchestration_id": "corr-12345",
  "timestamp": "2025-10-30T12:34:56.789Z",
  "status": "success",

  "order": {
    "orderId": "ORD-12345",
    "status": "DRAFT",
    "createdAt": "2025-10-30T12:34:56.000Z"
  },

  "warehouse": {
    "status": "success",
    "message": "Warehouse data received"
  },

  "finance": {
    "status": "success",
    "subtotal": 1250.00,
    "tax": 100.00,
    "total": 1350.00,
    "source": "live"
  },

  "audit": {
    "status": "success",
    "message": "Audit data received"
  },

  "metrics": {
    "total_execution_ms": 245,
    "phase1_validation_ms": 10,
    "phase2_parallel_ms": 120,
    "phase3_order_creation_ms": 100,
    "phase4_aggregation_ms": 15
  }
}
```

### Response Status Codes

- **`success`**: All steps completed successfully, order created
- **`partial_success`**: Order created, but some enrichment failed (warehouse/audit/finance)
- **`failed`**: Critical failure - order not created (validation error or orders service failure)

## Error Handling

### Retry Strategy

- **Default**: 3 attempts with exponential backoff (1s, 2s, 4s)
- **Jitter**: ±20% randomness to prevent thundering herd
- **Timeout**: 5s per attempt, 15s total per service

### Non-Critical Operations

- **Warehouse**: Information only, continues on failure
- **Audit**: Optional validation, continues on failure
- **Finance**: Has cache fallback, uses estimated pricing if mediator fails

### Critical Operations

- **Order Creation**: Must succeed or overall orchestration fails
- **Validation errors (400/422)**: Not retried, fails immediately

## Health Checks

```bash
# Health endpoint
curl http://localhost:3206/health

# Response
{
  "status": "ok",
  "service": "Orchestration Mediator",
  "version": "1.0.0",
  "timestamp": "2025-10-30T12:34:56.789Z"
}
```

## Logging

All logs include:
- `orchestrationId`: Unique ID for tracking full workflow
- `correlationId`: ID propagated through all calls
- `requestId`: Unique request identifier
- Structured JSON format with context

Example:
```json
{
  "level": "INFO",
  "time": "2025-10-30T12:34:56.789Z",
  "service": "orchestration-mediator",
  "context": "orchestrator-service",
  "orchestrationId": "corr-12345",
  "message": "Orchestration completed",
  "status": "success",
  "totalDurationMs": 245
}
```

## Development

### Install Dependencies

```bash
cd apps/mediator-services/orchestration-mediator
pnpm install
```

### Build

```bash
pnpm build
```

### Run in Development

```bash
pnpm dev
```

### Test

```bash
pnpm test
```

## Architecture

### Service Classes

- **orchestrator.service.ts**: Core orchestration logic
- **warehouse.service.ts**: Warehouse mediator calls
- **finance.service.ts**: Finance mediator calls (with cache)
- **audit.service.ts**: Audit mediator calls
- **orders.service.ts**: Orders service calls

### Utilities

- **retry.ts**: Exponential backoff retry logic
- **response-aggregator.ts**: Response formatting and aggregation
- **logger.ts**: Structured logging with Pino
- **registration.ts**: OpenHIM registration

### Routes

- **orchestration.routes.ts**: Main `/orchestrate` endpoint

## OpenHIM Integration

The mediator registers with OpenHIM and exposes:

```json
{
  "urn": "urn:mediator:smile-orchestration",
  "version": "1.0.0",
  "name": "SMILE Orchestration Mediator",
  "endpoints": [
    {
      "name": "Orchestration Endpoint",
      "host": "localhost",
      "port": 3206,
      "path": "/orchestrate",
      "type": "http"
    }
  ]
}
```

### OpenHIM Channel Configuration

**Channel Name**: Orders Orchestrated
**URL Pattern**: `^/orders-orchestrated$`
**Route**: `orchestration-mediator:3206/orchestrate`
**Allowed Clients**: smile-poc, pharmacy-system, billing-system

## Monitoring

### Metrics

Each orchestration logs:
- Total execution time
- Phase-by-phase execution times
- Retry counts and successes
- Step-by-step status

### Correlation Tracking

All logs include `orchestrationId` for tracing:
```bash
# Tail logs for specific orchestration
docker logs smile-orchestration-mediator | grep "corr-12345"
```

## Troubleshooting

### Service Timeouts

If operations timeout frequently, check:
1. Mediator service health: `curl http://warehouse-transformation-mediator:3301/health`
2. Network connectivity between containers
3. Increase `WAREHOUSE_TIMEOUT`, `FINANCE_TIMEOUT`, etc.

### Order Creation Failures

Check Orders Service logs:
```bash
docker logs smile-orders-service
```

Ensure required fields are present in request.

### Cache Not Being Used

Finance cache is 5-minute TTL. Verify:
1. Finance mediator was available at some point
2. Cache key (facilityId) matches

## References

- [PHASE_2_IMPLEMENTATION_GUIDE.md](../../PHASE_2_IMPLEMENTATION_GUIDE.md) - Detailed implementation specs
- [PHASE_2_DIAGRAMS.md](../../PHASE_2_DIAGRAMS.md) - Architecture and flow diagrams
- [OpenHIM Orchestrator Tutorial](https://openhim.org/docs/tutorial/mediators/orchestrator/)
- [OpenHIM Mediator Development](https://openhim.org/docs/dev-guide/developing-mediators/)

---

**Status**: Phase 2 Implementation - Orchestration Mediator
**Last Updated**: 2025-10-30
