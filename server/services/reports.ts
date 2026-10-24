import 'server-only';

import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { dbPool } from '../../db/pool';
import { user } from '../../db/schema/auth';
import { reports } from '../../db/schema/moderation';
import { themes } from '../../db/schema/themes';
import {
  reportDataSchema,
  reportReporterSchema,
  submitReportSchema,
} from '../../lib/validation/reports';
import type { ReportData, ReportReporter, SubmitReportInput } from '../../lib/validation/reports';
import { AppError } from '../errors';

export async function submitReport(
  input: SubmitReportInput,
  reporter: ReportReporter,
): Promise<{ data: ReportData; tags: string[] }> {
  const parsed = submitReportSchema.safeParse(input);
  const identity = reportReporterSchema.safeParse(reporter);
  if (!parsed.success || !identity.success) throw new AppError('VALIDATION', 'Invalid report');
  const value = parsed.data;
  const principal = identity.data;
  const identityKey = principal.kind === 'user' ? principal.userId : principal.ipHash;

  return dbPool.transaction(
    async (tx) => {
      // A per-reporter/theme lock makes check-and-insert atomic without a schema change.
      // Resolved/dismissed reports remain history and do not prevent a new report.
      const lockKey = JSON.stringify([
        'vibeset:report',
        value.themeId,
        principal.kind,
        identityKey,
      ]);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
      if (principal.kind === 'user') {
        const [account] = await tx
          .select({ id: user.id, banned: user.banned })
          .from(user)
          .where(eq(user.id, principal.userId))
          .for('share');
        if (!account) throw new AppError('UNAUTHENTICATED');
        if (account.banned) throw new AppError('FORBIDDEN');
      }
      const [theme] = await tx
        .select({ id: themes.id })
        .from(themes)
        .where(and(eq(themes.id, value.themeId), eq(themes.status, 'published')))
        .for('share');
      if (!theme) throw new AppError('NOT_FOUND');

      const reporterPredicate =
        principal.kind === 'user'
          ? eq(reports.reporterId, principal.userId)
          : and(isNull(reports.reporterId), eq(reports.reporterIpHash, principal.ipHash));
      const [existing] = await tx
        .select({ id: reports.id })
        .from(reports)
        .where(
          and(eq(reports.themeId, value.themeId), eq(reports.status, 'open'), reporterPredicate),
        )
        .orderBy(asc(reports.createdAt), asc(reports.id))
        .limit(1);
      if (existing) return { data: reportDataSchema.parse(existing), tags: [] };

      const [created] = await tx
        .insert(reports)
        .values({
          themeId: value.themeId,
          reason: value.reason,
          details: value.details ?? null,
          reporterId: principal.kind === 'user' ? principal.userId : null,
          reporterIpHash: principal.kind === 'visitor' ? principal.ipHash : null,
        })
        .returning({ id: reports.id });
      if (!created) throw new AppError('INTERNAL', 'Report was not created');
      return { data: reportDataSchema.parse(created), tags: [] };
    },
    { isolationLevel: 'read committed' },
  );
}
