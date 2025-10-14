# SMILE Health Interoperability Layer POC

A proof-of-concept implementation of an event-driven interoperability layer for health domain applications, built with Node.js, TypeScript, and OpenHIM.

## 🏗️ Architecture

This POC implements a clean, event-driven architecture with the following components:

- **App Service**: Emits CloudEvents for health application events
- **Interop Layer**: Core routing and mediation logic
- **Mediator Services**: OpenHIM-compatible mediators for data transformation
- **Webhook Services**: HTTP endpoints for OpenHIM integration
- **Client Service**: Consumes transformed CloudEvents

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+
- Docker & Docker Compose
- WSL (for Windows users)

### Setup

1. **Install dependencies and build**:

   ```bash
   make setup
   ```

2. **Start infrastructure services**:

   ```bash
   make docker-up
   ```

3. **Start development servers**:
   ```bash
   make dev
   ```

### Access Points

#### 🏥 SMILE Services

**Health Service** (HIPAA-compliant Patient Registration)

- **Swagger API Docs**: http://localhost:3004/api/docs
- **Health Check**: http://localhost:3004/health
- **Features**: Patient registration, PII/PHI data masking, HIPAA audit logging
- **Auth**: API Key: `health-api-key-dev` OR Bearer: `mock-jwt-token`

**Orders Service** (Order Lifecycle Management)

- **Swagger API Docs**: http://localhost:3005/api/docs
- **Health Check**: http://localhost:3005/health
- **Features**: Complete order workflow, state transitions, return processing
- **Auth**: API Key: `orders-api-key-dev` OR Bearer: `mock-jwt-token`
- **Sample Data**: See `sample-order-request.json`

#### 🔧 Infrastructure Services

- **RabbitMQ Management**: http://localhost:15672 (admin/admin123)
- **OpenHIM Console**: http://localhost:9000
- **OpenHIM Core API**: https://127.0.0.1:8080 (HTTPS only, use 127.0.0.1)
- **Jaeger Tracing**: http://localhost:16686
- **Grafana**: http://localhost:3001 (admin/admin123)
- **Prometheus**: http://localhost:9090
- **Redis**: localhost:6379
- **MongoDB**: localhost:27017

## 📋 Available Commands

Run `make help` to see all available commands:

```bash
make help              # Show help
make setup             # Complete project setup
make dev               # Start development servers
make test              # Run tests
make lint              # Run linting
make docker-up         # Start Docker services
make health            # Check service health
```

## 🧪 Development Workflow

### Test-Driven Development

```bash
# Run tests in watch mode
make test-watch

# Run specific test suites
pnpm --filter=@smile/app-service test
pnpm --filter=@smile/interop-layer test
```

### Code Quality

```bash
# Quick quality check
make quick-check

# Full check including tests
make full-check
```

## 📦 Monorepo Structure

```
smile-interop-poc/
├── apps/
│   ├── health-service/        # HIPAA-compliant patient registration (✅ Step 2a)
│   ├── orders-service/        # Order lifecycle management (✅ Step 2b)
│   ├── interop-layer/         # Core routing logic
│   ├── mediator-services/     # OpenHIM mediators
│   ├── webhook-services/      # HTTP endpoints
│   └── client-service/        # Event consumer
├── packages/
│   ├── common/                # Security utilities, audit logging, data masking
│   ├── cloud-events/          # CloudEvents SDK wrapper
│   └── openhim-adapter/       # OpenHIM integration
├── docker/                    # Docker configurations
├── tests/                     # Integration tests
└── docs/                      # Documentation
```

## 🏥 Implemented Services

### Health Service (Step 2a - Complete ✅)

**HIPAA-Compliant Patient Registration Service**

- **Port**: 3004
- **Swagger**: http://localhost:3004/api/docs
- **Test Coverage**: 90%+ (265 tests passing)

**Features:**

- Patient registration with full PII/PHI protection
- Automatic data masking in logs and events
- HIPAA-compliant audit trails
- Field-level encryption for sensitive data
- CloudEvents emission for patient lifecycle events
- Comprehensive validation and error handling

**Order Workflow States:**

```
Registration → Active → Inactive/Deceased
```

**API Endpoints:**

- `POST /api/v1/patients` - Register new patient
- `GET /api/v1/patients` - List patients (masked data)
- `GET /api/v1/patients/:id` - Get patient details
- `PUT /api/v1/patients/:id` - Update patient info
- `DELETE /api/v1/patients/:id` - Soft delete patient

**Sample Request:** See `sample-patient-request.json`

### Orders Service (Step 2b - Complete ✅)

**Order Lifecycle Management Service**

- **Port**: 3005
- **Swagger**: http://localhost:3005/api/docs
- **Test Coverage**: 90%+ (265 tests passing)

