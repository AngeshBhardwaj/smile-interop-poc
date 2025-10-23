/**
 * CloudEvents 1.0 validator using Joi
 */

import Joi from 'joi';
import { CloudEvent } from '../config/types';

/**
 * CloudEvents 1.0 schema
 * @see https://cloudevents.io/
 */
const cloudEventSchema = Joi.object({
  specversion: Joi.string().valid('1.0').required().description('CloudEvents version'),
  type: Joi.string().required().description('Event type identifier'),
  source: Joi.string().uri().required().description('Event source identifier'),
  id: Joi.string().required().description('Unique event identifier'),
  time: Joi.string().isoDate().optional().description('Event timestamp (ISO 8601)'),
  datacontenttype: Joi.string().optional().description('Content type of the data'),
  subject: Joi.string().optional().description('Subject of the event'),
  data: Joi.any().optional().description('Event payload'),
}).unknown(true); // Allow extension attributes

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  value?: CloudEvent;
}

/**
 * Validate a CloudEvent object
 */
export function validateCloudEvent(event: any): ValidationResult {
  const { error, value } = cloudEventSchema.validate(event, {
    abortEarly: false,
    stripUnknown: false, // Keep extension attributes
  });

  if (error) {
    return {
      valid: false,
      errors: error.details.map((detail: any) => detail.message),
    };
  }

  return {
    valid: true,
    value: value as CloudEvent,
  };
}

/**
 * Assert that an object is a valid CloudEvent (throws on failure)
 */
export function assertCloudEvent(event: any): asserts event is CloudEvent {
  const result = validateCloudEvent(event);
  if (!result.valid) {
    throw new Error(`Invalid CloudEvent: ${result.errors?.join(', ')}`);
  }
}

/**
 * Check if an object is a CloudEvent
 */
export function isCloudEvent(event: any): event is CloudEvent {
  return validateCloudEvent(event).valid;
}
