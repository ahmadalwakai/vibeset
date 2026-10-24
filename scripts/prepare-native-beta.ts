import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { NATIVE_BETA_ACTOR, NATIVE_BETA_ORIGINALS } from '../content/native-beta';
import { canonicalJson, specHash } from '../lib/render/hash';
import { storageKeySchema } from '../lib/validation/storage';
import { CacheTags } from '../lib/cache-tags';

const ORIGIN = 'https://vibeset-iota.vercel.app';
const directory = path.resolve('content/native-beta');
const planFile = path.join(directory, 'publication-plan.json');
const manifestFile = path.join(directory, 'publication.json');
const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const planSchema = z.strictObject({
  version: z.literal(1),
  origin: z.literal(ORIGIN),
  publications: z
    .array(
      z.strictObject({
        themeId: z.uuid().length(36),
        slug: z.string(),
        specHash: z.string().length(64),
        assetVersion: z.literal(1),
        attemptId: z.uuid().length(36),
      }),
    )
    .length(3),
});
export type NativeBetaPlan = z.infer<typeof planSchema>;
type Identity = { id: string; slug: string; specHash: string };

export function validateNativeBetaPlan(
  value: unknown,
  identities?: readonly Identity[],
): NativeBetaPlan {
  const plan = planSchema.parse(value);
  if (
    new Set(plan.publications.map((item) => item.themeId)).size !== 3 ||
    new Set(plan.publications.map((item) => item.slug)).size !== 3
  )
    throw new Error('The publication plan must contain three distinct originals');
  for (const item of plan.publications) {
    if (
      !NATIVE_BETA_ORIGINALS.some(
        (source) => source.slug === item.slug && source.specHash === item.specHash,
      ) ||
      (identities &&
        !identities.some(
          (row) =>
            row.id === item.themeId && row.slug === item.slug && row.specHash === item.specHash,
        ))
    )
      throw new Error(
        'The publication plan differs from the curated originals or database identities',
      );
  }
  return plan;
}

export function parseNativeBetaArgs(args: readonly string[]): {
  command: 'check' | 'stage' | 'publish';
  help: boolean;
  cacheRefresh: 'api' | 'manual';
} {
  const parsed = parseArgs({
    args: [...args],
    strict: true,
    allowPositionals: true,
    tokens: true,
    options: { help: { type: 'boolean' }, 'cache-refresh': { type: 'string' } },
  });
  const seen = new Set<string>();
  for (const token of parsed.tokens)
    if (token.kind === 'option') {
      if (seen.has(token.name)) throw new Error('Each option may be supplied only once');
      seen.add(token.name);
    }
  if (parsed.positionals.length > 1) throw new Error('Choose one command');
  return z
    .strictObject({
      command: z.enum(['check', 'stage', 'publish']),
      help: z.boolean().default(false),
      cacheRefresh: z.enum(['api', 'manual']).default('api'),
    })
    .parse({
      command: parsed.positionals[0] ?? 'check',
      help: parsed.values.help,
      cacheRefresh: parsed.values['cache-refresh'],
    });
}

/** Never loads .env.local or accepts a database connection in command arguments. */
export function assertNativeBetaTarget(
  environment: Readonly<Record<string, string | undefined>>,
): void {
  for (const key of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED']) {
    try {
      const url = new URL(environment[key] ?? '');
      if (
        !['postgres:', 'postgresql:'].includes(url.protocol) ||
        url.pathname !== '/vibeset' ||
        !/^ep-noisy-cake-zaqvg8qz(?:-pooler)?\.[a-z0-9.-]+\.neon\.tech$/.test(url.hostname) ||
        !['require', 'verify-full'].includes(url.searchParams.get('sslmode') ?? '')
      )
        throw new Error();
    } catch {
      throw new Error('This operator requires the explicitly reviewed MAIN database');
    }
  }
  if (environment.NEXT_PUBLIC_SITE_URL !== ORIGIN || environment.E2E_TEST_AUTH === '1')
    throw new Error(
      'The operator requires the reviewed production site without E2E authentication',
    );
}

async function readJson(file: string): Promise<unknown> {
  const bytes = await readFile(file);
  if (bytes.byteLength > 256_000) throw new Error('Publication metadata is too large');
  return JSON.parse(bytes.toString('utf8')) as unknown;
}

