# Phase 3b: Transformation Mediator - Implementation Plan (Custom JSON First)

## Overview

Implement an OpenHIM transformation mediator that transforms CloudEvents to custom JSON formats using file-based transformation rules. This phase focuses on getting the core architecture and E2E flow working with custom transformations, with placeholders for future HL7 v2 and FHIR R4 support.

## Strategy

**Phase 3b-Part 1** (This implementation):
- ✅ Custom JSON transformations with file-based rules
- ✅ Full E2E flow validation
- 📦 Placeholder structure for HL7 and FHIR

**Phase 3b-Part 2** (Future):
- HL7 v2 transformation implementation
- FHIR R4 transformation implementation

## Objectives

1. ✅ Transform CloudEvents to custom JSON formats
2. ✅ File-based transformation rules (hot-reload on restart)
3. ✅ Support JSONPath-based field mapping
4. ✅ Validate output against JSON Schema
5. ✅ Full OpenHIM integration with mediator response
6. ✅ Comprehensive error handling and logging
7. ✅ Achieve 80%+ test coverage
8. 📦 Create placeholder structure for HL7/FHIR

## Time Estimate

**Total: ~12 hours** for Phase 3b-Part 1 (Custom JSON transformations)

See detailed breakdown in the implementation steps section below.

## Let's Get Started!

Ready to build the transformation mediator! This is going to be a comprehensive implementation that sets up the foundation for all future transformations. 🚀

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                     OpenHIM Core (Port 5000)                   │
└────────────────────────────────────────────────────────────────┘
                              │
                              ↓
              ┌───────────────────────────────┐
              │  /transform Channel            │
              │  Auth: smile-poc              │
              └───────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│            Transformation Mediator (Port 3101)                  │
├─────────────────────────────────────────────────────────────────┤
│  1. Validate CloudEvent                                         │
│  2. Load transformation rules from file                         │
│  3. Match rule by event type                                    │
│  4. Apply JSONPath mappings                                     │
│  5. Validate output (JSON Schema)                               │
│  6. Forward to destination                                      │
│  7. Return OpenHIM mediator response                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
                      ┌──────────────┐
                      │   Custom     │
                      │   Webhook    │
                      └──────────────┘
```

## Project Structure

```
apps/mediator-services/transformation-mediator/
├── src/
│   ├── config/
│   │   ├── index.ts                    # Configuration loader
│   │   ├── openhim.config.ts          # OpenHIM mediator config
│   │   └── types.ts                   # TypeScript interfaces
│   ├── routes/
│   │   └── transform.routes.ts        # POST /transform endpoint
│   ├── services/
│   │   ├── transformer.service.ts     # Main transformation orchestrator
│   │   ├── custom-transformer.ts      # ✅ Custom JSON transformations
│   │   ├── hl7-transformer.ts         # 📦 PLACEHOLDER for HL7
│   │   └── fhir-transformer.ts        # 📦 PLACEHOLDER for FHIR
│   ├── validators/
│   │   ├── cloudevents.validator.ts   # CloudEvent validation
│   │   └── json-schema.validator.ts   # JSON Schema validation
│   ├── rules/
│   │   ├── rule-loader.ts             # Load rules from files
│   │   ├── rule-engine.ts             # Match and apply rules
│   │   └── types.ts                   # Rule type definitions
│   ├── utils/
│   │   ├── logger.ts                  # Pino logger
│   │   ├── registration.ts            # OpenHIM registration
│   │   ├── mapper.ts                  # JSONPath field mapping
│   │   └── forwarder.ts               # Forward to destination
│   ├── __tests__/
│   │   ├── config.test.ts
│   │   ├── transformer.service.test.ts
│   │   ├── custom-transformer.test.ts
│   │   ├── rule-loader.test.ts
│   │   ├── rule-engine.test.ts
│   │   ├── mapper.test.ts
│   │   ├── transform.routes.test.ts
│   │   └── validators.test.ts
│   └── index.ts
├── transformation-rules/              # External transformation rules
│   ├── custom/
│   │   ├── patient-registered.json   # ✅ Patient registration rule
│   │   ├── patient-updated.json      # ✅ Patient update rule
│   │   └── order-created.json        # ✅ Order creation rule
│   ├── hl7/                          # 📦 PLACEHOLDER
│   │   └── README.md                 # Future implementation notes
│   └── fhir/                         # 📦 PLACEHOLDER
│       └── README.md                 # Future implementation notes
├── schemas/                          # JSON Schema definitions
│   ├── patient-output.schema.json
│   └── order-output.schema.json
├── Dockerfile
├── .dockerignore
├── .env.example
├── .env.test
├── mediatorConfig.json
├── package.json
├── tsconfig.json
├── jest.config.js
├── .eslintrc.js
└── README.md
```

## Implementation Steps Summary

| Step | Task | Time | Priority |
|------|------|------|----------|
| 1 | Project Setup | 30 min | HIGH |
| 2 | Configuration & Types | 45 min | HIGH |
| 3 | Rule System | 1.5 hours | HIGH |
| 4 | JSONPath Mapper | 1 hour | HIGH |
| 5 | Custom Transformer | 1 hour | HIGH |
| 6 | JSON Schema Validation | 45 min | HIGH |
| 7 | Transformation Service | 1 hour | HIGH |
| 8 | HTTP Routes | 1 hour | HIGH |
| 9 | HL7/FHIR Placeholders | 15 min | MEDIUM |
| 10 | OpenHIM Integration | 45 min | HIGH |
| 11 | Docker Setup | 45 min | HIGH |
| 12 | Documentation | 1 hour | MEDIUM |
| 13 | Testing & Validation | 1.5 hours | HIGH |

**Total: ~12 hours**

## Success Criteria Checklist

- [ ] Mediator successfully registers with OpenHIM
- [ ] Loads transformation rules from files on startup
- [ ] Transforms health.patient.registered using custom rule
- [ ] Validates output against JSON Schema
- [ ] Forwards transformed data to webhook
- [ ] Returns proper OpenHIM mediator response with orchestrations
- [ ] All tests pass with 80%+ coverage
- [ ] Docker deployment successful
- [ ] E2E flow working through OpenHIM
- [ ] Transaction visible in OpenHIM Console
- [ ] Documentation complete with rule examples
- [ ] Placeholder structure ready for HL7/FHIR

## Next Phase

**Phase 3b-Part 2**: HL7 v2 and FHIR R4 Transformations (6-8 hours additional)

---

**Ready to start? Let's begin with Step 1: Project Setup!** 🚀
