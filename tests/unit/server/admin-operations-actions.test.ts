import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '../../../lib/settings';
const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  ip: vi.fn(),
  generate: vi.fn(),
  update: vi.fn(),
  read: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../../server/guards', () => ({
  requireAdmin: mocks.admin,
  requireUser: vi.fn(),
  requireCreator: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock('../../../server/request', () => ({ getIpHash: mocks.ip }));
vi.mock('../../../server/rate-limit', () => ({ rateLimit: vi.fn() }));
vi.mock('../../../server/services/settings', () => ({
  getFeatures: vi.fn(),
  updateSetting: mocks.update,
}));
vi.mock('../../../server/services/theme-generate', () => ({ generateDrafts: mocks.generate }));
vi.mock('../../../server/admin-queries/generator', () => ({ getAdminGenerationRun: mocks.read }));
vi.mock('../../../server/cache', () => ({ invalidate: mocks.invalidate }));
import {
  adminGenerateDrafts,
  adminReadGenerationRun,
} from '../../../server/actions/admin/generator';
import { adminUpdateSetting } from '../../../server/actions/admin/settings';
import { AppError } from '../../../server/errors';
const id = '12345678-1234-4123-8123-123456789abc';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ user: { id: 'real-admin', role: 'admin' }, session: {} });
  mocks.ip.mockResolvedValue('hash');
  mocks.generate.mockResolvedValue({
    data: { runId: id, created: 12, skippedQa: 0, skippedDuplicates: 0 },
    tags: [],
  });
  mocks.update.mockResolvedValue({ data: { ok: true }, tags: ['settings'] });
  mocks.read.mockResolvedValue(null);
});
describe('admin generator/settings actions', () => {
  const calls = [
    () => adminGenerateDrafts({ aesthetic: 'y2k', count: 12, seed: 0 }),
    () => adminUpdateSetting({ key: 'features', value: defaultSettings.features }),
    () => adminReadGenerationRun({ id }),
  ];
  it.each(calls)('requires an active administrator for every entrypoint', async (call) => {
    for (const code of ['UNAUTHENTICATED', 'FORBIDDEN'] as const) {
      mocks.admin.mockRejectedValueOnce(new AppError(code));
      expect(await call()).toMatchObject({ ok: false, error: { code } });
    }
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('bounds count and blocks autoapprove/actor injection before authorization or work', async () => {
    for (const value of [
      { aesthetic: 'y2k', count: 25 },
      { aesthetic: 'y2k', count: 0 },
      { aesthetic: 'y2k', count: 12, autoApprove: true },
      { aesthetic: 'y2k', count: 12, actor: { kind: 'system' } },
    ])
      expect(await adminGenerateDrafts(value)).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION' },
      });
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('rejects unknown recipes before running the generator', async () => {
    expect(await adminGenerateDrafts({ aesthetic: 'unknown', count: 12 })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('uses only the guarded actor, keeps explicit seed zero and never autoapproves', async () => {
    expect(await adminGenerateDrafts({ aesthetic: 'y2k', count: 12, seed: 0 })).toMatchObject({
      ok: true,
    });
    expect(mocks.generate).toHaveBeenCalledExactlyOnceWith({
      aesthetic: 'y2k',
      count: 12,
      seed: 0,
      actor: { kind: 'user', userId: 'real-admin', role: 'admin', isCreator: false },
    });
  });
  it('generates a bounded seed server-side only when omitted', async () => {
    await adminGenerateDrafts({ aesthetic: 'y2k', count: 1 });
    const input = mocks.generate.mock.calls[0]?.[0] as { seed: number };
    expect(Number.isInteger(input.seed)).toBe(true);
    expect(input.seed).toBeGreaterThanOrEqual(0);
    expect(input.seed).toBeLessThanOrEqual(2147483647);
  });
  it('invalidates public settings only after a successful guarded write', async () => {
    expect(await adminUpdateSetting({ key: 'home.hero', value: { collectionSlug: null } })).toEqual(
      { ok: true, data: { ok: true } },
    );
    expect(mocks.update).toHaveBeenCalledWith(
      'home.hero',
      { collectionSlug: null },
      { kind: 'user', userId: 'real-admin', role: 'admin', isCreator: false },
    );
    expect(mocks.invalidate).toHaveBeenCalledExactlyOnceWith(['settings'], 'update');
    mocks.invalidate.mockClear();
    mocks.update.mockRejectedValue(new AppError('CONFLICT'));
    expect(
      await adminUpdateSetting({ key: 'features', value: defaultSettings.features }),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
});
