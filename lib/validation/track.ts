import { z } from 'zod';

export const TRACK_EVENTS = ['view', 'download', 'icon_export', 'remix', 'setup_complete'] as const;
export const trackEventSchema = z.enum(TRACK_EVENTS);
export const trackInputSchema = z.strictObject({
  themeId: z.uuid().length(36).toLowerCase(),
  event: trackEventSchema,
});
export type TrackEvent = z.infer<typeof trackEventSchema>;
export type TrackInput = z.infer<typeof trackInputSchema>;
