import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getIpHash: vi.fn(),
  rateLimit: vi.fn(),
  getFeatures: vi.fn(),
  submitReport: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../../server/guards', () => ({
  getSession: mocks.getSession,
  requireUser: vi.fn(),
  requireCreator: vi.fn(),
  requireAdmin: vi.fn(),
}));
vi.mock('../../../server/request', () => ({ getIpHash: mocks.getIpHash }));
vi.mock('../../../server/rate-limit', () => ({ rateLimit: mocks.rateLimit }));
vi.mock('../../../server/services/settings', () => ({ getFeatures: mocks.getFeatures }));
vi.mock('../../../server/services/reports', () => ({ submitReport: mocks.submitReport }));
import { submitReport } from '../../../server/actions/reports';
import { AppError } from '../../../server/errors';

const themeId = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const input = { themeId, reason: 'copyright' };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue(null);
  mocks.getIpHash.mockResolvedValue('a'.repeat(64));
  mocks.rateLimit.mockResolvedValue({ allowed: true, count: 1 });
  mocks.getFeatures.mockResolvedValue({ reportsEnabled: true });
  mocks.submitReport.mockResolvedValue({ data: { id }, tags: [] });
});

describe('public report action', () => {
  it('uses the trusted salted IP for a visitor and a five-per-hour budget', async () => {
    expect(await submitReport(input)).toEqual({ ok: true, data: { id } });
    expect(mocks.submitReport).toHaveBeenCalledExactlyOnceWith(input, {
      kind: 'visitor',
      ipHash: 'a'.repeat(64),
    });
    expect(mocks.rateLimit).toHaveBeenCalledExactlyOnceWith(`report:ip:${'a'.repeat(64)}`, 5, 3600);
  });
  it('uses the trusted account instead of retaining its IP hash', async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: 'reporter', banned: false },
      session: { id: 'session' },
    });
    expect(await submitReport(input)).toEqual({ ok: true, data: { id } });
    expect(mocks.submitReport).toHaveBeenCalledExactlyOnceWith(input, {
      kind: 'user',
      userId: 'reporter',
    });
    expect(mocks.rateLimit).toHaveBeenCalledExactlyOnceWith('report:user:reporter', 5, 3600);
  });
  it('rejects a spoofed reporter before calling any guard or database code', async () => {
    expect(await submitReport({ ...input, reporterId: 'victim' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.submitReport).not.toHaveBeenCalled();
  });
  it('honours the feature flag before consuming the report budget', async () => {
    mocks.getFeatures.mockResolvedValue({ reportsEnabled: false });
    expect(await submitReport(input)).toMatchObject({
      ok: false,
      error: { code: 'FEATURE_DISABLED' },
    });
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.submitReport).not.toHaveBeenCalled();
  });
  it('blocks a banned session even though reporting is public', async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: 'reporter', banned: true },
      session: { id: 'session' },
    });
    expect(await submitReport(input)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(mocks.submitReport).not.toHaveBeenCalled();
  });
  it('returns the safe rate-limit error without submitting the report', async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false, count: 6 });
    expect(await submitReport(input)).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
    expect(mocks.submitReport).not.toHaveBeenCalled();
  });
  it('translates a no-longer-published theme into a safe action error', async () => {
    mocks.submitReport.mockRejectedValue(new AppError('NOT_FOUND'));
    expect(await submitReport(input)).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });
});
