import { randomInt, randomUUID } from 'node:crypto';
import { neon, type Pool } from '@neondatabase/serverless';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { getRecipe } from '../../content/aesthetics';
import { TAXONOMY } from '../../content/taxonomy';
import { auditLog, generationRuns } from '../../db/schema/system';
import { tags, themeTags } from '../../db/schema/taxonomy';
import { themes } from '../../db/schema/themes';
import { STYLE_IDS } from '../../lib/generator';
import { specHash } from '../../lib/render/hash';
import { themeSpecSchema } from '../../lib/render/spec';
import type { dbPool as configuredDatabase } from '../../db/pool';
import type { generateDrafts as generate } from '../../server/services/theme-generate';
import type * as previewModule from '../../server/render/generator-preview';

vi.mock('server-only', () => ({}));
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();
const actor = { kind: 'system', label: `integration-generator-${randomUUID()}` } as const;
const recipe = getRecipe('y2k');
if (!recipe) throw new Error('The generator fixture recipe is missing');
const aesthetic = recipe.slug;

describe.skipIf(!TEST_DATABASE_URL)(
  'curated generation with real rendering and atomic drafts',
  () => {
    let database: ReturnType<typeof drizzle>;
    let transactionDatabase: typeof configuredDatabase;
    let poolToClose: Pool | undefined;
    let generateDrafts: typeof generate;
    let previews: typeof previewModule;
    const fixtureTagIds = new Set<string>();
    const fixtureAuditIds = new Set<string>();

    beforeAll(async () => {
      const url = z.url({ protocol: /^postgres(?:ql)?$/ }).parse(TEST_DATABASE_URL);
      database = drizzle({ client: neon(url) });
      for (const [key, value] of Object.entries({
        DATABASE_URL: url,
        DATABASE_URL_UNPOOLED: url,
        NODE_ENV: 'test',
        BETTER_AUTH_URL: 'http://localhost:3000',
        NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
        BETTER_AUTH_SECRET: 'b'.repeat(32),
        IP_HASH_SALT: 'g'.repeat(32),
        CRON_SECRET: 'c'.repeat(32),
        INTERNAL_API_SECRET: 'i'.repeat(32),
      }))
        vi.stubEnv(key, value);
      vi.stubEnv('VERCEL_ENV', undefined);
      vi.stubEnv('SKIP_ENV_VALIDATION', undefined);
      const { pool, dbPool } = await import('../../db/pool');
      poolToClose = pool;
      transactionDatabase = dbPool;
      ({ generateDrafts } = await import('../../server/services/theme-generate'));
      previews = await import('../../server/render/generator-preview');
      const required = new Set([aesthetic, ...recipe.moods, ...STYLE_IDS]);
      const existing = await database
        .select({ slug: tags.slug })
        .from(tags)
        .where(inArray(tags.slug, [...required]));
      const found = new Set(existing.map(({ slug }) => slug));
      const missing = TAXONOMY.filter(({ slug }) => required.has(slug) && !found.has(slug));
      if (missing.length) {
        const { seedTaxonomy } = await import('../../server/services/seed-content');
        const seeded = await seedTaxonomy({ actor, rows: missing });
        if (seeded.data.auditId) fixtureAuditIds.add(seeded.data.auditId);
        if (seeded.data.identifiers.length) {
          const rows = await database
            .select({ id: tags.id })
            .from(tags)
            .where(inArray(tags.slug, seeded.data.identifiers));
          rows.forEach(({ id }) => fixtureTagIds.add(id));
        }
      }
    });

    async function ownRuns() {
      const logs = await database
        .select({ id: auditLog.entityId })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, 'generator.run'),
            eq(auditLog.entityType, 'generation_run'),
            sql`${auditLog.meta}->'actor'->>'label' = ${actor.label}`,
          ),
        );
      const ids = [...new Set(logs.flatMap(({ id }) => (id ? [id] : [])))];
      return ids.length
        ? database.select().from(generationRuns).where(inArray(generationRuns.id, ids))
        : [];
    }
    async function ownThemes() {
      const ids = (await ownRuns()).map(({ id }) => id);
      return ids.length
        ? database.select().from(themes).where(inArray(themes.generationRunId, ids))
        : [];
    }

    afterEach(async () => {
      vi.restoreAllMocks();
      const runs = await ownRuns();
      const ids = runs.map(({ id }) => id);
      const drafts = await ownThemes();
      if (drafts.length) {
        await database.delete(auditLog).where(
          and(
            eq(auditLog.entityType, 'theme'),
            inArray(
              auditLog.entityId,
              drafts.map(({ id }) => id),
            ),
          ),
        );
        await database.delete(themes).where(
          inArray(
            themes.id,
            drafts.map(({ id }) => id),
          ),
        );
      }
      if (ids.length) {
        await database
          .delete(auditLog)
          .where(and(eq(auditLog.entityType, 'generation_run'), inArray(auditLog.entityId, ids)));
        await database.delete(generationRuns).where(inArray(generationRuns.id, ids));
      }
    });
    afterAll(async () => {
      try {
        if (fixtureTagIds.size)
          await database
            .delete(tags)
            .where(
              and(
                inArray(tags.id, [...fixtureTagIds]),
                sql`NOT EXISTS (SELECT 1 FROM ${themeTags} WHERE ${themeTags.tagId} = ${tags.id})`,
              ),
            );
        if (fixtureAuditIds.size)
          await database.delete(auditLog).where(inArray(auditLog.id, [...fixtureAuditIds]));
      } finally {
        try {
          await poolToClose?.end();
        } finally {
          vi.unstubAllEnvs();
        }
      }
    });

    function input(seed = randomInt(100_000_000, 2_147_480_000)) {
      return { aesthetic, count: 3, seed, actor };
    }
    async function assertDrafts(expected: number): Promise<void> {
      const rows = await ownThemes();
      expect(rows).toHaveLength(expected);
      const ids = rows.map(({ id }) => id);
      const linked = ids.length
        ? await database
            .select({
              themeId: themeTags.themeId,
              kind: tags.kind,
              nameEn: tags.nameEn,
              nameAr: tags.nameAr,
              slug: tags.slug,
            })
            .from(themeTags)
            .innerJoin(tags, eq(themeTags.tagId, tags.id))
            .where(inArray(themeTags.themeId, ids))
        : [];
      for (const row of rows) {
        expect(row).toMatchObject({
          status: 'draft',
          source: 'generated',
          assetVersion: 0,
          assets: null,
        });
        expect(themeSpecSchema.safeParse(row.spec).success).toBe(true);
        expect(row.specHash).toBe(await specHash(row.spec));
        expect(row.previewHash).toMatch(/^[0-9a-f]{16}$/);
        expect(row.nameEn).not.toBe('');
        expect(row.nameAr).not.toBe('');
        expect(row.slug).toMatch(/^[a-z0-9-]+-[a-z0-9]{4}$/);
        const labels = linked.filter(({ themeId }) => themeId === row.id);
        expect(labels.filter(({ kind }) => kind === 'aesthetic').map(({ slug }) => slug)).toEqual([
          aesthetic,
        ]);
        for (const label of labels) {
          expect(row.tagsText).toContain(label.nameEn);
          expect(row.tagsText).toContain(label.nameAr);
        }
      }
      expect(new Set(rows.map(({ slug }) => slug)).size).toBe(rows.length);
      expect(new Set(rows.map(({ nameEn }) => nameEn)).size).toBe(rows.length);
    }

    it('creates three complete drafts and makes a repeated seeded batch a no-render no-op', async () => {
      const batch = input();
      const first = await generateDrafts(batch);
      expect(first.data.created).toBe(3);
      expect(first.tags).toEqual([]);
      await assertDrafts(3);
      const render = vi.spyOn(previews, 'renderGeneratorPreview');
      const second = await generateDrafts(batch);
      expect(second.data.created).toBe(0);
      expect(render).not.toHaveBeenCalled();
      expect(await ownRuns()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: first.data.runId,
            status: 'completed',
            created: 3,
            finishedAt: expect.any(Date),
          }),
          expect.objectContaining({ id: second.data.runId, status: 'completed', created: 0 }),
        ]),
      );
      const ids = (await ownRuns()).map(({ id }) => id);
      const logs = await database
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.action, 'generator.run'), inArray(auditLog.entityId, ids)));
      expect(logs).toHaveLength(4);
      expect(logs.filter(({ meta }) => meta.stage === 'started')).toHaveLength(2);
      expect(logs.filter(({ meta }) => meta.stage === 'finished')).toHaveLength(2);
    }, 90_000);

    it('caps identical concurrent batches at three total drafts under the advisory lock', async () => {
      const batch = input();
      const render = previews.renderGeneratorPreview;
      let entered = 0;
      let release: () => void = () => {};
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      vi.spyOn(previews, 'renderGeneratorPreview').mockImplementation(async (spec) => {
        const preview = await render(spec);
        if (++entered >= 2) release();
        await barrier;
        return preview;
      });
      const outcomes = await Promise.all([generateDrafts(batch), generateDrafts(batch)]);
      expect(outcomes.reduce((sum, { data }) => sum + data.created, 0)).toBe(3);
      await assertDrafts(3);
      expect((await ownRuns()).every(({ status }) => status === 'completed')).toBe(true);
    }, 90_000);

    it('finishes the active candidate on interruption and refills only the missing batch target', async () => {
      const batch = input();
      const controller = new AbortController();
      const render = previews.renderGeneratorPreview;
      const spy = vi
        .spyOn(previews, 'renderGeneratorPreview')
        .mockImplementationOnce(async (spec) => {
          const result = await render(spec);
          controller.abort();
          return result;
        });
      const interrupted = await generateDrafts({ ...batch, signal: controller.signal });
      spy.mockRestore();
      expect(interrupted.data.created).toBe(1);
      expect((await ownRuns()).find(({ id }) => id === interrupted.data.runId)).toMatchObject({
        status: 'failed',
        created: 1,
      });
      await assertDrafts(1);
      const resumed = await generateDrafts(batch);
      expect(resumed.data.created).toBe(2);
      await assertDrafts(3);
    }, 90_000);

    it('keeps committed draft progress on rendering failure and resumes the same batch', async () => {
      const batch = input();
      const render = previews.renderGeneratorPreview;
      let attempts = 0;
      const spy = vi.spyOn(previews, 'renderGeneratorPreview').mockImplementation(async (spec) => {
        if (++attempts === 2) throw new Error('Disposable rendering failure');
        return render(spec);
      });
      await expect(generateDrafts(batch)).rejects.toMatchObject({ code: 'INTERNAL' });
      spy.mockRestore();
      expect((await ownRuns())[0]).toMatchObject({ status: 'failed', created: 1 });
      await assertDrafts(1);
      expect((await generateDrafts(batch)).data.created).toBe(2);
      await assertDrafts(3);
    }, 90_000);

    it('recovers persisted progress when a candidate COMMIT acknowledgement is lost', async () => {
      const batch = input();
      const transaction = transactionDatabase.transaction.bind(transactionDatabase);
      vi.spyOn(transactionDatabase, 'transaction')
        .mockImplementationOnce(transaction)
        .mockImplementationOnce(async (callback, config) => {
          await transaction(callback, config);
          throw new Error('Lost acknowledgement after candidate commit');
        });
      await expect(generateDrafts(batch)).rejects.toMatchObject({ code: 'INTERNAL' });
      vi.restoreAllMocks();
      expect((await ownRuns())[0]).toMatchObject({ status: 'failed', created: 1 });
      await assertDrafts(1);
      expect((await generateDrafts(batch)).data.created).toBe(2);
      await assertDrafts(3);
    }, 90_000);

    it('rejects ordinary users and non-CLI automatic approval before opening a run', async () => {
      const batch = input();
      await expect(
        generateDrafts({
          ...batch,
          actor: { kind: 'user', userId: 'unprivileged', role: 'user', isCreator: false },
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(generateDrafts({ ...batch, autoApprove: true })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(await ownRuns()).toHaveLength(0);
    });
  },
);
