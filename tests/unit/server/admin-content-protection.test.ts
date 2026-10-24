import { beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ rows: [] as unknown[][], execute: vi.fn(), audit: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../../db/pool', () => ({
  dbPool: {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        execute: fake.execute,
        select: () => {
          const chain = {
            from: () => chain,
            where: () => chain,
            orderBy: () => chain,
            for: async () => fake.rows.shift() ?? [],
          };
          return chain;
        },
      }),
  },
}));
vi.mock('../../../server/audit', () => ({ auditInsert: fake.audit }));
import {
  adminDeleteTag,
  adminMergeTags,
  adminUpsertTag,
} from '../../../server/services/admin-tags';
const id = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222';
const core = {
  id,
  slug: 'y2k',
  kind: 'aesthetic' as const,
  nameEn: 'Y2K',
  nameAr: 'واي تو كي',
  isActive: true,
  sortOrder: 0,
};
const actor = { kind: 'user', userId: 'admin-fixture', role: 'admin', isCreator: false } as const;
beforeEach(() => {
  vi.clearAllMocks();
  fake.rows = [[{ id: actor.userId, role: 'admin', banned: false }]];
});
describe('seed recipe identity protections', () => {
  it('refuses deletion and merge-away of actual curated recipe identities before any audit', async () => {
    fake.rows.push([core]);
    await expect(adminDeleteTag({ id }, actor)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    fake.rows.push(
      [{ id: actor.userId, role: 'admin', banned: false }],
      [core, { ...core, id: other, slug: 'custom-aesthetic' }],
    );
    await expect(adminMergeTags({ fromId: id, toId: other }, actor)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(fake.audit).not.toHaveBeenCalled();
  });
  it('refuses seeded slug/kind changes while keeping metadata editing a separate allowed path', async () => {
    fake.rows.push([core]);
    await expect(adminUpsertTag({ ...core, kind: 'mood' }, actor)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    fake.rows.push([{ id: actor.userId, role: 'admin', banned: false }], [core]);
    await expect(adminUpsertTag({ ...core, slug: 'renamed-y2k' }, actor)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(fake.audit).not.toHaveBeenCalled();
  });
});