async function optionalJson(file: string): Promise<unknown | undefined> {
  try {
    return await readJson(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function writeOnce(file: string, value: unknown): Promise<unknown> {
  try {
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    return readJson(file);
  }
}

/** Append-only public files: reject traversal, existing links and changed bytes. */
export async function writeNativeBetaAsset(
  publicRoot: string,
  key: string,
  bytes: Uint8Array,
): Promise<void> {
  storageKeySchema.parse(key);
  const root = path.resolve(publicRoot),
    destination = path.resolve(root, key);
  if (!destination.startsWith(`${root}${path.sep}`))
    throw new Error('Asset escaped the public directory');
  const parts = path.relative(root, destination).split(path.sep);
  let current = root;
  for (const part of ['', ...parts]) {
    current = path.join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new Error('Publication paths cannot use symbolic links');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  await mkdir(path.dirname(destination), { recursive: true });
  try {
    await writeFile(destination, bytes, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (digest(await readFile(destination)) !== digest(bytes))
      throw new Error('An immutable asset already contains different bytes');
  }
}

export async function refreshNativeBetaCaches(
  tags: readonly string[],
  mode: 'api' | 'manual',
): Promise<{
  cacheRefresh: 'complete' | 'pending';
  pendingTags: string[];
}> {
  const unique = [...new Set(tags)];
  if (mode === 'manual')
    return { cacheRefresh: unique.length ? 'pending' : 'complete', pendingTags: unique };
  if (!unique.length) return { cacheRefresh: 'complete', pendingTags: [] };
  const { env } = await import('../lib/env.server');
  const response = await fetch(new URL('/api/internal/revalidate', ORIGIN), {
    method: 'POST',
    credentials: 'omit',
    redirect: 'error',
    headers: {
      authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ tags: unique }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('Content is committed; cache refresh needs a retry');
  return { cacheRefresh: 'complete', pendingTags: [] };
}

async function checkOriginals(): Promise<void> {
  const { loadGeneratorManifest } = await import('../server/render/generator-preview');
  const { qaSpec } = await import('../lib/render/qa');
  const manifest = await loadGeneratorManifest();
  for (const source of NATIVE_BETA_ORIGINALS) {
    if ((await specHash(source.spec)) !== source.specHash || !qaSpec(source.spec, manifest).ok)
      throw new Error('An original failed integrity or renderer QA');
  }
}

async function stage(mode: 'api' | 'manual'): Promise<void> {
  const { seedTaxonomy, seedSettings } = await import('../server/services/seed-content');
  const { importNativeBetaContent, getNativeBetaContent } =
    await import('../server/services/native-beta-content');
  const { transitionThemeStatus } = await import('../server/services/theme-status');
  const { renderPublishAssets } = await import('../server/render/publish-assets');
  const { defaultStorage } = await import('../server/storage/r2');
  const { staticPublicationManifestSchema } = await import('../server/storage/prepublished-static');
  const taxonomy = await seedTaxonomy({ actor: NATIVE_BETA_ACTOR });
  const settings = await seedSettings({ actor: NATIVE_BETA_ACTOR });
  const before = await optionalJson(planFile);
  const imported =
    before === undefined
      ? await importNativeBetaContent(NATIVE_BETA_ACTOR)
      : await getNativeBetaContent(NATIVE_BETA_ACTOR);
  if (
    before === undefined &&
    imported.data.themes.some((row) => row.status === 'published' || row.assetVersion !== 0)
  )
    throw new Error('Published originals require their existing committed publication plan');
  const plan = validateNativeBetaPlan(
    await writeOnce(
      planFile,
      before ?? {
        version: 1,
        origin: ORIGIN,
        publications: imported.data.themes.map((row) => ({
          themeId: row.id,
          slug: row.slug,
          specHash: row.specHash,
          assetVersion: 1,
          attemptId: randomUUID(),
        })),
      },
    ),
    imported.data.themes,
  );
  const publications = [];
  for (const item of plan.publications) {
    const source = NATIVE_BETA_ORIGINALS.find((row) => row.slug === item.slug);
    const row = imported.data.themes.find((theme) => theme.id === item.themeId);
    if (
      !source ||
      !row ||
      row.assetVersion !== (row.status === 'published' ? 1 : 0) ||
      (row.status === 'published' && row.assetsSpecHash !== source.specHash)
    )
      throw new Error('Publication snapshot changed');
    if (row.status === 'draft')
      await transitionThemeStatus({ themeId: row.id, to: 'approved', actor: NATIVE_BETA_ACTOR });
    const rendered = await renderPublishAssets({
      themeId: row.id,
      assetVersion: 1,
      attemptId: item.attemptId,
      spec: source.spec,
      storage: defaultStorage,
    });
    if (rendered.previewHash !== source.previewHash) throw new Error('Wallpaper fingerprint drift');
    const files = rendered.files.map((file) => ({
      key: file.key,
      sha256: digest(file.body),
      bytes: file.body.byteLength,
      contentType: file.contentType,
    }));
    staticPublicationManifestSchema.parse({
      version: 1,
      origin: ORIGIN,
      publications: [
        {
          themeId: item.themeId,
          specHash: item.specHash,
          assetVersion: 1,
          attemptId: item.attemptId,
          files,
        },
      ],
    });
    for (const file of rendered.files) await writeNativeBetaAsset('public', file.key, file.body);
    publications.push({
      themeId: row.id,
      specHash: item.specHash,
      assetVersion: 1,
      attemptId: item.attemptId,
      files,
    });
  }
  const manifest = staticPublicationManifestSchema.parse({
    version: 1,
    origin: ORIGIN,
    publications,
  });
  if (canonicalJson(await writeOnce(manifestFile, manifest)) !== canonicalJson(manifest))
    throw new Error('The immutable publication manifest already differs');
  const cache = await refreshNativeBetaCaches(
    [...taxonomy.tags, ...settings.tags, ...imported.tags, CacheTags.themes],
    mode,
  );
  process.stdout.write(
    `${JSON.stringify({
      staged: 3,
      files: publications.reduce((sum, item) => sum + item.files.length, 0),
      plan: 'content/native-beta/publication-plan.json',
      manifest: 'content/native-beta/publication.json',
      published: 0,
      ...cache,
    })}\n`,
  );
}

async function publish(mode: 'api' | 'manual'): Promise<void> {
  if (process.env.NEXT_PUBLIC_CDN_URL !== ORIGIN)
    throw new Error('Deploy the verified static asset origin before publication');
  const { getNativeBetaContent } = await import('../server/services/native-beta-content');
  const { publishTheme } = await import('../server/services/theme-publish');
  const { getThemeCacheTags } = await import('../server/services/theme-cache-tags');
  const { createPrepublishedStaticStorage, staticPublicationManifestSchema } =
    await import('../server/storage/prepublished-static');
  const current = await getNativeBetaContent(NATIVE_BETA_ACTOR);
  const plan = validateNativeBetaPlan(await readJson(planFile), current.data.themes);
  const manifest = staticPublicationManifestSchema.parse(await readJson(manifestFile));
  if (manifest.origin !== ORIGIN || manifest.publications.length !== 3)
    throw new Error('Unexpected publication manifest');
  for (const item of manifest.publications) {
    if (
      !plan.publications.some(
        (planned) =>
          planned.themeId === item.themeId &&
          planned.specHash === item.specHash &&
          planned.assetVersion === item.assetVersion &&
          planned.attemptId === item.attemptId,
      )
    )
      throw new Error('Manifest differs from its committed plan');
    const row = current.data.themes.find((theme) => theme.id === item.themeId);
    if (
      !row ||
      !['approved', 'published'].includes(row.status) ||
      row.assetVersion !==
        (row.status === 'published' ? item.assetVersion : item.assetVersion - 1) ||
      (row.status === 'published' &&
        (row.assetsSpecHash !== item.specHash ||
          !row.assets ||
          [
            row.assets.thumb,
            row.assets.previewHome,
            row.assets.previewLock,
            row.assets.og,
            ...Object.values(row.assets.wallpapers).map((wallpaper) => wallpaper.key),
          ]
            .sort()
            .join(',') !==
            item.files
              .map((file) => file.key)
              .sort()
              .join(',')))
    )
      throw new Error('Publication state differs from its plan');
  }
  const storage = createPrepublishedStaticStorage(manifest);
  // Verify every real deployed object before making even the first theme public.
  for (const publication of manifest.publications)
    for (const file of publication.files) await storage.getBytes(file.key);
  let published = 0,
    skipped = 0;
  try {
    for (const item of manifest.publications) {
      const result = await publishTheme({
        themeId: item.themeId,
        actor: NATIVE_BETA_ACTOR,
        preparedAttemptId: item.attemptId,
        storage,
      });
      if (result.data.skipped) skipped += 1;
      else published += 1;
    }
  } finally {
    // Includes uncertain COMMIT outcomes; retries preserve all immutable files.
    const tags = await Promise.all(
      current.data.themes.map((theme) => getThemeCacheTags({ ...theme, ownerId: null })),
    );
    const cache = await refreshNativeBetaCaches(tags.flat(), mode);
    process.stdout.write(
      `${JSON.stringify({
        published,
        skipped,
        origin: ORIGIN,
        verifiedFiles: 21,
        ...cache,
        failedCommandNeedsDatabaseInspection: published + skipped !== 3,
      })}\n`,
    );
  }
}

async function main(): Promise<void> {
  let close: (() => Promise<void>) | undefined;
  try {
    const args = parseNativeBetaArgs(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(
        'Usage: tsx --conditions=react-server scripts/prepare-native-beta.ts check|stage|publish [--cache-refresh=api|manual]\n',
      );
      return;
    }
    if (
      canonicalJson(await readJson(path.join(directory, 'originals.json'))) !==
      canonicalJson(NATIVE_BETA_ORIGINALS)
    )
      throw new Error('Run the operator from the reviewed Vibeset repository root');
    await checkOriginals();
    if (args.command === 'check') {
      process.stdout.write(
        'Three curated original specs pass integrity and renderer QA. No database/storage access.\n',
      );
      return;
    }
    assertNativeBetaTarget(process.env);
    const { pool } = await import('../db/pool');
    close = () => pool.end();
    if (args.command === 'stage') await stage(args.cacheRefresh);
    else await publish(args.cacheRefresh);
  } catch {
    process.stderr.write(
      'Native beta preparation failed. No credential details are logged; committed data/assets are preserved for an inspected retry.\n',
    );
    process.exitCode = 1;
  } finally {
    if (close) await close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
