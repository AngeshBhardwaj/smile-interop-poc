/**
 * Rule engine - Matches and applies transformation rules
 */

import { TransformationRule, RuleCacheEntry, RuleMatchResult } from './types';
import { loadRules, loadRuleByName } from './rule-loader';
import { config } from '../config';
import { CloudEvent } from '../config/types';

/**
 * Rule cache (in-memory)
 */
const ruleCache: Map<string, RuleCacheEntry> = new Map();
let lastCacheRefresh: number = 0;

/**
 * Get all rules (with caching)
 */
export function getRules(forceReload = false): TransformationRule[] {
  const now = Date.now();
  const cacheTTL = config.transformation.cacheTTL * 1000; // Convert to milliseconds

  // Check if cache is valid
  if (
    !forceReload &&
    config.transformation.enableCaching &&
    ruleCache.size > 0 &&
    now - lastCacheRefresh < cacheTTL
  ) {
    // Return cached rules
    return Array.from(ruleCache.values()).map((entry) => entry.rule);
  }

  // Load rules from files
  const result = loadRules();

  if (!result.success || !result.rules) {
    // If loading failed, return cached rules if available
    if (ruleCache.size > 0) {
      return Array.from(ruleCache.values()).map((entry) => entry.rule);
    }
    return [];
  }

  // Update cache
  ruleCache.clear();
  for (const rule of result.rules) {
    ruleCache.set(rule.name, {
      rule,
      loadedAt: now,
      filePath: '', // We don't track file path in current implementation
    });
  }
  lastCacheRefresh = now;

  return result.rules;
}

/**
 * Find a rule by event type
 */
export function findRuleByEventType(eventType: string): RuleMatchResult {
  const rules = getRules();

  // Find enabled rules matching the event type
  const matchingRules = rules.filter(
    (rule) => rule.enabled && rule.eventType === eventType
  );

  if (matchingRules.length === 0) {
    return {
      matched: false,
      error: `No enabled rule found for event type: ${eventType}`,
    };
  }

  if (matchingRules.length > 1) {
    // If multiple rules match, use the first one
    // TODO: Add priority system in future
    return {
      matched: true,
      rule: matchingRules[0],
    };
  }

  return {
    matched: true,
    rule: matchingRules[0],
  };
}

/**
 * Find a rule by name
 */
export function findRuleByName(ruleName: string): RuleMatchResult {
  const rules = getRules();

  const rule = rules.find((r) => r.name === ruleName);

  if (!rule) {
    return {
      matched: false,
      error: `Rule not found: ${ruleName}`,
    };
  }

  if (!rule.enabled) {
    return {
      matched: false,
      error: `Rule is disabled: ${ruleName}`,
    };
  }

  return {
    matched: true,
    rule,
  };
}

/**
 * Match a rule for a CloudEvent
 * Tries exact match by rule name if provided, otherwise matches by event type
 */
export function matchRule(
  cloudEvent: CloudEvent,
  ruleName?: string
): RuleMatchResult {
  if (ruleName) {
    return findRuleByName(ruleName);
  }

  return findRuleByEventType(cloudEvent.type);
}

/**
 * Clear the rule cache (useful for testing or hot-reload)
 */
export function clearRuleCache(): void {
  ruleCache.clear();
  lastCacheRefresh = 0;
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  cachedRules: number;
  lastRefresh: number;
  cacheAge: number;
} {
  return {
    cachedRules: ruleCache.size,
    lastRefresh: lastCacheRefresh,
    cacheAge: Date.now() - lastCacheRefresh,
  };
}
