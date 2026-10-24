import { z } from 'zod';
import { themeIdSchema } from '../theme-status';

export const REPORT_REASONS = ['copyright', 'inappropriate', 'broken', 'spam', 'other'] as const;
export const reportReasonSchema = z.enum(REPORT_REASONS);
export const reportDetailsSchema = z
  .string()
  .max(1_000)
  .normalize()
  .trim()
  .max(1_000)
  .refine(
    (value) =>
      !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value),
  )
  .transform((value) => value || undefined);

export const submitReportSchema = z.strictObject({
  themeId: themeIdSchema,
  reason: reportReasonSchema,
  details: reportDetailsSchema.optional(),
});
export const reportDataSchema = z.strictObject({ id: themeIdSchema });

/** Identity comes only from the guarded action context, never from form input. */
export const reportReporterSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('user'),
    userId: z
      .string()
      .trim()
      .min(1)
      .max(256)
      .regex(/^[^\s\u0000-\u001f\u007f]+$/),
  }),
  z.strictObject({
    kind: z.literal('visitor'),
    ipHash: z
      .string()
      .length(64)
      .regex(/^[a-f0-9]{64}$/),
  }),
]);

export type ReportReason = z.infer<typeof reportReasonSchema>;
export type SubmitReportInput = z.infer<typeof submitReportSchema>;
export type ReportData = z.infer<typeof reportDataSchema>;
export type ReportReporter = z.infer<typeof reportReporterSchema>;
