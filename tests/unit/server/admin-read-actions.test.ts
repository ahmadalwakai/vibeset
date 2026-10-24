import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  ip: vi.fn(),
  review: vi.fn(),
  item: vi.fn(),
  publish: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../../server/guards', () => ({
  requireAdmin: mocks.guard,
  getSession: vi.fn(),
  requireUser: vi.fn(),
  requireCreator: vi.fn(),
}));
vi.mock('../../../server/request', () => ({ getIpHash: mocks.ip }));
vi.mock('../../../server/rate-limit', () => ({ rateLimit: vi.fn() }));
vi.mock('../../../server/services/settings', () => ({ getFeatures: vi.fn() }));
vi.mock('../../../server/admin-queries/review', () => ({
  listAdminReview: mocks.review,
  getAdminReviewItem: mocks.item,
}));
vi.mock('../../../server/admin-queries/publish', () => ({ listAdminPublish: mocks.publish }));
import {
  refreshAdminPublish,
  refreshAdminReview,
  refreshAdminReviewItem,
} from '../../../server/actions/admin/queries';
import { AppError } from '../../../server/errors';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.ip.mockResolvedValue('hashed-fixture-ip');
});
describe('admin client read actions retain independent guards and shared boundaries', () => {
  it.each(['visitor', 'user', 'creator', 'banned-admin'] as const)(
    '%s is rejected',
    async (role) => {
      const code = role === 'visitor' ? 'UNAUTHENTICATED' : 'FORBIDDEN';
      mocks.guard.mockRejectedValue(new AppError(code));
      expect(await refreshAdminReview({})).toMatchObject({ ok: false, error: { code } });
      expect(await refreshAdminPublish({})).toMatchObject({ ok: false, error: { code } });
      expect(
        await refreshAdminReviewItem({ id: '123e4567-e89b-42d3-a456-426614174000' }),
      ).toMatchObject({ ok: false, error: { code } });
      expect(mocks.review).not.toHaveBeenCalled();
      expect(mocks.publish).not.toHaveBeenCalled();
      expect(mocks.item).not.toHaveBeenCalled();
      expect(mocks.ip).not.toHaveBeenCalled();
    },
  );
  it('parses safe defaults and forwards a successful admin read', async () => {
    mocks.guard.mockResolvedValue({
      user: { id: 'admin', role: 'admin' },
      session: { id: 'session' },
    });
    const page = { items: [], total: 0, page: 1, pageSize: 30, nextPage: null, nextCursor: null };
    mocks.review.mockResolvedValue(page);
    expect(await refreshAdminReview({})).toEqual({ ok: true, data: page });
    expect(mocks.review).toHaveBeenCalledWith({ page: 1 });
    mocks.item.mockResolvedValue(null);
    expect(await refreshAdminReviewItem({ id: '123e4567-e89b-42d3-a456-426614174000' })).toEqual({
      ok: true,
      data: null,
    });
    expect(mocks.item).toHaveBeenCalledWith('123e4567-e89b-42d3-a456-426614174000');
    expect(await refreshAdminPublish({ kind: 'unsafe' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
  });
});
