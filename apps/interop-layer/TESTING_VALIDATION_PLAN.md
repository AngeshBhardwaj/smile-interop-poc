# Interop Layer Testing & Validation Plan

## Overview
This document outlines the systematic approach to validate the complete flow:
**Orders-Service → RabbitMQ → Interop-Layer → OpenHIM → Transaction Log**

---

## Architecture Understanding

### OpenHIM Flow (CORRECT Architecture)
```
External System (Interop-Layer)
    ↓ [POST with Basic Auth as Client]
OpenHIM Core Channel (URL: https://localhost:5000/smile-default)
    ↓ [Request Matching + Routing]
Mediator Service (Optional - transforms data)
    ↓
Final Destination (Health System/Database)
    ↓
OpenHIM Transaction Log (Visible in OpenHIM Console)
```

### Our Current Setup
- **Interop-Layer** = OpenHIM Client (authenticated system making requests)
- **OpenHIM Channel** = Receives requests and routes them
- **Mediator** = Separate microservice that OpenHIM calls for transformation (optional)

### Key Insight
**We POST to OpenHIM channel endpoint, NOT directly to mediators.**
OpenHIM decides if/which mediator to call based on channel configuration.

---

## Validation Steps

### Step 1: Verify RabbitMQ Infrastructure ✓

**Objective:** Ensure exchanges, queues, and bindings exist

**Actions:**
1. Access RabbitMQ Management UI: http://localhost:15672
2. Login: admin / admin123
3. Check Exchanges tab:
   - ✅ `orders.events` should exist (type: topic)
   - ✅ `health.events` should exist (type: topic)
4. Check Queues tab:
   - ✅ `interop.orders.queue` should exist
   - ✅ `interop.health.queue` should exist
5. Check Bindings:
   - Click on `interop.orders.queue`
   - Verify binding: `orders.events` → `interop.orders.queue` with routing key `orders.#`

**Expected Result:** All exchanges, queues, and bindings exist correctly

**If Missing:** Need to ensure orders-service and interop-layer create them on startup

---

### Step 2: Verify Orders-Service Event Publishing

**Objective:** Confirm orders-service actually publishes events to RabbitMQ

**Test Actions:**
```bash
# 1. Create a test order via API
curl -X POST http://localhost:3005/api/v1/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "patientId": "P12345",
    "orderType": "medicines",
    "items": [{
      "itemId": "MED001",
      "name": "Paracetamol 500mg",
      "quantity": 20,
      "unit": "tablets"
    }],
    "priority": "normal",
    "notes": "Test order for event validation"
  }'

# 2. Check RabbitMQ UI → Queues → interop.orders.queue
# Look for "Ready" messages count (should increase by 1)

# 3. Check orders-service logs for:
# "Order event emitted successfully"
# eventType: "order.created"
```

**Expected Result:**
- ✅ Order created successfully (API returns 201)
- ✅ Orders-service logs show "Order event emitted successfully"
- ✅ RabbitMQ queue shows 1 new message

**If Event Not Published:**
- Check if OrderEventService is initialized in orders-service
- Verify RabbitMQ connection in orders-service logs
- Check for errors in event emission

---

### Step 3: Manual Event Publishing Test

**Objective:** Bypass orders-service and manually publish to test consumer

**Using RabbitMQ Management UI:**
1. Go to Queues → `interop.orders.queue`
2. Click "Publish message"
3. Set Properties:
   ```
   content_type: application/json
   delivery_mode: 2 (persistent)
   ```
4. Payload (CloudEvent format):
   ```json
   {
     "specversion": "1.0",
     "type": "order.created",
     "source": "smile.orders-service",
     "id": "test-manual-123",
     "time": "2025-10-14T12:00:00Z",
     "datacontenttype": "application/json",
     "subject": "order/ORD-TEST-001",
     "data": {
       "eventData": {
         "orderId": "ORD-TEST-001",
         "orderType": "medicines",
         "priority": "normal",
         "status": "DRAFT"
       },
       "metadata": {
         "facilityId": "FAC-001",
         "userId": "test-user",
         "correlationId": "test-manual-123",
         "service": "orders-service",
         "containsPII": false,
         "dataClassification": "internal",
         "eventVersion": "1.0"
       }
     }
   }
   ```
5. Click "Publish message"

**Expected Result:**
- ✅ Message consumed immediately (disappears from queue)
- ✅ Interop-layer logs show:
  ```
  Processing CloudEvent
  eventId: test-manual-123
  eventType: order.created
  ```
- ✅ Interop-layer attempts to send to OpenHIM (may fail if OpenHIM not configured)

