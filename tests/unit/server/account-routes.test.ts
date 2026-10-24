import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  rateLimit: vi.fn(),
  exportData: vi.fn(),
  remixes: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../../server/guards', () => ({ requireUser: mocks.requireUser }));
vi.mock('../../../server/rate-limit', () => ({ rateLimit: mocks.rateLimit }));
vi.mock('../../../server/services/account', () => ({ exportAccountData: mocks.exportData }));
vi.mock('../../../server/admin-queries/user', () => ({ listMyRemixes: mocks.remixes }));
import { GET as exportData } from '../../../app/api/account/export/route';
import { GET as remixes } from '../../../app/api/me/remixes/route';
import { AppError } from '../../../server/errors';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue({ user: { id: 'trusted-account' } });
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  mocks.exportData.mockResolvedValue({ version: 1, profile: { id: 'trusted-account' } });
  mocks.remixes.mockResolvedValue({ items: [], nextCursor: null });
});
describe('private account routes', () => {
  it('exports the fresh guarded account as a private JSON attachment', async () => {
    const response = await exportData();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="vibeset-account.json"',
    );
    expect(await response.json()).toEqual({
      data: { version: 1, profile: { id: 'trusted-account' } },
    });
    expect(mocks.exportData).toHaveBeenCalledExactlyOnceWith('trusted-account');
    expect(mocks.rateLimit).toHaveBeenCalledExactlyOnceWith(
      'account-export:trusted-account',
      5,
      86400,
    );
  });
  it('refuses visitors before accessing data or consuming an export allowance', async () => {
    mocks.requireUser.mockRejectedValue(new AppError('UNAUTHENTICATED'));
    const response = await exportData();
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.exportData).not.toHaveBeenCalled();
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });
  it('returns 429 without exporting when the daily allowance is exceeded', async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false });
    expect((await exportData()).status).toBe(429);
    expect(mocks.exportData).not.toHaveBeenCalled();
  });
  it('passes validated remix pagination to an independently guarded query', async () => {
    const response = await remixes(new Request('http://localhost/api/me/remixes?cursor=bounded'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.remixes).toHaveBeenCalledExactlyOnceWith({ cursor: 'bounded' });
    expect((await remixes(new Request('http://localhost/api/me/remixes?unknown=1'))).status).toBe(
      422,
    );
  });
});
