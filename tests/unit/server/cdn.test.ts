import { beforeEach, describe, expect, it, vi } from 'vitest';

const { env } = vi.hoisted(() => ({ env: { NEXT_PUBLIC_CDN_URL: 'https://cdn.example.com' } }));
vi.mock('server-only', () => ({}));
vi.mock('../../../lib/env.client', () => ({ env }));
import { cdnUrl } from '../../../lib/utils/cdn';
import { cdnUrl as serverCdnUrl } from '../../../server/storage/urls';

beforeEach(() => {
  env.NEXT_PUBLIC_CDN_URL = 'https://cdn.example.com';
});

describe('client-safe CDN URLs', () => {
  it('uses the same validated URL builder on client and server', () => {
    expect(cdnUrl('uploads/wallpapers/file/full.jpg')).toBe(
      'https://cdn.example.com/uploads/wallpapers/file/full.jpg',
    );
    expect(serverCdnUrl('uploads/wallpapers/file/full.jpg')).toBe(
      cdnUrl('uploads/wallpapers/file/full.jpg'),
    );
  });
  it('preserves a configured CDN path prefix and normalizes trailing slashes', () => {
    env.NEXT_PUBLIC_CDN_URL = 'http://localhost:3000/assets///';
    expect(cdnUrl('themes/file/thumb.webp')).toBe(
      'http://localhost:3000/assets/themes/file/thumb.webp',
    );
  });
  it.each([
    '//evil.example/x',
    '../private',
    'themes/../private',
    'themes/%2fprivate',
    'x?signature=1',
    'x#fragment',
  ])('rejects unsafe keys %s', (key) => {
    expect(() => cdnUrl(key)).toThrow();
  });
  it.each([
    'https://user:password@cdn.example.com',
    'https://cdn.example.com?token=x',
    'https://cdn.example.com#x',
    'javascript:alert(1)',
  ])('rejects unsafe CDN configuration %s', (url) => {
    env.NEXT_PUBLIC_CDN_URL = url;
    expect(() => cdnUrl('themes/a.webp')).toThrow();
  });
});
