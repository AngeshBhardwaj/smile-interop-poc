import { z } from 'zod';
import { ValidationError } from './errors';

export const validateData = <T>(schema: z.ZodSchema<T>, data: unknown): T => {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw new ValidationError('Validation failed', {
      errors: result.error.errors,
      data,
    });
  }

  return result.data;
};

export const validateAsync = async <T>(
  schema: z.ZodSchema<T>,
  data: unknown
): Promise<T> => {
  const result = await schema.safeParseAsync(data);

  if (!result.success) {
    throw new ValidationError('Async validation failed', {
      errors: result.error.errors,
      data,
    });
  }

  return result.data;
};

export const createValidator = <T>(schema: z.ZodSchema<T>) => {
  return (data: unknown): T => validateData(schema, data);
};