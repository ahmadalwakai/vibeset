import { describe, expect, it } from 'vitest';
import { playgroundStateSchema, renderSampleSpec } from '../../../content/render-sample';
import {
  adminUpdateThemeSchema,
  adminTransitionThemesSchema,
  adminTagThemesSchema,
  adminThemeIdsSchema,
  adminReviewVersionSchema,
} from '../../../lib/validation/admin-themes';
const id = '11111111-aaaa-4111-8111-111111111111';
describe('admin theme mutation validation', () => {
  it('canonicalizes IDs and deduplicates in input order without accepting malformed IDs', () => {
    expect(adminThemeIdsSchema.parse([id.toUpperCase(), id])).toEqual([id]);
    for (const ids of [[], [id + '\n'], ['missing'], Array.from({ length: 101 }, () => id)])
      expect(adminThemeIdsSchema.safeParse(ids).success).toBe(false);
  });
  it('requires a sanitized rejection reason and limits transitions to the documented bulk targets', () => {
    expect(
      adminTransitionThemesSchema.parse({
        ids: [id],
        to: 'rejected',
        reason: '<b>Low contrast</b>\nplease revise',
      }).reason,
    ).toBe('Low contrast please revise');
    for (const input of [
      { ids: [id], to: 'rejected' },
      { ids: [id], to: 'published' },
      { ids: [id], to: 'pending_review' },
    ])
      expect(adminTransitionThemesSchema.safeParse(input).success).toBe(false);
  });
  it('accepts an opaque review precondition only for a single deduplicated theme', () => {
    const reviewVersion = 'a'.repeat(64);
    expect(
      adminTransitionThemesSchema.parse({
        ids: [id.toUpperCase(), id],
        to: 'approved',
        reviewVersion,
      }),
    ).toEqual({ ids: [id], to: 'approved', reviewVersion });
    for (const value of ['', 'a'.repeat(63), 'A'.repeat(64), reviewVersion + '\n', '{}'])
      expect(adminReviewVersionSchema.safeParse(value).success).toBe(false);
    expect(
      adminTransitionThemesSchema.safeParse({
        ids: [id, '22222222-2222-4222-8222-222222222222'],
        to: 'approved',
        reviewVersion,
      }).success,
    ).toBe(false);
  });
  it('validates full editor metadata and spec while refusing privileged immutable fields', () => {
    const input = {
      id,
      nameEn: '  Admin name  ',
      tagSlugs: ['valid-aesthetic'],
      isFeatured: false,
      spec: renderSampleSpec(playgroundStateSchema.parse({})),
      descriptionAr: 'سطر أول\r\nسطر ثان',
    };
    expect(adminUpdateThemeSchema.parse(input)).toMatchObject({
      nameEn: 'Admin name',
      descriptionAr: 'سطر أول\nسطر ثان',
    });
    for (const change of [
      { slug: 'changed' },
      { ownerId: 'other' },
      { status: 'published' },
      { source: 'admin' },
      { assetVersion: 2 },
      { spec: {} },
      { tagSlugs: ['same', 'same'] },
      { tagSlugs: ['unsafe\n'] },
      { nameEn: '' },
    ])
      expect(adminUpdateThemeSchema.safeParse({ ...input, ...change }).success).toBe(false);
    expect(adminUpdateThemeSchema.safeParse({ ...input, spec: undefined }).success).toBe(true);
  });
  it('disallows contradictory tag operations and duplicate or noncanonical slugs', () => {
    expect(
      adminTagThemesSchema.safeParse({ ids: [id], add: ['new-tag'], remove: ['old-tag'] }).success,
    ).toBe(true);
    for (const change of [
      { add: ['same'], remove: ['same'] },
      { add: ['same', 'same'], remove: [] },
      { add: ['tag\n'], remove: [] },
    ])
      expect(adminTagThemesSchema.safeParse({ ids: [id], ...change }).success).toBe(false);
  });
});
