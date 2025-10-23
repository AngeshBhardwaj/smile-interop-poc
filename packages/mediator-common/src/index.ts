/**
 * @smile/mediator-common - Shared utilities for OpenHIM mediator services
 */

// Utils exports
export { getLogger, logger, LogLevel } from './utils/logger';
export {
  applyMappings,
  extractValue,
  setValue,
  applyTransformation,
  validateMapping,
  type MappingResult,
} from './utils/mapper';
export {
  registerWithOpenHIM,
  unregisterFromOpenHIM,
  type OpenHIMConfig,
  type MediatorConfig,
} from './utils/registration';
export { createDefaultChannels } from './utils/channel-manager';

// Validators exports
export {
  validateCloudEvent,
  assertCloudEvent,
  isCloudEvent,
} from './validators/cloudevents.validator';
export {
  validateSchema,
  getValidator,
  resetValidator,
  JsonSchemaValidator,
  type ValidationResult,
  type ValidationError,
} from './validators/json-schema.validator';

// Rules exports
export {
  loadRules,
  loadRuleByName,
} from './rules/rule-loader';
export {
  getRules,
  findRuleByEventType,
  findRuleByName,
  matchRule,
  clearRuleCache,
  getCacheStats,
} from './rules/rule-engine';
export type {
  TransformationRule,
  FieldMapping,
  TransformFunction,
  RuleLoadResult,
  RuleMatchResult,
  RuleCacheEntry,
} from './rules/types';

// Config types exports
export type {
  CloudEvent,
  CloudEventData,
  TransformationTarget,
} from './config/types';
