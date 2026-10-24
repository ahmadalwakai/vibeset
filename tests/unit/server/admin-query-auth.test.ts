import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ guard: vi.fn(), database: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../../server/guards', () => ({ requireAdmin: mocks.guard }));
vi.mock('../../../db', () => ({
  get db(): unknown {
    mocks.database();
    throw new Error('Unreachable database');
  },
}));
vi.mock('../../../lib/env.client', () => ({
  env: { NEXT_PUBLIC_CDN_URL: 'https://cdn.example.invalid' },
}));
import { AppError } from '../../../server/errors';
import { getAdminCounts } from '../../../server/admin-queries/counts';
import {
  getAdminDashboardKpis,
  getAdminDownloads,
  getAdminRecentAudit,
  getAdminTopThemes,
} from '../../../server/admin-queries/dashboard';
import {
  getAdminTheme,
  getAdminThemeOptions,
  listAdminThemes,
} from '../../../server/admin-queries/themes';
import { getAdminReviewItem, listAdminReview } from '../../../server/admin-queries/review';
import { listAdminPublish } from '../../../server/admin-queries/publish';

const reads = [
  getAdminCounts,
  getAdminDashboardKpis,
  getAdminDownloads,
  getAdminRecentAudit,
  getAdminTopThemes,
  getAdminThemeOptions,
  () => getAdminTheme('bad-id'),
  () => listAdminThemes({ page: 'bad' }),
  () => listAdminReview({ cursor: 'bad' }),
  () => getAdminReviewItem('bad-id'),
  () => listAdminPublish({ kind: 'bad' }),
];
beforeEach(() => vi.resetAllMocks());
describe('every admin read independently rejects unauthorized principals before DB/input work', () => {
  it.each(['visitor', 'user', 'creator', 'banned-admin'] as const)(
    '%s cannot read admin data',
    async (role) => {
      const code = role === 'visitor' ? 'UNAUTHENTICATED' : 'FORBIDDEN';
      mocks.guard.mockRejectedValue(new AppError(code));
      for (const read of reads) await expect(read()).rejects.toMatchObject({ code });
      expect(mocks.guard).toHaveBeenCalledTimes(reads.length);
      expect(mocks.database).not.toHaveBeenCalled();
    },
  );
});
