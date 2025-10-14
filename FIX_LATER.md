# Issues to Fix Later

## Health Service - Test Mocks Missing `maskObject`

**Priority**: Medium
**Type**: Test Issue (Not Core Functionality)

### Description
The Health Service unit tests are failing because the mock for `@smile/common` package is missing the `maskObject` export.

### Location
- File: `apps/health-service/src/services/__tests__/health-event.service.test.ts`
- Lines: 8-31 (mock definition)

### Issue
The mock includes `dataMasking`, `auditLogger`, `logger`, etc., but does NOT include `maskObject` which is imported and used by the service.

### Fix Required
Add `maskObject` to the mock:

```typescript
jest.mock('@smile/common', () => ({
  // ... existing mocks ...
  maskObject: jest.fn((obj, mapping) => {
    const masked = { ...obj };
    for (const [field, fieldType] of Object.entries(mapping)) {
      if (obj[field] && typeof obj[field] === 'string') {
        masked[field] = `masked_${obj[field]}`;
      }
    }
    return masked;
  }),
}));
```

### Impact
- **Runtime**: None - the actual service works correctly
- **Tests**: 4 test cases fail due to missing mock
- **Build**: Service builds successfully
- **Deployment**: No impact

### Verification
After fix, run: `cd apps/health-service && pnpm test`

---
