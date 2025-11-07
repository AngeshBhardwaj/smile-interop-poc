# Technical Reference - SMILE Interop POC

**Last Updated**: 2025-11-07 (Hapi FHIR Integration Added)

---

## 🏗️ System Architecture at a Glance

### Services & Ports
```
CORE SERVICES:
- Orders Service: 3005 (API: POST /api/v1/orders, PUT /api/v1/orders/:id)
- Health Service: 3004
- Interop Layer: 3002 (RabbitMQ listener)

UPSTREAM MEDIATORS:
- Transformation Mediator: 3101 (Primary)
- Warehouse Mediator: 3301
- Finance Mediator: 3302
- Audit Mediator: 3303

DOWNSTREAM MEDIATORS:
- Adapter Mediator: 3204 (NEW - Transform pharmacy/billing → Orders format)
- Orchestration Mediator: 3206 (PENDING - Multi-step workflows)

EXTERNAL CLIENTS:
- Warehouse Client: 3203
- Finance Client: 3202
- Audit Client: 3201
- Pharmacy Client: 4201 (NEW - Sends pharmacy format)
- Billing Client: 4202 (NEW - Sends billing format)

INFRASTRUCTURE:
- OpenHIM Core: 5001 (HTTP), 8080 (API), 9000 (Console)
- RabbitMQ: 5672 (AMQP), 15672 (UI)
- MongoDB: 27017
- Hapi FHIR Server: 8888 (FHIR API) **[NEW]**
- Redis: 6379
- Jaeger: 16686 (Tracing UI)
- Prometheus: 9090
- Grafana: 3001
```

---

## 🔀 Data Flow Diagrams

### UPSTREAM (Orders → Multiple Clients)
```
Orders Service (3005)
   ↓ CloudEvent to RabbitMQ
Interop Layer (3002)
   ↓ Routes to OpenHIM /transform
OpenHIM (5001)
   ├─ Warehouse Mediator (3301) → Warehouse Client (3203)
   ├─ Finance Mediator (3302) → Finance Client (3202)
   └─ Audit Mediator (3303) → Audit Client (3201)
```

### DOWNSTREAM (External Clients → Orders Service)
```
Pharmacy Client (4201)
   ↓ POST /orders (pharmacy format)
OpenHIM /orders-inbound (5001)
   ├─ Auth: pharmacy-system:password
   ↓ Routes to
Adapter Mediator (3204)
   ├─ Transform pharmacy → Orders Service format
   ↓
Orders Service (3005)
   └─ POST /api/v1/orders

Billing Client (4202)
   ↓ POST /orders (billing format)
OpenHIM /orders-inbound (5001)
   ├─ Auth: billing-system:password
   ↓ Routes to
Adapter Mediator (3204)
   ├─ Transform billing → Orders Service format
   ↓
Orders Service (3005)
   └─ PUT /api/v1/orders/:id
```

### ORCHESTRATION (To Be Implemented)
```
Client Request
   ↓
OpenHIM /orders-orchestrated (5001)
   ↓
Orchestration Mediator (3206)
   ├─ Call Warehouse (3301) for inventory
   ├─ Call Finance (3302) for pricing
   ├─ Call Audit (3303) for compliance
   ├─ Call Orders (3005) for creation
   ↓ Aggregate All Responses
   ↓
Return Combined Response
```

---

## 🔄 Data Transformation Reference

### PHARMACY REQUEST TRANSFORMATION
**Source Format** (from Pharmacy Client):
```json
{
  "pharmacy_order_id": "PHARM-XXX",
  "action": "create_order",
  "items": ["Item1", "Item2"] OR [{"medicineId": "M1", "name": "Item1", "quantity": 10}],
  "facility": "Hospital Name",
  "requested_by": "Dr. Name",
  "priority": "normal",  // optional
  "requiredDate": "ISO-8601",  // optional
  "deliveryAddress": {}  // optional
}
```

**Target Format** (for Orders Service):
```json
{
  "orderType": "medicine",
  "items": [
    {
      "medicineId": "MED-1",
      "name": "Item1",
      "category": "medicine-supplies",
      "unitOfMeasure": "units",
      "quantityOrdered": 1
    }
  ],
  "facilityId": "Hospital Name",
  "departmentId": "pharmacy",
  "requestedBy": "Dr. Name",
  "priority": "normal",
  "requiredDate": "2025-10-31T...",
  "deliveryAddress": {
    "street": "Main Street",
    "city": "Hospital Name",
    "state": "ST",
    "zipCode": "12345",
    "country": "Country"
  },
  "metadata": {
    "source": "pharmacy-system",
    "sourceOrderId": "PHARM-XXX",
    "transformedAt": "ISO-8601"
  }
}
```

**Transformation Logic** (transform.routes.ts:43-85):
- Extract items array
- Handle both string items (`"Item1"`) and object items (`{name: "Item1"}`)
- Map pharmacy fields to Orders Service fields
- Generate defaults for missing fields
- Include metadata for tracking

---

