import 'server-only';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { tags, themeTags } from '../../db/schema/taxonomy';
import { themes } from '../../db/schema/themes';
import { getTaxonomyTag } from '../../content/taxonomy';
import { CacheTags } from '../../lib/cache-tags';
import type { Actor } from '../../lib/theme-status';
import {
  adminUpsertTagSchema,
  adminDeleteTagSchema,
  adminMergeTagsSchema,
  type AdminUpsertTagInput,
} from '../../lib/validation/admin-content';
import type { AdminTransaction } from './admin-access';
import { contentTransaction, logContent, parseContent } from './admin-content-common';
import { rebuildTaxonomyText } from './taxonomy-text';
import { AppError } from '../errors';

const invalidation = [CacheTags.taxonomy, CacheTags.themes];
async function affected(tx: AdminTransaction, id: string): Promise<string[]> {
  const rows = await tx
    .select({ id: themes.id })
    .from(themes)
    .innerJoin(themeTags, eq(themeTags.themeId, themes.id))
    .where(eq(themeTags.tagId, id))
    .orderBy(asc(themes.id))
    .for('update', { of: themes });
  return rows.map((row) => row.id);
}
export async function adminUpsertTag(
  input: AdminUpsertTagInput,
  actor: Actor,
): Promise<{ data: { id: string }; tags: string[] }> {
  const value = parseContent(adminUpsertTagSchema, input);
  return contentTransaction(
    actor,
    async (tx, admin) => {
      const [before] = value.id
        ? await tx.select().from(tags).where(eq(tags.id, value.id)).for('update')
        : [];
      if (value.id && !before) throw new AppError('NOT_FOUND');
      const seeded = before ? getTaxonomyTag(before.slug) : undefined;
      if (seeded && (value.slug !== before?.slug || value.kind !== seeded.kind))
        throw new AppError('FORBIDDEN', 'Recipe identities are fixed');
      if (!before && getTaxonomyTag(value.slug))
        throw new AppError('FORBIDDEN', 'Seed recipe identities through the seed service');
      const ids = before ? await affected(tx, before.id) : [];
      if (before && ids.length && value.kind !== before.kind)
        throw new AppError('VALIDATION', 'Used tag kind is fixed', { kind: ['used'] });
      const { id: requested, ...fields } = value;
      let id = requested;
      if (before) {
        if (Object.entries(fields).some(([key, next]) => Reflect.get(before, key) !== next)) {
          await tx.update(tags).set(fields).where(eq(tags.id, before.id));
          await rebuildTaxonomyText(tx, ids);
          await logContent(tx, admin, 'tag.updated', 'tag', before.id, {
            before: {
              slug: before.slug,
              kind: before.kind,
              nameEn: before.nameEn,
              nameAr: before.nameAr,
              isActive: before.isActive,
            },
            after: fields,
            affectedThemes: ids.length,
          });
        }
      } else {
        const [created] = await tx.insert(tags).values(fields).returning({ id: tags.id });
        if (!created) throw new AppError('INTERNAL');
        id = created.id;
        await logContent(tx, admin, 'tag.created', 'tag', id, { after: fields });
      }
      if (!id) throw new AppError('INTERNAL');
      return { data: { id }, tags: invalidation };
    },
    'exclusive',
  );
}
export async function adminDeleteTag(
  input: { id: string; removeFromThemes?: boolean; expectedUsageCount?: number },
  actor: Actor,
): Promise<{ data: { id: string; affectedThemes: number }; tags: string[] }> {
  const value = parseContent(adminDeleteTagSchema, input);
  return contentTransaction(
    actor,
    async (tx, admin) => {
      const [row] = await tx.select().from(tags).where(eq(tags.id, value.id)).for('update');
      if (!row) throw new AppError('NOT_FOUND');
      if (getTaxonomyTag(row.slug)) throw new AppError('FORBIDDEN', 'Recipe identities are fixed');
      const ids = await affected(tx, row.id);
      if (value.expectedUsageCount !== undefined && value.expectedUsageCount !== ids.length)
        throw new AppError('CONFLICT');
      if (ids.length && (row.kind === 'aesthetic' || !value.removeFromThemes))
        throw new AppError(
          'INVALID_STATE',
          'Used tags require confirmed removal; aesthetics require merging',
        );
      await tx.delete(tags).where(eq(tags.id, row.id));
      await rebuildTaxonomyText(tx, ids);
      await logContent(tx, admin, 'tag.deleted', 'tag', row.id, {
        slug: row.slug,
        affectedThemes: ids.length,
      });
      return { data: { id: row.id, affectedThemes: ids.length }, tags: invalidation };
    },
    'exclusive',
  );
}
export async function adminMergeTags(
  input: { fromId: string; toId: string },
  actor: Actor,
): Promise<{ data: { id: string; affectedThemes: number }; tags: string[] }> {
  const value = parseContent(adminMergeTagsSchema, input);
  return contentTransaction(
    actor,
    async (tx, admin) => {
      const rows = await tx
        .select()
        .from(tags)
        .where(inArray(tags.id, [value.fromId, value.toId]))
        .orderBy(asc(tags.id))
        .for('update');
      const from = rows.find((row) => row.id === value.fromId),
        to = rows.find((row) => row.id === value.toId);
      if (!from || !to) throw new AppError('NOT_FOUND');
      if (getTaxonomyTag(from.slug)) throw new AppError('FORBIDDEN', 'Recipe identities are fixed');
      if (from.kind !== to.kind || !to.isActive)
        throw new AppError('VALIDATION', 'Merge requires an active target of the same kind', {
          toId: ['invalid'],
        });
      const ids = await affected(tx, from.id);
      await tx.execute(
        sql`INSERT INTO theme_tags(theme_id,tag_id) SELECT theme_id,${to.id}::uuid FROM theme_tags WHERE tag_id=${from.id}::uuid ON CONFLICT DO NOTHING`,
      );
      await tx.delete(tags).where(eq(tags.id, from.id));
      await rebuildTaxonomyText(tx, ids);
      await logContent(tx, admin, 'tag.merged', 'tag', to.id, {
        from: { id: from.id, slug: from.slug },
        to: { id: to.id, slug: to.slug },
        affectedThemes: ids.length,
      });
      return { data: { id: to.id, affectedThemes: ids.length }, tags: invalidation };
    },
    'exclusive',
  );
}
