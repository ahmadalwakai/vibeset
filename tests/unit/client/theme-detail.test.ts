import { describe, expect, it } from 'vitest';
import { playgroundStateSchema, renderSampleSpec } from '../../../content/render-sample';
import type { ThemeDetailDTO } from '../../../lib/dto';
import { themeDetailResponseSchema } from '../../../lib/validation/theme-detail';

const theme: ThemeDetailDTO = {
  id: '13f76d3b-357b-41ee-b125-33dcddc061f8',
  slug: 'lavender-dream',
  nameEn: 'Lavender Dream',
  nameAr: 'حلم اللافندر',
  thumbUrl: null,
  dominantColor: null,
  tags: [],
  isFeatured: false,
  downloadCount: 0,
  favoriteCount: 0,
  creator: null,
  publishedAt: null,
  updatedAt: '2026-10-24T00:00:00.000Z',
  descriptionEn: null,
  descriptionAr: null,
  spec: renderSampleSpec(playgroundStateSchema.parse({})),
  previewHomeUrl: null,
  previewLockUrl: null,
  ogUrl: null,
  wallpapers: [],
  remixOf: null,
};
describe('theme detail API client boundary', () => {
  it('accepts additive response fields and absent optional assets', () => {
    expect(themeDetailResponseSchema.parse({ data: { ...theme, futureField: true } }).data).toEqual(
      theme,
    );
  });
  it('requires valid updated metadata and spec data', () => {
    expect(
      themeDetailResponseSchema.safeParse({ data: { ...theme, updatedAt: undefined } }).success,
    ).toBe(false);
    expect(
      themeDetailResponseSchema.safeParse({ data: { ...theme, updatedAt: 'yesterday' } }).success,
    ).toBe(false);
    expect(themeDetailResponseSchema.safeParse({ data: { ...theme, spec: {} } }).success).toBe(
      false,
    );
  });
  it('rejects ambiguous size choices and malformed remix slugs', () => {
    const wallpaper = {
      size: 'phone',
      url: 'https://cdn.example/themes/phone.jpg',
      w: 1320,
      h: 2868,
      bytes: 50000,
    };
    expect(
      themeDetailResponseSchema.safeParse({
        data: { ...theme, wallpapers: [wallpaper, wallpaper] },
      }).success,
    ).toBe(false);
    expect(
      themeDetailResponseSchema.safeParse({
        data: { ...theme, remixOf: { slug: 'unsafe\n', nameEn: 'Original', nameAr: null } },
      }).success,
    ).toBe(false);
  });
});
