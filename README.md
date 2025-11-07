# SMILE Health Interoperability Layer POC

A proof-of-concept implementation of an **event-driven multi-mediator orchestration system** for health domain applications, demonstrating OpenHIM's capability to route single CloudEvents to multiple transformation mediators with domain-specific data formats.

Built with Node.js, TypeScript, Express.js, OpenHIM, and RabbitMQ.

## 🏗️ Architecture Overview

This POC implements a comprehensive, event-driven architecture showcasing OpenHIM's multi-directional capabilities:

### UPSTREAM (Existing - Orders Service Emits Events)
```
Health/Orders Service → RabbitMQ (CloudEvent) → Interop Layer
                                                      ↓
                                            OpenHIM Core Channel (/transform)
                                                      ↓
                ┌─────────────────────────────────────┼─────────────────────────────────────┐
                ↓                                      ↓                                      ↓
        Warehouse Mediator              Finance Mediator                      Audit Mediator
        (Port 3301)                     (Port 3302)                           (Port 3303)
                ↓                                      ↓                                      ↓
        Warehouse Client                Finance Client                      Audit Client
        (Port 3203)                     (Port 3202)                          (Port 3201)
        Custom JSON Format             Pricing/Tax Data                      Audit Trail + Auth
```

### DOWNSTREAM (New - External Systems Submit Requests)
```
Pharmacy Client ──┐
(Port 4201)       ├──→ OpenHIM (/orders-inbound) ──→ Adapter Mediator (Port 3204)
                  │    (Port 5001)                        ↓
Billing Client ───┘                            Orders Service (Port 3005)
(Port 4202)                                       ↓
                                          Order Created/Updated
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+
- Docker & Docker Compose
- WSL (for Windows users)

### Setup & Start

```bash
# Install dependencies
pnpm install

# Start all Docker services (infrastructure + mediators + clients)
docker-compose up -d

# Check service health
docker-compose ps
```

## 🌐 Access Points

### SMILE Services

**Health Service** (HIPAA-compliant Patient Registration)

- **Port**: 3004
- **Swagger**: http://localhost:3004/api/docs
- **Health**: http://localhost:3004/health

**Orders Service** (Order Lifecycle Management - CloudEvent Emitter)

- **Port**: 3005
- **Swagger**: http://localhost:3005/api/docs
- **Health**: http://localhost:3005/health
- **Sample Request**: `sample-order-request.json`

### Multi-Mediator Orchestration

**Transformation Mediators:**

- **Warehouse Mediator** (Port 3301): Custom JSON transformation for warehouse systems
- **Finance Mediator** (Port 3302): Pricing/tax calculation transformations
- **Audit Mediator** (Port 3303): Audit trail with Basic Auth credential handling
- **Custom Mediator** (Port 3205): Alternative warehouse transformation approach

**Upstream Mock Client Services** (with Swagger UI):

- **Warehouse Client** (Port 3203): http://localhost:3203/api-docs/ - Receives warehouse-specific format
- **Finance Client** (Port 3202): http://localhost:3202/api-docs/ - Receives finance details with pricing
- **Audit Client** (Port 3201): http://localhost:3201/api-docs/ - Receives audit trail (requires `audit-user:audit-secure-pass` Basic Auth)

**Downstream External Client Services** (New - with Swagger UI):

- **Pharmacy Client** (Port 4201): http://localhost:4201/api-docs - Submit orders in pharmacy format
- **Billing Client** (Port 4202): http://localhost:4202/api-docs - Submit billing information
- **Adapter Mediator** (Port 3204): http://localhost:3204/health - Transforms downstream requests to Orders Service format

**OpenHIM Routing (UPSTREAM):**

- Orders service emits CloudEvent to RabbitMQ
- Interop Layer routes event to OpenHIM `/transform` channel
- OpenHIM simultaneously routes to all three mediators (primary + secondary)
- Each mediator transforms data per client requirements
- Clients receive domain-specific transformed data

**OpenHIM Routing (DOWNSTREAM - NEW):**

- Pharmacy/Billing external clients POST to OpenHIM `/orders-inbound` channel
- OpenHIM authenticates clients and routes to Adapter Mediator
- Adapter Mediator transforms pharmacy/billing format to Orders Service format
- Orders Service creates/updates orders
- Response transformed back to client format and returned

### FHIR Services

**Hapi FHIR Server** (FHIR-compliant Resource Management) **[NEW]**

- **Port**: 8888
- **FHIR API Base**: http://localhost:8888/fhir/
- **Web UI**: http://localhost:8888/
- **Patient Resources**: http://localhost:8888/fhir/Patient
- **Health Check**: curl -X GET http://localhost:8888/fhir/Patient

### Infrastructure Services

- **RabbitMQ Management**: http://localhost:15672 (admin/admin123)
- **OpenHIM Console**: http://localhost:9000
- **OpenHIM Core API**: https://127.0.0.1:8080
- **Hapi FHIR Server**: http://localhost:8888/fhir/ **[NEW]**
- **Jaeger Tracing**: http://localhost:16686
- **Grafana**: http://localhost:3001 (admin/admin123)
- **Prometheus**: http://localhost:9090
- **Redis**: localhost:6379
- **MongoDB**: localhost:27017

## 📋 Testing the System

### Testing Downstream Integration (NEW)

#### 1. Submit a Pharmacy Order

**Using Swagger UI**: http://localhost:4201/api-docs

Or via curl:
```bash
curl -X POST http://localhost:4201/orders \
  -H "Content-Type: application/json" \
  -d '{
    "pharmacy_order_id": "PHARM-2025-001",
    "action": "create_order",
    "items": ["Aspirin 500mg", "Ibuprofen 200mg"],
    "facility": "Central Hospital",
    "requested_by": "Dr. Smith"
  }'
