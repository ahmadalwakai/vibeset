import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NATIVE_BETA_ORIGINALS, nativeBetaOriginalSchema } from '../../../content/native-beta';
import { specHash } from '../../../lib/render/hash';
import {
  assertNativeBetaTarget,
  parseNativeBetaArgs,
  validateNativeBetaPlan,
  writeNativeBetaAsset,
  refreshNativeBetaCaches,
} from '../../../scripts/prepare-native-beta';

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
const target = {
  DATABASE_URL:
    'postgresql://test:test@ep-noisy-cake-zaqvg8qz-pooler.c-4.eu-west-2.aws.neon.tech/vibeset?sslmode=require',
  DATABASE_URL_UNPOOLED:
    'postgresql://test:test@ep-noisy-cake-zaqvg8qz.c-4.eu-west-2.aws.neon.tech/vibeset?sslmode=require',
  NEXT_PUBLIC_SITE_URL: 'https://vibeset-iota.vercel.app',
};
const identities = NATIVE_BETA_ORIGINALS.map((source) => ({
  id: randomUUID(),
  slug: source.slug,
  specHash: source.specHash,
}));
const plan = {
  version: 1,
  origin: target.NEXT_PUBLIC_SITE_URL,
  publications: identities.map((identity) => ({
    themeId: identity.id,
    slug: identity.slug,
    specHash: identity.specHash,
    assetVersion: 1,
    attemptId: randomUUID(),
  })),
};

describe('reviewed native beta originals and operator boundaries', () => {
  it('keeps the exact three original specs, distinct algorithms and fingerprints without copying DEV IDs', async () => {
    expect(NATIVE_BETA_ORIGINALS).toHaveLength(3);
    expect(new Set(NATIVE_BETA_ORIGINALS.map((row) => row.spec.wallpaper.kind))).toEqual(
      new Set(['mesh', 'pattern', 'scatter']),
    );
    for (const source of NATIVE_BETA_ORIGINALS) {
      expect(await specHash(source.spec)).toBe(source.specHash);
      expect(source).not.toHaveProperty('id');
      expect(source.tagSlugs).toContain('y2k');
      expect(
        nativeBetaOriginalSchema.safeParse({ ...source, ownerId: 'copied-owner' }).success,
      ).toBe(false);
    }
  });
  it('keeps check read-only by default and rejects hidden mutation/connection arguments', () => {
    expect(parseNativeBetaArgs([])).toEqual({ command: 'check', help: false, cacheRefresh: 'api' });
    expect(parseNativeBetaArgs(['stage'])).toEqual({
      command: 'stage',
      help: false,
      cacheRefresh: 'api',
    });
    expect(parseNativeBetaArgs(['publish', '--cache-refresh=manual'])).toEqual({
      command: 'publish',
      help: false,
      cacheRefresh: 'manual',
    });
    for (const args of [
      ['stage', 'publish'],
      ['--database-url=secret'],
      ['publish', '--force'],
      ['--stage'],
      ['publish', '--cache-refresh=skip'],
      ['stage', '--cache-refresh=manual', '--cache-refresh=api'],
    ])
      expect(() => parseNativeBetaArgs(args)).toThrow();
  });
  it('manual cache mode emits the exact deduplicated pending tags without fetching or reading server env', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    try {
      await expect(
        refreshNativeBetaCaches(['themes', 'settings', 'themes'], 'manual'),
      ).resolves.toEqual({
        cacheRefresh: 'pending',
        pendingTags: ['themes', 'settings'],
      });
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('accepts only the reviewed MAIN endpoint/database and explicit production site', () => {
    expect(() => assertNativeBetaTarget(target)).not.toThrow();
    for (const patch of [
      {
        DATABASE_URL: target.DATABASE_URL.replace('noisy-cake-zaqvg8qz', 'summer-firefly-zacq6f23'),
      },
      { DATABASE_URL_UNPOOLED: target.DATABASE_URL_UNPOOLED.replace('/vibeset?', '/other?') },
      { DATABASE_URL: target.DATABASE_URL.replace('neon.tech', 'neon.tech.evil.example') },
      { DATABASE_URL: target.DATABASE_URL.replace('?sslmode=require', '') },
      { NEXT_PUBLIC_SITE_URL: 'https://vibeset-iota.vercel.app.evil.example' },
      { E2E_TEST_AUTH: '1' },
    ])
      expect(() => assertNativeBetaTarget({ ...target, ...patch })).toThrow();
  });
  it('binds every publication to the curated spec and actual freshly allocated database ID', () => {
    expect(validateNativeBetaPlan(plan, identities)).toEqual(plan);
    const changed = structuredClone(plan);
    const first = changed.publications[0];
    if (!first) throw new Error('Missing test plan entry');
    first.themeId = randomUUID();
    expect(() => validateNativeBetaPlan(changed, identities)).toThrow();
    const originalIdentity = identities[0];
    if (!originalIdentity) throw new Error('Missing test identity');
    first.themeId = originalIdentity.id;
    first.specHash = 'a'.repeat(64);
    expect(() => validateNativeBetaPlan(changed, identities)).toThrow();
    expect(() =>
      validateNativeBetaPlan({
        ...plan,
        publications: [plan.publications[0], plan.publications[0], plan.publications[2]],
      }),
    ).toThrow();
  });
  it('writes actual bytes once and rejects changed bytes, traversal and symbolic-link destinations', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vibeset-native-art-'));
    const outside = await mkdtemp(path.join(os.tmpdir(), 'vibeset-native-outside-'));
    temporary.push(root, outside);
    const key = `themes/${randomUUID()}/v1/${randomUUID()}/thumb.webp`;
    const bytes = new Uint8Array([12, 34, 56]);
    await writeNativeBetaAsset(root, key, bytes);
    await writeNativeBetaAsset(root, key, bytes);
    expect(await readFile(path.join(root, key))).toEqual(Buffer.from(bytes));
    await expect(writeNativeBetaAsset(root, key, new Uint8Array([99]))).rejects.toThrow(
      'different bytes',
    );
    await expect(writeNativeBetaAsset(root, '../escape.webp', bytes)).rejects.toThrow();
    await symlink(
      outside,
      path.join(root, 'linked'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await expect(writeNativeBetaAsset(root, 'linked/escape.webp', bytes)).rejects.toThrow(
      'symbolic links',
    );
  });
});
