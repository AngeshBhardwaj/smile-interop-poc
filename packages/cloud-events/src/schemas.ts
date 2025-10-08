import { z } from 'zod';

export const cloudEventSchema = z.object({
  specversion: z.literal('1.0'),
  type: z.string(),
  source: z.string(),
  id: z.string(),
  time: z.string().datetime(),
  datacontenttype: z.string().optional(),
  subject: z.string().optional(),
  data: z.unknown().optional(),
});

export type CloudEventData = z.infer<typeof cloudEventSchema>;