```

**Expected Flow**:
- Pharmacy client forwards to OpenHIM with pharmacy-system credentials
- OpenHIM routes to Adapter Mediator
- Adapter Mediator transforms pharmacy format to Orders Service format
- Order created in Orders Service
- Response returns to pharmacy client

**Success Response**:
```json
{
  "message": "Pharmacy order submitted successfully",
  "pharmacy_order_id": "PHARM-2025-001",
  "orders_service_id": "766636e6-fa01-4d20-8762-84bdbfa305e3",
  "status": "submitted",
  "openHIMResponse": {
    "status": 200,
    "message": "Order forwarded to OpenHIM successfully"
  }
}
```

#### 2. Submit Billing Information

**Using Swagger UI**: http://localhost:4202/api-docs

Or via curl:
```bash
curl -X POST http://localhost:4202/orders \
  -H "Content-Type: application/json" \
  -d '{
    "action": "update_billing",
    "order_id": "766636e6-fa01-4d20-8762-84bdbfa305e3",
    "cost": 2500.50,
    "currency": "USD",
    "invoice_number": "INV-2025-001",
    "payment_status": "pending"
  }'
```

**Success Response**:
```json
{
  "message": "Billing information submitted successfully",
  "order_id": "766636e6-fa01-4d20-8762-84bdbfa305e3",
  "billing_status": "recorded",
  "invoice_number": "INV-2025-001",
  "openHIMResponse": {
    "status": 200,
    "message": "Billing information forwarded to OpenHIM successfully"
  }
}
```

---

### Testing Hapi FHIR Server (NEW)

#### 1. Query All Patient Resources

```bash
curl -X GET "http://localhost:8888/fhir/Patient" \
  -H "Accept: application/fhir+json"
```

**Expected Response**:
```json
{
  "resourceType": "Bundle",
  "id": "ec14aa0d-544e-4f25-8d38-7b25109a48c5",
  "meta": {
    "lastUpdated": "2025-11-07T15:44:52.122+00:00"
  },
  "type": "searchset",
  "total": 0,
  "link": [
    {
      "relation": "self",
      "url": "http://hapi-fhir:8080/fhir/Patient"
    }
  ]
}
```

#### 2. Create a New FHIR Patient Resource

```bash
curl -X POST "http://localhost:8888/fhir/Patient" \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Patient",
    "name": [
      {
        "given": ["John"],
        "family": "Doe"
      }
    ],
    "gender": "male",
    "birthDate": "1980-01-01",
    "identifier": [
      {
        "system": "http://example.com/mrn",
        "value": "MRN123"
      }
    ],
    "contact": [
      {
        "system": "phone",
        "value": "555-1234"
      }
    ]
  }'
