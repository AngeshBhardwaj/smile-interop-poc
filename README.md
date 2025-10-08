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

- **RabbitMQ Management**: http://localhost:15672 (admin/admin123)
- **OpenHIM Console**: http://localhost:9000
- **OpenHIM Core API**: https://localhost:8080 (HTTPS)
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
│   ├── app-service/           # CloudEvent emitter
│   ├── interop-layer/         # Core routing logic
│   ├── mediator-services/     # OpenHIM mediators
│   ├── webhook-services/      # HTTP endpoints
│   └── client-service/        # Event consumer
├── packages/
│   ├── common/                # Shared utilities
│   ├── cloud-events/          # CloudEvents SDK
│   └── openhim-adapter/       # OpenHIM integration
├── docker/                    # Docker configurations
├── tests/                     # Integration tests
└── docs/                      # Documentation
```

## 🔧 Configuration

Create environment files:

```bash
make env-example  # Creates .env.example
cp .env.example .env
```

## 🐳 Docker Services

The POC includes the following containerized services:

- **RabbitMQ**: Message broker with management UI
- **MongoDB**: Database for OpenHIM
- **OpenHIM Core**: Health information mediator
- **OpenHIM Console**: Web administration interface
- **Jaeger**: Distributed tracing
- **Prometheus**: Metrics collection
- **Grafana**: Metrics visualization
- **Redis**: Caching layer

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

- [CLAUDE.md](./CLAUDE.md) - Claude Code guidance
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