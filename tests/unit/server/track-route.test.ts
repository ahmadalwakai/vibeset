import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRACK_EVENTS } from '../../../lib/validation/track';

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  record: vi.fn(),
  headers: vi.fn(),
  salt: 'tracking-test-salt-'.repeat(3),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../../lib/env.server', () => ({ env: { IP_HASH_SALT: mocks.salt } }));
vi.mock('../../../server/rate-limit', () => ({ rateLimit: mocks.limit }));
vi.mock('../../../server/services/theme-track', () => ({ trackThemeEvent: mocks.record }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
import { POST } from '../../../app/api/track/route';

const themeId = 'f5497e73-9a14-4d82-a1eb-baa931101bce';
function request(body: string, ip = '203.0.113.42, 198.51.100.2'): Request {
  return new Request('https://vibeset.test/api/track', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
      cookie: 'better-auth.session_token=ignored-untrusted-cookie',
    },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.limit.mockResolvedValue({ allowed: true, count: 1 });
  mocks.record.mockResolvedValue({ data: { counted: true }, tags: [] });
  mocks.headers.mockImplementation(() => {
    throw new Error('Request-time auth/headers API must not be read');
  });
});

describe('anonymous POST /api/track', () => {
  it.each(TRACK_EVENTS)(
    'records %s without reading cookies/session and salts the first forwarded IP',
    async (event) => {
      const response = await POST(
        request(JSON.stringify({ themeId: themeId.toUpperCase(), event })),
      );
      expect(response.status).toBe(204);
      expect(await response.text()).toBe('');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('set-cookie')).toBeNull();
      const hash = createHash('sha256').update('203.0.113.42').update(mocks.salt).digest('hex');
      expect(mocks.limit).toHaveBeenCalledWith(`track:${hash}`, 120, 60);
      expect(mocks.record).toHaveBeenCalledWith({ themeId, event });
      expect(mocks.headers).not.toHaveBeenCalled();
    },
  );
  it('uses a salted unknown bucket when no valid IP is provided', async () => {
    await POST(request(JSON.stringify({ themeId, event: 'view' }), 'invalid'));
    expect(mocks.limit).toHaveBeenCalledWith(
      `track:${createHash('sha256').update('unknown').update(mocks.salt).digest('hex')}`,
      120,
      60,
    );
  });
  it('silently returns the same empty204 when rate-limited', async () => {
    mocks.limit.mockResolvedValue({ allowed: false, count: 121 });
    const response = await POST(request(JSON.stringify({ themeId, event: 'view' })));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it('does not reveal unpublished or missing themes', async () => {
    mocks.record.mockResolvedValue({ data: { counted: false }, tags: [] });
    expect((await POST(request(JSON.stringify({ themeId, event: 'download' })))).status).toBe(204);
  });
  it.each([
    'invalid JSON',
    '{}',
    JSON.stringify({ themeId: 'invalid', event: 'view' }),
    JSON.stringify({ themeId, event: 'invalid' }),
    JSON.stringify({ themeId, event: 'view', userId: 'personal-id' }),
    JSON.stringify({ themeId, event: 'view', padding: 'x'.repeat(1100) }),
  ])('rejects malformed or oversized bodies before rate-limiting: %s', async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(422);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({ error: { code: 'VALIDATION' } });
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it('sanitizes database errors instead of claiming success', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mocks.record.mockRejectedValue(new Error('private SQL'));
      const response = await POST(request(JSON.stringify({ themeId, event: 'view' })));
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain('private SQL');
    } finally {
      log.mockRestore();
    }
  });
});
