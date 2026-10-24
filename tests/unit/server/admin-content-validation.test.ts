import { describe, expect, it } from 'vitest';
import {
  adminUpsertCollectionSchema,
  adminUpsertTagSchema,
  adminUpsertAppSchema,
  adminDeleteTagSchema,
  adminMergeTagsSchema,
  adminReorderCollectionSchema,
  adminUtcDateInput,
} from '../../../lib/validation/admin-content';
const id = '11111111-1111-4111-8111-111111111111';
const collection = {
  slug: 'test-collection',
  kind: 'seasonal',
  visibility: 'public',
  titleEn: 'Collection',
  isPinned: false,
  sortOrder: 0,
};
const app = {
  slug: 'x',
  name: 'X',
  aliases: ['إكس'],
  category: 'social',
  glyph: 'heart',
  rank: 1,
  isActive: true,
};
describe('admin content mutation boundaries', () => {
  it('keeps invalid extended-year input in validation without throwing a formatting error', () => {
    expect(adminUtcDateInput('2026-10-24T13:45')).toBe('2026-10-24T13:45:00.000Z');
    expect(adminUtcDateInput('')).toBeNull();
    expect(() => adminUtcDateInput('10000-01-01T00:00')).not.toThrow();
    expect(
      adminUpsertCollectionSchema.safeParse({
        ...collection,
        startsAt: adminUtcDateInput('10000-01-01T00:00'),
      }).success,
    ).toBe(false);
  });
  it('accepts nullable bilingual metadata and valid half-open seasonal windows', () => {
    expect(
      adminUpsertCollectionSchema.parse({
        ...collection,
        titleAr: '',
        descriptionAr: 'سطر\r\nسطر',
        startsAt: '2026-10-24T12:00:00Z',
        endsAt: '2026-10-24T13:00:00Z',
      }),
    ).toMatchObject({ titleAr: null, descriptionAr: 'سطر\nسطر' });
    for (const fields of [
      { endsAt: '2026-10-24T12:00:00Z' },
      { endsAt: '2026-10-24T11:00:00Z' },
      { kind: 'editorial', endsAt: '2026-10-24T13:00:00Z' },
      { visibility: 'unlisted' },
      { slug: 'bad\n' },
      { ownerId: 'other' },
    ])
      expect(
        adminUpsertCollectionSchema.safeParse({
          ...collection,
          startsAt: '2026-10-24T12:00:00Z',
          ...fields,
        }).success,
      ).toBe(false);
  });
  it('requires full unique order and explicit usage confirmation for destructive tag removal', () => {
    for (const slug of ['x', 'a'.repeat(121)])
      expect(adminUpsertCollectionSchema.safeParse({ ...collection, slug }).success).toBe(false);
    expect(
      adminReorderCollectionSchema.safeParse({ collectionId: id, themeIds: [id, id] }).success,
    ).toBe(false);
    expect(adminReorderCollectionSchema.safeParse({ collectionId: id, themeIds: [] }).success).toBe(
      true,
    );
    expect(adminDeleteTagSchema.safeParse({ id, removeFromThemes: true }).success).toBe(false);
    expect(
      adminDeleteTagSchema.parse({ id, removeFromThemes: true, expectedUsageCount: 3 }),
    ).toMatchObject({ expectedUsageCount: 3 });
    expect(adminMergeTagsSchema.safeParse({ fromId: id, toId: id }).success).toBe(false);
  });
  it('bounds labels, tag slugs, aliases and protocol metadata without excluding Arabic', () => {
    expect(
      adminUpsertTagSchema.safeParse({
        slug: 'new-tag',
        kind: 'mood',
        nameEn: 'New',
        nameAr: 'جديد',
        isActive: true,
        sortOrder: 0,
      }).success,
    ).toBe(true);
    expect(
      adminUpsertAppSchema.safeParse({
        ...app,
        iosScheme: 'whatsapp://',
        androidPackage: 'com.example.app',
      }).success,
    ).toBe(true);
    for (const extra of [
      { name: 'x'.repeat(121) },
      { glyph: 'heart\n' },
      { aliases: ['same', 'same'] },
      { category: 'unknown' },
      { iosScheme: 'javascript:' },
      { iosScheme: 'https://example.com' },
      { androidPackage: 'app;secret' },
      { slug: 'x\n' },
    ])
      expect(adminUpsertAppSchema.safeParse({ ...app, ...extra }).success).toBe(false);
  });
});
