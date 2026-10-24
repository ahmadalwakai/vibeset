import codec from 'lz-string';
import { describe, expect, it } from 'vitest';
import { decodeStudioShare, prepareStudioShareUrl } from '../../../lib/client/studio-share';
import { MAX_STUDIO_DRAFT_LENGTH, MAX_STUDIO_URL_LENGTH } from '../../../lib/studio';
import { wallpaperFixture } from '../render/wallpaper-fixture';

describe('bounded Studio share links', () => {
  it.each(['en', 'ar'] as const)(
    'round-trips a complete %s design including independent lock wallpaper',
    async (locale) => {
      const spec = wallpaperFixture();
      spec.lockWallpaper = {
        kind: 'pattern',
        pattern: 'bows',
        scale: 2.4,
        rotation: -7,
        colors: ['#ffffff', '#ff00ff'],
      };
      const result = await prepareStudioShareUrl(spec, {
        baseUrl: 'https://vibeset.test/old?remove=yes#hash',
        locale,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const url = new URL(result.url);
      expect(url.pathname).toBe(locale === 'ar' ? '/ar/studio' : '/studio');
      expect(url.hash).toBe('');
      expect([...url.searchParams.keys()]).toEqual(['s']);
      const compressed = url.searchParams.get('s');
      expect(compressed).toBeTruthy();
      expect(await decodeStudioShare(compressed ?? '')).toEqual(spec);
      expect(result.url.length).toBeLessThanOrEqual(MAX_STUDIO_URL_LENGTH);
    },
  );

  it('uses the same encoded format as existing lz-string links', async () => {
    const spec = wallpaperFixture();
    for (const seed of [0, 1, 42, 99, 2_147_483_647]) {
      spec.wallpaper = { kind: 'mesh', seed, points: 4, softness: 0.7, grain: 0, colors: null };
      expect(
        await decodeStudioShare(codec.compressToEncodedURIComponent(JSON.stringify(spec))),
      ).toEqual(spec);
    }
  });

  it.each(['home', 'lock'] as const)(
    'blocks private photo references in the %s wallpaper for encoding and decoding',
    async (target) => {
      const spec = wallpaperFixture();
      const image = {
        kind: 'image' as const,
        assetKey: 'uploads/wallpapers/13f76d3b-357b-41ee-b125-33dcddc061f8/full.jpg',
        focalX: 0.5,
        focalY: 0.5,
        dim: 0.1,
      };
      if (target === 'home') spec.wallpaper = image;
      else spec.lockWallpaper = image;
      await expect(
        prepareStudioShareUrl(spec, { baseUrl: 'https://vibeset.test' }),
      ).resolves.toEqual({ ok: false, reason: 'photo' });
      await expect(
        decodeStudioShare(codec.compressToEncodedURIComponent(JSON.stringify(spec))),
      ).resolves.toBeNull();
    },
  );

  it('checks the complete escaped URL length, including its origin', async () => {
    await expect(
      prepareStudioShareUrl(wallpaperFixture(), { baseUrl: `https://${'a'.repeat(5500)}.test` }),
    ).resolves.toEqual({ ok: false, reason: 'too-large' });
  });

  it.each(['javascript:alert(1)', 'https://user:password@vibeset.test/', 'not a URL'])(
    'rejects an unsafe URL base',
    async (baseUrl) => {
      await expect(prepareStudioShareUrl(wallpaperFixture(), { baseUrl })).resolves.toEqual({
        ok: false,
        reason: 'invalid',
      });
    },
  );

  it.each(['', '$', 'bad!encoding', 'A'.repeat(MAX_STUDIO_URL_LENGTH + 1), 'BYUwNmD2Q'])(
    'rejects malformed or oversized compressed input',
    async (value) => {
      await expect(decodeStudioShare(value)).resolves.toBeNull();
    },
  );

  it('rejects trailing data, truncated streams, invalid JSON, and invalid specs', async () => {
    const compressed = codec.compressToEncodedURIComponent(JSON.stringify(wallpaperFixture()));
    expect(await decodeStudioShare(`${compressed}A`)).toBeNull();
    expect(await decodeStudioShare(compressed.slice(0, -5))).toBeNull();
    expect(await decodeStudioShare(codec.compressToEncodedURIComponent('{broken'))).toBeNull();
    expect(await decodeStudioShare(codec.compressToEncodedURIComponent('{"v":1}'))).toBeNull();
  });

  it('caps expansion before JSON.parse even when a tiny link expands to a megabyte', async () => {
    const compressed = codec.compressToEncodedURIComponent('a'.repeat(1_000_000));
    expect(compressed.length).toBeLessThan(MAX_STUDIO_URL_LENGTH);
    expect(await decodeStudioShare(compressed)).toBeNull();
    const oversized = codec.compressToEncodedURIComponent(
      `{"v":1,"padding":"${'a'.repeat(MAX_STUDIO_DRAFT_LENGTH)}"}`,
    );
    expect(await decodeStudioShare(oversized)).toBeNull();
  });
});
