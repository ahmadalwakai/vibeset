import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rm, rename, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import {
  E2E_PROJECT_NAMES,
  E2E_ROLES,
  e2eManifestSchema,
  type E2eManifest,
} from '../../tests/e2e/manifest';
import { assertOwnedE2ePath, e2eDirectory, type E2eMode } from './environment';
import type { ThemeAssets } from '../../lib/theme-assets';

const journalSchema = z.strictObject({
  manifest: e2eManifestSchema,
  tagId: z.uuid(),
  appIds: z.array(z.uuid()),
  settingKeys: z.array(z.string()),
  auditIds: z.array(z.uuid()),
  seedCatalog: z.boolean(),
  seedSettings: z.boolean(),
  cleanupThemeIds: z.array(z.uuid()).max(2000).default([]),
});
type Journal = z.infer<typeof journalSchema>;

async function saveJournal(journal: Journal): Promise<string> {
  const directory = e2eDirectory(journal.manifest.runId);
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, 'journal.json');
  const pending = path.join(directory, `journal-${randomUUID()}.tmp`);
  try {
    await writeFile(pending, `${JSON.stringify(journal, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    await rename(pending, file);
  } finally {
    await rm(pending, { force: true });
  }
  return file;
}

interface SeedInput {
  mode: E2eMode;
  baseURL: string;
  assetOrigin: string;
  fingerprint: string;
  runId: string;
}

export async function seedE2eFixtures(
  input: SeedInput,
): Promise<{ manifest: E2eManifest; manifestPath: string }> {
  const { env } = await import('../../lib/env.server');
  if (env.VERCEL_ENV !== 'preview' || env.E2E_TEST_AUTH !== '1')
    throw new Error('E2E seed guard failed');
  const { pool } = await import('../../db/pool');
  const lease = await pool.connect();
  let locked = false;
  try {
    const result = await lease.query(
      "SELECT pg_try_advisory_lock(hashtextextended('vibeset.e2e.seed', 0)) AS locked",
    );
    locked = z.object({ locked: z.boolean() }).parse(result.rows[0]).locked;
    if (!locked) throw new Error('Another E2E seed owns this database');
    return await seedE2eFixturesUnlocked(input);
  } finally {
    try {
      if (locked)
        await lease.query("SELECT pg_advisory_unlock(hashtextextended('vibeset.e2e.seed', 0))");
    } finally {
      lease.release();
    }
  }
}

async function seedE2eFixturesUnlocked(
  input: SeedInput,
): Promise<{ manifest: E2eManifest; manifestPath: string }> {
  // Imports must follow the entry point's production/endpoint/app-fingerprint guards.
  const [{ dbPool }, schema, { auth }, { env }, { fingerprintE2eDatabase }] = await Promise.all([
    import('../../db/pool'),
    import('../../db/schema'),
    import('../../server/auth'),
    import('../../lib/env.server'),
    import('../../server/e2e'),
  ]);
  if (
    env.VERCEL_ENV !== 'preview' ||
    env.E2E_TEST_AUTH !== '1' ||
    fingerprintE2eDatabase(env.DATABASE_URL) !== input.fingerprint
  )
    throw new Error('E2E fixture guard failed');
  const counts = await dbPool.execute(
    sql`SELECT (SELECT count(*)::int FROM "user") AS users, (SELECT count(*)::int FROM themes) AS themes`,
  );
  const first = z.object({ users: z.number(), themes: z.number() }).parse(counts.rows[0]);
  if (first.users || first.themes)
    throw new Error('E2E requires a clean database with no existing users or themes');
  const runId = z.uuid().parse(input.runId),
    prefix = `e2e-${runId}`;
  const projects = Object.fromEntries(
    E2E_PROJECT_NAMES.map((project) => [
      project,
      {
        accounts: Object.fromEntries(
          E2E_ROLES.map((role) => [
            role,
            {
              id: `planned_${project}_${role}_${runId.replaceAll('-', '')}`,
              email: `e2e-${project}-${role.toLowerCase()}-${runId}@example.invalid`,
              password: randomBytes(32).toString('base64url'),
            },
          ]),
        ),
      },
    ]),
  );
  const published = Array.from({ length: 25 }, (_, index) => ({
    id: randomUUID(),
    slug: `${prefix}-${index + 1}`,
    nameEn: `E2E palette ${String(index + 1).padStart(2, '0')}`,
  }));
  const manifest = e2eManifestSchema.parse({
    v: 1,
    runId,
    mode: input.mode,
    baseURL: input.baseURL,
    assetOrigin: input.assetOrigin,
    fixturePrefix: prefix,
    databaseFingerprint: input.fingerprint,
    createdAt: new Date().toISOString(),
    projects,
    themes: published,
    aestheticSlug: prefix,
    aestheticNameEn: 'E2E palette',
    searchTerm: 'E2E palette',
    editorialCollection: { id: randomUUID(), slug: `${prefix}-collection` },
    generationRunId: null,
    publishEnabled:
      input.mode === 'remote' &&
      !!(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET),
  });
  const appCount = await dbPool.select({ id: schema.apps.id }).from(schema.apps).limit(1);
  const settingCount = await dbPool
    .select({ key: schema.siteSettings.key })
    .from(schema.siteSettings)
    .limit(1);
  const journal: Journal = {
    manifest,
    tagId: randomUUID(),
    appIds: [],
    settingKeys: [],
    auditIds: [],
    seedCatalog: !appCount.length,
    seedSettings: !settingCount.length,
    cleanupThemeIds: [],
  };
  await saveJournal(journal); // Recovery plan exists before the first mutation.
  let stage = 'disposable account creation';
  try {
    for (const project of E2E_PROJECT_NAMES)
      for (const role of E2E_ROLES) {
        const account = manifest.projects[project].accounts[role];
        const response = await auth.api.signUpEmail({
          body: {
            email: account.email,
            password: account.password,
            name: `E2E ${project} ${role}`,
          },
        });
        const result = z.object({ user: z.object({ id: z.string().min(1) }) }).parse(response);
        account.id = result.user.id;
        await saveJournal(journal);
        if (role === 'admin')
          await dbPool
            .update(schema.user)
            .set({ role: 'admin', emailVerified: true })
            .where(eq(schema.user.id, account.id));
        if (role === 'creator')
          await dbPool.insert(schema.creatorProfiles).values({
            userId: account.id,
            handle: `e2e_${project}_${runId.replaceAll('-', '').slice(0, 8)}`,
            displayName: `E2E ${project}`,
            status: 'approved',
            isAdult: true,
            reviewedAt: new Date(),
          });
      }
    process.stdout.write('Disposable role accounts created.\n');
    stage = 'app/settings catalog seeding';
    const { seedApps, seedSettings } = await import('../../server/services/seed-content');
    const actor = { kind: 'system', label: prefix } as const;
    if (journal.seedCatalog) {
      const seeded = await seedApps({ actor });
      if (seeded.data.auditId) journal.auditIds.push(seeded.data.auditId);
      journal.appIds = (await dbPool.select({ id: schema.apps.id }).from(schema.apps)).map(
        (row) => row.id,
      );
      await saveJournal(journal);
    }
    if (journal.seedSettings) {
      const seeded = await seedSettings({ actor });
      if (seeded.data.auditId) journal.auditIds.push(seeded.data.auditId);
      journal.settingKeys = seeded.data.identifiers;
      await saveJournal(journal);
    }
    stage = 'fixture taxonomy';
    await dbPool.insert(schema.tags).values({
      id: journal.tagId,
      slug: prefix,
      kind: 'aesthetic',
      nameEn: manifest.aestheticNameEn,
      nameAr: 'لوحات الاختبار',
      isActive: true,
    });
    stage = 'fixture rendering';
    const [
      { renderSampleSpec, playgroundStateSchema },
      { specHash },
      { renderPublishAssets },
      { createR2Storage },
      { themeAssetKey },
    ] = await Promise.all([
      import('../../content/render-sample'),
      import('../../lib/render/hash'),
      import('../../server/render/publish-assets'),
      import('../../server/storage/r2'),
      import('../../server/storage/keys'),
    ]);
    const spec = renderSampleSpec(playgroundStateSchema.parse({}));
    const hash = await specHash(spec);
    // Generated fixtures never read photos. This renderer dependency cannot perform storage I/O.
    const forbiddenStorage = async (): Promise<never> => {
      throw new Error('Generated E2E fixtures must not access source storage');
    };
    const firstTheme = manifest.themes[0];
    if (!firstTheme) throw new Error('Missing E2E theme plan');
    const rendered = await renderPublishAssets({
      themeId: firstTheme.id,
      assetVersion: 1,
      attemptId: randomUUID(),
      spec,
      storage: {
        getBytes: forbiddenStorage,
        put: forbiddenStorage,
        head: forbiddenStorage,
        deleteMany: forbiddenStorage,
        deletePrefix: forbiddenStorage,
        listPrefixes: forbiddenStorage,
        presignPut: forbiddenStorage,
      },
    });
    const storage =
      input.mode === 'remote'
        ? createR2Storage({
            accountId: env.R2_ACCOUNT_ID ?? '',
            accessKeyId: env.R2_ACCESS_KEY_ID ?? '',
            secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? '',
            bucket: env.R2_BUCKET ?? '',
          })
        : null;
    stage = 'rendered fixture insertion';
    for (const theme of manifest.themes) {
      const attemptId = randomUUID();
      const keys = new Map<string, string>();
      for (const file of rendered.files) {
        const name = path.posix.basename(file.key);
        const key = themeAssetKey(theme.id, 1, name, attemptId);
        keys.set(file.key, key);
        if (storage)
          await storage.put({
            key,
            body: file.body,
            contentType: file.contentType,
            cacheControl: 'public, max-age=31536000, immutable',
          });
        else {
          const target = assertOwnedE2ePath(path.join(e2eDirectory(runId), 'assets', key), runId);
          await mkdir(path.dirname(target), { recursive: true });
          await writeFile(target, file.body);
        }
      }
      const mappedKey = (old: string): string => {
        const key = keys.get(old);
        if (!key) throw new Error('Missing rendered fixture asset');
        return key;
      };
      const assets: ThemeAssets = {
        ...rendered.assets,
        thumb: mappedKey(rendered.assets.thumb),
        previewHome: mappedKey(rendered.assets.previewHome),
        previewLock: mappedKey(rendered.assets.previewLock),
        og: mappedKey(rendered.assets.og),
        wallpapers: Object.fromEntries(
          Object.entries(rendered.assets.wallpapers).map(([size, value]) => [
            size,
            { ...value, key: mappedKey(value.key) },
          ]),
        ),
      };
      await dbPool.insert(schema.themes).values({
        id: theme.id,
        slug: theme.slug,
        source: 'generated',
        status: 'published',
        nameEn: theme.nameEn,
        nameAr: `لوحة اختبار ${manifest.themes.indexOf(theme) + 1}`,
        spec,
        specHash: hash,
        assetVersion: 1,
        assets,
        assetsSpecHash: hash,
        dominantColor: rendered.dominantColor,
        colorFamily: rendered.colorFamily,
        previewHash: rendered.previewHash,
        publishedAt: new Date(),
        tagsText: `${prefix} ${manifest.aestheticNameEn}`,
      });
      await dbPool.insert(schema.themeTags).values({ themeId: theme.id, tagId: journal.tagId });
    }
    stage = 'fixture collection insertion';
    const collection = manifest.editorialCollection;
    if (collection) {
      await dbPool.insert(schema.collections).values({
        id: collection.id,
        slug: collection.slug,
        kind: 'editorial',
        visibility: 'public',
        titleEn: 'E2E collection',
        titleAr: 'مجموعة اختبار',
        coverThemeId: firstTheme.id,
        isPinned: true,
      });
      await dbPool.insert(schema.collectionItems).values(
        manifest.themes.slice(0, 3).map((theme, position) => ({
          collectionId: collection.id,
          themeId: theme.id,
          position,
        })),
      );
    }
    const manifestPath = path.join(e2eDirectory(runId), 'manifest.json');
    await writeFile(
      manifestPath,
      `${JSON.stringify(e2eManifestSchema.parse(manifest), null, 2)}\n`,
      { mode: 0o600 },
    );
    await saveJournal(journal);
    return { manifest, manifestPath };
  } catch (error) {
    await cleanupE2eFixtures(path.join(e2eDirectory(runId), 'journal.json')).catch(() => undefined);
    throw new Error(
      error instanceof Error && error.message.startsWith('E2E account creation returned HTTP')
        ? error.message
        : `E2E seed failed during ${stage}`,
      { cause: error },
    );
  }
}

export async function cleanupE2eFixtures(journalPath: string): Promise<void> {
  const target = path.resolve(journalPath);
  const directoryRunId = z
    .uuid()
    .length(36)
    .parse(path.basename(path.dirname(target)));
  assertOwnedE2ePath(target, directoryRunId);
  if (
    path.basename(target) !== 'journal.json' ||
    path.relative(target, await realpath(target)) !== '' ||
    (await stat(target)).size > 256 * 1024
  )
    throw new Error('Invalid E2E cleanup journal path/size');
  const journal = journalSchema.parse(JSON.parse(await readFile(target, 'utf8')));
  const { manifest } = journal;
  if (manifest.runId !== directoryRunId) throw new Error('E2E cleanup run directory mismatch');
  assertOwnedE2ePath(journalPath, manifest.runId);
  const [{ dbPool }, schema, { env }, { fingerprintE2eDatabase }] = await Promise.all([
    import('../../db/pool'),
    import('../../db/schema'),
    import('../../lib/env.server'),
    import('../../server/e2e'),
  ]);
  if (
    env.VERCEL_ENV !== 'preview' ||
    env.E2E_TEST_AUTH !== '1' ||
    fingerprintE2eDatabase(env.DATABASE_URL) !== manifest.databaseFingerprint
  )
    throw new Error('E2E cleanup database guard failed');
  const emails = Object.values(manifest.projects).flatMap((project) =>
    Object.values(project.accounts).map((entry) => entry.email),
  );
  const themeIds = manifest.themes.map((entry) => entry.id);
  const allThemeIds = await dbPool.transaction(async (tx) => {
    // Same user-first lock order as account deletion; wait for in-flight writers,
    // then revoke sessions and capture every theme before removing the users.
    const users = await tx
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(inArray(schema.user.email, emails))
      .orderBy(schema.user.id)
      .for('update');
    const userIds = users.map((entry) => entry.id);
    const owned = userIds.length
      ? await tx
          .select({ id: schema.themes.id })
          .from(schema.themes)
          .where(inArray(schema.themes.ownerId, userIds))
      : [];
    const allThemeIds = [...new Set([...themeIds, ...owned.map((entry) => entry.id)])];
    if (journal.cleanupThemeIds.length) {
      const previousRows = await tx
        .select({ id: schema.themes.id })
        .from(schema.themes)
        .where(inArray(schema.themes.id, journal.cleanupThemeIds));
      if (previousRows.some((entry) => !allThemeIds.includes(entry.id)))
        throw new Error('Saved E2E storage cleanup plan has an unrelated live theme');
    }
    const existingFixtures = await tx
      .select({ id: schema.themes.id, slug: schema.themes.slug })
      .from(schema.themes)
      .where(inArray(schema.themes.id, themeIds));
    const planned = new Map(manifest.themes.map((entry) => [entry.id, entry.slug]));
    if (existingFixtures.some((entry) => planned.get(entry.id) !== entry.slug))
      throw new Error('E2E cleanup theme ownership mismatch');
    const storageThemeIds = [...new Set([...journal.cleanupThemeIds, ...allThemeIds])];
    journal.cleanupThemeIds = storageThemeIds;
    // Persist before deleting rows: a failed R2 operation after commit must still
    // recover prefixes for themes created through the browser, not only seed IDs.
    await saveJournal(journal);
    const seedAudits = await tx
      .select({ action: schema.auditLog.action, meta: schema.auditLog.meta })
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.meta}->'actor'->>'label' = ${manifest.fixturePrefix}`);
    // Seed services atomically write these identifiers with their changes. This
    // recovers even if the process died before saving returned IDs to its journal.
    const seededApps: string[] = [],
      seededSettings: string[] = [];
    for (const audit of seedAudits) {
      const identifiers = z
        .array(z.string().min(1).max(160))
        .max(500)
        .parse(audit.meta.identifiers);
      if (audit.action === 'apps.seeded') seededApps.push(...identifiers);
      if (audit.action === 'settings.seeded') seededSettings.push(...identifiers);
    }
    const auditConditions = [inArray(schema.auditLog.entityId, allThemeIds)];
    if (userIds.length) auditConditions.push(inArray(schema.auditLog.actorId, userIds));
    if (journal.auditIds.length)
      auditConditions.push(inArray(schema.auditLog.id, journal.auditIds));
    // Interrupted seed calls are recoverable by their validated unique system label.
    auditConditions.push(
      sql`${schema.auditLog.meta}->'actor'->>'label' = ${manifest.fixturePrefix}`,
    );
    await tx.delete(schema.auditLog).where(or(...auditConditions));
    if (manifest.editorialCollection)
      await tx
        .delete(schema.collections)
        .where(
          and(
            eq(schema.collections.id, manifest.editorialCollection.id),
            eq(schema.collections.slug, manifest.editorialCollection.slug),
          ),
        );
    await tx.delete(schema.themes).where(inArray(schema.themes.id, allThemeIds));
    if (userIds.length) await tx.delete(schema.user).where(inArray(schema.user.id, userIds));
    await tx
      .delete(schema.tags)
      .where(and(eq(schema.tags.id, journal.tagId), eq(schema.tags.slug, manifest.aestheticSlug)));
    if (seededApps.length)
      await tx.delete(schema.apps).where(inArray(schema.apps.slug, seededApps));
    if (seededSettings.length)
      await tx.delete(schema.siteSettings).where(inArray(schema.siteSettings.key, seededSettings));
    return storageThemeIds;
  });
  // Storage deletion follows a confirmed database commit. Failed/uncertain commits preserve assets.
  if (manifest.mode === 'remote') {
    const [{ createR2Storage }, { themePrefix }] = await Promise.all([
      import('../../server/storage/r2'),
      import('../../server/storage/keys'),
    ]);
    const storage = createR2Storage({
      accountId: env.R2_ACCOUNT_ID ?? '',
      accessKeyId: env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? '',
      bucket: env.R2_BUCKET ?? '',
    });
    for (const id of allThemeIds) await storage.deletePrefix(themePrefix(id));
  }
  const directory = e2eDirectory(manifest.runId);
  if (path.resolve(directory) !== path.resolve('.tmp', 'e2e', manifest.runId))
    throw new Error('E2E cleanup path mismatch');
  await rm(directory, { recursive: true, force: true });
}
