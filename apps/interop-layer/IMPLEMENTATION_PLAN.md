# Interop Layer - CloudEvent Consumer Implementation Plan

**Phase:** Step 3 - Implement CloudEvent Consumer in Interop Layer
**Start Date:** 2025-10-10
**Status:** IN PROGRESS
**Current Task:** Task 2 - Define CloudEvent Consumer Architecture

---

## 🎯 Objective

Implement a robust CloudEvent consumer in the Interop Layer that:
1. Consumes CloudEvents from RabbitMQ queues (health-service and orders-service)
2. Applies intelligent routing logic based on event type, source, and business rules
3. Routes events to appropriate mediator services or client services
4. Handles failures with Dead Letter Queue (DLQ) and retry mechanisms
5. Provides comprehensive observability through logging, tracing, and metrics

---

## 📋 Task Checklist

### ✅ Phase 1: Planning & Architecture
- [x] **Task 1:** Review current interop-layer structure and dependencies
  - **Status:** COMPLETED
  - **Date:** 2025-10-10
  - **Findings:**
    - Minimal Express app with health endpoint only
    - All required dependencies present (amqplib, cloudevents, pino, OpenTelemetry)
    - Basic EventConsumer exists in @smile/cloud-events but needs enhancement
    - Must consume from 2 exchanges: `health.events` (20+ event types), `orders.events` (14 event types)

- [x] **Task 2:** Define CloudEvent consumer architecture and routing strategy
  - **Status:** COMPLETED
  - **Date Started:** 2025-10-10
  - **Date Completed:** 2025-10-10
  - **Deliverables:**
    - ✅ Architecture diagram (documented in this file)
    - ✅ Routing strategy definition (5 strategies: type, source, content, hybrid, fallback)
    - ✅ Component interfaces and contracts (TypeScript interfaces)
    - ✅ Configuration schema (env vars, YAML routing config, TS interfaces)
  - **Sub-tasks:**
    - [x] Define consumer architecture components
    - [x] Define routing rules and strategies
    - [x] Design configuration structure
    - [x] Document component interfaces

### 🔧 Phase 2: Core Implementation
- [ ] **Task 3:** Implement RabbitMQ connection management with retry logic
  - **Status:** PENDING
  - **Deliverables:**
    - Connection manager with retry/backoff
    - Channel pooling
    - Graceful shutdown handling
    - Connection health monitoring
  - **Files to create:**
    - `apps/interop-layer/src/messaging/connection-manager.ts`
    - `apps/interop-layer/src/messaging/types.ts`

- [ ] **Task 4:** Implement CloudEvent consumer with proper deserialization
  - **Status:** PENDING
  - **Deliverables:**
    - Enhanced EventConsumer class
    - CloudEvent deserialization and validation
    - Message acknowledgment strategies
    - Correlation ID propagation
  - **Files to create:**
    - `apps/interop-layer/src/consumer/event-consumer.ts`
    - `apps/interop-layer/src/consumer/message-handler.ts`

- [ ] **Task 5:** Implement routing logic based on event type and source
  - **Status:** PENDING
  - **Deliverables:**
    - Event router with multiple strategies
    - Routing configuration loader
    - Route validation
    - Fallback handling
  - **Files to create:**
    - `apps/interop-layer/src/routing/event-router.ts`
    - `apps/interop-layer/src/routing/routing-config.ts`
    - `apps/interop-layer/src/routing/strategies/*`

- [ ] **Task 6:** Add structured logging with correlation IDs and tracing
  - **Status:** PENDING
  - **Deliverables:**
    - Pino logger integration
    - OpenTelemetry span creation
    - Correlation ID tracking
    - PII/PHI masking in logs
  - **Files to create:**
    - `apps/interop-layer/src/observability/logger.ts`
    - `apps/interop-layer/src/observability/tracer.ts`

- [ ] **Task 7:** Implement error handling with DLQ and circuit breaker
  - **Status:** PENDING
  - **Deliverables:**
    - DLQ routing for failed messages
    - Retry logic with exponential backoff
    - Circuit breaker for downstream services
    - Error metrics
  - **Files to create:**
    - `apps/interop-layer/src/error-handling/dlq-handler.ts`
    - `apps/interop-layer/src/error-handling/circuit-breaker.ts`
    - `apps/interop-layer/src/error-handling/retry-strategy.ts`

