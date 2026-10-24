import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getIpHash: vi.fn(),
  rateLimit: vi.fn(),
  toggle: vi.fn(),
  merge: vi.fn(),
  list: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../../server/guards', () => ({
  requireUser: mocks.requireUser,
  getSession: vi.fn(),
  requireCreator: vi.fn(),
  requireAdmin: vi.fn(),
}));
vi.mock('../../../server/request', () => ({ getIpHash: mocks.getIpHash }));
vi.mock('../../../server/rate-limit', () => ({ rateLimit: mocks.rateLimit }));
vi.mock('../../../server/services/settings', () => ({ getFeatures: vi.fn() }));
vi.mock('../../../server/services/favorites', () => ({
  toggleFavorite: mocks.toggle,
  mergeLocalFavorites: mocks.merge,
  listFavoriteIds: mocks.list,
}));
import { toggleFavorite, mergeLocalFavorites } from '../../../server/actions/favorites';
import { GET } from '../../../app/api/me/favorites/route';
import { AppError } from '../../../server/errors';

const id = '11111111-1111-4111-8111-111111111111';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue({
    user: { id: 'owner', role: 'user', banned: false },
    session: { id: 'session' },
  });
  mocks.getIpHash.mockResolvedValue('hash');
  mocks.rateLimit.mockResolvedValue({ allowed: true, count: 1 });
  mocks.toggle.mockResolvedValue({ data: { favorited: true }, tags: [] });
  mocks.merge.mockResolvedValue({ data: { merged: 1 }, tags: [] });
  mocks.list.mockResolvedValue([id]);
});
describe('favorites guarded actions/private route', () => {
  it('derives identity from the guard and applies the documented account budgets', async () => {
    expect(await toggleFavorite({ themeId: id })).toEqual({ ok: true, data: { favorited: true } });
    expect(mocks.toggle).toHaveBeenCalledExactlyOnceWith('owner', id);
    expect(mocks.rateLimit).toHaveBeenCalledExactlyOnceWith('favorite-toggle:owner', 120, 60);
    mocks.rateLimit.mockClear();
    expect(await mergeLocalFavorites({ themeIds: [id, id] })).toEqual({
      ok: true,
      data: { merged: 1 },
    });
    expect(mocks.merge).toHaveBeenCalledExactlyOnceWith('owner', [id]);
    expect(mocks.rateLimit).toHaveBeenCalledExactlyOnceWith('favorite-merge:owner', 10, 3600);
  });
  it('rejects ownership injection before guards and refuses visitors/rate-limited mutations', async () => {
    expect(await toggleFavorite({ themeId: id, userId: 'victim' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    expect(mocks.requireUser).not.toHaveBeenCalled();
    mocks.requireUser.mockRejectedValueOnce(new AppError('UNAUTHENTICATED'));
    expect(await toggleFavorite({ themeId: id })).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
    mocks.rateLimit.mockResolvedValueOnce({ allowed: false, count: 121 });
    expect(await toggleFavorite({ themeId: id })).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
    expect(mocks.toggle).not.toHaveBeenCalled();
  });
  it('serves only guarded private ids with an explicit no-store response', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ data: { themeIds: [id] } });
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith('owner');
    mocks.requireUser.mockRejectedValueOnce(new AppError('UNAUTHENTICATED'));
    const denied = await GET();
    expect(denied.status).toBe(401);
    expect(denied.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await denied.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });
});
