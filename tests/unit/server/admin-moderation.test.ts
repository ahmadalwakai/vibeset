import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  adminBanUserSchema,
  adminCreatorQuerySchema,
  adminReportQuerySchema,
  adminResolveReportSchema,
  adminReviewCreatorSchema,
  adminSetRoleSchema,
  adminUserIdSchema,
  adminUserQuerySchema,
} from '../../../lib/validation/admin-moderation';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ guard: vi.fn() }));
vi.mock('../../../server/guards', () => ({ requireAdmin: mocks.guard }));
vi.mock('../../../lib/env.client', () => ({
  env: {
    NEXT_PUBLIC_SITE_URL: 'https://example.invalid',
    NEXT_PUBLIC_CDN_URL: 'https://cdn.example.invalid',
  },
}));
vi.mock('../../../db', () => ({
  get db(): never {
    throw new Error('Guard must precede all database access');
  },
}));

describe('admin moderation boundaries', () => {
  it('keeps text Better Auth ids and rejects whitespace/control/oversized identifiers', () => {
    expect(adminUserIdSchema.parse('better-auth_user-123')).toBe('better-auth_user-123');
    for (const id of ['', ' id', 'id\n', 'id\u200b', 'x'.repeat(257)])
      expect(adminUserIdSchema.safeParse(id).success).toBe(false);
    expect(adminSetRoleSchema.safeParse({ userId: 'owner', role: 'superadmin' }).success).toBe(
      false,
    );
    expect(
      adminSetRoleSchema.safeParse({ userId: 'owner', role: 'admin', banned: true }).success,
    ).toBe(false);
  });
  it('normalizes URL query primitives without accepting arrays or malformed page offsets', () => {
    expect(
      adminUserQuerySchema.parse({ q: '  Alice  ', banned: 'false', page: '2' }),
    ).toMatchObject({ q: 'Alice', banned: false, page: 2 });
    expect(adminUserQuerySchema.parse({})).toEqual({ page: 1 });
    expect(adminCreatorQuerySchema.parse({})).toEqual({ page: 1, status: 'pending' });
    expect(adminReportQuerySchema.parse({})).toEqual({ page: 1, status: 'open' });
    for (const page of ['0', '01', '1e2', '100001', -1, 1.5, ['2']])
      expect(adminUserQuerySchema.safeParse({ page }).success).toBe(false);
    expect(adminUserQuerySchema.safeParse({ q: ['admin'] }).success).toBe(false);
  });
  it('defaults archival to off and limits it to the explicit destructive operation', () => {
    expect(
      adminBanUserSchema.parse({ userId: 'owner', reason: ' <b>Spam</b>\n links ' }),
    ).toMatchObject({ reason: 'Spam links', archiveThemes: false });
    const report = { id: randomUUID(), note: 'Reviewed original source', action: 'dismiss' };
    expect(adminResolveReportSchema.parse(report).archiveThemes).toBe(false);
    expect(adminResolveReportSchema.safeParse({ ...report, archiveThemes: true }).success).toBe(
      false,
    );
    expect(
      adminResolveReportSchema.safeParse({ ...report, action: 'ban_owner', archiveThemes: true })
        .success,
    ).toBe(true);
    expect(
      adminReviewCreatorSchema.parse({ userId: 'creator', decision: 'approve' }).archiveThemes,
    ).toBe(false);
    expect(
      adminReviewCreatorSchema.safeParse({
        userId: 'creator',
        decision: 'approve',
        archiveThemes: true,
      }).success,
    ).toBe(false);
    expect(
      adminReviewCreatorSchema.safeParse({
        userId: 'creator',
        decision: 'suspend',
        reason: 'Repeated infringement',
        archiveThemes: true,
      }).success,
    ).toBe(true);
  });
  it('requires bounded notes/reasons and retains readable multiline report notes', () => {
    const value = { id: randomUUID(), action: 'dismiss' };
    expect(adminResolveReportSchema.parse({ ...value, note: ' First\nSecond ' }).note).toBe(
      'First\nSecond',
    );
    for (const note of ['', '   ', 'x'.repeat(1001), 'spoof\u202etext'])
      expect(adminResolveReportSchema.safeParse({ ...value, note }).success).toBe(false);
    expect(adminBanUserSchema.safeParse({ userId: 'owner', reason: 'x'.repeat(501) }).success).toBe(
      false,
    );
    expect(
      adminReviewCreatorSchema.safeParse({ userId: 'owner', decision: 'reject' }).success,
    ).toBe(false);
  });
});

describe('private moderation reads', () => {
  it('guards every exported read before input parsing or database initialization', async () => {
    const failure = Object.assign(new Error('denied'), { code: 'FORBIDDEN' });
    mocks.guard.mockRejectedValue(failure);
    const [users, reports, creators] = await Promise.all([
      import('../../../server/admin-queries/users'),
      import('../../../server/admin-queries/reports'),
      import('../../../server/admin-queries/creators'),
    ]);
    for (const read of [
      () => users.listAdminUsers({}),
      () => users.getAdminUser('invalid\n'),
      () => reports.listAdminReports({}),
      () => reports.getAdminReport('invalid'),
      () => creators.listAdminCreators({}),
      () => creators.getAdminCreator('invalid\n'),
    ]) {
      await expect(read()).rejects.toBe(failure);
    }
    expect(mocks.guard).toHaveBeenCalledTimes(6);
  });
});