**If Consumer Not Working:**
- Check interop-layer logs for errors
- Verify consumer is started (logs show "Consumer started")
- Check RabbitMQ connection status

---

### Step 4: Test OpenHIM HTTP Bridge

**Objective:** Verify interop-layer can POST to OpenHIM channel

**Prerequisites:**
- OpenHIM running: https://localhost:8080
- OpenHIM Console: http://localhost:9000
- Client configured in OpenHIM
- Channel configured: https://localhost:5000/smile-default

**Test with Postman (Known Working):**
```
Method: POST
URL: https://localhost:5000/smile-default
Headers:
  Content-Type: application/cloudevents+json
  Authorization: Basic <base64(client:password)>
Body: {CloudEvent JSON}
```

**Expected Result:** ✅ OpenHIM Console shows new transaction

**Test from Interop-Layer:**
1. Ensure interop-layer config has:
   ```
   OPENHIM_ORDERS_ENDPOINT=https://localhost:5000/smile-default
   OPENHIM_USERNAME=your-client-name
   OPENHIM_PASSWORD=your-client-password
   ```
2. Publish test event to RabbitMQ (Step 3)
3. Check interop-layer logs:
   ```
   Sending CloudEvent to OpenHIM
   endpoint: https://localhost:5000/smile-default
   ```
4. Check OpenHIM Console for transaction

**If OpenHIM POST Fails:**
- Check SSL certificate issues (may need to disable cert validation for dev)
- Verify client credentials match OpenHIM configuration
- Check OpenHIM logs for authentication/authorization errors

---

### Step 5: Webhook Test (Debugging Alternative)

**Objective:** Test HTTP posting without OpenHIM complexity

**Setup:**
1. Use webhook.site URL: https://webhook.site/e0bf3b4a-4914-4e44-a97e-fa9fd179909c
2. Temporarily modify interop-layer to POST there instead of OpenHIM

**Implementation (Already Done by User):**
- `sendToWebhookTest()` method added to OpenHIMBridge
- Modify `createEventHandler()` in InteropService to use webhook method

**Expected Result:**
- ✅ Webhook.site shows received CloudEvent
- ✅ Validates HTTP posting works independently of OpenHIM

**If Webhook Also Fails:**
- Issue is in RabbitMQ consumption, not HTTP posting
- Focus on Steps 2-3 first

---

### Step 6: End-to-End Integration Test

**Objective:** Complete flow validation

**Test Procedure:**
```bash
# 1. Ensure all services running:
docker ps  # RabbitMQ, OpenHIM
# Interop-layer running (pnpm dev)
# Orders-service running

# 2. Check RabbitMQ queues are empty
# RabbitMQ UI → Queues → verify 0 messages

# 3. Create order via orders-service API
curl -X POST http://localhost:3005/api/v1/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{...order data...}'

# 4. Watch interop-layer logs in real-time
tail -f interop-layer.log | grep "Processing CloudEvent"

# 5. Check OpenHIM Console
# http://localhost:9000 → Transactions tab
# Should show new transaction with order.created event
```

**Success Criteria:**
1. ✅ Order created (orders-service returns 201)
2. ✅ Event published to RabbitMQ (visible briefly in queue)
3. ✅ Interop-layer consumes event (logs show processing)
4. ✅ Interop-layer POSTs to OpenHIM (logs show HTTP request)
5. ✅ OpenHIM records transaction (visible in Console)

---

## Common Issues & Solutions

### Issue 1: Events Not Consumed from RabbitMQ
**Symptoms:** Queue has messages but interop-layer logs show nothing
**Causes:**
- Consumer not started
- Binding mismatch (routing key pattern wrong)
- Connection closed

**Debug Steps:**
```bash
# Check interop-layer logs for:
"Consumer started" ← Should see this
"Exchange asserted" ← Should see this
"Queue bound to exchange" ← Should see this

# If missing, check for connection errors
```

### Issue 2: OpenHIM Returns 401 Unauthorized
**Symptoms:** Interop-layer logs show HTTP 401 error
**Causes:**
- Client not configured in OpenHIM
- Wrong credentials
- Client doesn't have permission for channel

**Solutions:**
1. OpenHIM Console → Clients → Verify client exists
2. Check username/password match `.env` config
3. Ensure client has roles matching channel requirements

### Issue 3: OpenHIM Returns 404 Not Found
**Symptoms:** HTTP 404 when POST to channel URL
**Causes:**
- Wrong channel URL
- Channel not active
- URL pattern doesn't match

**Solutions:**
1. Verify channel URL in OpenHIM Console
2. Check channel is "Enabled"
3. Verify URL pattern matches POST endpoint

