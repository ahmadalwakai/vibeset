import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { playgroundStateSchema, renderSampleSpec } from '../../../content/render-sample';
import type * as MapperModule from '../../../server/queries/mappers';
import type { ThemeDetailRow } from '../../../server/queries/mappers';
import type { ThemeAssets } from '../../../lib/theme-assets';

vi.mock('server-only', () => ({}));
let mappers: typeof MapperModule;
beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://vibeset.example');
  vi.stubEnv('NEXT_PUBLIC_CDN_URL', 'https://cdn.vibeset.example/assets');
  mappers = await import('../../../server/queries/mappers');
});
afterAll(() => vi.unstubAllEnvs());

function row(): ThemeDetailRow {
  return {
    id: randomUUID(),
    slug: 'lavender-haze',
    nameEn: 'Lavender Haze',
    nameAr: 'ضباب اللافندر',
    descriptionEn: 'Soft',
    descriptionAr: 'ناعم',
    assets: null,
    dominantColor: '#d1b2ef',
    isFeatured: false,
    downloadCount: 4,
    favoriteCount: 3,
    publishedAt: null,
    tags: [{ slug: 'y2k', kind: 'aesthetic', nameEn: 'Y2K', nameAr: 'واي تو كي' }],
    creator: null,
    remixOf: null,
    spec: renderSampleSpec(playgroundStateSchema.parse({ kind: 'mesh', palette: 'lavender' })),
  };
}

function assets(): ThemeAssets {
  const prefix = `themes/${randomUUID()}/v1/${randomUUID()}`;
  return {
    version: 1,
    thumb: `${prefix}/thumb.webp`,
    previewHome: `${prefix}/preview-home.webp`,
    previewLock: `${prefix}/preview-lock.webp`,
    og: `${prefix}/og.jpg`,
    wallpapers: { phone: { key: `${prefix}/wallpaper-phone.jpg`, w: 1080, h: 2340, bytes: 1234 } },
  };
}

describe('public query DTO mappers', () => {
  it('keeps both languages and maps null assets to null URLs and no downloads', () => {
    const result = mappers.toThemeDetail(row());
    expect(result).toMatchObject({
      nameEn: 'Lavender Haze',
      nameAr: 'ضباب اللافندر',
      thumbUrl: null,
      previewHomeUrl: null,
      previewLockUrl: null,
      ogUrl: null,
      publishedAt: null,
      wallpapers: [],
    });
  });

  it('builds absolute CDN URLs and omits missing wallpaper sizes', () => {
    const source = row();
    source.assets = assets();
    source.publishedAt = new Date('2026-10-24T12:00:00Z');
    const result = mappers.toThemeDetail(source);
    expect(result.thumbUrl).toBe(`https://cdn.vibeset.example/assets/${source.assets.thumb}`);
    expect(result.wallpapers).toEqual([
      {
        size: 'phone',
        url: `https://cdn.vibeset.example/assets/${source.assets.wallpapers.phone?.key}`,
        w: 1080,
        h: 2340,
        bytes: 1234,
      },
    ]);
    expect(result.publishedAt).toBe('2026-10-24T12:00:00.000Z');
  });

  it('projects explicit fields rather than spreading database/private properties', () => {
    const source = {
      ...row(),
      ownerId: 'private-owner',
      rejectionReason: 'private-reason',
      publishError: 'private-error',
      email: 'private@example.test',
    };
    const result = mappers.toThemeCard(source);
    expect(Object.keys(result).sort()).toEqual(
      [
        'id',
        'slug',
        'nameEn',
        'nameAr',
        'thumbUrl',
        'dominantColor',
        'tags',
        'isFeatured',
        'downloadCount',
        'favoriteCount',
        'creator',
        'publishedAt',
      ].sort(),
    );
    expect(JSON.stringify(result)).not.toContain('private-');
  });

  it('maps creator avatars and allows only safe public HTTP links', () => {
    const result = mappers.toCreatorPublic(
      {
        handle: 'artist',
        displayName: 'Artist',
        avatarKey: 'avatars/artist/abc.webp',
        bio: 'Art',
        links: [
          { label: 'Site', url: 'https://example.test/' },
          { label: 'Unsafe', url: 'javascript:alert(1)' },
          { label: 'Credentials', url: 'https://user:password@example.test/' },
        ],
      },
      { items: [], nextCursor: null },
    );
    expect(result.avatarUrl).toBe('https://cdn.vibeset.example/assets/avatars/artist/abc.webp');
    expect(result.links).toEqual([{ label: 'Site', url: 'https://example.test/' }]);
    expect(result.themes).toEqual({ items: [], nextCursor: null });
  });

  it('maps public collection covers and excludes app installation metadata', () => {
    expect(
      mappers.toCollectionCard({
        id: randomUUID(),
        slug: 'cozy',
        kind: 'editorial',
        titleEn: 'Cozy',
        titleAr: null,
        coverThumbKey: null,
        itemCount: 0,
      }).coverThumbUrl,
    ).toBeNull();
    expect(
      mappers.toApp({
        slug: 'mail',
        name: 'Mail',
        aliases: ['Email'],
        category: 'productivity',
        glyph: 'envelope',
        rank: 1,
        iosScheme: 'private',
      } as Parameters<typeof mappers.toApp>[0]),
    ).toEqual({
      slug: 'mail',
      name: 'Mail',
      aliases: ['Email'],
      category: 'productivity',
      glyph: 'envelope',
      rank: 1,
    });
  });
});
