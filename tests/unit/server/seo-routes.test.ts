import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ connection: vi.fn(), count: vi.fn(), page: vi.fn() }));
vi.mock('next/server', () => ({ connection: mocks.connection }));
vi.mock('../../../lib/env.client', () => ({
  env: { NEXT_PUBLIC_SITE_URL: 'https://vibeset.example' },
}));
vi.mock('../../../server/queries/sitemap', () => ({
  countSitemapEntities: mocks.count,
  readSitemapEntities: mocks.page,
}));
import { GET as index } from '../../../app/sitemap.xml/route';
import { GET as shard } from '../../../app/sitemap/[id]/route';
import robots from '../../../app/robots';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.connection.mockResolvedValue(undefined);
  mocks.count.mockResolvedValue(7);
  mocks.page.mockResolvedValue([{ path: '/', lastModified: null }]);
});
describe('runtime crawl endpoints', () => {
  it('serves a public XML index after opting into request-time data', async () => {
    const response = await index();
    expect(response.headers.get('content-type')).toContain('application/xml');
    expect(response.headers.get('cache-control')).toContain('s-maxage=3600');
    expect(await response.text()).toContain('https://vibeset.example/sitemap/0.xml');
    expect(mocks.connection.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.count.mock.invocationCallOrder[0] ?? 0,
    );
  });
  it('bounds shard access before requesting rows and includes both locales', async () => {
    const response = await shard(new Request('https://vibeset.example/sitemap/0.xml'), {
      params: Promise.resolve({ id: '0.xml' }),
    });
    expect(response.status).toBe(200);
    expect((await response.text()).match(/<url>/g)).toHaveLength(2);
    expect(mocks.page).toHaveBeenCalledExactlyOnceWith(0);
    mocks.page.mockClear();
    const missing = await shard(new Request('https://vibeset.example/sitemap/1.xml'), {
      params: Promise.resolve({ id: '1.xml' }),
    });
    expect(missing.status).toBe(404);
    expect(mocks.page).not.toHaveBeenCalled();
    expect(missing.headers.get('cache-control')).toBe('private, no-store');
  });
  it('rejects malformed shards before loading the cached count', async () => {
    const response = await shard(new Request('https://vibeset.example/sitemap/bad.xml'), {
      params: Promise.resolve({ id: 'bad.xml' }),
    });
    expect(response.status).toBe(404);
    expect(mocks.count).not.toHaveBeenCalled();
  });
  it('excludes private English and Arabic sections and points crawlers to the runtime index', () => {
    const result = robots();
    expect(result.sitemap).toBe('https://vibeset.example/sitemap.xml');
    expect(result.rules).toMatchObject({
      allow: '/',
      disallow: expect.arrayContaining([
        '/admin',
        '/ar/admin',
        '/saved',
        '/ar/saved',
        '/collections/u/',
        '/ar/collections/u/',
        '/sign-in',
        '/ar/sign-in',
        '/api',
      ]),
    });
  });
  it('does not block public collection slugs beginning with u', () => {
    const rules = robots().rules;
    const rule = Array.isArray(rules) ? rules[0] : rules;
    const disallowed = Array.isArray(rule?.disallow) ? rule.disallow : [rule?.disallow ?? ''];
    for (const prefix of ['', '/ar', '/en']) {
      expect(disallowed.some((path) => `${prefix}/collections/u/owned-id`.startsWith(path))).toBe(
        true,
      );
      for (const slug of ['urban', 'underwater'])
        expect(disallowed.some((path) => `${prefix}/collections/${slug}`.startsWith(path))).toBe(
          false,
        );
    }
  });
});
