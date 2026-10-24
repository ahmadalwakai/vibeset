import { describe, expect, it, vi } from 'vitest';
import {
  avatarKey,
  incomingUploadKey,
  incomingAvatarUploadKey,
  themeAssetKey,
  themeAttemptPrefix,
  themePrefix,
  themeVersionPrefix,
  wallpaperUploadKeys,
} from '../../../server/storage/keys';
import { storageKeySchema, storagePrefixSchema } from '../../../lib/validation/storage';

vi.mock('server-only', () => ({}));
const id = '12345678-abcd-4234-abcd-123456789abc';
const attempt = '87654321-dcba-4321-abcd-cba987654321';

describe('storage key builders', () => {
  it('includes the required attempt UUID beneath the logical version', () => {
    expect(themePrefix(id)).toBe(`themes/${id}/`);
    expect(themeVersionPrefix(id, 2)).toBe(`themes/${id}/v2/`);
    expect(themeAttemptPrefix(id, 2, attempt)).toBe(`themes/${id}/v2/${attempt}/`);
    expect(themeAssetKey(id.toUpperCase(), 2, 'thumb.webp', attempt)).toBe(
      `themes/${id}/v2/${attempt}/thumb.webp`,
    );
    expect(() => Reflect.apply(themeAssetKey, undefined, [id, 2, 'thumb.webp'])).toThrow();
  });
  it.each(['../theme', '', 'not-a-uuid', `${id}/other`, `${id}\n`, '%2f'])(
    'rejects invalid UUID %s',
    (value) => {
      expect(() => themePrefix(value)).toThrow();
      expect(() => themeAttemptPrefix(id, 1, value)).toThrow();
      expect(() => wallpaperUploadKeys(value)).toThrow();
    },
  );
  it.each([0, -1, 1.1, Infinity, 2_147_483_648])('rejects invalid version %s', (version) => {
    expect(() => themeVersionPrefix(id, version)).toThrow();
  });
  it.each(['../thumb.webp', 'thumb.svg', 'full.jpg', 'thumb.webp?x=1'])(
    'rejects unrecognized theme file %s',
    (file) => {
      expect(() => themeAssetKey(id, 1, file, attempt)).toThrow();
    },
  );
  it('accepts opaque auth IDs without requiring UUIDs', () => {
    const userId = 'Abcd1234efgh5678IJKL9012mnop3456';
    expect(incomingUploadKey(userId, id)).toBe(`uploads/incoming/${userId}/${id}`);
    expect(incomingAvatarUploadKey(userId, id.toUpperCase())).toBe(
      `uploads/incoming/${userId}/avatars/${id}`,
    );
    expect(avatarKey(userId, 'A'.repeat(64))).toBe(`avatars/${userId}/${'a'.repeat(64)}.webp`);
    expect(wallpaperUploadKeys(id)).toEqual({
      full: `uploads/wallpapers/${id}/full.jpg`,
      preview: `uploads/wallpapers/${id}/preview.webp`,
    });
  });
  it.each([
    '../user',
    'user/name',
    'user\\name',
    'user%2fname',
    'user\n',
    'user\r',
    '',
    'x'.repeat(129),
  ])('rejects unsafe auth segment %s', (userId) => {
    expect(() => incomingUploadKey(userId, id)).toThrow();
    expect(() => avatarKey(userId, 'a'.repeat(64))).toThrow();
  });
  it.each([
    '',
    '/',
    '/themes/id',
    'themes//id',
    'themes/../id',
    'themes/%2e%2e/id',
    'themes/id?x=1',
    'themes/id#hash',
    'themes/\\id',
    'themes/id\nnext',
    'themes/id\n',
    'themes/id\r',
    'themes/.env',
    `themes/${'a'.repeat(129)}`,
  ])('rejects unsafe storage path %s', (key) => {
    expect(storageKeySchema.safeParse(key).success).toBe(false);
    expect(storagePrefixSchema.safeParse(`${key}/`).success).toBe(false);
  });
  it('distinguishes keys from bounded directory prefixes', () => {
    expect(() => avatarKey('user', `${'a'.repeat(64)}\n`)).toThrow();
    expect(storageKeySchema.safeParse(`themes/${id}/v1/${attempt}/thumb.webp`).success).toBe(true);
    expect(storagePrefixSchema.safeParse(`themes/${id}/v1/`).success).toBe(true);
    expect(storageKeySchema.safeParse('themes/').success).toBe(false);
    expect(storagePrefixSchema.safeParse('themes').success).toBe(false);
    expect(
      storageKeySchema.safeParse(Array.from({ length: 17 }, () => 'a').join('/')).success,
    ).toBe(false);
    expect(
      storageKeySchema.safeParse(Array.from({ length: 9 }, () => 'a'.repeat(120)).join('/'))
        .success,
    ).toBe(false);
  });
});