```

#### 3. Query Other FHIR Resources

```bash
# Get all Observations
curl -X GET "http://localhost:8888/fhir/Observation" \
  -H "Accept: application/fhir+json"

# Get all Medications
curl -X GET "http://localhost:8888/fhir/Medication" \
  -H "Accept: application/fhir+json"

# Get all Service Requests
curl -X GET "http://localhost:8888/fhir/ServiceRequest" \
  -H "Accept: application/fhir+json"
```

#### 4. Get Server Capabilities

```bash
curl -X GET "http://localhost:8888/fhir/metadata" \
  -H "Accept: application/fhir+json" | jq .
```

#### 5. Access Hapi FHIR Web UI

Open browser: **http://localhost:8888/**

This provides a visual interface to:
- Browse and search FHIR resources
- Create and edit resources
- View server statistics
- Test FHIR API calls

---

### Testing the Multi-Mediator System (Upstream)

### 1. Create an Order (Generates CloudEvent)

```bash
curl -X POST http://localhost:3005/api/v1/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mock-jwt-token" \
  -d @sample-order-request.json
```

This will automatically:

- Create an order in the orders-service
- Emit a CloudEvent to RabbitMQ
- Trigger the Interop Layer
- Route through OpenHIM to all three mediators
- Transform and deliver data to all three clients

### 2. Verify Data in Mock Clients

**Warehouse Client:**

```bash
curl -s http://localhost:3203/orders | jq .
```

Response includes: Custom warehouse JSON format, external order references, delivery info

**Finance Client:**

```bash
curl -s http://localhost:3202/orders | jq .
```

Response includes: Items, subtotal, tax (8%), total, payment status, currency

**Audit Client** (with Basic Auth):

```bash
curl -s http://localhost:3201/orders \
  -H "Authorization: Basic YXVkaXQtdXNlcjphdWRpdC1zZWN1cmUtcGFzcw==" | jq .
```

Response includes: Status history, compliance requirements, data classification, audit trail, retention period (7 years)

### 3. Access Swagger UIs for Testing

- Warehouse: http://localhost:3203/api-docs/
- Finance: http://localhost:3202/api-docs/
- Audit: http://localhost:3201/api-docs/ (login with audit-user:audit-secure-pass)

Each Swagger UI shows:

- All received orders/audit trails with timestamps
- Complete request/response details
- Authenticated user information
- Custom transformation data

## 🔧 Key Features

### Multi-Mediator Orchestration

- Single CloudEvent routed to multiple transformation mediators simultaneously
- Each mediator produces domain-specific output format
- Primary mediator + 3 secondary mediators (async execution)
- No waiting for secondary responses

### Transformation Capabilities

- **Warehouse**: Custom JSON with inventory references
- **Finance**: Pricing calculations with 8% tax, payment metadata
- **Audit**: Compliance data, status history, 7-year retention policy
- **Custom**: Alternative warehouse transformation rules

### Authentication & Credential Handling

- Basic Auth credentials configured in OpenHIM route properties
- Mediators extract and forward credentials to clients
- Mock clients validate and log authenticated user information
- Full audit trail of authenticated access

### Dynamic Swagger UI

- Service names configurable via `SERVICE_NAME` environment variable
- Reusable mock client Dockerfile for multiple services
- Automatic Swagger title generation per client
- All endpoints documented and testable

## 📦 Monorepo Structure

```
smile-interop-poc/
├── apps/
│   ├── health-service/              # HIPAA-compliant patient registration
│   ├── orders-service/              # Order lifecycle (CloudEvent emitter)
│   ├── interop-layer/               # RabbitMQ listener → OpenHIM router
│   ├── mediator-services/           # OpenHIM mediators
│   │   ├── transformation-mediator/        # Primary transformation (3101)
│   │   ├── adapter-mediator/               # Downstream transformer (3204) ⭐ NEW
│   │   ├── warehouse-transformation-mediator/  # Warehouse format (3301)
│   │   ├── finance-transformation-mediator/    # Finance format (3302)
│   │   ├── audit-transformation-mediator/      # Audit trail (3303)
│   │   ├── custom-transformation-mediator/     # Custom warehouse (3205)
│   │   └── passthrough-mediator/               # Pass-through (3100)
│   └── webhook-services/            # Mock clients
│       ├── mock-client-warehouse/       # Warehouse client (3203)
│       ├── mock-client-pharmacy/        # Pharmacy client (4201) ⭐ NEW
│       ├── mock-client-billing/         # Billing client (4202) ⭐ NEW
│       ├── mock-client-audit/           # Audit client (3201) with Basic Auth
│       └── (mock-client-fhir/hl7 disabled - port conflicts)
├── packages/
│   ├── common/                  # Shared utilities
│   ├── cloud-events/            # CloudEvents SDK wrapper
│   └── mediator-common/         # Mediator shared code
├── docker/
│   ├── docker-compose.yml       # Complete stack orchestration
│   └── openhim/                 # OpenHIM configuration
├── CLAUDE.md                    # Project development guidelines
├── POC_ENHANCEMENT_PLAN.md      # Enhancement roadmap (Downstream + Orchestration)
├── interop-poc-plan-gpt.prompt.md # Original architecture plan
└── README.md                    # This file
```

## 🏥 Implemented Services

### Orders Service (Complete ✅)

**Order Lifecycle Management with CloudEvent Emission**

- **Port**: 3005
- **Swagger**: http://localhost:3005/api/docs

**Order States:**

```
DRAFT → SUBMITTED → APPROVED → PACKED → SHIPPED → RECEIVED → FULFILLED
  ↑                  ↓                              ↓
  ← ← ← ← ← ← ← ← REJECTED                      RETURNED → RETURN_COMPLETE
