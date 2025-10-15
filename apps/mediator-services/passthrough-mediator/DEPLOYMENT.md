# Pass-through Mediator - Deployment Guide

## Quick Start

### 1. Configure Environment

Update `docker-compose.yml`:

```yaml
passthrough-mediator:
  environment:
    OPENHIM_USERNAME: root@openhim.org     # OpenHIM user (NOT client)
    OPENHIM_PASSWORD: password
    WEBHOOK_URL: https://webhook.site/your-id
```

### 2. Deploy

```bash
docker-compose build passthrough-mediator
docker-compose up -d passthrough-mediator
docker-compose logs -f passthrough-mediator
```

### 3. Verify Registration

Should see in logs:
- "Mediator registered successfully with OpenHIM"
- "Heartbeat activated"

### 4. Create OpenHIM Channel

```bash
curl -k -X POST https://localhost:8080/channels \
  -u "root@openhim.org:password" \
  -H "Content-Type: application/json" \
  -d '{"name":"Health Passthrough Channel","urlPattern":"^/passthrough$","type":"http","methods":["POST"],"authType":"private","allow":["smile-poc"],"routes":[{"name":"Passthrough Route","type":"http","status":"enabled","host":"passthrough-mediator","port":3100,"path":"/forward","primary":true}],"status":"enabled"}'
```

## Testing

### Test Direct Endpoint

```bash
curl -X POST http://localhost:3100/forward \
  -H "Content-Type: application/json" \
  -d '{"specversion":"1.0","type":"health.patient.registered","source":"smile.health-service","id":"test-123","time":"2025-10-14T17:30:00Z","datacontenttype":"application/json","data":{"patientId":"P-12345"}}'
```

### Test Through OpenHIM

```bash
curl -k -X POST https://localhost:5000/passthrough \
  -u "smile-poc:password" \
  -H "Content-Type: application/json" \
  -d '{"specversion":"1.0","type":"health.patient.registered","source":"smile.health-service","id":"e2e-789","time":"2025-10-14T17:45:00Z","datacontenttype":"application/json","data":{"patientId":"P-67890"}}'
```

## Monitoring

```bash
# Check status
docker-compose ps passthrough-mediator

# View logs
docker-compose logs -f passthrough-mediator

# Check mediator heartbeat
curl -k -s -u "root@openhim.org:password" https://localhost:8080/mediators | jq '.[] | select(.urn == "urn:mediator:smile-passthrough")'
```

## Troubleshooting

### Mediator Registration Failed

- Verify OpenHIM Core is running
- Check username is root@openhim.org (user, not client)
- Ensure API URL is accessible: `docker-compose exec passthrough-mediator curl -k https://openhim-core:8080/heartbeat`

### Channel Not Found (404)

- Verify channel exists: `curl -k -s -u "root@openhim.org:password" https://localhost:8080/channels`
- Recreate using command in section 4 above

### Authentication Failed (401)

- Verify smile-poc client exists
- Check client in channel allow list
- Default password: "password"

### Webhook Forward Failed

- Verify webhook URL is accessible
- Check timeout settings (default 30s)
- Review logs: `docker-compose logs passthrough-mediator`

## Access Points

- **Mediator Direct**: http://localhost:3100/forward
- **Through OpenHIM**: https://localhost:5000/passthrough
- **OpenHIM Console**: http://localhost:9000
- **Health Check**: http://localhost:3100/health

## Architecture

```
Client (smile-poc)
    ↓ POST /passthrough
OpenHIM Core (Port 5000)
    ↓ Route: passthrough-mediator:3100/forward
Pass-through Mediator
    ↓ CloudEvents validation
    ↓ Forward with retry
Webhook.site
    ↓ Response 200 OK
Pass-through Mediator
    ↓ OpenHIM mediator response
OpenHIM Core
    ↓ Transaction logged
```

## Production Checklist

- [ ] Change default passwords
- [ ] Use proper TLS certificates
- [ ] Configure webhook authentication
- [ ] Set Docker resource limits
- [ ] Enable log aggregation
- [ ] Set up monitoring alerts
- [ ] Configure backup webhook URLs
- [ ] Test failover scenarios

See README.md for complete configuration options and API reference.
