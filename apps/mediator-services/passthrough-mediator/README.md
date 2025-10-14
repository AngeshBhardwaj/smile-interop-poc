# SMILE Pass-through Mediator

An OpenHIM mediator that forwards CloudEvents without transformation to external webhooks.

## Overview

The Pass-through Mediator acts as a bridge between OpenHIM and external systems. It:
- Receives CloudEvents via HTTP POST to `/forward`
- Validates CloudEvent format
- Forwards events to configured webhook URL
- Implements retry logic with exponential backoff
- Returns OpenHIM-compatible mediator responses with orchestration logs

## Features

- ✅ CloudEvents 1.0 specification compliance
- ✅ OpenHIM mediator registration and heartbeat
- ✅ Automatic retry with exponential backoff
- ✅ Correlation ID tracking
- ✅ Comprehensive logging with Pino
- ✅ Health check endpoint
- ✅ 99%+ test coverage
- ✅ Docker support

## Quick Start

### Local Development

1. **Install dependencies**
   ```bash
   pnpm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your configuration
   ```

3. **Run in development mode**
   ```bash
   pnpm dev
   ```

4. **Run tests**
   ```bash
   pnpm test
   pnpm test:coverage
   ```

### Docker Deployment

1. **Build the image**
   ```bash
   docker-compose build passthrough-mediator
   ```

2. **Start the service**
   ```bash
   docker-compose up -d passthrough-mediator
   ```

3. **View logs**
   ```bash
   docker-compose logs -f passthrough-mediator
   ```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MEDIATOR_PORT` | No | 3100 | Port for HTTP server |
| `NODE_ENV` | No | development | Environment mode |
| `LOG_LEVEL` | No | info | Logging level (debug, info, warn, error) |
| `OPENHIM_API_URL` | Yes | - | OpenHIM Core API URL |
| `OPENHIM_USERNAME` | Yes | - | OpenHIM username for registration |
| `OPENHIM_PASSWORD` | Yes | - | OpenHIM password |
| `OPENHIM_TRUST_SELF_SIGNED` | No | false | Trust self-signed certificates |
| `WEBHOOK_URL` | Yes | - | Destination webhook URL |
| `WEBHOOK_TIMEOUT` | No | 30000 | Webhook request timeout (ms) |
| `WEBHOOK_RETRY_ATTEMPTS` | No | 3 | Number of retry attempts |

## API Endpoints

### POST /forward

Forward a CloudEvent to the configured webhook.

**Request:**
```json
{
  "specversion": "1.0",
  "type": "health.patient.registered",
  "source": "smile.health-service",
  "id": "event-123",
  "time": "2025-10-14T10:00:00Z",
  "datacontenttype": "application/json",
  "data": {
    "patientId": "P-12345",
    "name": "John Doe"
  }
}
```

**Response:**
```json
{
  "x-mediator-urn": "urn:mediator:smile-passthrough",
  "status": "Successful",
  "response": {
    "status": 200,
    "headers": {},
    "body": "{}",
    "timestamp": "2025-10-14T10:00:01Z"
  },
  "orchestrations": [...],
  "properties": {
    "correlationId": "abc-123",
    "eventId": "event-123",
    "eventType": "health.patient.registered",
    "processingDuration": 1234
  }
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "service": "passthrough-mediator",
  "timestamp": "2025-10-14T10:00:00Z"
}
```

## OpenHIM Configuration

The mediator automatically registers with OpenHIM on startup and creates a default channel:

- **Channel Name**: Health Passthrough Channel
- **URL Pattern**: `^/passthrough$`
- **Methods**: POST
- **Auth Type**: Private

## Testing

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage

# Lint
pnpm lint
pnpm lint:fix

# Type check
pnpm typecheck
```

## Architecture

```
┌──────────────┐      ┌──────────────────┐      ┌──────────────┐
│   OpenHIM    │─────▶│   Passthrough    │─────▶│   External   │
│     Core     │      │    Mediator      │      │   Webhook    │
└──────────────┘      └──────────────────┘      └──────────────┘
                              │
                              │ Registration
                              │ & Heartbeat
                              ▼
                      ┌──────────────┐
                      │   OpenHIM    │
                      │     API      │
                      └──────────────┘
```

## License

Part of the SMILE POC project.
