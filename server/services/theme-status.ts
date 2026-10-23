import 'server-only';

import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index';
import { themes } from '../../db/schema/themes';
import { tags, themeTags } from '../../db/schema/taxonomy';
import { auditLog } from '../../db/schema/system';
import { creatorProfiles } from '../../db/schema/moderation';
import {
  actorSchema,
  rejectionReasonSchema,
  themeStatusSchema,
  themeIdSchema,
  transitionThemeSchema,
  TRANSITIONS,
} from '../../lib/theme-status';
import type {
  Actor,
  ThemeStatus,
  ThemeTransitionData,
  TransitionTheme,
} from '../../lib/theme-status';
import { themeSpecSchema } from '../../lib/render/spec';
import { AppError } from '../errors';
import { getThemeCacheTags } from './theme-cache-tags';

export { TRANSITIONS, getThemeCacheTags };
type TransitionStatement = ReturnType<typeof db.execute<ThemeTransitionData>>;

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError('VALIDATION', 'Invalid theme transition input');
  return result.data;
}

function isAdmin(actor: Actor): boolean {
  return actor.kind === 'system' || actor.role === 'admin';
}

/** Capability candidates only; assertTransition additionally checks the actual owner and source. */
export function allowedTransitions(status: ThemeStatus, actor: Actor): ThemeStatus[] {
  const from = parse(themeStatusSchema, status);
  const principal = parse(actorSchema, actor);
  return TRANSITIONS.filter(
    (rule) =>
      rule.from === from &&
      (rule.permission === 'admin'
        ? isAdmin(principal)
        : principal.kind === 'user' && (rule.permission === 'owner' || principal.isCreator)),
  ).map((rule) => rule.to);
}

export function assertTransition(
  theme: TransitionTheme,
  to: ThemeStatus,
  actor: Actor,
  reason?: string,
): void {
  const current = parse(transitionThemeSchema, theme);
  const target = parse(themeStatusSchema, to);
  const principal = parse(actorSchema, actor);
  const rule = TRANSITIONS.find((edge) => edge.from === current.status && edge.to === target);
  if (!rule) throw new AppError('INVALID_STATE', 'This theme status transition is not permitted');
  const owner = principal.kind === 'user' && principal.userId === current.ownerId;
  if (
    rule.permission === 'admin'
      ? !isAdmin(principal)
      : !owner ||
        (rule.permission === 'ownerCreator' && (principal.kind !== 'user' || !principal.isCreator))
  ) {
    throw new AppError('FORBIDDEN', 'The actor cannot make this theme transition');
  }
  if (
    current.status === 'draft' &&
    target === 'approved' &&
    current.source !== 'generated' &&
    current.source !== 'admin'
  ) {
    throw new AppError('INVALID_STATE', 'Only generated or admin drafts may bypass review');
  }
  if (reason !== undefined) parse(rejectionReasonSchema, reason);
  if (target === 'rejected' && reason === undefined)
    throw new AppError('VALIDATION', 'Rejection requires a reason');
  if (target === 'pending_review') {
    parse(themeSpecSchema, current.spec);
    parse(z.string().trim().min(1).max(60), current.nameEn);
    if (!current.aestheticTagCount)
      throw new AppError('VALIDATION', 'Submission requires an aesthetic tag');
  }
}

