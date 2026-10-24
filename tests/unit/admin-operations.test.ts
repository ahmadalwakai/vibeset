import { describe, expect, it } from 'vitest';
import { adminEntityLink } from '../../lib/admin-entity-link';
import {
  collectionIsInWindow,
  selectHomeCollections,
  selectHomeHero,
} from '../../lib/collection-window';
import type { HomeCollectionCandidate } from '../../lib/collection-window';
import { defaultSettings, parseStoredSetting, settingSchemas } from '../../lib/settings';
import {
  adminAuditQuerySchema,
  adminGenerateDraftsSchema,
  adminGenerationQuerySchema,
  adminUpdateSettingSchema,
} from '../../lib/validation/admin-operations';

describe('admin operations boundaries', () => {
  it('bounds generator work and rejects actor/automatic-publication injection', () => {
    const valid = { aesthetic: 'y2k', count: 12, seed: 0 };
    expect(adminGenerateDraftsSchema.parse(valid)).toEqual(valid);
    expect(adminGenerateDraftsSchema.parse({ aesthetic: 'y2k', count: 24 })).toEqual({
      aesthetic: 'y2k',
      count: 24,
    });
    for (const input of [
      { ...valid, count: 0 },
      { ...valid, count: 25 },
      { ...valid, count: 1.5 },
      { ...valid, count: '12' },
      { ...valid, seed: -1 },
      { ...valid, seed: 2147483648 },
      { ...valid, aesthetic: 'y2k\n' },
      { ...valid, actor: { kind: 'system' } },
      { ...valid, autoApprove: true },
    ])
      expect(adminGenerateDraftsSchema.safeParse(input).success).toBe(false);
  });
  it('keeps setting key/value payloads exact, bounded and bilingual when enabled', () => {
    expect(
      adminUpdateSettingSchema.safeParse({ key: 'features', value: defaultSettings.features })
        .success,
    ).toBe(true);
    for (const input of [
      { key: 'home.hero', value: defaultSettings.features },
      { key: 'features', value: { ...defaultSettings.features, unsupported: true } },
      { key: 'unsupported', value: {} },
      { key: 'home.hero', value: { collectionSlug: 'valid\n' } },
      { key: 'home.hero', value: { collectionSlug: 'a'.repeat(161) } },
      {
        key: 'home.announcement',
        value: { ...defaultSettings['home.announcement'], enabled: true, textEn: 'Hello' },
      },
      {
        key: 'home.announcement',
        value: { ...defaultSettings['home.announcement'], textAr: 'a'.repeat(281) },
      },
      {
        key: 'home.announcement',
        value: { ...defaultSettings['home.announcement'], textEn: 'a\u0000b' },
      },
      {
        key: 'home.announcement',
        value: {
          ...defaultSettings['home.announcement'],
          href: 'https://example.com/' + 'x'.repeat(2048),
        },
      },
    ])
      expect(adminUpdateSettingSchema.safeParse(input).success).toBe(false);
    expect(
      settingSchemas['home.announcement'].parse({
        ...defaultSettings['home.announcement'],
        enabled: true,
        textEn: ' Cafe\u0301 ',
        textAr: ' إعلان ',
      }).textEn,
    ).toBe('Café');
    const missing = settingSchemas['home.announcement'].safeParse({
      ...defaultSettings['home.announcement'],
      enabled: true,
    });
    expect(
      missing.success ? [] : missing.error.issues.map((issue) => issue.path.join('.')).sort(),
    ).toEqual(['textAr', 'textEn']);
  });
  it('falls back an invalid whole key without contaminating other settings/default instances', () => {
    expect(parseStoredSetting('home.hero', { collectionSlug: '//bad' })).toEqual({
      collectionSlug: null,
    });
    expect(
      parseStoredSetting('home.announcement', {
        ...defaultSettings['home.announcement'],
        href: 'javascript:bad',
      }),
    ).toEqual(defaultSettings['home.announcement']);
    const first = parseStoredSetting('features', { uploadsEnabled: false });
    first.uploadsEnabled = false;
    expect(parseStoredSetting('features', undefined).uploadsEnabled).toBe(true);
  });
  it('accepts real UTC dates, ordered ranges and bounded scalar filters', () => {
    expect(
      adminAuditQuerySchema.parse({ from: '2024-02-29', to: '2024-03-01', action: 'theme._%' })
        .action,
    ).toBe('theme._%');
    for (const value of [
      { from: '2026-02-29' },
      { from: '2026-10-25', to: '2026-10-24' },
      { page: '2\n' },
      { page: ['1', '2'] },
      { actor: 'a\u0000' },
      { action: 'x'.repeat(257) },
      { unsupported: true },
    ])
      expect(adminAuditQuerySchema.safeParse(value).success).toBe(false);
    expect(adminGenerationQuerySchema.parse({ aesthetic: '', page: '2' })).toEqual({ page: 2 });
  });
  it('links only supported entities and never treats audit data as a URL', () => {
    const id = '12345678-1234-4123-8123-123456789abc';
    expect(adminEntityLink('theme', id.toUpperCase())).toBe(`/admin/themes/${id}`);
    expect(adminEntityLink('collection', id)).toBe(`/admin/collections/${id}`);
    expect(adminEntityLink('setting', 'home.hero')).toBe('/admin/settings');
    expect(adminEntityLink('generation_run', id)).toBe(`/admin/review?run=${id}`);
    for (const [type, value] of [
      ['theme', 'javascript:alert(1)'],
      ['theme', id + '\n'],
      ['user', id],
      ['setting', '/bad'],
    ])
      expect(adminEntityLink(type ?? '', value ?? '')).toBeNull();
  });
});