- [ ] **Task 8:** Add health check endpoint for consumer status
  - **Status:** PENDING
  - **Deliverables:**
    - Enhanced health endpoint
    - RabbitMQ connection status
    - Consumer metrics
    - Kubernetes-ready readiness/liveness probes
  - **Files to update:**
    - `apps/interop-layer/src/index.ts`
    - `apps/interop-layer/src/health/health-service.ts` (new)

### 🧪 Phase 3: Testing
- [ ] **Task 9:** Write comprehensive unit tests for consumer logic
  - **Status:** PENDING
  - **Coverage Target:** >80%
  - **Deliverables:**
    - Unit tests for connection manager
    - Unit tests for event consumer
    - Unit tests for router
    - Unit tests for error handlers
  - **Files to create:**
    - `apps/interop-layer/src/messaging/__tests__/connection-manager.test.ts`
    - `apps/interop-layer/src/consumer/__tests__/event-consumer.test.ts`
    - `apps/interop-layer/src/routing/__tests__/event-router.test.ts`
    - `apps/interop-layer/src/error-handling/__tests__/*.test.ts`

- [ ] **Task 10:** Write integration tests for RabbitMQ consumption
  - **Status:** PENDING
  - **Deliverables:**
    - Integration tests with real RabbitMQ (Docker)
    - Event consumption flow tests
    - Routing verification
    - DLQ tests
  - **Files to create:**
    - `apps/interop-layer/src/__tests__/integration/consumer.integration.test.ts`
    - `apps/interop-layer/src/__tests__/integration/routing.integration.test.ts`

### 🔍 Phase 4: Manual Testing & Verification
- [ ] **Task 11:** Test consumer with health-service events via Swagger
  - **Status:** PENDING
  - **Test Cases:**
    - [ ] Patient registration event (health.patient.registered)
    - [ ] Appointment scheduled event (health.appointment.scheduled)
    - [ ] Vital signs recorded event (health.vitals.recorded)
    - [ ] Lab result available event (health.lab.result-available)
    - [ ] Medication prescribed event (health.medication.prescribed)
  - **Verification:**
    - [ ] Events consumed successfully
    - [ ] Routing applied correctly
    - [ ] Logs show correlation IDs
    - [ ] PII/PHI masked in logs

- [ ] **Task 12:** Test consumer with orders-service events via Swagger
  - **Status:** PENDING
  - **Test Cases:**
    - [ ] Order created event (order.created)
    - [ ] Order submitted event (order.submitted)
    - [ ] Order approved event (order.approved)
    - [ ] Order shipped event (order.shipped)
    - [ ] Order fulfilled event (order.fulfilled)
  - **Verification:**
    - [ ] Events consumed successfully
    - [ ] Routing applied correctly
    - [ ] Logs show correlation IDs

