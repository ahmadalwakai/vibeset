import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { defaultSettings, settingSchemas } from '../../../lib/settings';

const { select, limit } = vi.hoisted(() => {
  const limit = vi.fn<() => Promise<{ value: unknown }[]>>();
  return { limit, select: vi.fn(() => ({ from: () => ({ where: () => ({ limit }) }) })) };
});
vi.mock('server-only', () => ({}));
vi.mock('../../../db/index', () => ({ db: { select } }));

import { getFeatures, getSetting } from '../../../server/services/settings';

beforeEach(() => {
  vi.clearAllMocks();
  limit.mockResolvedValue([]);
});

describe('uncached site settings', () => {
  it('returns documented complete defaults for absent rows', async () => {
    expect(await getSetting('home.hero')).toEqual({ collectionSlug: null });
    expect(await getSetting('home.announcement')).toEqual(defaultSettings['home.announcement']);
    expect(await getFeatures()).toEqual({
      creatorApplicationsOpen: true,
      uploadsEnabled: true,
      reportsEnabled: true,
    });
    expect(select).toHaveBeenCalledTimes(3);
  });

  it('honors valid stored feature flags on every uncached read', async () => {
    limit.mockResolvedValueOnce([
      { value: { creatorApplicationsOpen: false, uploadsEnabled: false, reportsEnabled: true } },
    ]);
    expect((await getFeatures()).uploadsEnabled).toBe(false);
    expect((await getFeatures()).uploadsEnabled).toBe(true);
  });

  it('falls back on malformed stored JSON without sharing mutable default objects', async () => {
    limit.mockResolvedValue([{ value: { uploadsEnabled: false } }]);
    const features = await getFeatures();
    features.uploadsEnabled = false;
    expect((await getFeatures()).uploadsEnabled).toBe(true);
  });

  it('propagates database failures instead of silently enabling default features', async () => {
    limit.mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(getFeatures()).rejects.toThrow('Database unavailable');
  });

  it('rejects unknown setting keys before querying', async () => {
    await expect(Reflect.apply(getSetting, undefined, ['unsupported'])).rejects.toThrow(ZodError);
    expect(select).not.toHaveBeenCalled();
  });

  it.each([
    'javascript:alert(1)',
    '//example.com',
    '//vibeset.invalid/path',
    '/\\example.com',
    '/path\nnext',
    '/%2f%2fhost',
    '/%252f%252fhost',
    '/%5chost',
    '/%255chost',
    '/%0ahost',
    '/%250ahost',
    '/%not-encoded',
    'https://user:password@example.com',
    'https://user@example.com',
    'http://:password@example.com',
    ' https://example.com',
    'https:/example.com',
  ])('rejects unsafe announcement href %s', (href) => {
    expect(
      settingSchemas['home.announcement'].safeParse({
        ...defaultSettings['home.announcement'],
        href,
      }).success,
    ).toBe(false);
  });

  it.each([
    '/explore?sort=new',
    '/sign-in',
    '/collections/%D8%B9%D8%B1%D8%A8%D9%8A',
    'https://vibeset.app/explore',
    'http://example.com/path?query=value#section',
  ])('accepts a safe announcement href %s', (href) => {
    expect(
      settingSchemas['home.announcement'].safeParse({
        ...defaultSettings['home.announcement'],
        href,
      }).success,
    ).toBe(true);
  });
});
