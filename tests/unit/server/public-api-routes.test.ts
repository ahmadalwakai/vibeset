import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playgroundStateSchema, renderSampleSpec } from '../../../content/render-sample';
import type { CollectionDetailDTO, ThemeCardDTO, ThemeDetailDTO } from '../../../lib/dto';
import { HTTP_STATUS } from '../../../lib/result';
import { encodeCollectionCursor, encodeCursor } from '../../../lib/utils/cursor';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  themes: vi.fn(),
  detail: vi.fn(),
  collections: vi.fn(),
  collection: vi.fn(),
  tags: vi.fn(),
  apps: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: mocks.connection }));
vi.mock('@/server/queries/themes', () => ({
  listThemes: mocks.themes,
  getThemeDetail: mocks.detail,
}));
vi.mock('@/server/queries/collections', () => ({
  listPublicCollections: mocks.collections,
  getCollection: mocks.collection,
}));
vi.mock('@/server/queries/taxonomy', () => ({ listTags: mocks.tags }));
vi.mock('@/server/queries/apps', () => ({ listApps: mocks.apps }));

import { GET as themes } from '../../../app/api/v1/themes/route';
import { GET as detail } from '../../../app/api/v1/themes/[slug]/route';
import { GET as collections } from '../../../app/api/v1/collections/route';
import { GET as collection } from '../../../app/api/v1/collections/[slug]/route';
import { GET as tags } from '../../../app/api/v1/tags/route';
import { GET as apps } from '../../../app/api/v1/apps/route';

const publicCache = 'public, s-maxage=300, stale-while-revalidate=86400';
const firstId = 'f5497e73-9a14-4d82-a1eb-baa931101bce';
const secondId = 'af2ddd65-802c-4ce2-ae40-f65cc6f36cbd';
const card: ThemeCardDTO = {
  id: firstId,
  slug: 'lavender-haze',
  nameEn: 'Lavender Haze',
  nameAr: 'ضباب اللافندر',
  thumbUrl: null,
  dominantColor: null,
  tags: [],
  isFeatured: false,
  downloadCount: 0,
  favoriteCount: 0,
  creator: null,
  publishedAt: null,
};
const themeDetail: ThemeDetailDTO = {
  ...card,
  updatedAt: '2026-10-24T12:00:00.000Z',
  descriptionEn: null,
  descriptionAr: null,
  spec: renderSampleSpec(playgroundStateSchema.parse({ kind: 'mesh', palette: 'lavender' })),
  previewHomeUrl: null,
  previewLockUrl: null,
  ogUrl: null,
  wallpapers: [],
  remixOf: null,
};
const page = { items: [card], nextCursor: null };
const collectionDetail: CollectionDetailDTO = {
  id: secondId,
  slug: 'soft-season',
  kind: 'seasonal',
  titleEn: 'Soft Season',
  titleAr: 'موسم ناعم',
  coverThumbUrl: null,
  itemCount: 1,
  descriptionEn: null,
  descriptionAr: null,
  items: page,
};
const tagData = [{ slug: 'calm', kind: 'mood', nameEn: 'Calm', nameAr: 'هادئ' }];
const appData = [
  {
    slug: 'mail',
    name: 'Mail',
    aliases: ['Email'],
    category: 'productivity',
    glyph: 'envelope',
    rank: 1,
  },
];
function request(path: string): Request {
  return new Request(`https://vibeset.test/api/v1/${path}`);
}
function context(slug: string): { params: Promise<{ slug: string }> } {
  return { params: Promise.resolve({ slug }) };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.connection.mockResolvedValue(undefined);
  mocks.themes.mockResolvedValue(page);
  mocks.detail.mockResolvedValue(themeDetail);
  mocks.collections.mockResolvedValue([collectionDetail]);
  mocks.collection.mockResolvedValue(collectionDetail);
  mocks.tags.mockResolvedValue(tagData);
  mocks.apps.mockResolvedValue(appData);
});

const endpoints = [
  { name: 'themes', call: () => themes(request('themes')), data: page, query: mocks.themes },
  {
    name: 'theme detail',
    call: () => detail(request('themes/lavender-haze'), context('lavender-haze')),
    data: themeDetail,
    query: mocks.detail,
  },
  {
    name: 'collections',
    call: () => collections(),
    data: [collectionDetail],
    query: mocks.collections,
  },
  {
    name: 'collection detail',
    call: () => collection(request('collections/soft-season'), context('soft-season')),
    data: collectionDetail,
    query: mocks.collection,
  },
  { name: 'tags', call: () => tags(request('tags')), data: tagData, query: mocks.tags },
  { name: 'apps', call: () => apps(), data: appData, query: mocks.apps },
];

