/**
 * Rule loader - Loads transformation rules from JSON files
 */

import * as fs from 'fs';
import * as path from 'path';
import { TransformationRule, RuleLoadResult } from './types';
import { config } from '../config';

/**
 * Load all transformation rules from the rules directory
 */
export function loadRules(): RuleLoadResult {
  const errors: string[] = [];
  const rules: TransformationRule[] = [];

  try {
    const rulesDir = config.transformation.rulesDirectory;

    // Check if rules directory exists
    if (!fs.existsSync(rulesDir)) {
      return {
        success: false,
        errors: [`Rules directory not found: ${rulesDir}`],
      };
    }

    // Load rules from custom directory
    const customDir = path.join(rulesDir, 'custom');
    if (fs.existsSync(customDir)) {
      const customRules = loadRulesFromDirectory(customDir);
      rules.push(...customRules.rules);
      errors.push(...customRules.errors);
    }

    // TODO: Load HL7 rules when implemented
    // TODO: Load FHIR rules when implemented

    return {
      success: errors.length === 0,
      rules,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error: any) {
    return {
      success: false,
      errors: [`Failed to load rules: ${error.message}`],
    };
  }
}

/**
 * Load rules from a specific directory
 */
function loadRulesFromDirectory(directory: string): {
  rules: TransformationRule[];
  errors: string[];
} {
  const rules: TransformationRule[] = [];
  const errors: string[] = [];

  try {
    const files = fs.readdirSync(directory);

    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }

      const filePath = path.join(directory, file);

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const rule = JSON.parse(content) as TransformationRule;

        // Validate rule structure
        const validation = validateRule(rule);
        if (!validation.valid) {
          errors.push(`Invalid rule in ${file}: ${validation.error}`);
          continue;
        }

        rules.push(rule);
      } catch (error: any) {
        errors.push(`Failed to load ${file}: ${error.message}`);
      }
    }
  } catch (error: any) {
    errors.push(`Failed to read directory ${directory}: ${error.message}`);
  }

  return { rules, errors };
}

/**
 * Validate rule structure
 */
function validateRule(rule: any): { valid: boolean; error?: string } {
  if (!rule.name) {
    return { valid: false, error: 'Missing required field: name' };
  }

  if (!rule.eventType) {
    return { valid: false, error: 'Missing required field: eventType' };
  }

  if (!rule.targetFormat) {
    return { valid: false, error: 'Missing required field: targetFormat' };
  }

  if (!Array.isArray(rule.mappings)) {
    return { valid: false, error: 'Missing or invalid field: mappings (must be array)' };
  }

  if (rule.mappings.length === 0) {
    return { valid: false, error: 'mappings array cannot be empty' };
  }

  // Validate each mapping
  for (let i = 0; i < rule.mappings.length; i++) {
    const mapping = rule.mappings[i];

    if (!mapping.source) {
      return { valid: false, error: `Mapping ${i}: Missing required field: source` };
    }

    if (!mapping.target) {
      return { valid: false, error: `Mapping ${i}: Missing required field: target` };
    }
  }

  return { valid: true };
}

/**
 * Load a specific rule by name
 */
export function loadRuleByName(ruleName: string): TransformationRule | null {
  const result = loadRules();

  if (!result.success || !result.rules) {
    return null;
  }

  return result.rules.find((rule) => rule.name === ruleName) || null;
}
