import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rows: vi.fn(), life: vi.fn(), tags: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../../db/index', () => ({
  db: { select: () => ({ from: () => ({ where: mocks.rows }) }) },
}));
vi.mock('../../../server/cache', async () => ({
  CacheTags: (await import('../../../lib/cache-tags')).CacheTags,
  cacheLife: mocks.life,
  cacheTag: mocks.tags,
}));
import { getPublicSettings } from '../../../server/queries/settings';

const announcement = {
  enabled: true,
  textEn: 'A new collection',
  textAr: 'مجموعة جديدة',
  href: '/collections/new',
  tone: 'celebrate',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('cached public settings projection', () => {
  it('uses defaults when public settings have not yet been seeded', async () => {
    mocks.rows.mockResolvedValue([]);
    expect(await getPublicSettings()).toEqual({ announcement: null, heroCollectionSlug: null });
    expect(mocks.life).toHaveBeenCalledWith('hours');
    expect(mocks.tags).toHaveBeenCalledWith('settings');
  });

  it('assigns a stable full content hash without exposing private settings', async () => {
    mocks.rows.mockResolvedValue([
      { key: 'home.hero', value: { collectionSlug: 'new' } },
      { key: 'home.announcement', value: announcement },
    ]);
    const first = await getPublicSettings();
    const second = await getPublicSettings();
    expect(first).toEqual(second);
    expect(first.announcement?.id).toMatch(/^[0-9a-f]{64}$/);
    expect(first.heroCollectionSlug).toBe('new');
    expect(Object.keys(first).sort()).toEqual(['announcement', 'heroCollectionSlug']);
    mocks.rows.mockResolvedValue([
      { key: 'home.announcement', value: { ...announcement, textEn: 'Changed content' } },
    ]);
    expect((await getPublicSettings()).announcement?.id).not.toBe(first.announcement?.id);
  });

  it('returns null for a disabled announcement', async () => {
    mocks.rows.mockResolvedValue([
      { key: 'home.announcement', value: { ...announcement, enabled: false } },
    ]);
    expect((await getPublicSettings()).announcement).toBeNull();
  });

  it('falls back malformed stored announcement keys instead of rendering executable URLs', async () => {
    mocks.rows.mockResolvedValue([
      { key: 'home.announcement', value: { ...announcement, href: 'javascript:alert(1)' } },
    ]);
    expect(await getPublicSettings()).toEqual({ announcement: null, heroCollectionSlug: null });
  });
});
