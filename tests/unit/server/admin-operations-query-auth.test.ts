import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ guard: vi.fn(), database: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../../server/guards', () => ({ requireAdmin: mocks.guard }));
vi.mock('../../../db', () => ({
  get db(): unknown {
    mocks.database();
    throw new Error('Unexpected DB read');
  },
}));
vi.mock('../../../lib/env.client', () => ({
  env: { NEXT_PUBLIC_CDN_URL: 'https://cdn.example.invalid' },
}));
import { AppError } from '../../../server/errors';
import {
  getAdminGenerationRun,
  getAdminGeneratorOptions,
  listAdminGenerationRuns,
} from '../../../server/admin-queries/generator';
import { getAdminHeroOptions, getAdminSettings } from '../../../server/admin-queries/settings';
import { listAdminAudit } from '../../../server/admin-queries/audit';
const reads = [
  getAdminGeneratorOptions,
  () => getAdminGenerationRun('bad-id'),
  () => listAdminGenerationRuns({ page: 'bad' }),
  getAdminSettings,
  getAdminHeroOptions,
  () => listAdminAudit({ from: 'bad' }),
];
beforeEach(() => vi.resetAllMocks());
describe('operations reads independently guard before DB work', () => {
  it.each(['visitor', 'user', 'creator', 'banned-admin'])(
    '%s cannot read operations data',
    async (role) => {
      const code = role === 'visitor' ? 'UNAUTHENTICATED' : 'FORBIDDEN';
      mocks.guard.mockRejectedValue(new AppError(code));
      for (const read of reads) await expect(read()).rejects.toMatchObject({ code });
      expect(mocks.guard).toHaveBeenCalledTimes(reads.length);
      expect(mocks.database).not.toHaveBeenCalled();
    },
  );
});
