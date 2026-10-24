import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';
import { dbPool } from '../../db/pool';
import { themes } from '../../db/schema/themes';
import { tags, themeTags } from '../../db/schema/taxonomy';
import { specHash } from '../../lib/render/hash';
import type { Actor, ThemeStatus } from '../../lib/theme-status';
import {
  createCreatorThemeSchema,
  updateCreatorThemeSchema,
  creatorThemeIdSchema,
} from '../../lib/validation/creator';
import type {
  CreateCreatorThemeInput,
  UpdateCreatorThemeInput,
} from '../../lib/validation/creator';
import { auditInsert } from '../audit';
import { AppError } from '../errors';
import {
  authorizeWallpaperPhotos,
  requireCreatorPrincipal,
  type CreatorTransaction,
  type CreatorPrincipal,
} from './creator-access';
import { transitionStatements } from './theme-status';
import { lockTaxonomy } from './taxonomy-lock';

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError('VALIDATION');
  return result.data;
}
async function authorTags(tx: CreatorTransaction, slugs: string[]) {
  if (slugs.length < 1 || slugs.length > 6 || new Set(slugs).size !== slugs.length)
    throw new AppError('VALIDATION', 'Invalid authoring tags');
  const selected = await tx
    .select({
      id: tags.id,
      slug: tags.slug,
      kind: tags.kind,
      nameEn: tags.nameEn,
      nameAr: tags.nameAr,
    })
    .from(tags)
    .where(and(inArray(tags.slug, slugs), eq(tags.isActive, true)))
    .for('share');
  if (
    selected.length !== slugs.length ||
    selected.filter((tag) => tag.kind === 'aesthetic').length !== 1
  )
    throw new AppError(
      'VALIDATION',
      'Choose exactly one active aesthetic and at most five other active tags',
      { tagSlugs: ['invalid'] },
    );
  return selected.sort((a, b) => a.slug.localeCompare(b.slug));
}
async function ownTheme(tx: CreatorTransaction, id: string, ownerId: string) {
  const [row] = await tx
    .select()
    .from(themes)
    .where(
      and(
        eq(themes.id, id),
        eq(themes.ownerId, ownerId),
        inArray(themes.source, ['creator', 'remix']),
      ),
    )
    .for('update');
  if (!row) throw new AppError('NOT_FOUND');
  return row;
}
function editable(row: typeof themes.$inferSelect): void {
  if (row.status !== 'draft' && row.status !== 'rejected') throw new AppError('INVALID_STATE');
}
async function transition(
  tx: CreatorTransaction,
  row: typeof themes.$inferSelect,
  to: ThemeStatus,
  principal: CreatorPrincipal,
  aestheticTagCount = 0,
): Promise<void> {
  const [statement] = transitionStatements({ ...row, aestheticTagCount }, to, {
    kind: 'user',
    userId: principal.id,
    role: principal.role === 'admin' ? 'admin' : 'user',
    isCreator: principal.isCreator,
  });
  const result = await tx.execute(statement);
  if (result.rows.length !== 1) throw new AppError('CONFLICT');
}
const result = (id: string) => ({ data: { id }, tags: [] as string[] });

export async function createCreatorTheme(
  input: CreateCreatorThemeInput,
  actor: Actor,
): Promise<{ data: { id: string }; tags: string[] }> {
  const value = parse(createCreatorThemeSchema, input),
    hash = await specHash(value.spec);
  return dbPool.transaction(async (tx) => {
    await lockTaxonomy(tx, 'shared');
    const principal = await requireCreatorPrincipal(tx, actor);
    await authorizeWallpaperPhotos(tx, principal.id, value.spec);
    const selected = await authorTags(tx, value.tagSlugs);
    const id = randomUUID();
    await tx.insert(themes).values({
      id,
      slug: `creator-${id}`,
      ownerId: principal.id,
      source: 'creator',
      status: 'draft',
      nameEn: value.nameEn,
      nameAr: value.nameAr || null,
      descriptionEn: value.descriptionEn || null,
      descriptionAr: value.descriptionAr || null,
      spec: value.spec,
      specHash: hash,
      tagsText: selected.map((tag) => `${tag.slug} ${tag.nameEn} ${tag.nameAr}`).join(' '),
    });
    await tx.insert(themeTags).values(selected.map((tag) => ({ themeId: id, tagId: tag.id })));
    await tx.execute(
      auditInsert({
        actorId: principal.id,
        action: 'theme.created',
        entityType: 'theme',
        entityId: id,
        meta: { source: 'creator', specHash: hash, tagSlugs: selected.map((tag) => tag.slug) },
      }),
    );
    return result(id);
  });
}