### BILLING REQUEST TRANSFORMATION
**Source Format** (from Billing Client):
```json
{
  "action": "update_billing",
  "order_id": "ORD-XXX",
  "cost": 2500.50,
  "currency": "USD",
  "invoice_number": "INV-XXX",
  "payment_status": "pending|partial|paid|overdue|cancelled"
}
```

**Target Format** (for Orders Service):
```json
{
  "orderId": "ORD-XXX",  // Critical for routing
  "financials": {
    "totalAmount": 2500.50,
    "currency": "USD",
    "paymentTerms": "pending",
    "budgetCode": "INV-XXX"
  },
  "metadata": {
    "source": "billing-system",
    "sourceInvoiceNumber": "INV-XXX",
    "paymentStatus": "pending",
    "action": "update_billing",
    "transformedAt": "ISO-8601"
  }
}
```

**HTTP Method**: PUT (because orderId is present)
**Endpoint**: `/api/v1/orders/ORD-XXX`

**Transformation Logic** (transform.routes.ts:90-106):
- Extract orderId → Used for PUT endpoint routing
- Map billing fields to financials schema
- Include payment status in metadata
- No default values needed (all fields required)

---

## 🔑 Authentication & Credentials

### OpenHIM Client Authentication
```
Pharmacy Client:
  Username: pharmacy-system
  Password: password
  Header: Authorization: Basic <base64(pharmacy-system:password)>

Billing Client:
  Username: billing-system
  Password: password
  Header: Authorization: Basic <base64(billing-system:password)>
```

### Orders Service Authentication
```
All requests use JWT Bearer token:
  Header: Authorization: Bearer mock-jwt-token
```

### Orders Service PUT Endpoint
```
PUT /api/v1/orders/:orderId
Header: Authorization: Bearer mock-jwt-token
Header: Content-Type: application/json
Body: {
  "financials": { ... },
  "metadata": { ... }
}
```

---

## 📡 API Endpoints Reference

### Pharmacy Client (Port 4201)
```
POST /orders
  - Submit pharmacy order
  - Body: pharmacy format JSON
  - Response: Order created with OpenHIM response

GET /orders
  - Get all submitted orders

GET /orders/latest
  - Get most recent order

DELETE /orders
  - Clear all orders (testing)

GET /health
  - Health check
```

### Billing Client (Port 4202)
```
POST /orders
  - Submit billing information
  - Body: billing format JSON
  - Response: Order updated with OpenHIM response

GET /orders
  - Get all submitted billing records

GET /orders/latest
  - Get most recent record

DELETE /orders
  - Clear all records (testing)

GET /health
  - Health check
```

### Adapter Mediator (Port 3204)
```
POST /transform-downstream
  - OpenHIM calls this endpoint
  - Expects: pharmacy or billing format
  - Returns: OpenHIM-compatible response

GET /health
  - Health check
```

### Orders Service (Port 3005)
```
POST /api/v1/orders
  - Create new order
  - Body: Orders Service format
  - Returns: Created order with orderId

PUT /api/v1/orders/:id
  - Update existing order
  - Body: Partial update (financials, items, etc.)
  - Returns: Updated order

GET /api/v1/orders/:id
  - Get order details
```

### Hapi FHIR Server (Port 8888) **[NEW]**
```
GET /fhir/Patient
  - Get all patient resources
  - Response: FHIR Bundle with patient resources
  - Format: application/fhir+json

POST /fhir/Patient
  - Create new FHIR Patient resource
  - Body: FHIR Patient resource JSON
  - Returns: Created patient resource

GET /fhir/Patient/:id
  - Get specific patient by FHIR ID
  - Response: Patient resource in FHIR format

GET /fhir/Observation
  - Get all observation resources
  - Response: FHIR Bundle with observations

GET /fhir/Medication
  - Get all medication resources
  - Response: FHIR Bundle with medications

GET /fhir/ServiceRequest
  - Get all service request resources
  - Response: FHIR Bundle with service requests

GET /fhir/metadata
  - Get server capability statement
  - Returns: FHIR CapabilityStatement
```

---

## 🧪 Testing Endpoints & Examples

### Quick Test: Pharmacy Flow
```bash
# 1. Submit pharmacy order
curl -X POST http://localhost:4201/orders \
  -H "Content-Type: application/json" \
  -d '{"pharmacy_order_id":"TEST-001","action":"create_order","items":["Item1"],"facility":"Test","requested_by":"User"}'

# 2. Check order was created
curl http://localhost:4201/orders/latest

# 3. Get orders service to verify
curl -H "Authorization: Bearer mock-jwt-token" \
  http://localhost:3005/api/v1/orders/<ORDER_ID>
```

### Quick Test: Billing Flow
```bash
# 1. Submit billing for order from above
curl -X POST http://localhost:4202/orders \
  -H "Content-Type: application/json" \
  -d '{"action":"update_billing","order_id":"<ORDER_ID>","cost":100,"currency":"USD","invoice_number":"INV-001","payment_status":"pending"}'

# 2. Verify order was updated
curl -H "Authorization: Bearer mock-jwt-token" \
  http://localhost:3005/api/v1/orders/<ORDER_ID>
```

---

## 🐳 Docker Commands

