import { describe, expect, it } from 'vitest';
import {
  adminPublishQuerySchema,
  adminQueryInput,
  adminReviewQuerySchema,
  adminThemeListSchema,
  decodeAdminReviewCursor,
  encodeAdminReviewCursor,
} from '../../lib/validation/admin-queries';

const cursor = {
  k: 'admin-review' as const,
  priority: 0 as const,
  at: '2026-10-24T12:30:00.123456Z',
  id: '123e4567-e89b-42d3-a456-426614174000',
};
describe('admin read boundaries', () => {
  it('normalizes URL values without interpreting false as true', () => {
    expect(
      adminThemeListSchema.parse(
        adminQueryInput(
          new URLSearchParams('page=2&featured=false&stale=0&source=creator&q=%20Caf%C3%A9%20'),
        ),
      ),
    ).toEqual({
      page: 2,
      featured: false,
      stale: false,
      source: 'creator',
      q: 'Café',
      sort: 'updated',
    });
    expect(adminThemeListSchema.parse({ featured: true, stale: true, page: 3 }).page).toBe(3);
  });
  it.each([
    { page: '-1' },
    { page: '1.5' },
    { page: '01' },
    { page: 100001 },
    { stale: 'yes' },
    { source: 'external' },
    { q: 'bad\u0000text' },
    { aesthetic: 'aesthetic\n' },
    { sort: 'trending' },
    { role: 'admin' },
  ])('rejects malformed or undeclared filters %j', (input) =>
    expect(adminThemeListSchema.safeParse(input).success).toBe(false),
  );
  it('rejects repeated scalar URL filters and preserves empty defaults', () => {
    expect(() => adminQueryInput(new URLSearchParams('page=1&page=2'))).toThrow();
    expect(adminThemeListSchema.parse({ page: '', status: '', q: '' })).toEqual({
      page: 1,
      sort: 'updated',
    });
    expect(
      adminThemeListSchema.safeParse(adminQueryInput(new URLSearchParams('__proto__=x'))).success,
    ).toBe(false);
  });
  it('keeps cursor microseconds and binds the cursor to the review queue kind', () => {
    const encoded = encodeAdminReviewCursor(cursor);
    expect(decodeAdminReviewCursor(encoded)).toEqual(cursor);
    expect(adminReviewQuerySchema.parse({ cursor: encoded, page: '2' })).toMatchObject({
      cursor: encoded,
      page: 2,
    });
    for (const bad of [
      encoded + '=',
      'not-json',
      btoa(JSON.stringify({ ...cursor, k: 'new' })),
      btoa(JSON.stringify({ ...cursor, at: '2026-10-24T12:30:00.123Z' })),
      btoa(JSON.stringify({ ...cursor, priority: 2 })),
    ])
      expect(() => decodeAdminReviewCursor(bad)).toThrow();
  });
  it('does not accept table-only filters on review/publish reads', () => {
    expect(adminReviewQuerySchema.safeParse({ source: 'creator' }).success).toBe(false);
    expect(adminPublishQuerySchema.safeParse({ kind: 'draft' }).success).toBe(false);
  });
});
