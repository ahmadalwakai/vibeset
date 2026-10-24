import 'server-only';

import { eq } from 'drizzle-orm';
import { dbPool } from '../../db/pool';
import { user } from '../../db/schema/auth';
import { reports } from '../../db/schema/moderation';
import { themes } from '../../db/schema/themes';
import type { ModerationResult } from '../../lib/admin-moderation';
import { rejectionReasonSchema, type Actor } from '../../lib/theme-status';
import { adminResolveReportSchema } from '../../lib/validation/admin-moderation';
import { auditInsert } from '../audit';
import { AppError } from '../errors';
import { requireAdminPrincipal } from './admin-access';
import { archiveThemeRows, moderationLock } from './moderation';
import { banUserInTransaction } from './users';

export async function resolveReport(
  input: unknown,
  actor: Actor,
): Promise<{ data: ModerationResult; tags: string[] }> {
  const value = adminResolveReportSchema.safeParse(input);
  if (!value.success) throw new AppError('VALIDATION');
  return dbPool.transaction(async (tx) => {
    await moderationLock(tx);
    const principal = await requireAdminPrincipal(tx, actor);
    const [snapshot] = await tx
      .select({ themeId: reports.themeId, ownerId: themes.ownerId })
      .from(reports)
      .innerJoin(themes, eq(themes.id, reports.themeId))
      .where(eq(reports.id, value.data.id));
    if (!snapshot) throw new AppError('NOT_FOUND');
    // Account deletion and creator mutations lock user before theme/report too.
    const [owner] = snapshot.ownerId
      ? await tx.select().from(user).where(eq(user.id, snapshot.ownerId)).for('update')
      : [];
    const [theme] = await tx
      .select()
      .from(themes)
      .where(eq(themes.id, snapshot.themeId))
      .for('update');
    const [report] = await tx
      .select()
      .from(reports)
      .where(eq(reports.id, value.data.id))
      .for('update');
    if (!theme || !report) throw new AppError('NOT_FOUND');
    if (theme.ownerId !== snapshot.ownerId) throw new AppError('CONFLICT');
    if (report.status !== 'open') throw new AppError('INVALID_STATE');
    let sideEffects = { archived: 0, tags: [] as string[] };
    if (value.data.action === 'archive_theme') {
      if (theme.status !== 'published' && theme.status !== 'archived')
        throw new AppError('INVALID_STATE');
      if (theme.status === 'published')
        sideEffects = await archiveThemeRows(tx, [theme], principal);
    } else if (value.data.action === 'ban_owner') {
      if (!owner) throw new AppError('INVALID_STATE', 'This theme has no account owner');
      // Full resolution note remains on the report; the account reason is bounded separately.
      const summary = value.data.note
        .replaceAll('\n', ' ')
        .replaceAll('\t', ' ')
        .slice(0, 500)
        .replace(/[\uD800-\uDBFF]$/u, '');
      const reason = rejectionReasonSchema.safeParse(summary);
      if (!reason.success) throw new AppError('VALIDATION');
      sideEffects = await banUserInTransaction(
        tx,
        owner,
        principal,
        reason.data,
        value.data.archiveThemes,
      );
    }
    const status = value.data.action === 'dismiss' ? 'dismissed' : 'resolved';
    await tx
      .update(reports)
      .set({
        status,
        resolutionNote: value.data.note,
        resolvedBy: principal.userId,
        resolvedAt: new Date(),
      })
      .where(eq(reports.id, report.id));
    await tx.execute(
      auditInsert({
        actorId: principal.userId,
        action: `report.${status}`,
        entityType: 'report',
        entityId: report.id,
        meta: {
          action: value.data.action,
          themeId: theme.id,
          note: value.data.note,
          archived: sideEffects.archived,
        },
      }),
    );
    return { data: { ok: true as const, archived: sideEffects.archived }, tags: sideEffects.tags };
  });
}
