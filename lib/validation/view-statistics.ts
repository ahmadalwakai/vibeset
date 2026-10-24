import { z } from 'zod';

export const VIEW_STATISTICS_KEY = 'vibeset:view-statistics:v1';
export const MAX_VIEW_STATISTICS_LENGTH = 128;
export const viewStatisticsPreferenceSchema = z.strictObject({
  v: z.literal(1),
  enabled: z.boolean(),
});

export type ViewStatisticsPreference = z.infer<typeof viewStatisticsPreferenceSchema>;
