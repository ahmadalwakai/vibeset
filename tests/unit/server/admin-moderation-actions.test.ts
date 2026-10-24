import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../server/errors';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  ip: vi.fn(),
  role: vi.fn(),
  ban: vi.fn(),
  unban: vi.fn(),
  creator: vi.fn(),
  report: vi.fn(),
  userRead: vi.fn(),
  creatorRead: vi.fn(),
  reportRead: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock('../../../server/guards', () => ({
  requireAdmin: mocks.admin,
  requireUser: vi.fn(),
  requireCreator: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock('../../../server/request', () => ({ getIpHash: mocks.ip }));
vi.mock('../../../server/rate-limit', () => ({ rateLimit: vi.fn() }));
vi.mock('../../../server/services/settings', () => ({ getFeatures: vi.fn() }));
vi.mock('../../../server/services/users', () => ({
  adminSetRole: mocks.role,
  adminBanUser: mocks.ban,
  adminUnbanUser: mocks.unban,
}));
vi.mock('../../../server/services/creators', () => ({ reviewCreator: mocks.creator }));
vi.mock('../../../server/services/admin-reports', () => ({ resolveReport: mocks.report }));
vi.mock('../../../server/admin-queries/users', () => ({ getAdminUser: mocks.userRead }));
vi.mock('../../../server/admin-queries/creators', () => ({ getAdminCreator: mocks.creatorRead }));
vi.mock('../../../server/admin-queries/reports', () => ({ getAdminReport: mocks.reportRead }));
vi.mock('../../../server/cache', () => ({ invalidate: mocks.invalidate }));
import {
  adminSetRole,
  adminBanUser,
  adminUnbanUser,
  adminReviewCreator,
  adminResolveReport,
  readAdminUser,
  readAdminCreator,
  readAdminReport,
} from '../../../server/actions/admin/moderation';
const id = '12345678-1234-4123-8123-123456789abc';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ user: { id: 'real-admin', role: 'admin' }, session: {} });
  mocks.ip.mockResolvedValue('hashed');
  for (const mock of [mocks.role, mocks.ban, mocks.unban, mocks.creator, mocks.report])
    mock.mockResolvedValue({ data: { ok: true, archived: 1 }, tags: ['themes'] });
  for (const mock of [mocks.userRead, mocks.creatorRead, mocks.reportRead])
    mock.mockResolvedValue(null);
});
describe('guarded moderation actions', () => {
  const calls = [
    () => adminSetRole({ userId: 'target', role: 'admin' }),
    () => adminBanUser({ userId: 'target', reason: 'Verified abuse' }),
    () => adminUnbanUser({ userId: 'target' }),
    () => adminReviewCreator({ userId: 'creator', decision: 'approve' }),
    () => adminResolveReport({ id, action: 'dismiss', note: 'Reviewed' }),
    () => readAdminUser({ userId: 'target' }),
    () => readAdminCreator({ userId: 'creator' }),
    () => readAdminReport({ id }),
  ];
  it.each(calls)(
    'rejects an unauthenticated or non-admin principal before invoking the service',
    async (call) => {
      for (const code of ['UNAUTHENTICATED', 'FORBIDDEN'] as const) {
        mocks.admin.mockRejectedValueOnce(new AppError(code));
        expect(await call()).toMatchObject({ ok: false, error: { code } });
      }
      for (const service of [
        mocks.role,
        mocks.ban,
        mocks.unban,
        mocks.creator,
        mocks.report,
        mocks.userRead,
        mocks.creatorRead,
        mocks.reportRead,
      ])
        expect(service).not.toHaveBeenCalled();
    },
  );
  it('uses the guarded actor and defaults optional archival off', async () => {
    await adminBanUser({ userId: 'target', reason: ' <b>Verified abuse</b> ' });
    expect(mocks.ban).toHaveBeenCalledExactlyOnceWith(
      { userId: 'target', reason: 'Verified abuse', archiveThemes: false },
      { kind: 'user', userId: 'real-admin', role: 'admin', isCreator: false },
    );
    expect(mocks.invalidate).toHaveBeenCalledExactlyOnceWith(['themes'], 'update');
  });
  it('rejects actor injection and does not invalidate failed mutations', async () => {
    expect(
      await adminSetRole({ userId: 'target', role: 'admin', actor: { kind: 'system' } }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(mocks.admin).not.toHaveBeenCalled();
    mocks.report.mockRejectedValue(new AppError('INVALID_STATE'));
    expect(await adminResolveReport({ id, action: 'dismiss', note: 'Reviewed' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_STATE' },
    });
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
});
