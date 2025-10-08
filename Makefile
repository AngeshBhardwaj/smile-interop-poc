# SMILE Interop POC - Development Makefile
.PHONY: help install build dev test clean docker-up docker-down docker-logs setup check

# Default target
help: ## Show this help message
	@echo "SMILE Health Interoperability Layer POC"
	@echo "Available commands:"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# Installation and setup
install: ## Install all dependencies
	pnpm install

setup: install build ## Complete project setup
	@echo "✅ Project setup complete!"
	@echo "💡 Next steps:"
	@echo "   - Run 'make docker-up' to start infrastructure"
	@echo "   - Run 'make dev' to start development servers"

# Development
dev: ## Start all services in development mode
	pnpm dev

build: ## Build all packages
	pnpm build

# Testing
test: ## Run all tests
	pnpm test

test-watch: ## Run tests in watch mode
	pnpm test:watch

test-integration: ## Run integration tests
	pnpm test:integration

test-bdd: ## Run BDD tests
	pnpm test:bdd

# Quality assurance
lint: ## Run linting
	pnpm lint

lint-fix: ## Fix linting issues
	pnpm lint:fix

typecheck: ## Run TypeScript type checking
	pnpm typecheck

check: ## Run all quality checks
	pnpm check-all

# Docker operations
docker-up: ## Start Docker services (RabbitMQ, OpenHIM, Jaeger, Prometheus, Grafana, Redis)
	docker-compose up -d
	@echo "🐳 Docker services started!"
	@echo "📊 Access points:"
	@echo "   - RabbitMQ Management: http://localhost:15672 (admin/admin123)"
	@echo "   - OpenHIM Console: http://localhost:9000"
	@echo "   - OpenHIM Core API: http://localhost:8080"
	@echo "   - Jaeger UI: http://localhost:16686"
	@echo "   - Grafana: http://localhost:3001 (admin/admin123)"
	@echo "   - Prometheus: http://localhost:9090"
	@echo "   - Redis: localhost:6379"

docker-down: ## Stop Docker services
	docker-compose down

docker-logs: ## Show Docker service logs
	docker-compose logs -f

docker-clean: docker-down ## Clean Docker resources
	docker-compose down -v
	docker system prune -f

# Cleanup
clean: ## Clean build artifacts
	pnpm clean
	rm -rf node_modules
	rm -rf apps/*/node_modules
	rm -rf packages/*/node_modules

clean-all: clean docker-clean ## Clean everything including Docker

# Development workflow
quick-check: ## Quick development check (build + lint + typecheck)
	pnpm build && pnpm lint && pnpm typecheck

full-check: quick-check test ## Full check including tests

# Git helpers
git-status: ## Show git status
	git status

commit: ## Interactive commit with conventional commit format
	@echo "Staging all changes..."
	git add -A
	@echo "📝 Use conventional commit format:"
	@echo "   feat: add new feature"
	@echo "   fix: bug fix"
	@echo "   docs: documentation changes"
	@echo "   test: add or modify tests"
	@echo "   refactor: code refactoring"
	@echo "   chore: maintenance tasks"
	git commit

# Service-specific commands
app-service: ## Start only app-service
	pnpm --filter=@smile/app-service dev

interop-layer: ## Start only interop-layer
	pnpm --filter=@smile/interop-layer dev

# Logs and monitoring
logs-app: ## Show app-service logs
	pnpm --filter=@smile/app-service logs

logs-interop: ## Show interop-layer logs
	pnpm --filter=@smile/interop-layer logs

# Health checks
health: ## Check health of all services
	@echo "🏥 Health check starting..."
	@curl -f http://localhost:3001/health 2>/dev/null && echo "✅ App Service: OK" || echo "❌ App Service: DOWN"
	@curl -f http://localhost:3002/health 2>/dev/null && echo "✅ Interop Layer: OK" || echo "❌ Interop Layer: DOWN"
	@curl -f http://localhost:15672 2>/dev/null && echo "✅ RabbitMQ: OK" || echo "❌ RabbitMQ: DOWN"
	@curl -f http://localhost:8080/heartbeat 2>/dev/null && echo "✅ OpenHIM: OK" || echo "❌ OpenHIM: DOWN"

# Documentation
docs: ## Generate API documentation
	@echo "📚 Generating documentation..."
	# TODO: Add documentation generation commands

# Environment helpers
env-example: ## Create example environment file
	@echo "Creating .env.example..."
	@echo "# Application Configuration" > .env.example
	@echo "NODE_ENV=development" >> .env.example
	@echo "LOG_LEVEL=info" >> .env.example
	@echo "" >> .env.example
	@echo "# RabbitMQ Configuration" >> .env.example
	@echo "RABBITMQ_URL=amqp://admin:admin123@localhost:5672" >> .env.example
	@echo "RABBITMQ_EXCHANGE=smile-events" >> .env.example
	@echo "RABBITMQ_QUEUE=interop-events" >> .env.example
	@echo "" >> .env.example
	@echo "# OpenHIM Configuration" >> .env.example
	@echo "OPENHIM_API_URL=http://localhost:8080" >> .env.example
	@echo "OPENHIM_USERNAME=root@openhim.org" >> .env.example
	@echo "OPENHIM_PASSWORD=openhim-password" >> .env.example
	@echo "" >> .env.example
	@echo "# Service Ports" >> .env.example
	@echo "APP_SERVICE_PORT=3001" >> .env.example
	@echo "INTEROP_LAYER_PORT=3002" >> .env.example
	@echo "MEDIATOR_SERVICES_PORT=3003" >> .env.example
	@echo "WEBHOOK_SERVICES_PORT=3004" >> .env.example
	@echo "CLIENT_SERVICE_PORT=3005" >> .env.example
	@echo "" >> .env.example
	@echo "# Tracing" >> .env.example
	@echo "JAEGER_ENDPOINT=http://localhost:14268/api/traces" >> .env.example
	@echo "" >> .env.example
	@echo "# Redis" >> .env.example
	@echo "REDIS_URL=redis://localhost:6379" >> .env.example
	@echo "✅ .env.example created!"

# Development troubleshooting
troubleshoot: ## Show troubleshooting information
	@echo "🔧 Troubleshooting Information:"
	@echo "Node version: $(shell node --version 2>/dev/null || echo 'Not installed')"
	@echo "pnpm version: $(shell pnpm --version 2>/dev/null || echo 'Not installed')"
	@echo "Docker version: $(shell docker --version 2>/dev/null || echo 'Not installed')"
	@echo "Docker Compose version: $(shell docker-compose --version 2>/dev/null || echo 'Not installed')"
	@echo ""
	@echo "📂 Project structure:"
	@find . -name "package.json" -not -path "./node_modules/*" | head -10
	@echo ""
	@echo "🐳 Docker containers:"
	@docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "Docker not running"