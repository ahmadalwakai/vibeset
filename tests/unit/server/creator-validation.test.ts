import { describe, expect, it } from 'vitest';
import { playgroundStateSchema, renderSampleSpec } from '../../../content/render-sample';
import {
  applyForCreatorSchema,
  creatorHandleSchema,
  createCreatorThemeSchema,
  reviewCreatorSchema,
  updateCreatorProfileSchema,
} from '../../../lib/validation/creator';

const profile = { handle: 'my_studio', displayName: '  My Studio  ', links: [], isAdult: true };
describe('creator boundaries', () => {
  it('accepts canonical handles and normalizes user-visible text', () => {
    expect(applyForCreatorSchema.parse(profile)).toMatchObject({
      displayName: 'My Studio',
      handle: 'my_studio',
    });
    expect(creatorHandleSchema.parse('art_123')).toBe('art_123');
    expect(
      applyForCreatorSchema.parse({ ...profile, bio: ' First line\r\nSecond line ' }),
    ).toMatchObject({ bio: 'First line\nSecond line' });
  });
  it.each([
    'admin',
    'vibeset',
    'support',
    'api',
    'setup',
    'legal',
    'privacy',
    'studio',
    'apple',
    'instagram',
    'MyName',
    'ab',
    'a'.repeat(25),
    'abc\n',
    'abc-xyz',
    'a b',
  ])('rejects unsafe or reserved handle %j', (handle) => {
    expect(creatorHandleSchema.safeParse(handle).success).toBe(false);
  });
  it('requires an adult, at most three credential-free HTTPS links, and bounded plain text', () => {
    for (const change of [
      { isAdult: false },
      { bio: 'x'.repeat(281) },
      { displayName: '\u202EName' },
      { links: [{ label: 'Site', url: 'http://example.com' }] },
      { links: [{ label: 'Site', url: 'https://user:password@example.com' }] },
      { links: Array.from({ length: 4 }, () => ({ label: 'Site', url: 'https://example.com' })) },
      { status: 'approved' },
    ])
      expect(applyForCreatorSchema.safeParse({ ...profile, ...change }).success).toBe(false);
    expect(
      applyForCreatorSchema.safeParse({
        ...profile,
        links: [{ label: 'Site', url: 'https://example.com/path' }],
      }).success,
    ).toBe(true);
  });
  it('requires review reasons and sanitizes them using the state-machine reason contract', () => {
    for (const decision of ['reject', 'suspend'])
      expect(reviewCreatorSchema.safeParse({ userId: 'user', decision }).success).toBe(false);
    expect(
      reviewCreatorSchema.parse({
        userId: 'user',
        decision: 'reject',
        reason: ' <b>Use your own work</b>\n please ',
      }),
    ).toMatchObject({ reason: 'Use your own work please' });
    expect(reviewCreatorSchema.safeParse({ userId: 'user', decision: 'approve' }).success).toBe(
      true,
    );
  });
  it('accepts only full validated authoring inputs without status, ownership or asset metadata', () => {
    const input = {
      spec: renderSampleSpec(playgroundStateSchema.parse({})),
      nameEn: ' Theme ',
      tagSlugs: ['aesthetic', 'mood'],
    };
    expect(createCreatorThemeSchema.parse(input).nameEn).toBe('Theme');
    for (const change of [
      { ownerId: 'other' },
      { status: 'published' },
      { source: 'admin' },
      { tagSlugs: [] },
      { tagSlugs: ['same', 'same'] },
      { tagSlugs: ['aesthetic\n'] },
      { tagSlugs: Array.from({ length: 7 }, (_, i) => `tag-${i}`) },
      { nameEn: '' },
      { spec: {} },
    ])
      expect(createCreatorThemeSchema.safeParse({ ...input, ...change }).success).toBe(false);
    expect(
      updateCreatorProfileSchema.safeParse({
        displayName: 'Me',
        links: [],
        avatarKey: 'avatars/other/file.webp',
      }).success,
    ).toBe(false);
  });
});