describe('public API v1 routes', () => {
  it.each(endpoints)(
    'returns the $name data envelope with exact public cache headers',
    async ({ call, data }) => {
      const response = await call();
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe(publicCache);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(await response.json()).toEqual({ data });
      expect(mocks.connection).toHaveBeenCalledOnce();
    },
  );

  it('passes normalized list filters and ignores unknown parameters', async () => {
    await themes(
      request('themes?q=%20Lavender%20&tags=y2k,calm,y2k&sort=new&limit=5&unknown=ignored'),
    );
    expect(mocks.themes).toHaveBeenCalledWith({
      q: 'Lavender',
      tags: ['calm', 'y2k'],
      sort: 'new',
      limit: 5,
    });
  });

  it('preserves normalized ID order and ignores every other IDs-mode argument', async () => {
    mocks.themes.mockResolvedValue({ items: [{ ...card, id: secondId }, card], nextCursor: null });
    const response = await themes(
      request(
        `themes?ids=${secondId.toUpperCase()},${firstId},${secondId}&q=x&color=invalid&sort=invalid&limit=999&cursor=invalid`,
      ),
    );
    expect(mocks.themes).toHaveBeenCalledWith({
      ids: [secondId, firstId],
      sort: 'trending',
      limit: 24,
    });
    expect(await response.json()).toEqual({
      data: { items: [{ ...card, id: secondId }, card], nextCursor: null },
    });
  });

  it('passes validated slug promises, collection cursors and tag kinds to queries', async () => {
    const cursor = encodeCollectionCursor({ s: 4, id: firstId });
    await detail(request('themes/lavender-haze'), context('lavender-haze'));
    await collection(
      request(`collections/soft-season?cursor=${cursor}&extra=ignored`),
      context('soft-season'),
    );
    await tags(request('tags?kind=mood&extra=ignored'));
    expect(mocks.detail).toHaveBeenCalledWith('lavender-haze');
    expect(mocks.collection).toHaveBeenCalledWith('soft-season', cursor);
    expect(mocks.tags).toHaveBeenCalledWith('mood');
  });

  it('calls unparameterized catalogue queries without arguments', async () => {
    await apps();
    await collections();
    expect(mocks.apps).toHaveBeenCalledWith();
    expect(mocks.collections).toHaveBeenCalledWith();
  });

  const invalidCases = [
    { name: 'short search', call: () => themes(request('themes?q=x')) },
    { name: 'too many tags', call: () => themes(request('themes?tags=a,b,c,d,e,f')) },
    { name: 'unknown colour', call: () => themes(request('themes?color=invalid')) },
    { name: 'oversized page', call: () => themes(request('themes?limit=49')) },
    { name: 'unknown sort', call: () => themes(request('themes?sort=random')) },
    { name: 'invalid UUID', call: () => themes(request('themes?ids=invalid')) },
    { name: 'invalid cursor', call: () => themes(request('themes?cursor=invalid')) },
    {
      name: 'sort-incompatible cursor',
      call: () =>
        themes(
          request(`themes?sort=new&cursor=${encodeCursor({ k: 'popular', s: 7, id: firstId })}`),
        ),
    },
    {
      name: 'invalid theme slug',
      call: () => detail(request('themes/invalid'), context('Invalid/slug')),
    },
    {
      name: 'invalid collection slug',
      call: () => collection(request('collections/invalid'), context('Invalid\n')),
    },
    {
      name: 'invalid collection cursor',
      call: () =>
        collection(request('collections/soft-season?cursor=invalid'), context('soft-season')),
    },
    {
      name: 'incompatible collection cursor',
      call: () =>
        collection(
          request(
            `collections/soft-season?cursor=${encodeCursor({ k: 'trending', s: 1, id: firstId })}`,
          ),
          context('soft-season'),
        ),
    },
    {
      name: 'duplicate collection cursor',
      call: () =>
        collection(request('collections/soft-season?cursor=a&cursor=b'), context('soft-season')),
    },
    { name: 'unknown tag kind', call: () => tags(request('tags?kind=colour')) },
    { name: 'duplicate tag kind', call: () => tags(request('tags?kind=mood&kind=style')) },
  ];
  it.each(invalidCases)(
    'rejects $name before any query with private no-store',
    async ({ call }) => {
      const response = await call();
      expect(response.status).toBe(HTTP_STATUS.VALIDATION);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(await response.json()).toMatchObject({ error: { code: 'VALIDATION' } });
      for (const query of endpoints.map(({ query }) => query)) expect(query).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      name: 'theme',
      call: () => detail(request('themes/missing'), context('missing')),
      query: mocks.detail,
    },
    {
      name: 'collection',
      call: () => collection(request('collections/missing'), context('missing')),
      query: mocks.collection,
    },
  ])('returns private JSON404 for an unknown $name', async ({ call, query }) => {
    query.mockResolvedValue(null);
    const response = await call();
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it.each(endpoints)(
    'sanitizes unexpected $name query errors as private JSON500',
    async ({ call, query }) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        query.mockRejectedValue(new Error('private database credentials and SQL'));
        const response = await call();
        expect(response.status).toBe(500);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(await response.json()).toEqual({
          error: { code: 'INTERNAL', message: 'An internal error occurred' },
        });
        expect(log).toHaveBeenCalledOnce();
      } finally {
        log.mockRestore();
      }
    },
  );
});