export async function updateCreatorTheme(
  input: UpdateCreatorThemeInput,
  actor: Actor,
): Promise<{ data: { id: string }; tags: string[] }> {
  const value = parse(updateCreatorThemeSchema, input),
    hash = await specHash(value.spec);
  return dbPool.transaction(async (tx) => {
    await lockTaxonomy(tx, 'shared');
    const principal = await requireCreatorPrincipal(tx, actor),
      row = await ownTheme(tx, value.id, principal.id);
    editable(row);
    await authorizeWallpaperPhotos(tx, principal.id, value.spec);
    const selected = await authorTags(tx, value.tagSlugs);
    const existing = await tx
      .select({ tagId: themeTags.tagId })
      .from(themeTags)
      .where(eq(themeTags.themeId, row.id));
    const tagsSame =
      existing.length === selected.length &&
      selected.every((tag) => existing.some((item) => item.tagId === tag.id));
    const data = {
      nameEn: value.nameEn,
      nameAr: value.nameAr || null,
      descriptionEn: value.descriptionEn || null,
      descriptionAr: value.descriptionAr || null,
      spec: value.spec,
      specHash: hash,
      tagsText: selected.map((tag) => `${tag.slug} ${tag.nameEn} ${tag.nameAr}`).join(' '),
    };
    if (
      row.status === 'draft' &&
      tagsSame &&
      row.specHash === hash &&
      row.nameEn === data.nameEn &&
      row.nameAr === data.nameAr &&
      row.descriptionEn === data.descriptionEn &&
      row.descriptionAr === data.descriptionAr &&
      row.tagsText === data.tagsText
    )
      return result(row.id);
    if (row.status === 'rejected') await transition(tx, row, 'draft', principal);
    await tx.update(themes).set(data).where(eq(themes.id, row.id));
    if (!tagsSame) {
      await tx.delete(themeTags).where(eq(themeTags.themeId, row.id));
      await tx
        .insert(themeTags)
        .values(selected.map((tag) => ({ themeId: row.id, tagId: tag.id })));
    }
    await tx.execute(
      auditInsert({
        actorId: principal.id,
        action: 'theme.updated',
        entityType: 'theme',
        entityId: row.id,
        meta: {
          before: { specHash: row.specHash },
          after: { specHash: hash },
          tagSlugs: selected.map((tag) => tag.slug),
        },
      }),
    );
    return result(row.id);
  });
}

export async function submitTheme(
  input: { id: string },
  actor: Actor,
): Promise<{ data: { status: ThemeStatus }; tags: string[] }> {
  const value = parse(creatorThemeIdSchema, input);
  return dbPool.transaction(async (tx) => {
    await lockTaxonomy(tx, 'shared');
    const principal = await requireCreatorPrincipal(tx, actor, { requireApproved: true }),
      row = await ownTheme(tx, value.id, principal.id);
    if (row.status !== 'draft') throw new AppError('INVALID_STATE');
    await authorizeWallpaperPhotos(tx, principal.id, row.spec);
    const memberships = await tx
      .select({ slug: tags.slug })
      .from(themeTags)
      .innerJoin(tags, eq(themeTags.tagId, tags.id))
      .where(eq(themeTags.themeId, row.id));
    await authorTags(
      tx,
      memberships.map((tag) => tag.slug),
    );
    await transition(tx, row, 'pending_review', principal, 1);
    return { data: { status: 'pending_review' as const }, tags: [] };
  });
}

export async function withdrawTheme(
  input: { id: string },
  actor: Actor,
): Promise<{ data: { status: ThemeStatus }; tags: string[] }> {
  const value = parse(creatorThemeIdSchema, input);
  return dbPool.transaction(async (tx) => {
    await lockTaxonomy(tx, 'shared');
    const principal = await requireCreatorPrincipal(tx, actor),
      row = await ownTheme(tx, value.id, principal.id);
    if (row.status !== 'pending_review') throw new AppError('INVALID_STATE');
    await transition(tx, row, 'draft', principal);
    return { data: { status: 'draft' as const }, tags: [] };
  });
}

export async function deleteCreatorTheme(
  input: { id: string },
  actor: Actor,
): Promise<{ data: { id: string }; tags: string[] }> {
  const value = parse(creatorThemeIdSchema, input);
  return dbPool.transaction(async (tx) => {
    await lockTaxonomy(tx, 'shared');
    const principal = await requireCreatorPrincipal(tx, actor),
      row = await ownTheme(tx, value.id, principal.id);
    editable(row);
    await tx.delete(themes).where(eq(themes.id, row.id));
    await tx.execute(
      auditInsert({
        actorId: principal.id,
        action: 'theme.deleted',
        entityType: 'theme',
        entityId: row.id,
        meta: { source: row.source, specHash: row.specHash },
      }),
    );
    return result(row.id);
  });
}
