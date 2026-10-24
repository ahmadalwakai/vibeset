import 'server-only';

import { randomInt } from 'node:crypto';
import { and, count, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getRecipe } from '../../content/aesthetics';
import { getPalette } from '../../content/palettes';
import { seasonTagSlug } from '../../content/taxonomy';
import { db } from '../../db/index';
import { dbPool } from '../../db/pool';
import { auditLog, generationRuns } from '../../db/schema/system';
import { tags, themeTags } from '../../db/schema/taxonomy';
import { themes } from '../../db/schema/themes';
import { env } from '../../lib/env.server';
import { buildSpec } from '../../lib/render/build-spec';
import { colorFamilyOf } from '../../lib/render/color';
import { specHash } from '../../lib/render/hash';
import { baseNames, slugFor, withSuffix } from '../../lib/render/naming';
import { createRng } from '../../lib/render/prng';
import { qaSpec } from '../../lib/render/qa';
import { deriveStyleTags } from '../../lib/render/style-tags';
import { actorSchema, type Actor } from '../../lib/theme-status';
import { AppError } from '../errors';
import { loadGeneratorManifest, renderGeneratorPreview } from '../render/generator-preview';
import { hamming } from '../render/hash';
import { transitionThemeStatus } from './theme-status';
import { requireAdminPrincipal } from './admin-access';
import { lockTaxonomy } from './taxonomy-lock';

const generationInputSchema = z.strictObject({
  aesthetic: z.string().regex(/^[a-z0-9-]{2,40}$/),
  count: z.number().int().min(1).max(24),
  seed: z.number().int().min(0).max(2_147_483_647),
  actor: actorSchema,
  autoApprove: z.boolean().default(false),
});

export interface GenerateDraftsInput {
  aesthetic: string;
  count: number;
  seed: number;
  actor: Actor;
  autoApprove?: boolean;
  /** Stop before claiming another candidate, after the current item drains. */
  signal?: AbortSignal;
}

export interface GenerationSummary {
  runId: string;
  created: number;
  skippedDuplicates: number;
  skippedQa: number;
}

const hashSchema = z.string().regex(/^[0-9a-f]{16}$/i);
type Transaction = Parameters<Parameters<typeof dbPool.transaction>[0]>[0];
type Batch = { aesthetic: string; seed: number; count: number };

async function batchSize(database: typeof db | Transaction, batch: Batch): Promise<number> {
  const [row] = await database
    .select({ total: count() })
    .from(themes)
    .innerJoin(generationRuns, eq(themes.generationRunId, generationRuns.id))
    .where(
      and(
        eq(generationRuns.aesthetic, batch.aesthetic),
        eq(generationRuns.seed, batch.seed),
        eq(generationRuns.requested, batch.count),
        ne(themes.status, 'rejected'),
      ),
    );
  return row?.total ?? 0;
}

async function existingHashes(database: typeof db | Transaction): Promise<string[]> {
  const rows = await database
    .select({ hash: themes.previewHash })
    .from(themes)
    .where(ne(themes.status, 'rejected'));
  return rows.flatMap(({ hash }) => (hashSchema.safeParse(hash).success && hash ? [hash] : []));
}

