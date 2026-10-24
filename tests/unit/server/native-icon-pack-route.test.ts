import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NATIVE_BETA_ORIGINALS } from '../../../content/native-beta';
import prepared from '../../../content/native-beta/icon-packs.json';
import { nativeIconPackResponseSchema } from '../../../lib/validation/native-icon-pack';
import { HTTP_STATUS } from '../../../lib/result';

const mocks = vi.hoisted(() => ({ detail: vi.fn(), connection: vi.fn(), cacheTag: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: mocks.connection }));
vi.mock('../../../server/queries/themes', () => ({ getThemeDetail: mocks.detail }));
vi.mock('../../../server/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: mocks.cacheTag,
  CacheTags: { themes: 'themes', theme: (slug: string): string => `theme:${slug}` },
}));
vi.mock('../../../server/storage/urls', () => ({
  cdnUrl: (key: string): string => `https://assets.vibeset.test/${key}`,
}));
import { GET } from '../../../app/api/v1/themes/[slug]/icons/route';

const original = NATIVE_BETA_ORIGINALS[0],
  pack = prepared[0];
if (!original || !pack) throw new Error('Missing real prepared pack');
const snapshot = { id: pack.themeId, slug: pack.slug, spec: original.spec };
function request(slug = snapshot.slug): Promise<Response> {
  return GET(new Request(`https://vibeset.test/api/v1/themes/${slug}/icons`), {
    params: Promise.resolve({ slug }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.detail.mockResolvedValue(snapshot);
});

describe('published current native icon pack API', () => {
  it('returns real individual PNGs at the approvedCDN with public cache and current-theme tags', async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(
      'public, s-maxage=300, stale-while-revalidate=86400',
    );
    const result = nativeIconPackResponseSchema.parse(await response.json());
    expect(result.data.icons).toHaveLength(125);
    expect(
      result.data.icons.every(({ url }) => new URL(url).origin === 'https://assets.vibeset.test'),
    ).toBe(true);
    expect(mocks.cacheTag).toHaveBeenCalledWith('themes', `theme:${snapshot.slug}`);
  });
  it('never exposes a missing, private/unpublished or foreign theme pack', async () => {
    mocks.detail.mockResolvedValue(null);
    expect((await request()).status).toBe(404);
    mocks.detail.mockResolvedValue({ ...snapshot, id: '11111111-1111-4111-8111-111111111111' });
    expect((await request()).status).toBe(404);
  });
  it('refuses a stale pack after the published specification changes', async () => {
    mocks.detail.mockResolvedValue({
      ...snapshot,
      spec: { ...snapshot.spec, palette: { ...snapshot.spec.palette, primary: '#123456' } },
    });
    expect((await request()).status).toBe(404);
  });
  it('validates the slug before any published-theme lookup', async () => {
    expect((await request('invalid\n')).status).toBe(HTTP_STATUS.VALIDATION);
    expect(mocks.detail).not.toHaveBeenCalled();
  });
});
