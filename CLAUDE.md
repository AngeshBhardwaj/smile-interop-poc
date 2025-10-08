# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Proof of Concept (POC) for a health domain interoperability layer built with event-driven architecture. The system enables efficient communication between health applications and services through mediators that handle data restructuring and remodeling based on client requirements.

## Architecture

- **Clean Architecture** with TDD/BDD approach
- **Event-Driven Architecture** using CloudEvents and RabbitMQ
- **Monorepo** structure managed by Turborepo with pnpm
- **OpenHIM Integration** with custom mediators for health interoperability
- **Microservices** pattern with ExpressJS + TypeScript

## Core Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js |
| Language | TypeScript |
| Framework | ExpressJS |
| Package Manager | pnpm |
| Monorepo Tool | Turborepo |
| Event Broker | RabbitMQ |
| Event Standard | CloudEvents |
| Health Interop | OpenHIM |
| Containerization | Docker Compose |
| Testing | Jest (TDD), Cucumber.js (BDD) |
| Logging | Pino |
| Tracing | OpenTelemetry + Jaeger |
| Metrics | Prometheus + Grafana |
| Validation | Zod |

## Essential Commands

### Development Setup
```bash
# Install dependencies
pnpm install

# Start all services in development
pnpm dev

# Start Docker services (RabbitMQ, OpenHIM, etc.)
docker-compose up -d

# Stop Docker services
docker-compose down
```

### Build and Test
```bash
# Build all packages
pnpm build

# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run specific package tests
pnpm --filter=app-service test

# Run integration tests
pnpm test:integration

# Run BDD tests
pnpm test:bdd
```

### Quality Assurance
```bash
# Lint all packages
pnpm lint

# Fix linting issues
pnpm lint:fix

# Type checking
pnpm typecheck

# Run all quality checks
pnpm check-all
```

### Turborepo Specific
```bash
# Build with cache
turbo build

# Test with cache
turbo test

# Clean cache
turbo clean

# Run specific task across all packages
turbo run lint

# Run task for specific package
turbo run build --filter=interop-layer
```

## Project Structure

```
interop-poc/
├── apps/
│   ├── app-service/           # CloudEvent emitter
│   ├── interop-layer/         # Core routing and mediation logic
│   ├── mediator-services/     # OpenHIM mediator implementations
│   ├── webhook-services/      # HTTP endpoints for OpenHIM
│   └── client-service/        # CloudEvent consumer
├── packages/
│   ├── common/                # Shared utilities and types
│   ├── cloud-events/          # CloudEvents SDK wrapper
│   └── openhim-adapter/       # OpenHIM integration utilities
├── docker/                    # Docker configurations
├── tests/                     # Integration and E2E tests
└── docs/                      # API documentation
```

## Key Architectural Patterns

### Event Flow
1. **App Service** emits CloudEvents to RabbitMQ
2. **Interop Layer** consumes events, applies routing logic
3. **Mediator Services** transform data per client requirements
4. **OpenHIM Integration** handles health standard compliance
5. **Client Services** receive transformed CloudEvents

### CloudEvents to OpenHIM Bridge
- Custom mediators transform CloudEvents to OpenHIM-compatible formats
- Bidirectional transformation (CloudEvents ↔ HL7/FHIR)
- Error handling and response transformation back to CloudEvents
- Publishing results to configured queues/topics

### Mediator Types (per OpenHIM standards)
- **Pass-through Mediator**: Route without transformation
- **Adaptor Mediator**: Format/protocol transformation
- **Orchestration Mediator**: Complex business logic and workflow

## Development Guidelines

### Git Commit Strategy
- **Commit at Logical Milestones**: After each feature completion, test suite pass, or phase completion
- **Conventional Commits**: Use conventional commit format (feat:, fix:, docs:, test:, refactor:, chore:)
- **Descriptive Messages**: Focus on "why" rather than "what"
- **Atomic Commits**: Each commit should represent a single logical change
- **Never Leave Broken State**: Always commit working code that builds and passes tests

### Testing Strategy
- **TDD First**: Write tests before implementation
- **Unit Tests**: Jest for individual functions/classes
- **Integration Tests**: Supertest for API endpoints
- **BDD**: Cucumber.js for feature scenarios
- **Mock Services**: For external dependencies

### Error Handling
- Structured error responses with correlation IDs
- Dead Letter Queue (DLQ) for failed messages
- Exponential backoff retry logic
- Circuit breaker pattern for external services

### Observability
- **Logging**: Structured JSON logs with correlation IDs
- **Tracing**: OpenTelemetry spans across service boundaries
- **Metrics**: Custom business metrics + system metrics
- **Health Checks**: Kubernetes-ready health endpoints

### API Standards
- OpenAPI 3.0 specifications for REST APIs
- AsyncAPI for event schemas
- Automatic documentation generation
- Zod schemas for runtime validation

## OpenHIM Integration Details

### Mediator Registration
Mediators must register with OpenHIM Core using the heartbeat API and provide configuration metadata.

### Message Transformation Pipeline
1. Receive CloudEvent from RabbitMQ
2. Extract payload and metadata
3. Transform to target format (HL7, FHIR, etc.)
4. Send to OpenHIM via REST API
5. Transform response back to CloudEvent
6. Publish to result queue

### Configuration Management
- JSON/YAML config files for routing rules
- Environment-specific configurations
- Hot-reload capabilities for development

## Performance Considerations

### Caching Strategy
- Turborepo build cache for faster CI/CD
- Redis for application-level caching
- In-memory caching for frequently accessed configs

### Scaling
- Horizontal scaling of mediator services
- RabbitMQ clustering for high availability
- Load balancing with health checks

## Security

### Message Security
- Message encryption for sensitive health data
- Certificate-based authentication with OpenHIM
- Role-based access control (RBAC)

### Development Security
- No secrets in code or commits
- Environment variable configuration
- Secure defaults for all configurations

## Docker Development Environment

The project uses Docker Compose for local development with WSL compatibility:

- **RabbitMQ**: Message broker with management UI
- **OpenHIM Core**: Health information mediator
- **OpenHIM Console**: Web-based administration
- **Jaeger**: Distributed tracing
- **Prometheus/Grafana**: Metrics and monitoring

### WSL Specific Notes
- Ensure Docker Desktop WSL integration is enabled
- Use `docker-compose` commands from WSL terminal
- File watching works correctly with proper bind mounts

## Common Development Tasks

### Adding a New Mediator
1. Create service in `apps/mediator-services/`
2. Implement OpenHIM mediator interface
3. Add transformation logic for target format
4. Register with OpenHIM Core
5. Add tests and documentation

### Adding a New Event Type
1. Define CloudEvent schema in `packages/cloud-events/`
2. Add Zod validation schema
3. Update routing configuration
4. Add mediator handling logic
5. Write integration tests

### Debugging Event Flow
1. Check RabbitMQ management UI for queue status
2. Review service logs with correlation ID
3. Use Jaeger for distributed tracing
4. Verify OpenHIM transaction logs

## Troubleshooting

### Common Issues
- **Port conflicts**: Check Docker port mappings
- **Queue connection issues**: Verify RabbitMQ is running
- **Build failures**: Clear Turborepo cache with `turbo clean`
- **OpenHIM connection**: Check mediator registration status

### Health Checks
All services expose `/health` endpoints for monitoring and troubleshooting.