/** Admin/system mutation shared by the generator UI and CLI; no provider credentials needed. */
export async function generateDrafts(input: GenerateDraftsInput): Promise<{
  data: GenerationSummary;
  tags: string[];
}> {
  const { signal, ...boundary } = input;
  const parsed = generationInputSchema.safeParse(boundary);
  if (!parsed.success) throw new AppError('VALIDATION', 'Invalid generator input');
  const value = parsed.data;
  if (value.actor.kind !== 'system' && value.actor.role !== 'admin')
    throw new AppError('FORBIDDEN', 'Only administrators can generate themes');
  if (
    value.autoApprove &&
    (value.actor.kind !== 'system' ||
      value.actor.label !== 'cli' ||
      env.NODE_ENV === 'production' ||
      env.VERCEL_ENV === 'production')
  )
    throw new AppError('FORBIDDEN', 'Automatic approval is restricted to the development CLI');
  const recipe = getRecipe(value.aesthetic);
  if (!recipe) throw new AppError('VALIDATION', 'Unknown aesthetic recipe');
  const actorId = value.actor.kind === 'user' ? value.actor.userId : null;
  const actorMeta = value.actor.kind === 'system' ? { actor: value.actor } : {};
  const identity = { aesthetic: value.aesthetic, seed: value.seed, requested: value.count };
  const run = await dbPool.transaction(async (tx) => {
    if (value.actor.kind === 'user') await requireAdminPrincipal(tx, value.actor);
    const [row] = await tx
      .insert(generationRuns)
      .values({ ...identity, actorId })
      .returning({ id: generationRuns.id });
    if (!row) throw new AppError('INTERNAL', 'Could not start generation');
    await tx.insert(auditLog).values({
      actorId,
      action: 'generator.run',
      entityType: 'generation_run',
      entityId: row.id,
      meta: { ...identity, ...actorMeta, stage: 'started', status: 'running' },
    });
    return row;
  });
  const summary: GenerationSummary = {
    runId: run.id,
    created: 0,
    skippedDuplicates: 0,
    skippedQa: 0,
  };
  const log: string[] = [];
  async function finish(status: 'completed' | 'failed'): Promise<void> {
    await dbPool.transaction(async (tx) => {
      // Recover a committed draft even when its COMMIT acknowledgement was lost.
      const [actual] = await tx
        .select({ total: count() })
        .from(themes)
        .where(eq(themes.generationRunId, run.id));
      summary.created = actual?.total ?? 0;
      await tx
        .update(generationRuns)
        .set({
          created: summary.created,
          skippedDuplicates: summary.skippedDuplicates,
          skippedQa: summary.skippedQa,
          status,
          log,
          finishedAt: new Date(),
        })
        .where(eq(generationRuns.id, run.id));
      await tx.insert(auditLog).values({
        actorId,
        action: 'generator.run',
        entityType: 'generation_run',
        entityId: run.id,
        meta: { ...identity, ...actorMeta, ...summary, stage: 'finished', status },
      });
    });
  }
  try {
    if ((await batchSize(db, value)) < value.count) {
      const manifest = await loadGeneratorManifest();
      const knownHashes = await existingHashes(db);
      for (let index = 0; index < value.count * 3; index += 1) {
        if (signal?.aborted) break;
        const paletteId = recipe.palettes[index % recipe.palettes.length];
        const palette = paletteId ? getPalette(paletteId) : undefined;
        if (!palette) throw new AppError('VALIDATION', 'Recipe references an unknown palette');
        const spec = buildSpec(recipe, palette, createRng(value.seed + index));
        const qa = qaSpec(spec, manifest);
        if (!qa.ok) {
          summary.skippedQa += 1;
          log.push(`candidate ${index + 1}: QA ${qa.reasons.join(', ')}`);
          continue;
        }
        const preview = await renderGeneratorPreview(spec);
        if (knownHashes.some((hash) => hamming(hash, preview.previewHash) <= 6)) {
          summary.skippedDuplicates += 1;
          continue;
        }
        const hash = await specHash(spec);
        const tagSlugs = [
          ...new Set([
            recipe.slug,
            ...recipe.moods.slice(0, 3),
            ...deriveStyleTags(spec, palette),
            ...recipe.styles,
            ...(recipe.season ? [seasonTagSlug(recipe.season)] : []),
          ]),
        ];
        const names = baseNames(recipe, palette);
        const outcome = await dbPool.transaction(async (tx) => {
          await lockTaxonomy(tx, 'shared');
          if (value.actor.kind === 'user') await requireAdminPrincipal(tx, value.actor);
          // Separate statement: subsequent READ COMMITTED queries see commits made while waiting.
          await tx.execute(sql`SELECT pg_advisory_xact_lock(812706, 1)`);
          if ((await batchSize(tx, value)) >= value.count) return { kind: 'full' } as const;
          if (
            (await existingHashes(tx)).some(
              (existing) => hamming(existing, preview.previewHash) <= 6,
            )
          )
            return { kind: 'duplicate' } as const;
          const selectedTags = await tx.select().from(tags).where(inArray(tags.slug, tagSlugs));
          if (
            selectedTags.length !== tagSlugs.length ||
            selectedTags.filter((tag) => tag.kind === 'aesthetic').length !== 1
          )
            throw new AppError('VALIDATION', 'Seed the required taxonomy before generation');
          const existingNames = new Set(
            (await tx.select({ en: themes.nameEn, ar: themes.nameAr }).from(themes)).flatMap(
              (entry) => (entry.ar ? [entry.en, entry.ar] : [entry.en]),
            ),
          );
          let chosen = names;
          let occurrence = 1;
          while (existingNames.has(chosen.en) || existingNames.has(chosen.ar)) {
            occurrence += 1;
            if (occurrence > 3999)
              throw new AppError('CONFLICT', 'Theme name variants are exhausted');
            chosen = withSuffix(names, occurrence);
          }
          for (let attempt = 0; attempt < 8; attempt += 1) {
            const slug = slugFor(
              chosen.en,
              randomInt(36 ** 4)
                .toString(36)
                .padStart(4, '0'),
            );
            const [created] = await tx
              .insert(themes)
              .values({
                slug,
                source: 'generated',
                status: 'draft',
                nameEn: chosen.en,
                nameAr: chosen.ar,
                descriptionEn: recipe.descriptionEn,
                descriptionAr: recipe.descriptionAr,
                spec,
                specHash: hash,
                previewHash: preview.previewHash,
                dominantColor: palette.primary,
                colorFamily: colorFamilyOf(palette.primary),
                tagsText: selectedTags.flatMap((tag) => [tag.nameEn, tag.nameAr]).join(' '),
                generationRunId: run.id,
              })
              .onConflictDoNothing({ target: themes.slug })
              .returning({ id: themes.id, slug: themes.slug });
            if (!created) continue;
            await tx
              .insert(themeTags)
              .values(selectedTags.map((tag) => ({ themeId: created.id, tagId: tag.id })));
            // Progress and the draft commit together, preserving counts after an interrupted run.
            await tx
              .update(generationRuns)
              .set({
                created: summary.created + 1,
                skippedDuplicates: summary.skippedDuplicates,
                skippedQa: summary.skippedQa,
              })
              .where(eq(generationRuns.id, run.id));
            return { kind: 'created', ...created } as const;
          }
          throw new AppError('CONFLICT', 'Could not allocate a unique theme slug');
        });
        if (outcome.kind === 'full') break;
        if (outcome.kind === 'duplicate') {
          summary.skippedDuplicates += 1;
          knownHashes.push(preview.previewHash);
          continue;
        }
        summary.created += 1;
        knownHashes.push(preview.previewHash);
        log.push(`candidate ${index + 1}: ${outcome.slug}`);
        if (value.autoApprove)
          await transitionThemeStatus({ themeId: outcome.id, to: 'approved', actor: value.actor });
        if ((await batchSize(db, value)) >= value.count) break;
      }
    } else log.push('Seeded batch already reached its target; no new drafts.');
    if (value.autoApprove && !signal?.aborted) {
      // A previous attempt may have committed a draft before approval failed.
      const outstanding = await db
        .select({ id: themes.id })
        .from(themes)
        .innerJoin(generationRuns, eq(themes.generationRunId, generationRuns.id))
        .where(
          and(
            eq(generationRuns.aesthetic, value.aesthetic),
            eq(generationRuns.seed, value.seed),
            eq(generationRuns.requested, value.count),
            eq(themes.status, 'draft'),
          ),
        );
      for (const theme of outstanding) {
        if (signal?.aborted) break;
        try {
          await transitionThemeStatus({ themeId: theme.id, to: 'approved', actor: value.actor });
        } catch (error) {
          const [current] = await db
            .select({ status: themes.status })
            .from(themes)
            .where(eq(themes.id, theme.id));
          if (current?.status !== 'approved') throw error;
        }
      }
    }
    if (signal?.aborted) log.push('Interrupted after the current candidate completed.');
    await finish(signal?.aborted ? 'failed' : 'completed');
    return { data: summary, tags: [] };
  } catch (error) {
    log.push(`Generation failed (${error instanceof AppError ? error.code : 'INTERNAL'}).`);
    await finish('failed');
    if (error instanceof AppError) throw error;
    throw new AppError('INTERNAL', 'Theme generation failed');
  }
}
