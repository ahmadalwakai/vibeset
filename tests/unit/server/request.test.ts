import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { headersMock, salt } = vi.hoisted(() => ({
  headersMock: vi.fn<() => Promise<Headers>>(),
  salt: 'request-privacy-test-salt'.repeat(2),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: headersMock }));
vi.mock('../../../lib/env.server', () => ({ env: { IP_HASH_SALT: salt } }));

import { getClientIp, getIpHash } from '../../../server/request';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('request IP boundary', () => {
  it('uses the first forwarded hop and ignores later hops', () => {
    expect(
      getClientIp(
        new Headers({
          'x-forwarded-for': ' 203.0.113.5, 198.51.100.8',
          'x-real-ip': '192.0.2.9',
        }),
      ),
    ).toBe('203.0.113.5');
  });

  it('does not search later forwarded hops when the first is invalid', () => {
    expect(
      getClientIp(
        new Headers({
          'x-forwarded-for': 'invalid, 198.51.100.8',
          'x-real-ip': ' 192.0.2.9 ',
        }),
      ),
    ).toBe('192.0.2.9');
    expect(getClientIp(new Headers({ 'x-forwarded-for': ', 198.51.100.8' }))).toBeNull();
  });

  it('accepts IPv6 and rejects malformed or absent IPs', () => {
    expect(getClientIp(new Headers({ 'x-real-ip': '2001:db8::1' }))).toBe('2001:db8::1');
    expect(getClientIp(new Headers({ 'x-real-ip': '203.0.113.5:3000' }))).toBeNull();
    expect(getClientIp(new Headers())).toBeNull();
  });

  it('awaits request headers and exposes only salted SHA-256 output', async () => {
    headersMock.mockResolvedValue(new Headers({ 'x-forwarded-for': '203.0.113.5' }));
    expect(await getIpHash()).toBe(
      createHash('sha256')
        .update('203.0.113.5' + salt)
        .digest('hex'),
    );
    expect(headersMock).toHaveBeenCalledTimes(1);
  });

  it('shares a stable hashed bucket when no trusted IP is available', async () => {
    headersMock.mockResolvedValue(new Headers());
    expect(await getIpHash()).toBe(
      createHash('sha256')
        .update('unknown' + salt)
        .digest('hex'),
    );
  });
});
