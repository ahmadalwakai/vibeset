import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { createAdminReviewVersion } from '../../../server/admin-review-version';

describe('admin review revision fingerprint', () => {
  const input = {
    status: 'pending_review' as const,
    revisionTime: '2026-10-24T10:20:30.123001Z',
    specHash: 'a'.repeat(64),
  };
  it('hashes the exact status, raw microsecond revision and spec hash tuple', () => {
    expect(createAdminReviewVersion(input)).toBe(
      createHash('sha256')
        .update(JSON.stringify([input.status, input.revisionTime, input.specHash]))
        .digest('hex'),
    );
    for (const change of [
      { status: 'draft' as const },
      { revisionTime: '2026-10-24T10:20:30.123002Z' },
      { specHash: 'b'.repeat(64) },
    ])
      expect(createAdminReviewVersion({ ...input, ...change })).not.toBe(
        createAdminReviewVersion(input),
      );
  });
  it('refuses timestamps that have already lost microsecond precision', () => {
    for (const revisionTime of [
      '2026-10-24T10:20:30.123Z',
      '2026-10-24T10:20:30.123001+00:00',
      '2026-10-24T10:20:30.123001Z\n',
    ])
      expect(() => createAdminReviewVersion({ ...input, revisionTime })).toThrow();
  });
});