```bash
# Start entire system
docker-compose up -d

# Rebuild specific service
docker-compose build adapter-mediator
docker-compose build mock-client-pharmacy
docker-compose build mock-client-billing

# Restart service
docker-compose up -d --force-recreate adapter-mediator

# View logs
docker-compose logs -f adapter-mediator
docker-compose logs -f mock-client-pharmacy
docker-compose logs -f mock-client-billing

# Stop everything
docker-compose down

# Clean rebuild
docker-compose down
docker-compose up -d --build
```

---

## 📁 Key Files Location

### Adapter-Mediator (Downstream)
```
apps/mediator-services/adapter-mediator/
├── src/routes/transform.routes.ts        # Transformation logic
├── src/index.ts                          # Express setup
├── mediatorConfig.json                   # OpenHIM registration
├── Dockerfile                            # Build config
└── package.json                          # Dependencies
```

### Pharmacy Client
```
apps/webhook-services/mock-client-pharmacy/
├── src/index.ts                          # All code + Swagger
├── package.json                          # Dependencies (includes axios)
└── Dockerfile                            # Build config
```

### Billing Client
```
apps/webhook-services/mock-client-billing/
├── src/index.ts                          # All code + Swagger
├── package.json                          # Dependencies (includes axios)
└── Dockerfile                            # Build config
```

---

## 🔧 Configuration Files

### docker-compose.yml (Relevant Services)
```yaml
# Adapter-Mediator
adapter-mediator:
  image: smile-interop-poc-adapter-mediator
  ports:
    - "3204:3204"
  environment:
    PORT: 3204
    OPENHIM_API_URL: https://openhim-core:8080
    CLIENT_ENDPOINT: http://orders-service:3005/api/v1/orders

# Pharmacy Client
mock-client-pharmacy:
  image: smile-interop-poc-mock-client-pharmacy
  ports:
    - "4201:4201"
  environment:
    PORT: 4201
    SERVICE_NAME: Pharmacy
    OPENHIM_ENDPOINT: http://openhim-core:5001/orders-inbound

# Billing Client
mock-client-billing:
  image: smile-interop-poc-mock-client-billing
  ports:
    - "4202:4202"
  environment:
    PORT: 4202
    SERVICE_NAME: Billing
    OPENHIM_ENDPOINT: http://openhim-core:5001/orders-inbound
```

---

## 📊 Orders Service Schema Reference

### Create Order (POST /api/v1/orders)
```json
{
  "orderType": "medicine|equipment|supplies|vaccines",
  "items": [
    {
      "medicineId": "string",
      "name": "string",
      "category": "string",
      "unitOfMeasure": "string",
      "quantityOrdered": number
    }
  ],
  "facilityId": "string",
  "departmentId": "string",
  "requestedBy": "string",
  "priority": "low|normal|high|urgent",
  "requiredDate": "ISO-8601 (future date)",
  "deliveryAddress": {
    "street": "string (min 5 chars)",
    "city": "string",
    "state": "string",
    "zipCode": "string",
    "country": "string"
  }
}
```

### Update Order (PUT /api/v1/orders/:id)
```json
{
  "financials": {
    "totalAmount": number,
    "currency": "string",
    "paymentTerms": "string",
    "budgetCode": "string"
  }
  // ... other optional fields
}
```

**Only editable in states**: DRAFT, REJECTED

---

## 🚨 Common Issues & Solutions

### Issue: Adapter-mediator not registered with OpenHIM
**Solution**: Ensure `mediatorConfig.json` is copied to Docker image and WORKDIR is set correctly

### Issue: Billing update returns 400 error
**Solution**: Ensure `orderId` field is present in transformation (triggers PUT routing)

### Issue: Pharmacy items not transforming correctly
**Solution**: Check if items are strings or objects; transformation handles both cases

### Issue: OpenHIM 502 error
**Solution**: Check adapter-mediator logs; likely data transformation mismatch

### Issue: Build fails with "frozen-lockfile"
**Solution**: Run `pnpm install` in root directory to update lockfile after changing package.json

---

## ✅ Verification Checklist

Run these to verify everything is working:

```bash
# 1. Check all containers running
docker-compose ps

# 2. Health checks
curl http://localhost:3204/health
curl http://localhost:4201/health
curl http://localhost:4202/health

# 3. Pharmacy flow test
curl -X POST http://localhost:4201/orders \
  -H "Content-Type: application/json" \
  -d '{"pharmacy_order_id":"VERIFY-001","action":"create_order","items":["Test"],"facility":"Test","requested_by":"Test"}'

# 4. Billing flow test
curl -X POST http://localhost:4202/orders \
  -H "Content-Type: application/json" \
  -d '{"action":"update_billing","order_id":"TEST_ORDER_ID","cost":100,"currency":"USD","invoice_number":"INV-TEST","payment_status":"pending"}'

# 5. Check Swagger UIs
# Pharmacy: http://localhost:4201/api-docs
# Billing: http://localhost:4202/api-docs
```

---

**Reference prepared for**: Resuming Phase 2 development
**Status**: Ready ✅
**Last tested**: 2025-10-24 11:01 UTC
