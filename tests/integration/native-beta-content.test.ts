import { randomUUID } from 'node:crypto';
import type { PoolClient } from '@neondatabase/serverless';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { NATIVE_BETA_ORIGINALS } from '../../content/native-beta';
import { TAXONOMY } from '../../content/taxonomy';
import { themes } from '../../db/schema/themes';
import { tags } from '../../db/schema/taxonomy';
import { auditLog } from '../../db/schema/system';
import type * as DatabasePool from '../../db/pool';
import type * as ImportService from '../../server/services/native-beta-content';
import type * as Transitions from '../../server/services/theme-status';

vi.mock('server-only', () => ({}));
const url = process.env.TEST_DATABASE_URL?.trim();
const actor = { kind: 'system', label: `native-beta-test-${randomUUID()}` } as const;
const slugs = NATIVE_BETA_ORIGINALS.map((source) => source.slug);
const hashes = NATIVE_BETA_ORIGINALS.map((source) => source.specHash);
const ownedIds = new Set<string>(),
  ownedTagIds = new Set<string>();

describe.skipIf(!url)('native beta original import on the explicitly isolated test branch', () => {
  let database: typeof DatabasePool;
  let service: typeof ImportService;
  let transitions: typeof Transitions;
  let lock: PoolClient | undefined;
  beforeAll(async () => {
    expect(process.env.VERCEL_ENV).not.toBe('production');
    const target = z.url({ protocol: /^postgres(?:ql)?$/ }).parse(url);
    const host = (value: string): string => new URL(value).hostname.replace(/-pooler(?=\.)/, '');
    expect(host(target)).not.toMatch(/^ep-noisy-cake-zaqvg8qz\./);
    for (const ordinary of [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED])
      if (ordinary)
        expect(host(target), 'TEST must use a distinct runtime endpoint').not.toBe(host(ordinary));
    // Bind the actual runtime clients before imports; a missed mock cannot reach DEV or MAIN.
    vi.stubEnv('DATABASE_URL', target);
    vi.stubEnv('DATABASE_URL_UNPOOLED', target);
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('VERCEL_ENV', undefined);
    database = await import('../../db/pool');
    lock = await database.pool.connect();
    await lock.query('SELECT pg_advisory_lock(914014,1)');
    const existing = await database.dbPool
      .select({ id: themes.id })
      .from(themes)
      .where(or(inArray(themes.slug, slugs), inArray(themes.specHash, hashes)));
    expect(existing, 'Never reuse or delete pre-existing content').toEqual([]);
    const wanted = new Set(NATIVE_BETA_ORIGINALS.flatMap((source) => source.tagSlugs));
    const present = new Set(
      (
        await database.dbPool
          .select({ slug: tags.slug })
          .from(tags)
          .where(inArray(tags.slug, [...wanted]))
      ).map((row) => row.slug),
    );
    for (const tag of TAXONOMY.filter((tag) => wanted.has(tag.slug) && !present.has(tag.slug))) {
      const id = randomUUID();
      ownedTagIds.add(id);
      await database.dbPool.insert(tags).values({ ...tag, id });
    }
    service = await import('../../server/services/native-beta-content');
    transitions = await import('../../server/services/theme-status');
  }, 30_000);
  afterAll(async () => {
    try {
      if (!database) return;
      // Recover IDs after an uncertain test COMMIT only from this run's unique audit actor.
      const imported = await database.dbPool
        .select({ id: auditLog.entityId })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, 'theme.original_imported'),
            sql`${auditLog.meta}->'actor'->>'label' = ${actor.label}`,
          ),
        );
      for (const row of imported)
        if (row.id && z.uuid().safeParse(row.id).success) ownedIds.add(row.id);
      if (ownedIds.size) {
        await database.dbPool.delete(auditLog).where(inArray(auditLog.entityId, [...ownedIds]));
        await database.dbPool.delete(themes).where(inArray(themes.id, [...ownedIds]));
        expect(
          await database.dbPool
            .select({ id: themes.id })
            .from(themes)
            .where(inArray(themes.id, [...ownedIds])),
        ).toEqual([]);
      }
      if (ownedTagIds.size)
        await database.dbPool.delete(tags).where(inArray(tags.id, [...ownedTagIds]));
    } finally {
      if (lock) {
        await lock.query('SELECT pg_advisory_unlock(914014,1)');
        lock.release();
      }
      if (database) await database.pool.end();
      vi.unstubAllEnvs();
    }
  }, 30_000);

  it('rejects user actors and rolls back all imports/audits when a later original collides', async () => {
    await expect(
      service.importNativeBetaContent({
        kind: 'user',
        userId: 'untrusted',
        role: 'admin',
        isCreator: false,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const original = NATIVE_BETA_ORIGINALS[2];
    if (!original) throw new Error('Missing original');
    const id = randomUUID();
    ownedIds.add(id);
    await database.dbPool
      .insert(themes)
      .values({
        id,
        slug: original.slug,
        source: 'generated',
        nameEn: 'Deliberately conflicting isolated fixture',
        spec: original.spec,
        specHash: original.specHash,
      });
    await expect(service.importNativeBetaContent(actor)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(
      await database.dbPool
        .select({ id: themes.id })
        .from(themes)
        .where(inArray(themes.slug, slugs)),
    ).toEqual([{ id }]);
    expect(
      await database.dbPool
        .select({ id: auditLog.id })
        .from(auditLog)
        .where(sql`${auditLog.meta}->'actor'->>'label' = ${actor.label}`),
    ).toEqual([]);
    await database.dbPool.delete(themes).where(eq(themes.id, id));
    ownedIds.delete(id);
  }, 30_000);

  it('serializes concurrent import attempts into exactly three fresh ownerless drafts and three audits', async () => {
    const outcomes = await Promise.allSettled(
      Array.from({ length: 3 }, () => service.importNativeBetaContent(actor)),
    );
    for (const outcome of outcomes) {
      if (outcome.status === 'fulfilled')
        for (const row of outcome.value.data.themes) ownedIds.add(row.id);
    }
    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      'fulfilled',
      'fulfilled',
      'fulfilled',
    ]);
    const results = outcomes.flatMap((outcome) =>
      outcome.status === 'fulfilled' ? [outcome.value] : [],
    );
    const first = results[0];
    if (!first) throw new Error('Import failed');
    expect(first.data.themes).toHaveLength(3);
    for (const result of results)
      expect(result.data.themes.map((row) => row.id)).toEqual(
        first.data.themes.map((row) => row.id),
      );
    expect(
      await database.dbPool
        .select({ ownerId: themes.ownerId, status: themes.status, version: themes.assetVersion })
        .from(themes)
        .where(inArray(themes.id, [...ownedIds])),
    ).toEqual(Array.from({ length: 3 }, () => ({ ownerId: null, status: 'draft', version: 0 })));
    const audits = await database.dbPool
      .select({ actorId: auditLog.actorId })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, 'theme.original_imported'),
          inArray(auditLog.entityId, [...ownedIds]),
        ),
      );
    expect(audits).toEqual([{ actorId: null }, { actorId: null }, { actorId: null }]);
    expect((await service.importNativeBetaContent(actor)).tags).toEqual([]);
  }, 30_000);

  it('uses canonical approval and refuses to overwrite an edited imported row', async () => {
    const current = await service.getNativeBetaContent(actor);
    const first = current.data.themes[0];
    if (!first) throw new Error('Import missing');
    await transitions.transitionThemeStatus({ themeId: first.id, to: 'approved', actor });
    expect((await service.getNativeBetaContent(actor)).data.themes[0]?.status).toBe('approved');
    const original = NATIVE_BETA_ORIGINALS.find((source) => source.slug === first.slug);
    if (!original) throw new Error('Original missing');
    await database.dbPool
      .update(themes)
      .set({ nameEn: 'Intentional edited fixture' })
      .where(eq(themes.id, first.id));
    await expect(service.importNativeBetaContent(actor)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await database.dbPool
      .update(themes)
      .set({ nameEn: original.nameEn })
      .where(eq(themes.id, first.id));
    expect((await service.getNativeBetaContent(actor)).data.themes.map((row) => row.id)).toEqual(
      current.data.themes.map((row) => row.id),
    );
  }, 30_000);
});