**Features:**

- Complete order lifecycle management
- State-driven workflow with validation
- Support for medicines, equipment, supplies, vaccines
- Return and rejection workflows
- Role-based access control
- CloudEvents emission for all state changes
- Comprehensive audit logging

**Order Workflow States:**

```
DRAFT → SUBMITTED → APPROVED → PACKED → SHIPPED → RECEIVED → FULFILLED
  ↑                  ↓                              ↓
  ← ← ← ← ← ← ← ← REJECTED                      RETURNED → RETURN_COMPLETE
```

**API Endpoints:**

_Core CRUD:_

- `POST /api/v1/orders` - Create new order (DRAFT)
- `GET /api/v1/orders` - List orders with filtering
- `GET /api/v1/orders/:id` - Get order details
- `PUT /api/v1/orders/:id` - Update order (DRAFT/REJECTED only)
- `DELETE /api/v1/orders/:id` - Delete order (DRAFT only)

_State Transitions:_

- `POST /api/v1/orders/:id/submit` - Submit for approval
- `POST /api/v1/orders/:id/approve` - Approve order
- `POST /api/v1/orders/:id/reject` - Reject order

_Fulfillment:_

- `POST /api/v1/orders/:id/pack` - Mark as packed
- `POST /api/v1/orders/:id/ship` - Mark as shipped
- `POST /api/v1/orders/:id/receive` - Mark as received
- `POST /api/v1/orders/:id/fulfill` - Mark as fulfilled

_Returns:_

- `POST /api/v1/orders/:id/return` - Initiate return
- `POST /api/v1/orders/:id/complete-return` - Complete return

**Sample Request:** See `sample-order-request.json`

## 🔧 Configuration

Create environment files:

```bash
make env-example  # Creates .env.example
cp .env.example .env
```

## 🐳 Docker Deployment

### Single Command Deployment

Bring up the entire SMILE application stack with a single command:

```bash
make docker-up    # Starts all infrastructure and application services
```

This command will:

- Build Docker images for health-service and orders-service
- Start all infrastructure services (RabbitMQ, MongoDB, Redis, etc.)
- Start application services with proper health checks
- Configure networking between all containers

### Teardown

```bash
make docker-down  # Stops and removes all containers
```

### Container Services

The complete Docker stack includes:

**Application Services:**

- **health-service**: HIPAA-compliant patient registration (Port 3004)
- **orders-service**: Order lifecycle management (Port 3005)

**Infrastructure Services:**

- **RabbitMQ**: Message broker with management UI (Ports 5672, 15672)
- **MongoDB**: Database for OpenHIM (Port 27017)
- **OpenHIM Core**: Health information mediator (Ports 5000, 5001, 8080)
- **OpenHIM Console**: Web administration interface (Port 9000)
- **Jaeger**: Distributed tracing (Port 16686)
- **Prometheus**: Metrics collection (Port 9090)
- **Grafana**: Metrics visualization (Port 3001)
- **Redis**: Caching layer (Port 6379)

### Health Checks

All services include health checks to ensure proper startup sequence:

- Application services wait for RabbitMQ to be healthy
- OpenHIM Console waits for OpenHIM Core to be healthy
- MongoDB, RabbitMQ, and Redis have built-in health checks

### Swagger in Docker

Both health-service and orders-service Swagger UIs are fully functional in Docker mode:

- **Health Service**: http://localhost:3004/api/docs
- **Orders Service**: http://localhost:3005/api/docs

All API endpoints are available for testing directly from the Swagger interface.

## 🏥 Health Monitoring

Check service health:

```bash
make health
```

View logs:

```bash
make docker-logs        # All Docker services
make logs-app          # App service only
make logs-interop      # Interop layer only
```

## 🧩 Event Flow

1. **App Service** emits CloudEvents to RabbitMQ
2. **Interop Layer** consumes events and applies routing rules
3. **Mediator Services** transform data based on client requirements
4. **OpenHIM Integration** ensures health standard compliance
5. **Client Services** receive transformed events

## 📖 Documentation

- [Architecture Decision Records](./docs/adr/) - Design decisions
- [API Documentation](./docs/api/) - Auto-generated API docs

## 🛠️ Troubleshooting

Run diagnostics:

```bash
make troubleshoot
```

Common issues:

- **Port conflicts**: Check Docker port mappings
- **Build failures**: Run `make clean && make setup`
- **Connection issues**: Verify services with `make health`

## 🤝 Contributing

1. Follow TDD approach - write tests first
2. Use conventional commit messages
3. Run quality checks before committing: `make full-check`
4. Use `make commit` for guided commit creation

## 📄 License

MIT - See LICENSE file for details
