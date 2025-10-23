# Resume Tomorrow - Phase 2 Multi-Mediator Investigation

## Current Status
- **Branch**: main
- **Commits ahead**: 6
- **All changes committed** ✓

## The Issue
CloudEvent body not being forwarded to OpenHIM secondary routes:
- Primary route (transformation-mediator:3101) → Receives full CloudEvent ✓
- Secondary route (warehouse-mediator:3301) → Receives empty body ✗

## Investigation Needed
1. Check OpenHIM documentation on secondary route body forwarding
2. Look at channel configuration for body forwarding settings
3. Possible solutions:
   - OpenHIM config flag for secondary route body forwarding
   - Different request format for secondary routes
   - Use context/params instead of body

## Key Files
- `docker-compose.yml` - Line 293: `OPENHIM_ORDERS_ENDPOINT=https://openhim-core:5000/transform`
- `apps/mediator-services/warehouse-transformation-mediator/src/routes/transform.routes.ts` - Has debug logging added
- OpenHIM Channel: `68ef9671301162fff0b5d68d` (/transform with 2 routes)

## Quick Test Command
```bash
cd /d/work/smile-5-0/poc/interop-layer/claude-cli/smile-interop-poc
curl -s -X POST "http://localhost:3005/api/v1/orders" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mock-jwt-token" \
  --data-binary @sample-order-request.json | grep orderId
```

Then check logs:
```bash
docker logs smile-warehouse-transformation-mediator | grep -A 10 "16:06"
```

## Architecture Working ✓
- Single /transform channel with 2 routes
- Both routes execute (OpenHIM transparency confirmed)
- Primary route returns 200 status
- Secondary route gets 400 (validation error due to missing body)

## Services Running
All services healthy - no need to restart tomorrow.

Next session: Investigate & fix the secondary route body forwarding issue!
