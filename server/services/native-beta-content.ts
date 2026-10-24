import 'server-only';

import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { dbPool } from '../../db/pool';
import { themes } from '../../db/schema/themes';
import { tags, themeTags } from '../../db/schema/taxonomy';
import { NATIVE_BETA_ORIGINALS } from '../../content/native-beta';
import { canonicalJson, specHash } from '../../lib/render/hash';
import { qaSpec } from '../../lib/render/qa';
import { colorFamilyOf } from '../../lib/render/color';
import { actorSchema, type Actor } from '../../lib/theme-status';
import { CacheTags } from '../../lib/cache-tags';
import { auditInsert } from '../audit';
import { AppError } from '../errors';
import { loadGeneratorManifest } from '../render/generator-preview';
import { lockTaxonomy } from './taxonomy-lock';

type Theme = typeof themes.$inferSelect;
type Identity = Pick<
  Theme,
  'id' | 'slug' | 'status' | 'specHash' | 'assetVersion' | 'assets' | 'assetsSpecHash'
>;
interface ImportedContent {
  data: { themes: Identity[] };
  tags: string[];
}

async function content(actor: Actor, create: boolean): Promise<ImportedContent> {
  const principal = actorSchema.safeParse(actor);
  if (!principal.success) throw new AppError('VALIDATION');
  if (principal.data.kind !== 'system') throw new AppError('FORBIDDEN');
  const manifest = await loadGeneratorManifest();
  for (const original of NATIVE_BETA_ORIGINALS) {
    if (
      (await specHash(original.spec)) !== original.specHash ||
      !qaSpec(original.spec, manifest).ok
    )
      throw new AppError('VALIDATION', 'The curated original failed integrity or renderer QA');
  }
  return dbPool.transaction(async (tx) => {
    await lockTaxonomy(tx, 'shared');
    await tx.execute(sql`SELECT pg_advisory_xact_lock(812706, 2)`);
    const identities: Identity[] = [];
    let changed = false;
    for (const original of NATIVE_BETA_ORIGINALS) {
      const selectedTags = await tx
        .select()
        .from(tags)
        .where(and(inArray(tags.slug, original.tagSlugs), eq(tags.isActive, true)))
        .for('share');
      if (
        selectedTags.length !== original.tagSlugs.length ||
        selectedTags.filter((tag) => tag.kind === 'aesthetic').length !== 1 ||
        !selectedTags.some((tag) => tag.kind === 'aesthetic' && tag.slug === 'y2k')
      )
        throw new AppError('VALIDATION', 'Seed the original taxonomy before importing');
      const existing = await tx
        .select()
        .from(themes)
        .where(or(eq(themes.slug, original.slug), eq(themes.specHash, original.specHash)))
        .for('update');
      if (existing.length > 1)
        throw new AppError('CONFLICT', 'The original is not uniquely identified');
      let row = existing[0];
      if (row) {
        const membership = await tx
          .select({ slug: tags.slug })
          .from(themeTags)
          .innerJoin(tags, eq(themeTags.tagId, tags.id))
          .where(eq(themeTags.themeId, row.id));
        if (
          row.slug !== original.slug ||
          row.specHash !== original.specHash ||
          canonicalJson(row.spec) !== canonicalJson(original.spec) ||
          row.source !== 'generated' ||
          row.ownerId !== null ||
          !['draft', 'approved', 'published'].includes(row.status) ||
          row.nameEn !== original.nameEn ||
          row.nameAr !== original.nameAr ||
          row.descriptionEn !== original.descriptionEn ||
          row.descriptionAr !== original.descriptionAr ||
          membership
            .map((tag) => tag.slug)
            .sort()
            .join(',') !== [...original.tagSlugs].sort().join(',')
        )
          throw new AppError('CONFLICT', 'An existing row differs from the curated original');
      } else {
        if (!create) throw new AppError('NOT_FOUND', 'Stage the original before publication');
        [row] = await tx
          .insert(themes)
          .values({
            slug: original.slug,
            source: 'generated',
            ownerId: null,
            nameEn: original.nameEn,
            nameAr: original.nameAr,
            descriptionEn: original.descriptionEn,
            descriptionAr: original.descriptionAr,
            spec: original.spec,
            specHash: original.specHash,
            previewHash: original.previewHash,
            dominantColor: original.spec.palette.primary,
            colorFamily: colorFamilyOf(original.spec.palette.primary),
            tagsText: selectedTags
              .map((tag) => `${tag.slug} ${tag.nameEn} ${tag.nameAr}`)
              .join(' '),
          })
          .returning();
        if (!row) throw new AppError('INTERNAL');
        const createdId = row.id;
        await tx
          .insert(themeTags)
          .values(selectedTags.map((tag) => ({ themeId: createdId, tagId: tag.id })));
        await tx.execute(
          auditInsert({
            actorId: null,
            action: 'theme.original_imported',
            entityType: 'theme',
            entityId: row.id,
            meta: {
              actor: principal.data,
              specHash: original.specHash,
              source: 'reviewed-generated-original',
              after: { status: 'draft' },
            },
          }),
        );
        changed = true;
      }
      identities.push({
        id: row.id,
        slug: row.slug,
        status: row.status,
        specHash: row.specHash,
        assetVersion: row.assetVersion,
        assets: row.assets,
        assetsSpecHash: row.assetsSpecHash,
      });
    }
    return { data: { themes: identities }, tags: changed ? [CacheTags.themes] : [] };
  });
}

/** One fixed original allowlist; no generic import route and no account creation. */
export function importNativeBetaContent(actor: Actor): Promise<ImportedContent> {
  return content(actor, true);
}

export function getNativeBetaContent(actor: Actor): Promise<ImportedContent> {
  return content(actor, false);
}