export function transitionStatements(
  theme: TransitionTheme,
  to: ThemeStatus,
  actor: Actor,
  reason?: string,
): readonly [TransitionStatement] {
  assertTransition(theme, to, actor, reason);
  if (to === 'published')
    throw new AppError('INVALID_STATE', 'Publication must use the publish service');
  const current = parse(transitionThemeSchema, theme);
  const principal = parse(actorSchema, actor);
  const sanitizedReason = reason === undefined ? undefined : parse(rejectionReasonSchema, reason);
  const reviewed = current.status === 'pending_review' && (to === 'approved' || to === 'rejected');
  const actorId = principal.kind === 'user' ? principal.userId : null;
  const meta = {
    before: { status: current.status },
    after: { status: to },
    ...(principal.kind === 'system' ? { actor: { kind: 'system', label: principal.label } } : {}),
    ...(sanitizedReason ? { reason: sanitizedReason } : {}),
  };
  const submission =
    to === 'pending_review'
      ? sql`
    AND ${themes.nameEn} = ${current.nameEn}
    AND EXISTS (SELECT 1 FROM ${themeTags} INNER JOIN ${tags} ON ${themeTags.tagId} = ${tags.id}
      WHERE ${themeTags.themeId} = ${themes.id} AND ${tags.kind} = 'aesthetic')
    AND EXISTS (SELECT 1 FROM ${creatorProfiles} WHERE ${creatorProfiles.userId} = ${themes.ownerId} AND ${creatorProfiles.status} = 'approved')
  `
      : sql``;
  const statement = sql`
    WITH changed AS (
      UPDATE ${themes} SET
        status = ${to}::theme_status,
        submitted_at = ${to === 'pending_review' ? sql`now()` : current.status === 'pending_review' && to === 'draft' ? sql`NULL` : themes.submittedAt},
        reviewed_at = ${reviewed ? sql`now()` : themes.reviewedAt},
        reviewed_by = ${reviewed ? sql`${actorId}` : themes.reviewedBy},
        rejection_reason = ${to === 'rejected' ? sql`${sanitizedReason}` : current.status === 'rejected' && to === 'draft' ? sql`NULL` : themes.rejectionReason},
        updated_at = now()
      WHERE ${themes.id} = ${current.id}::uuid
        AND ${themes.status} = ${current.status}::theme_status
        AND ${themes.assetVersion} = ${current.assetVersion}
        AND ${themes.specHash} = ${current.specHash}
        AND ${themes.source} = ${current.source}::theme_source
        AND ${themes.ownerId} IS NOT DISTINCT FROM ${current.ownerId}
        ${submission}
      RETURNING ${themes.id}, ${themes.status}
    ), audited AS (
      INSERT INTO ${auditLog} (actor_id, action, entity_type, entity_id, meta)
      SELECT ${actorId}, ${`theme.status.${to}`}, 'theme', changed.id::text, ${JSON.stringify(meta)}::jsonb FROM changed
      RETURNING entity_id
    )
    SELECT changed.id::text AS id, changed.status::text AS status FROM changed
    INNER JOIN audited ON audited.entity_id = changed.id::text
  `;
  return [db.execute<ThemeTransitionData>(statement)];
}

const transitionInputSchema = z.strictObject({
  themeId: themeIdSchema,
  to: themeStatusSchema,
  actor: actorSchema,
  reason: z.string().optional(),
});

export async function transitionThemeStatus(input: {
  themeId: string;
  to: ThemeStatus;
  actor: Actor;
  reason?: string;
}): Promise<{ data: ThemeTransitionData; tags: string[] }> {
  const value = parse(transitionInputSchema, input);
  if (value.to === 'published')
    throw new AppError('INVALID_STATE', 'Publication must use the publish service');
  const [theme] = await db.select().from(themes).where(eq(themes.id, value.themeId));
  if (!theme) throw new AppError('NOT_FOUND', 'The theme does not exist');
  let aestheticTagCount = 0;
  if (value.to === 'pending_review') {
    const aesthetics = await db
      .select({ id: tags.id })
      .from(themeTags)
      .innerJoin(tags, eq(themeTags.tagId, tags.id))
      .where(sql`${themeTags.themeId} = ${theme.id}::uuid AND ${tags.kind} = 'aesthetic'`);
    aestheticTagCount = aesthetics.length;
  }
  const snapshot: TransitionTheme = { ...theme, aestheticTagCount };
  assertTransition(snapshot, value.to, value.actor, value.reason);
  const invalidation = theme.status === 'published' ? await getThemeCacheTags(theme) : [];
  const [result] = await db.batch(
    transitionStatements(snapshot, value.to, value.actor, value.reason),
  );
  const rows = z
    .array(z.object({ id: themeIdSchema, status: themeStatusSchema }))
    .parse(result.rows);
  if (rows.length !== 1 || !rows[0])
    throw new AppError('CONFLICT', 'The theme changed before the transition completed');
  return { data: rows[0], tags: invalidation };
}
