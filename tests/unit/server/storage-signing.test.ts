import { describe, expect, it, vi } from 'vitest';
import { createR2Storage } from '../../../server/storage/r2';

vi.mock('server-only', () => ({}));

describe('R2 presigning without network requests', () => {
  it('binds content type and expiry using local test-only credentials', async () => {
    const storage = createR2Storage({
      accountId: '0'.repeat(32),
      accessKeyId: 'testonlyaccesskey',
      secretAccessKey: 'testonlysecret',
      bucket: 'vibeset-test',
    });
    const signed = new URL(
      await storage.presignPut({ key: 'uploads/incoming/test/file', contentType: 'image/jpeg' }),
    );
    expect(signed.hostname).toContain('r2.cloudflarestorage.com');
    expect(signed.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(signed.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toContain('content-type');
    expect(signed.searchParams.has('x-amz-checksum-crc32')).toBe(false);
  });
});