```

**Sample Request:**

```bash
curl -X POST http://localhost:3005/api/v1/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mock-jwt-token" \
  -d '{
    "items": [...],
    "facilityId": "facility-001",
    "departmentId": "purchasing",
    "priority": "normal"
  }'
```

### Health Service (Complete ✅)

**HIPAA-Compliant Patient Registration**

- **Port**: 3004
- **Swagger**: http://localhost:3004/api/docs
- **Features**: PII masking, HIPAA audit logging, CloudEvents emission

## 🐳 Docker Deployment

### Complete Stack

```bash
# Start entire system
docker-compose up -d

# Check all services
docker-compose ps

# View logs
docker-compose logs -f [service-name]

# Stop everything
docker-compose down
```

### Services Running in Docker

**Application Layer:**

- health-service (3004)
- orders-service (3005)
- interop-layer (3002)

**Mediators:**

- transformation-mediator (3101)
- adapter-mediator (3204) ⭐ NEW - Transforms downstream requests
- warehouse-transformation-mediator (3301)
- finance-transformation-mediator (3302)
- audit-transformation-mediator (3303)
- custom-transformation-mediator (3205)
- passthrough-mediator (3100)

**Mock Clients (Upstream):**

- mock-client-warehouse (3203)
- mock-client-finance (3202)
- mock-client-audit (3201)

**Mock Clients (Downstream - NEW):**

- mock-client-pharmacy (4201) ⭐ NEW
- mock-client-billing (4202) ⭐ NEW

**Infrastructure:**

- RabbitMQ (5672, 15672)
- MongoDB (27017)
- OpenHIM Core (5000, 5001, 8080)
- OpenHIM Console (9000)
- Hapi FHIR Server (8888) ⭐ NEW - FHIR-compliant resource management
- Jaeger (16686)
- Prometheus (9090)
- Grafana (3001)
- Redis (6379)

## 🔧 Configuration

### Environment Variables

Key configurations in `docker-compose.yml`:

**Mediators:**

```yaml
# Warehouse Mediator
PORT: 3301
CLIENT_ENDPOINT: http://mock-client-warehouse:3203/orders
CLIENT_NAME: Warehouse Fulfillment

# Finance Mediator
PORT: 3302
CLIENT_ENDPOINT: http://mock-client-finance:3202/orders
CLIENT_NAME: Finance Accounting

