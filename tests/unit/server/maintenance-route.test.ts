import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MaintenanceSummary } from '../../../lib/maintenance';
import type * as MaintenanceService from '../../../server/services/maintenance';
const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  invalidate: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../../lib/env.server', () => ({ env: { CRON_SECRET: 'c'.repeat(32) } }));
vi.mock('../../../server/cache', () => ({ invalidate: mocks.invalidate }));
vi.mock('../../../server/services/maintenance', async (original) => ({
  ...(await original<typeof MaintenanceService>()),
  runDailyMaintenance: mocks.run,
}));
import { GET, maxDuration } from '../../../app/api/cron/daily/route';
import { MaintenanceIncompleteError } from '../../../server/services/maintenance';

const summary: MaintenanceSummary = {
  popularityChecked: 2,
  popularityUpdated: 1,
  popularityRetried: 0,
  popularityPending: 0,
  countersChecked: 3,
  countersUpdated: 2,
  countersRetried: 1,
  countersPending: 0,
  cleanupRetried: 0,
  cleanupPending: 0,
  appRateLimitsDeleted: 4,
  authRateLimitsDeleted: 5,
  uploadsRejected: 6,
};
const request = (authorization?: string, query = ''): Request =>
  new Request(`https://example.invalid/api/cron/daily${query}`, {
    headers: {
      ...(authorization ? { authorization } : {}),
      cookie: 'better-auth.session_token=not-authority',
    },
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'info').mockImplementation(mocks.info);
  vi.spyOn(console, 'error').mockImplementation(mocks.error);
  mocks.run.mockResolvedValue({ data: summary, tags: ['themes'] });
});
describe('protected daily cron route', () => {
  it.each([
    undefined,
    'Bearer wrong',
    'Basic ' + 'c'.repeat(32),
    'Bearer ' + 'c'.repeat(33),
    'Bearer a b',
  ])('rejects invalid authorization without work or invalidation (%s)', async (header) => {
    const response = await GET(request(header));
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it('uses the configured cron secret, accepts no caller options, and revalidates public reads', async () => {
    expect(maxDuration).toBe(60);
    const response = await GET(
      request('Bearer ' + 'c'.repeat(32), '?asOf=1900-01-01&scope=anything'),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: summary });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.run).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.invalidate).toHaveBeenCalledExactlyOnceWith(['themes'], 'revalidate');
    expect(mocks.info).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ scope: 'cron.daily', complete: true, ...summary }),
    );
  });
  it('invalidates after an incomplete authenticated run and logs only aggregate diagnostics', async () => {
    const partial = { ...summary, countersPending: 2 };
    mocks.run.mockRejectedValue(new MaintenanceIncompleteError('counters', partial));
    const response = await GET(request('Bearer ' + 'c'.repeat(32)));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: { code: 'INTERNAL' } });
    expect(mocks.invalidate).toHaveBeenCalledExactlyOnceWith(['themes'], 'revalidate');
    expect(mocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ complete: false, phase: 'counters', countersPending: 2 }),
    );
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain('Bearer');
    expect(mocks.info).not.toHaveBeenCalled();
  });
  it('sanitizes unexpected database failures and still refreshes potentially committed work', async () => {
    mocks.run.mockRejectedValue(new Error('unsafe SQL or connection details'));
    const response = await GET(request('Bearer ' + 'c'.repeat(32)));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('unsafe');
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain('unsafe');
    expect(mocks.invalidate).toHaveBeenCalledOnce();
  });
  it('reports cache refresh failure after successful database work without leaking exception text', async () => {
    mocks.invalidate.mockImplementation(() => {
      throw new Error('unsafe cache exception');
    });
    const response = await GET(request('Bearer ' + 'c'.repeat(32)));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('unsafe');
    expect(mocks.run).toHaveBeenCalledOnce();
    expect(mocks.error).toHaveBeenCalledWith({ scope: 'cron.daily.invalidate', code: 'INTERNAL' });
  });
});