### Issue 4: SSL Certificate Errors
**Symptoms:** `UNABLE_TO_VERIFY_LEAF_SIGNATURE` or `CERT_HAS_EXPIRED`
**Solution (Dev Only):**
```typescript
// Add to axios config in OpenHIMBridge
const requestConfig: AxiosRequestConfig = {
  headers: {...},
  timeout: this.config.timeout,
  httpsAgent: new https.Agent({
    rejectUnauthorized: false  // ⚠️ DEV ONLY!
  })
};
```

---

## Quick Diagnostic Commands

```bash
# 1. Check all Docker services
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# 2. Check RabbitMQ connections
curl -u admin:admin123 http://localhost:15672/api/connections | jq

# 3. Check RabbitMQ queues
curl -u admin:admin123 http://localhost:15672/api/queues | jq '.[] | {name, messages}'

# 4. Check interop-layer health
curl http://localhost:3002/health | jq

# 5. Check OpenHIM heartbeat
curl -k https://localhost:8080/heartbeat

# 6. Test OpenHIM authentication
curl -k -u client:password https://localhost:5000/smile-default
```

---

## Next Steps After Validation

1. ✅ **Document findings** - Update this plan with actual results
2. ✅ **Fix identified issues** - Address any failures systematically
3. ✅ **Add integration tests** - Automate this validation
4. ✅ **Configure mediators** - If data transformation needed
5. ✅ **Commit working code** - Once end-to-end flow verified
6. ✅ **Update architecture docs** - Clarify OpenHIM integration

---

## Questions Answered

### Q: What are OpenHIM Mediators?
**A:** Mediators are separate microservices that:
- Transform data formats (e.g., CloudEvents → HL7)
- Enrich data with additional information
- Orchestrate complex workflows
- Are called BY OpenHIM (not called directly by us)

### Q: Do we call mediators directly or through OpenHIM?
**A:** **Through OpenHIM!** Our flow:
```
Interop-Layer → OpenHIM Channel → [Optional] Mediator → Final System
```

We POST to OpenHIM channel, and OpenHIM's channel configuration determines if a mediator is involved.

### Q: Where does data transformation happen?
**A:**
- **Option 1:** In the mediator (if configured in channel)
- **Option 2:** At the final destination system
- **Option 3:** Not at all (pass-through if systems speak same format)

For POC, we can use pass-through (no transformation) and add mediators later when needed.

---

## Testing Priority

1. **HIGH**: Steps 1-3 (Verify RabbitMQ infrastructure and consumption)
2. **HIGH**: Step 4 (Verify OpenHIM HTTP posting)
3. **MEDIUM**: Step 5 (Webhook debugging if needed)
4. **HIGH**: Step 6 (End-to-end validation)

Start with Step 1 and proceed sequentially. Each step builds on the previous one.

---

## Validation Results (Completed 2025-10-14)

### ✅ All Validation Steps Completed Successfully

**Date**: October 14, 2025
**Validation Status**: **PASSED** - Complete end-to-end integration working

### Critical Issue Discovered & Fixed

**Issue**: Routing Key Mismatch
**Location**: RabbitMQ queue binding for `interop.orders.queue`
**Problem**: Queue was bound with pattern `orders.#` (plural), but events were published with routing key `order.created` (singular)
**Impact**: Events were not being routed to consumer queue
**Solution**: Changed queue binding from `orders.#` to `order.#` to match actual event types
**Command Used**:
```bash
# Remove old binding
curl -u admin:admin123 -X DELETE "http://localhost:15672/api/bindings/%2F/e/orders.events/q/interop.orders.queue/orders.%23"

# Add correct binding
curl -u admin:admin123 -X POST "http://localhost:15672/api/bindings/%2F/e/orders.events/q/interop.orders.queue" \
  -H "Content-Type: application/json" \
  -d '{"routing_key":"order.#"}'
```

### Configuration Updates Made

**1. OpenHIM Bridge (`apps/interop-layer/src/bridge/openhim-bridge.ts`)**
- ✅ Added `https` import for SSL agent configuration
- ✅ Enabled endpoint routing with `getEndpointForSource()` method
- ✅ Added SSL certificate bypass for development (`rejectUnauthorized: false`)
- ✅ Added TODO notes for future channel-specific routing based on business logic

**2. Interop Service (`apps/interop-layer/src/services/interop-service.ts`)**
- ✅ Changed from temporary `sendToWebhookTest()` to production `sendToOpenHIM()`
- ✅ Updated log messages to reflect OpenHIM integration
- ✅ Maintained error handling with NACK for failed messages

