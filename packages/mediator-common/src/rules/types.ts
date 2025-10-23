/**
 * Transformation rule types and schemas
 */

import { TransformationTarget } from '../config/types';

/**
 * Transformation function types
 */
export type TransformFunction =
  | 'toUpperCase'
  | 'toLowerCase'
  | 'trim'
  | 'formatDate'
  | 'mapGender'
  | 'generateUUID'
  | 'toString'
  | 'toNumber'
  | 'toBoolean';

/**
 * Field mapping definition
 */
export interface FieldMapping {
  /** JSONPath expression to extract value from CloudEvent */
  source: string;

  /** JSONPath expression for target field in output */
  target: string;

  /** Optional transformation function to apply */
  transform?: TransformFunction;

  /** Default value if source is not found */
  defaultValue?: any;

  /** Whether this field is required (fail if missing) */
  required?: boolean;

  /** Description of this mapping */
  description?: string;
}

/**
 * Transformation rule definition
 */
export interface TransformationRule {
  /** Unique rule name */
  name: string;

  /** Human-readable description */
  description: string;

  /** CloudEvent type this rule applies to (e.g., 'health.patient.registered') */
  eventType: string;

  /** Target transformation format */
  targetFormat: TransformationTarget;

  /** Whether this rule is enabled */
  enabled: boolean;

  /** Array of field mappings */
  mappings: FieldMapping[];

  /** Optional JSON Schema file path for output validation */
  outputSchema?: string;

  /** Optional default destination URL */
  destination?: string;

  /** Rule metadata */
  metadata?: {
    version?: string;
    author?: string;
    created?: string;
    modified?: string;
    tags?: string[];
  };
}

/**
 * Rule cache entry
 */
export interface RuleCacheEntry {
  rule: TransformationRule;
  loadedAt: number;
  filePath: string;
}

/**
 * Rule loading result
 */
export interface RuleLoadResult {
  success: boolean;
  rules?: TransformationRule[];
  errors?: string[];
}

/**
 * Rule match result
 */
export interface RuleMatchResult {
  matched: boolean;
  rule?: TransformationRule;
  error?: string;
}