# Audit Mediator (with credentials)
PORT: 3303
CLIENT_ENDPOINT: http://mock-client-audit:3201/orders
AUDIT_CLIENT_USERNAME: "audit-user"
AUDIT_CLIENT_PASSWORD: "audit-secure-pass"
```

**Mock Clients:**

```yaml
# Service names (configurable)
SERVICE_NAME: Warehouse  # For warehouse client
SERVICE_NAME: Finance    # For finance client
```

## 🧩 Event Flow

1. **Order Creation**: Orders service creates order (CloudEvent emitted)
2. **Message Broker**: CloudEvent published to RabbitMQ
3. **Routing**: Interop Layer consumes and routes to OpenHIM
4. **Orchestration**: OpenHIM routes to all configured mediators
5. **Transformation**:
   - Warehouse Mediator → Custom JSON format
   - Finance Mediator → Pricing/tax calculations
   - Audit Mediator → Audit trail with compliance data
6. **Delivery**: All clients receive their domain-specific transformed data

## 📊 Verification Points

### Mediator Health

```bash
# All mediators expose /health endpoint
curl http://localhost:3301/health    # Warehouse
curl http://localhost:3302/health    # Finance
curl http://localhost:3303/health    # Audit
```

### Client Verification

```bash
# Warehouse client
curl http://localhost:3203/orders | jq '.totalOrders'

# Finance client
curl http://localhost:3202/orders | jq '.totalOrders'

# Audit client (with auth)
curl -H "Authorization: Basic $(echo -n 'audit-user:audit-secure-pass' | base64)" \
  http://localhost:3201/orders | jq '.totalAuditTrails'
```

## 🧪 Testing Strategy

- **Unit Tests**: Jest for individual functions
- **Integration Tests**: Supertest for API endpoints
- **Manual Testing**: Swagger UIs for all clients
- **Docker Testing**: All services fully functional in Docker

## 🛠️ Troubleshooting

### Port Conflicts

```bash
# List running services
docker-compose ps

# Check specific port
lsof -i :3301  # Example: check port 3301
```

### Service Health Issues

```bash
# View service logs
docker-compose logs -f [service-name]

# Check OpenHIM configuration
# Access: http://localhost:9000 (OpenHIM Console)
```

### Build Failures

```bash
# Clean and rebuild
docker-compose down
docker-compose up -d --build
```

## 🚀 Current Implementation Status

### Upstream Integration (Complete ✅)
✅ **Multi-Mediator Orchestration**: Single event routed to 5 mediators simultaneously
✅ **Transformation Mediators**: Warehouse, Finance, Audit with domain-specific formats
✅ **Credential Handling**: Basic Auth integrated with OpenHIM route configuration
✅ **Mock Clients**: Swagger UI endpoints with request logging
✅ **Event-Driven Architecture**: CloudEvents via RabbitMQ
✅ **OpenHIM Integration**: Full primary + secondary route support
✅ **Docker Deployment**: Complete stack in docker-compose

### Downstream Integration (Complete ✅ - NEW)
✅ **Pharmacy Client**: Submits orders in pharmacy format (Port 4201)
✅ **Billing Client**: Submits billing information (Port 4202)
✅ **Adapter Mediator**: Transforms downstream requests to Orders Service format (Port 3204)
✅ **OpenHIM Inbound Channel**: `/orders-inbound` channel with client authentication
✅ **Data Transformation**: Pharmacy and Billing formats → Orders Service schema
✅ **Swagger Documentation**: Complete API docs for both downstream clients
✅ **End-to-End Testing**: Full flow verified with multiple test cases

### FHIR Server Integration (Complete ✅ - NEW)
✅ **Hapi FHIR Server**: FHIR R4-compliant resource management (Port 8888)
✅ **FHIR Resources**: Full CRUD operations on Patient, Observation, Medication, ServiceRequest
✅ **Default Database**: H2 in-memory database for development
✅ **CORS Enabled**: Cross-service communication enabled
✅ **Web UI**: Interactive web interface for resource management
✅ **REST API**: Complete FHIR-compliant REST API accessible at http://localhost:8888/fhir/

### Orchestration Mediator (Pending 🔄)
⏳ **Orchestration Mediator**: Multi-step workflow coordination (Port 3206)
⏳ **Complex Workflows**: Parallel calls to Warehouse, Finance, Audit, and Orders services
⏳ **Error Handling**: Partial success and fallback mechanisms
⏳ **Response Aggregation**: Combined response from multiple services

## 📖 Documentation

- **interop-poc-plan-gpt.prompt.md**: Original architecture planning document

## 🤝 Contributing

1. Follow TDD approach - write tests first
2. Use conventional commit messages
3. Run quality checks before committing: `make full-check`
4. Update README when adding new mediators or clients
5. Keep service names generic (use SERVICE_NAME env variable)

## 📄 License

MIT - See LICENSE file for details
