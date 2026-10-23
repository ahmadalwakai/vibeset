import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

const privacyEnv = vi.hoisted(() => ({ IP_HASH_SALT: 'privacy-test-salt'.repeat(3) }));
vi.mock('server-only', () => ({}));
vi.mock('../../lib/env.server', () => ({ env: privacyEnv }));
vi.mock('../../db/index', () => ({ db: {} }));

import { hashAuthIdentifier } from '../../server/auth-privacy';
import { consumeAuthRateLimit } from '../../server/auth-rate-limit';

afterEach(() => {
  privacyEnv.IP_HASH_SALT = 'privacy-test-salt'.repeat(3);
});

describe('authentication identifier privacy', () => {
  it('uses the documented salted SHA-256 algorithm without storing raw identifiers', () => {
    const value = '203.0.113.7:/sign-in/email';
    const expected = createHash('sha256')
      .update(value + privacyEnv.IP_HASH_SALT)
      .digest('hex');

    expect(hashAuthIdentifier(value)).toBe(expected);
    expect(hashAuthIdentifier(value)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashAuthIdentifier(value)).not.toContain('203.0.113.7');
    expect(hashAuthIdentifier(value)).not.toBe(hashAuthIdentifier('203.0.113.7:/sign-in/google'));
  });

  it('changes hashes when the salt changes', () => {
    const previous = hashAuthIdentifier('203.0.113.7');
    privacyEnv.IP_HASH_SALT = 'different-privacy-test-salt'.repeat(2);

    expect(hashAuthIdentifier('203.0.113.7')).not.toBe(previous);
  });

  it('rejects an empty identifier', () => {
    expect(() => hashAuthIdentifier('')).toThrow(ZodError);
  });
});

describe('authentication rate-limit boundary', () => {
  it.each([
    { key: '', rule: { window: 10, max: 3 } },
    { key: 'valid', rule: { window: 0, max: 3 } },
    { key: 'valid', rule: { window: 0.5, max: 3 } },
    { key: 'valid', rule: { window: Number.NaN, max: 3 } },
    { key: 'valid', rule: { window: 10, max: 0 } },
    { key: 'valid', rule: { window: 10, max: 1.5 } },
    { key: 'valid', rule: { window: 10, max: 2_147_483_648 } },
  ])('rejects invalid input before reaching the database: %j', async ({ key, rule }) => {
    await expect(consumeAuthRateLimit(key, rule)).rejects.toThrow(ZodError);
  });
});