- [ ] **Task 13:** Verify OpenTelemetry tracing in Jaeger UI
  - **Status:** PENDING
  - **Verification Steps:**
    - [ ] Start Jaeger (docker-compose up jaeger)
    - [ ] Trigger events from both services
    - [ ] Open Jaeger UI (http://localhost:16686)
    - [ ] Verify traces show full event lifecycle
    - [ ] Verify span hierarchy (producer -> consumer -> router)

- [ ] **Task 14:** Test error scenarios and DLQ routing
  - **Status:** PENDING
  - **Test Cases:**
    - [ ] Invalid CloudEvent format
    - [ ] Missing required fields
    - [ ] Routing failure (no matching route)
    - [ ] Downstream service unavailable
    - [ ] Circuit breaker activation
  - **Verification:**
    - [ ] Failed messages sent to DLQ
    - [ ] Retry attempts logged
    - [ ] Error metrics incremented
    - [ ] Circuit breaker opens after threshold

### 📚 Phase 5: Documentation & Finalization
- [ ] **Task 15:** Update API documentation and README
  - **Status:** PENDING
  - **Deliverables:**
    - Update `apps/interop-layer/README.md`
    - Document routing configuration
    - Document environment variables
    - Add architecture diagrams
    - Add troubleshooting guide

- [ ] **Task 16:** Run full test suite and verify all tests pass
  - **Status:** PENDING
  - **Commands to run:**
    ```bash
    pnpm --filter=@smile/interop-layer test
    pnpm --filter=@smile/interop-layer typecheck
    pnpm --filter=@smile/interop-layer lint
    ```
  - **Success Criteria:**
    - [ ] All unit tests pass
    - [ ] All integration tests pass
    - [ ] Test coverage >80%
    - [ ] No TypeScript errors
    - [ ] No linting errors

- [ ] **Task 17:** Test in Docker deployment environment
  - **Status:** PENDING
  - **Steps:**
    ```bash
    # Build all services
    pnpm build

    # Start all Docker services
    docker-compose up -d

    # Verify all services healthy
    curl http://localhost:3001/health  # health-service
    curl http://localhost:3005/health  # orders-service
    curl http://localhost:3002/health  # interop-layer

    # Check RabbitMQ management
    # http://localhost:15672 (admin/admin123)

    # Check Jaeger traces
    # http://localhost:16686
    ```
  - **Verification:**
    - [ ] All services start successfully
    - [ ] Health checks pass
    - [ ] Events flow end-to-end
    - [ ] Traces visible in Jaeger
    - [ ] No errors in logs

- [ ] **Task 18:** Commit changes with proper commit message
  - **Status:** PENDING
  - **Pre-commit checklist:**
    - [ ] All tests passing
    - [ ] Code linted and formatted
    - [ ] Documentation updated
    - [ ] No debug code or console.logs
    - [ ] No secrets in code
  - **Commit Message Format:**
    ```
    feat: implement CloudEvent consumer in interop-layer

    - Add RabbitMQ connection manager with retry logic
    - Implement event consumer with CloudEvent deserialization
    - Add intelligent routing based on event type and source
    - Implement DLQ and circuit breaker for error handling
    - Add comprehensive logging and OpenTelemetry tracing
    - Enhance health check with consumer status
    - Add unit and integration tests (>80% coverage)

    Tested:
    - Unit tests: PASS
    - Integration tests: PASS
    - Manual testing via Swagger: PASS
    - Docker deployment: PASS
    - Jaeger tracing: VERIFIED

    Related to: Step 3 - CloudEvent Consumer Implementation
    ```

---

## 🏗️ Architecture Design

### Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Interop Layer Application                     │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Express HTTP Server                      │ │
│  │  - Health Check Endpoints                                   │ │
│  │  - Metrics Endpoints                                        │ │
│  │  - Admin/Management APIs                                    │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              Connection Manager (RabbitMQ)                  │ │
│  │  - Connection pooling with retry                           │ │
│  │  - Channel management                                       │ │
│  │  - Graceful shutdown                                        │ │
│  │  - Health monitoring                                        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                          │                                        │
│                          ▼                                        │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                  Event Consumer                             │ │
│  │  - Subscribe to multiple queues                            │ │
│  │  - CloudEvent deserialization & validation                 │ │
│  │  - Message acknowledgment strategies                       │ │
│  │  - Correlation ID extraction & propagation                 │ │
│  └────────────────────────────────────────────────────────────┘ │
│                          │                                        │
│                          ▼                                        │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                   Message Handler                           │ │
│  │  - Pre-processing (validation, enrichment)                 │ │
│  │  - Idempotency check (optional)                            │ │
│  │  - Correlation tracking                                     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                          │                                        │
│                          ▼                                        │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Event Router                             │ │
│  │  - Route determination (type, source, content-based)       │ │
│  │  - Multiple routing strategies                             │ │
│  │  - Route validation & fallback                             │ │
│  │  - Dynamic configuration reload                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                          │                                        │
│          ┌───────────────┼───────────────┐                       │
│          ▼               ▼               ▼                       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│  │  Mediator   │ │  Mediator   │ │   Client    │               │
│  │  Service A  │ │  Service B  │ │  Services   │               │
│  └─────────────┘ └─────────────┘ └─────────────┘               │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                  Error Handler                              │ │
│  │  - DLQ routing for permanent failures                      │ │
│  │  - Retry logic with exponential backoff                    │ │
│  │  - Circuit breaker for downstream services                 │ │
│  │  - Error classification & metrics                          │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                 Observability Layer                         │ │
│  │  - Pino structured logging                                 │ │
│  │  - OpenTelemetry tracing (Jaeger)                          │ │
│  │  - Prometheus metrics                                       │ │
│  │  - PII/PHI masking                                         │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Event Flow

```
┌─────────────┐         ┌─────────────┐
│   Health    │         │   Orders    │
│  Service    │         │  Service    │
└──────┬──────┘         └──────┬──────┘
       │                       │
       │ Publish               │ Publish
       │ CloudEvents           │ CloudEvents
       ▼                       ▼
┌──────────────────────────────────────┐
│         RabbitMQ Exchanges           │
│  - health.events (topic)             │
│  - orders.events (topic)             │
└──────┬───────────────────────┬───────┘
       │                       │
       │ Bind                  │ Bind
       ▼                       ▼
┌──────────────────────────────────────┐
│          RabbitMQ Queues             │
│  - interop.health.queue              │
│  - interop.orders.queue              │
│  - interop.dlq (Dead Letter Queue)   │
└──────┬───────────────────────────────┘
       │
       │ Consume
       ▼
┌──────────────────────────────────────┐
│      Interop Layer Consumer          │
│                                       │
│  1. Deserialize CloudEvent           │
│  2. Validate schema                  │
│  3. Extract correlation ID           │
│  4. Apply routing rules              │
│  5. Forward to destination           │
│  6. ACK/NACK message                 │
│  7. Log & trace                      │
└──────┬───────────────────────────────┘
       │
       │ Route based on:
       │ - event.type
       │ - event.source
       │ - event.subject
       │ - content rules
       │
       ▼
┌──────────────────────────────────────┐
│         Destination Services         │
│  - Mediator Services (OpenHIM)       │
│  - Client Services                   │
│  - Analytics Services                │
│  - Notification Services             │
└──────────────────────────────────────┘
```

### Routing Strategy

The Interop Layer uses a **multi-strategy routing approach** to determine the destination for each CloudEvent.

#### Routing Strategies

**1. Type-Based Routing (Primary Strategy)**
- Routes events based on `event.type` field
- Example: `health.patient.registered` → `mediator-fhir-service`
- Example: `order.approved` → `mediator-procurement-service`
- Supports wildcard patterns: `health.patient.*`, `order.*`
- Defined in routing configuration file

**2. Source-Based Routing**
- Routes events based on `event.source` field
- Example: `smile.health-service` → route to health mediators
- Example: `smile.orders-service` → route to order mediators
- Useful for service-level routing decisions

**3. Content-Based Routing**
- Routes events based on payload content
- Example: Orders with `priority: 'urgent'` → fast-track queue
- Example: Health events with `containsPHI: true` → secure mediator
- Requires payload inspection

**4. Hybrid Routing**
- Combines multiple strategies
- Example: Route by type + priority
- Example: Route by source + data classification

**5. Fallback/Default Routing**
- When no specific route matches
- Routes to a default mediator or client service
- Prevents message loss

#### Routing Configuration Structure

```yaml
routes:
  # Health Service Routes
  - name: "patient-registration-to-fhir"
    source: "smile.health-service"
    type: "health.patient.registered"
    strategy: "type"
    destination:
      type: "mediator"
      service: "fhir-mediator"
      endpoint: "http://localhost:3010/fhir/patient"
      transform: true
    priority: 5
    enabled: true

  - name: "health-events-to-openhim"
    source: "smile.health-service"
    type: "health.*"
    strategy: "type"
    destination:
      type: "openhim"
      channel: "health-events"
      endpoint: "http://localhost:5001/health"
    priority: 3
    enabled: true

  # Order Service Routes
  - name: "order-approved-to-procurement"
    source: "smile.orders-service"
    type: "order.approved"
    strategy: "type"
    destination:
      type: "mediator"
      service: "procurement-mediator"
      endpoint: "http://localhost:3011/procurement/order"
    priority: 7
    enabled: true

  - name: "urgent-orders-fast-track"
    source: "smile.orders-service"
    type: "order.*"
    strategy: "content"
    condition:
      field: "data.eventData.priority"
      operator: "equals"
      value: "urgent"
    destination:
      type: "queue"
      queue: "orders.urgent"
      exchange: "orders.fast-track"
    priority: 9
    enabled: true

  # Client Service Routes
  - name: "all-events-to-audit"
    source: "*"
    type: "*"
    strategy: "default"
    destination:
      type: "client"
      service: "audit-service"
      endpoint: "http://localhost:3006/audit"
    priority: 1
    enabled: true

  # Fallback Route
  - name: "fallback-route"
    source: "*"
    type: "*"
    strategy: "fallback"
    destination:
      type: "queue"
      queue: "interop.unrouted"
      exchange: "interop.fallback"
    priority: 0
    enabled: true
```

#### Routing Decision Algorithm

```
1. Receive CloudEvent from RabbitMQ queue
2. Extract routing metadata (type, source, subject, priority)
3. Load active routing rules from configuration
4. Sort routes by priority (highest first)
5. For each route (in priority order):
   a. Check if route.enabled = true
   b. Match route.source (wildcard support)
   c. Match route.type (wildcard support)
   d. If strategy = "content", evaluate condition
   e. If all conditions match:
      - Return matched route
      - Break loop
6. If no route matched:
   - Use fallback route
7. Execute route:
   a. Transform event if needed
   b. Send to destination
   c. Handle response
   d. ACK message on success
   e. NACK message on failure (retry or DLQ)
```

#### Route Priority Guidelines

- **Priority 9-10:** Critical/urgent events (STAT orders, critical lab results)
- **Priority 7-8:** High priority (approvals, shipments, alerts)
- **Priority 5-6:** Normal business events (create, update, workflow transitions)
- **Priority 3-4:** Low priority (notifications, audit logs)
- **Priority 1-2:** Background/async processing
- **Priority 0:** Fallback/default routes

---

## 📊 Quality Metrics

### Test Coverage
- **Target:** >80% code coverage
- **Current:** N/A (not implemented yet)

### Performance Targets
- **Event processing latency:** <100ms (p95)
- **Throughput:** >1000 events/second
- **Error rate:** <1%
- **DLQ rate:** <0.1%

### Observability Requirements
- **Logging:** All events logged with correlation IDs
- **Tracing:** 100% of events have OpenTelemetry spans
- **Metrics:** Event count, latency, errors, DLQ count
- **Security:** All PII/PHI masked in logs

---

## 🔧 Configuration Schema

### Environment Variables (.env)

```bash
# Service Configuration
NODE_ENV=development
INTEROP_LAYER_PORT=3002
LOG_LEVEL=info

# RabbitMQ Configuration
RABBITMQ_URL=amqp://admin:admin123@localhost:5672
RABBITMQ_PREFETCH_COUNT=10
RABBITMQ_RECONNECT_DELAY=5000
RABBITMQ_MAX_RECONNECT_ATTEMPTS=10

# Consumer Configuration
CONSUMER_HEALTH_QUEUE=interop.health.queue
CONSUMER_HEALTH_EXCHANGE=health.events
CONSUMER_HEALTH_ROUTING_KEY=health.#

CONSUMER_ORDERS_QUEUE=interop.orders.queue
CONSUMER_ORDERS_EXCHANGE=orders.events
CONSUMER_ORDERS_ROUTING_KEY=orders.#

# Dead Letter Queue Configuration
DLQ_QUEUE=interop.dlq
DLQ_EXCHANGE=interop.dlq.exchange
DLQ_ROUTING_KEY=dlq.#

# Retry Configuration
RETRY_MAX_ATTEMPTS=3
RETRY_INITIAL_DELAY=1000
RETRY_MAX_DELAY=30000
RETRY_BACKOFF_MULTIPLIER=2

# Circuit Breaker Configuration
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_TIMEOUT=60000
CIRCUIT_BREAKER_RESET_TIMEOUT=30000

# Routing Configuration
ROUTING_CONFIG_PATH=./config/routing.yml
ROUTING_RELOAD_INTERVAL=60000

# OpenTelemetry Configuration
OTEL_SERVICE_NAME=interop-layer
OTEL_EXPORTER_JAEGER_ENDPOINT=http://localhost:14268/api/traces
OTEL_TRACES_SAMPLER=always_on

# Health Check Configuration
HEALTH_CHECK_INTERVAL=30000
HEALTH_CHECK_TIMEOUT=5000
```

### Routing Configuration File (config/routing.yml)

```yaml
# Routing Configuration for Interop Layer
# Format: YAML

metadata:
  version: "1.0.0"
  lastUpdated: "2025-10-10T00:00:00Z"
  description: "Event routing configuration for SMILE Interop Layer"

settings:
  # Default behavior when no route matches
  fallbackBehavior: "route-to-fallback-queue"

  # Enable/disable routing rule validation on load
  validateOnLoad: true

  # Enable/disable dynamic route reloading
  dynamicReload: true
  reloadInterval: 60000 # milliseconds

  # Enable route metrics
  enableMetrics: true

routes:
  #
  # Health Service Routes
  #
  - name: "patient-events-to-fhir"
    description: "Route patient lifecycle events to FHIR mediator"
    enabled: true
    source: "smile.health-service"
    type: "health.patient.*"
    strategy: "type"
    priority: 6
    destination:
      type: "http"
      method: "POST"
      endpoint: "http://localhost:3010/fhir/patient"
      timeout: 5000
      headers:
        Content-Type: "application/json"
        X-Service: "interop-layer"
    transform:
      enabled: true
      type: "fhir-r4"
    retry:
      enabled: true
      maxAttempts: 3
      backoffMs: 1000

  - name: "vital-signs-to-analytics"
    description: "Route vital signs to analytics service"
    enabled: true
    source: "smile.health-service"
    type: "health.vitals.*"
    strategy: "type"
    priority: 5
    destination:
      type: "http"
      method: "POST"
      endpoint: "http://localhost:3007/analytics/vitals"
      timeout: 3000
    transform:
      enabled: false
    retry:
      enabled: true
      maxAttempts: 2

  - name: "critical-lab-results"
    description: "Route critical lab results with high priority"
    enabled: true
    source: "smile.health-service"
    type: "health.lab.result-critical"
    strategy: "type"
    priority: 10
    destination:
      type: "http"
      method: "POST"
      endpoint: "http://localhost:3008/alerts/critical-lab"
      timeout: 2000
    transform:
      enabled: false
    retry:
      enabled: true
      maxAttempts: 5
      backoffMs: 500

  #
  # Order Service Routes
  #
  - name: "order-lifecycle-events"
    description: "Route all order lifecycle events to procurement system"
    enabled: true
    source: "smile.orders-service"
    type: "order.*"
    strategy: "type"
    priority: 5
    destination:
      type: "http"
      method: "POST"
      endpoint: "http://localhost:3011/procurement/events"
      timeout: 5000
    transform:
      enabled: true
      type: "procurement-format"
    retry:
      enabled: true
      maxAttempts: 3

  - name: "urgent-orders-fast-track"
    description: "Fast-track urgent orders"
    enabled: true
    source: "smile.orders-service"
    type: "order.*"
    strategy: "content"
    priority: 9
    condition:
      field: "data.eventData.priority"
      operator: "equals"
      value: "urgent"
    destination:
      type: "queue"
      exchange: "orders.fast-track"
      queue: "orders.urgent"
      routingKey: "orders.urgent"
    transform:
      enabled: false
    retry:
      enabled: true
      maxAttempts: 5

  - name: "order-alerts-to-notification"
    description: "Route order alerts to notification service"
    enabled: true
    source: "smile.orders-service"
    type: "order.alerts.*"
    strategy: "type"
    priority: 8
    destination:
      type: "http"
      method: "POST"
      endpoint: "http://localhost:3009/notifications/send"
      timeout: 3000
    transform:
      enabled: true
      type: "notification-format"
    retry:
      enabled: true
      maxAttempts: 2

  #
  # Cross-Cutting Routes
  #
  - name: "all-events-to-audit"
    description: "Send all events to audit service for compliance"
    enabled: true
    source: "*"
    type: "*"
    strategy: "default"
    priority: 1
    destination:
      type: "http"
      method: "POST"
      endpoint: "http://localhost:3006/audit/log"
      timeout: 2000
    transform:
      enabled: false
    retry:
      enabled: false # Don't retry audit logging

  - name: "phi-events-to-secure-storage"
    description: "Route events containing PHI to secure storage"
    enabled: true
    source: "smile.health-service"
    type: "*"
    strategy: "content"
    priority: 7
    condition:
      field: "data.metadata.containsPHI"
      operator: "equals"
      value: true
    destination:
      type: "http"
      method: "POST"
      endpoint: "http://localhost:3012/secure-storage/phi"
      timeout: 5000
      headers:
        X-Security-Level: "high"
        X-Encryption-Required: "true"
    transform:
      enabled: true
      type: "phi-encryption"
    retry:
      enabled: true
      maxAttempts: 5

  #
  # Fallback Route
  #
  - name: "fallback-route"
    description: "Default route for unmatched events"
    enabled: true
    source: "*"
    type: "*"
    strategy: "fallback"
    priority: 0
    destination:
      type: "queue"
      exchange: "interop.fallback"
      queue: "interop.unrouted"
      routingKey: "unrouted.#"
    transform:
      enabled: false
    retry:
      enabled: false
```

### TypeScript Configuration Interfaces

```typescript
/**
 * Main configuration interface for Interop Layer
 */
export interface InteropLayerConfig {
  service: ServiceConfig;
  rabbitmq: RabbitMQConfig;
  consumer: ConsumerConfig;
  routing: RoutingConfig;
  retry: RetryConfig;
  circuitBreaker: CircuitBreakerConfig;
  observability: ObservabilityConfig;
}

/**
 * Service-level configuration
 */
export interface ServiceConfig {
  name: string;
  version: string;
  port: number;
  environment: 'development' | 'production' | 'test';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * RabbitMQ connection configuration
 */
export interface RabbitMQConfig {
  url: string;
  prefetchCount: number;
  reconnectDelay: number;
  maxReconnectAttempts: number;
  heartbeat: number;
  socketOptions?: {
    timeout?: number;
    keepAlive?: boolean;
  };
}

/**
 * Consumer configuration for multiple queues
 */
export interface ConsumerConfig {
  consumers: QueueConsumerConfig[];
  dlq: DLQConfig;
}

export interface QueueConsumerConfig {
  name: string;
  queue: string;
  exchange: string;
  exchangeType: 'topic' | 'direct' | 'fanout';
  routingKey: string;
  enabled: boolean;
  prefetch?: number;
  options?: {
    durable?: boolean;
    autoDelete?: boolean;
    exclusive?: boolean;
  };
}

/**
 * Dead Letter Queue configuration
 */
export interface DLQConfig {
  queue: string;
  exchange: string;
  routingKey: string;
  ttl?: number; // Message TTL in DLQ
  maxLength?: number; // Max messages in DLQ
}

/**
 * Routing configuration loaded from YAML
 */
export interface RoutingConfig {
  metadata: RoutingMetadata;
  settings: RoutingSettings;
  routes: RouteDefinition[];
}

export interface RoutingMetadata {
  version: string;
  lastUpdated: string;
  description: string;
}

export interface RoutingSettings {
  fallbackBehavior: 'route-to-fallback-queue' | 'drop' | 'error';
  validateOnLoad: boolean;
  dynamicReload: boolean;
  reloadInterval: number;
  enableMetrics: boolean;
}

export interface RouteDefinition {
  name: string;
  description?: string;
  enabled: boolean;
  source: string; // Wildcard support: "smile.health-service", "*"
  type: string; // Wildcard support: "health.patient.*", "*"
  strategy: 'type' | 'source' | 'content' | 'hybrid' | 'default' | 'fallback';
  priority: number; // 0-10
  condition?: RouteCondition; // For content-based routing
  destination: RouteDestination;
  transform?: TransformConfig;
  retry?: RouteRetryConfig;
}

export interface RouteCondition {
  field: string; // JSONPath expression
  operator: 'equals' | 'notEquals' | 'contains' | 'greaterThan' | 'lessThan' | 'regex';
  value: any;
}

export interface RouteDestination {
  type: 'http' | 'queue' | 'topic' | 'openhim' | 'webhook';
  // For HTTP destinations
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  endpoint?: string;
  timeout?: number;
  headers?: Record<string, string>;
  // For queue destinations
  exchange?: string;
  queue?: string;
  routingKey?: string;
}

export interface TransformConfig {
  enabled: boolean;
  type?: string; // 'fhir-r4', 'hl7-v2', 'custom'
  config?: Record<string, any>;
}

export interface RouteRetryConfig {
  enabled: boolean;
  maxAttempts?: number;
  backoffMs?: number;
}

/**
 * Retry strategy configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: string[]; // Error codes/types to retry
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  threshold: number; // Number of failures before opening
  timeout: number; // Time in open state before attempting reset
  resetTimeout: number; // Time to wait before closing circuit
  monitoringPeriod: number; // Period to track failures
}

/**
 * Observability configuration
 */
export interface ObservabilityConfig {
  logging: {
    enabled: boolean;
    level: string;
    masking: {
      enabled: boolean;
      fields: string[]; // Fields to mask in logs
    };
  };
  tracing: {
    enabled: boolean;
    serviceName: string;
    endpoint: string;
    sampler: 'always_on' | 'always_off' | 'trace_id_ratio';
    sampleRate?: number;
  };
  metrics: {
    enabled: boolean;
    port: number;
    path: string;
  };
}
```

---

## 🚨 Known Issues & Blockers

_None at this time_

---

## 📝 Notes & Decisions

### 2025-10-10 - Task 1 & Task 2 Completed

#### Task 1: Review Completed
- Reviewed existing structure
- Basic EventConsumer exists in @smile/cloud-events but needs enhancement for production use
- Decision: Extend existing EventConsumer vs. create new one in interop-layer
  - **Decision:** Create enhanced consumer in interop-layer that uses @smile/cloud-events as a base
  - **Rationale:** Allows service-specific customization without affecting other services

#### Task 2: Architecture & Routing Strategy Defined
- **Architecture Decisions:**
  1. **Multi-Component Architecture:**
     - Connection Manager: Handles RabbitMQ connections with pooling and retry
     - Event Consumer: Subscribes to multiple queues and deserializes CloudEvents
     - Message Handler: Validates, enriches, and tracks correlation IDs
     - Event Router: Determines destination using multiple strategies
     - Error Handler: DLQ routing, retry logic, circuit breaker
     - Observability Layer: Logging, tracing, metrics with PII/PHI masking

  2. **Routing Strategy:**
     - Primary: Type-based routing (matches event.type with wildcard support)
     - Secondary: Source-based routing (matches event.source)
     - Advanced: Content-based routing (evaluates payload conditions)
     - Hybrid: Combines multiple strategies
     - Fallback: Default route for unmatched events
     - **Priority-based route selection:** Routes sorted by priority (0-10), highest first

  3. **Configuration Approach:**
     - Environment variables for connection and system config
     - YAML file for routing rules (supports hot-reload)
     - TypeScript interfaces for type safety
     - Separation of concerns: system config vs. business routing rules

  4. **Queue Strategy:**
     - Two dedicated consumer queues: `interop.health.queue`, `interop.orders.queue`
     - One DLQ: `interop.dlq` for failed messages
     - Fallback queue: `interop.unrouted` for unmatched events
     - Binding pattern: `health.#` and `orders.#` (all events from each exchange)

  5. **Error Handling Strategy:**
     - Retry with exponential backoff (configurable attempts and delays)
     - Circuit breaker for downstream service protection
     - DLQ for permanent failures or exhausted retries
     - Error classification: retryable vs. non-retryable

  6. **Observability Strategy:**
     - Structured logging with Pino
     - OpenTelemetry tracing for full event lifecycle
     - Correlation ID propagation across all components
     - PII/PHI masking in all logs
     - Prometheus metrics for monitoring

  7. **Security & Compliance:**
     - PHI detection based on event metadata (`containsPHI` flag)
     - Automatic routing of PHI events to secure storage
     - Field-level masking in logs
     - Audit trail for all event processing

---

## 📚 References

- [CloudEvents Spec](https://github.com/cloudevents/spec)
- [RabbitMQ Documentation](https://www.rabbitmq.com/documentation.html)
- [OpenTelemetry Node.js](https://opentelemetry.io/docs/instrumentation/js/)
- [HIPAA Compliance Guidelines](https://www.hhs.gov/hipaa/index.html)
- Project CLAUDE.md: `D:\work\smile-5-0\poc\interop-layer\claude-cli\smile-interop-poc\CLAUDE.md`

---

**Last Updated:** 2025-10-10 (Task 2 completed - Architecture and routing strategy defined)
**Updated By:** Claude Code