const candidate = (
  slug: string,
  patch: Partial<HomeCollectionCandidate> = {},
): HomeCollectionCandidate => ({
  id: slug,
  slug,
  kind: 'editorial',
  titleEn: slug,
  titleAr: null,
  coverThumbUrl: null,
  itemCount: 0,
  descriptionEn: null,
  descriptionAr: null,
  isPinned: true,
  startsAt: null,
  endsAt: null,
  ...patch,
});
describe('request-time Home collection schedules', () => {
  const start = '2026-10-24T12:00:00.000Z',
    end = '2026-10-24T13:00:00.000Z';
  const seasonal = candidate('season', { kind: 'seasonal', startsAt: start, endsAt: end });
  const rows = [seasonal, candidate('unpinned', { isPinned: false }), candidate('pinned')];
  it('includes start, excludes end, and uses a cached snapshot safely across both boundaries', () => {
    expect(collectionIsInWindow(seasonal, Date.parse(start) - 1)).toBe(false);
    expect(collectionIsInWindow(seasonal, Date.parse(start))).toBe(true);
    expect(collectionIsInWindow(seasonal, Date.parse(end))).toBe(false);
    expect(selectHomeHero(rows, 'season', Date.parse(start))?.slug).toBe('season');
    expect(selectHomeHero(rows, 'season', Date.parse(end))?.slug).toBe('pinned');
    expect(selectHomeCollections(rows, Date.parse(start)).map((row) => row.slug)).toEqual([
      'season',
      'pinned',
    ]);
    expect(selectHomeCollections(rows, Date.parse(end)).map((row) => row.slug)).toEqual(['pinned']);
  });
  it('uses first eligible pinned on null/missing selection but honors an unpinned explicit collection', () => {
    expect(selectHomeHero(rows, null, Date.parse(end))?.slug).toBe('pinned');
    expect(selectHomeHero(rows, 'missing', Date.parse(end))?.slug).toBe('pinned');
    expect(selectHomeHero(rows, 'unpinned', Date.parse(end))?.slug).toBe('unpinned');
    expect(selectHomeHero([seasonal], null, Date.parse(end))).toBeNull();
    expect(() => selectHomeHero(rows, null, Number.NaN)).toThrow(RangeError);
  });
});