**3. Docker Configuration (`docker-compose.yml`)**
- ✅ Updated OpenHIM username from `root@openhim.org` to `smile-poc` (matching configured client)
- ✅ Changed all channel endpoints to `https://openhim-core:5000/smile-default`
- ✅ Added documentation comments for future channel expansion
- ✅ Configured HTTPS (port 5000) instead of HTTP (port 5001) for security best practices

### Test Execution Results

**Test Order Created**:
- **Order ID**: `c1428924-8838-45d8-8f3d-fc3c2e922bff`
- **Correlation ID**: `45cc8de7-e88b-4965-a8ed-4072cf2a6665`
- **Timestamp**: `2025-10-14 09:50:24 UTC`
- **Order Type**: Equipment (Surgical Scalpel Set)
- **Priority**: High
- **Facility**: FAC-OPENHIM-TEST

**Flow Validation**:
```
✅ Orders API (POST /api/v1/orders) → Success (201)
    ↓
✅ Orders-Service (OrderEventService) → Event Emitted
    ↓ [CloudEvent: order.created]
✅ RabbitMQ (orders.events exchange) → Routed Successfully
    ↓ [Routing Key: order.created matched pattern order.#]
✅ Interop-Layer (EventConsumer) → Consumed from queue
    ↓ [Processing CloudEvent]
✅ OpenHIM Bridge → HTTPS POST with Basic Auth
    ↓ [Endpoint: https://openhim-core:5000/smile-default]
✅ OpenHIM Core → Request Accepted (200 OK)
    ↓
✅ Transaction Logged → Visible in OpenHIM Console
```

**Log Evidence**:

*Orders-Service Logs (09:50:24 UTC)*:
```
[09:50:24 UTC] INFO: Order event emitted successfully
[09:50:24 UTC] INFO: Order created successfully
```

*Interop-Layer Logs (09:50:24 UTC)*:
```
[09:50:24 UTC] INFO: Received message
[09:50:24 UTC] INFO: Processing CloudEvent
[09:50:24 UTC] INFO: Sending CloudEvent to OpenHIM
[09:50:25 UTC] INFO: OpenHIM request successful
[09:50:25 UTC] INFO: CloudEvent successfully forwarded to OpenHIM
```

**OpenHIM Console Verification**:
- ✅ Transaction visible in OpenHIM Console (http://localhost:9000)
- ✅ Correlation ID traceable: `45cc8de7-e88b-4965-a8ed-4072cf2a6665`
- ✅ Request metadata captured correctly
- ✅ CloudEvent format preserved

### Architecture Insights Gained

**OpenHIM Port Configuration** (Standard Setup):
- **Port 8080**: API port (administrative operations)
- **Port 5000**: HTTPS channel port (secured client communication) ✅ **Used**
- **Port 5001**: HTTP channel port (unsecured/internal traffic)

**Best Practice**: Use HTTPS (port 5000) for all client communications, even within Docker network, to maintain consistent security practices.

**Docker Network Communication**:
- Services communicate via Docker DNS hostnames (e.g., `openhim-core`, `rabbitmq`)
- SSL certificates are self-signed in development, requiring bypass configuration
- Same Docker network (`smile-network`) enables seamless inter-container communication

### Recommendations for Future Enhancement

1. **Channel-Specific Routing**:
   - Implement business logic to route different event types to specific OpenHIM channels
   - Example: `health.*` events → `/health-channel`, `order.*` events → `/orders-channel`
   - Update `getEndpointForSource()` method with routing rules

2. **SSL Certificate Management**:
   - Replace self-signed certificates with proper CA-signed certificates for production
   - Remove `rejectUnauthorized: false` configuration
   - Configure OpenHIM with valid SSL certificates

3. **Monitoring & Alerting**:
   - Add metrics for message processing latency
   - Configure alerts for failed OpenHIM requests
   - Implement dead letter queue monitoring

4. **Integration Testing**:
   - Automate this validation flow as integration tests
   - Add test coverage for edge cases (network failures, authentication errors)
   - Implement E2E test suite with test data generation

5. **Mediator Development**:
   - Develop custom mediators for data transformation (CloudEvents → HL7/FHIR)
   - Configure mediator registration with OpenHIM
   - Implement mediator-specific routing based on event content

### Conclusion

**Status**: ✅ **COMPLETE & VALIDATED**

The complete end-to-end integration from Orders API through to OpenHIM transaction logging is now **fully functional**. All components are working together seamlessly:

- Event-driven architecture with RabbitMQ
- CloudEvents specification compliance
- OpenHIM integration with proper authentication
- Transaction logging and traceability
- Docker containerized deployment

**Next Steps**: Commit working implementation and proceed with production-readiness improvements (SSL certificates, integration tests, monitoring).
