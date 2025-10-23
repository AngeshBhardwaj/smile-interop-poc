# Gemini Code Assistant Context

This document provides context for the Gemini code assistant to understand the SMILE Health Interoperability Layer POC project.

## Project Overview

This project is a proof-of-concept for a health interoperability layer using an event-driven architecture. It is a Node.js monorepo using pnpm, TypeScript, and Docker. The project is structured as a collection of microservices that communicate with each other using CloudEvents via RabbitMQ.

### Architecture

The architecture consists of the following components:

-   **`apps`**: This directory contains the microservices that make up the application.
    -   **`app-service`**: A service that emits CloudEvents for health application events.
    -   **`health-service`**: A HIPAA-compliant service for managing patient data.
    -   **`orders-service`**: A service for managing the lifecycle of orders.
    -   **`interop-layer`**: The core of the project, responsible for routing and mediating events between services.
    -   **`mediator-services`**: OpenHIM-compatible mediators for data transformation.
    -   **`webhook-services`**: HTTP endpoints for OpenHIM integration.
    -   **`client-service`**: A service that consumes transformed CloudEvents.
-   **`packages`**: This directory contains shared libraries used by the microservices.
    -   **`common`**: Shared utilities for logging, configuration, error handling, and security.
    -   **`cloud-events`**: A wrapper around the CloudEvents SDK for creating and consuming events.
    -   **`openhim-adapter`**: Utilities for integrating with OpenHIM.
-   **`docker`**: This directory contains the Docker configurations for the project, including services like RabbitMQ, OpenHIM, Jaeger, Prometheus, and Grafana.

### Technologies

-   **Backend**: Node.js, TypeScript, Express.js
-   **Monorepo**: pnpm, turbo
-   **Messaging**: RabbitMQ, CloudEvents
-   **Database**: MongoDB
-   **Orchestration**: Docker, Docker Compose
-   **Testing**: Jest, Supertest
-   **Linting**: ESLint, Prettier
-   **CI/CD**: `Makefile` for scripting common tasks.

## Building and Running

The project uses a `Makefile` to simplify the development workflow.

-   **`make setup`**: Installs all dependencies and builds the project.
-   **`make dev`**: Starts all services in development mode with hot-reloading.
-   **`make docker-up`**: Starts all infrastructure services using Docker Compose.
-   **`make docker-down`**: Stops all Docker services.
-   **`make test`**: Runs all tests.
-   **`make lint`**: Lints the entire codebase.
-   **`make check`**: Runs all quality checks (linting, type-checking, and testing).

## Development Conventions

-   **Conventional Commits**: The project uses the conventional commit format for git commits.
-   **Test-Driven Development (TDD)**: The `README.md` encourages a TDD approach.
-   **Code Quality**: The project has a strong emphasis on code quality, with linting, type-checking, and high test coverage.
-   **Error Handling**: The `@smile/common` package provides a standardized way of handling errors.
-   **Logging**: The `@smile/common` package provides a standardized logger.
-   **Configuration**: The project uses `.env` files for configuration. An example file can be created with `make env-example`.
