/**
 * RouteMatchEngine
 *
 * Handles pattern matching and route selection for CloudEvents with:
 * - Wildcard pattern matching (*, ?)
 * - Source and type matching
 * - Content-based condition evaluation
 * - Priority-based route selection
 */

import { logger } from '@smile/common';
import { RouteDefinition, RouteCondition, RouteMatchResult } from '../messaging/types';

/**
 * Route matching engine
 */
export class RouteMatchEngine {
  /**
   * Match a string against a pattern with wildcard support
   *
   * @param value - The value to match
   * @param pattern - The pattern (supports * wildcard)
   * @returns Whether the value matches the pattern
   */
  public matchPattern(value: string, pattern: string): boolean {
    // Exact match
    if (pattern === value) {
      return true;
    }

    // Wildcard match
    if (pattern === '*') {
      return true;
    }

    // Convert pattern to regex
    // Escape special regex characters except *
    const regexPattern = pattern
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(value);
  }

  /**
   * Check if an event matches a route
   *
   * @param event - The CloudEvent
   * @param route - The route definition
   * @returns Whether the event matches the route
   */
  public matchRoute(event: any, route: RouteDefinition): boolean {
    // Skip disabled routes
    if (!route.enabled) {
      return false;
    }

    // Match source
    if (!this.matchPattern(event.source, route.source)) {
      return false;
    }

    // Match type
    if (!this.matchPattern(event.type, route.type)) {
      return false;
    }

    // Evaluate content-based condition if present
    if (route.condition) {
      if (!this.evaluateCondition(event, route.condition)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate a content-based routing condition
   *
   * @param event - The CloudEvent
   * @param condition - The condition to evaluate
   * @returns Whether the condition is met
   */
  public evaluateCondition(event: any, condition: RouteCondition): boolean {
    const value = this.getFieldValue(event, condition.field);

    if (value === undefined || value === null) {
      return false;
    }

    switch (condition.operator) {
      case 'equals':
        return value === condition.value;

      case 'notEquals':
        return value !== condition.value;

      case 'greaterThan':
        return typeof value === 'number' && value > condition.value;

      case 'lessThan':
        return typeof value === 'number' && value < condition.value;

      case 'contains':
        if (Array.isArray(value)) {
          return value.includes(condition.value);
        }
        if (typeof value === 'string') {
          return value.includes(condition.value);
        }
        return false;

      case 'regex':
        if (typeof value === 'string') {
          const regex = new RegExp(condition.value);
          return regex.test(value);
        }
        return false;

      default:
        logger.warn('Unknown condition operator', { operator: condition.operator });
        return false;
    }
  }

  /**
   * Get a field value from an object using dot notation
   *
   * @param obj - The object
   * @param path - The field path (e.g., "data.eventData.priority")
   * @returns The field value or undefined
   */
  private getFieldValue(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === undefined || current === null) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * Find the best matching route for an event
   *
   * @param event - The CloudEvent
   * @param routes - Available routes
   * @returns Match result with the best route or no match
   */
  public findMatchingRoute(event: any, routes: RouteDefinition[]): RouteMatchResult {
    // Sort routes by priority (highest first)
    const sortedRoutes = this.sortRoutesByPriority(routes);

    // Find first matching route
    for (const route of sortedRoutes) {
      if (this.matchRoute(event, route)) {
        logger.debug('Route matched', {
          eventType: event.type,
          eventSource: event.source,
          routeName: route.name,
          routePriority: route.priority,
        });

        return {
          matched: true,
          route,
        };
      }
    }

    // No match found
    logger.warn('No matching route found', {
      eventType: event.type,
      eventSource: event.source,
    });

    return {
      matched: false,
      reason: `No enabled route matches event type '${event.type}' from source '${event.source}'`,
    };
  }

  /**
   * Sort routes by priority (descending)
   *
   * @param routes - Routes to sort
   * @returns Sorted routes
   */
  public sortRoutesByPriority(routes: RouteDefinition[]): RouteDefinition[] {
    return [...routes].sort((a, b) => b.priority - a.priority);
  }
}
