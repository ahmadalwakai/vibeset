import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../server/errors';
const mocks = vi.hoisted(() => ({ guard: vi.fn(), invalidate: vi.fn(), call: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../../server/guards', () => ({
  requireAdmin: mocks.guard,
  requireUser: vi.fn(),
  requireCreator: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock('../../../server/request', () => ({ getIpHash: vi.fn() }));
vi.mock('../../../server/cache', () => ({ invalidate: mocks.invalidate }));
vi.mock('../../../server/services/settings', () => ({ getFeatures: vi.fn() }));
vi.mock('../../../server/rate-limit', () => ({ rateLimit: vi.fn() }));
vi.mock('../../../server/services/admin-collections', () => ({
  adminUpsertCollection: mocks.call,
  adminDeleteCollection: mocks.call,
  adminReorderCollection: mocks.call,
  adminSetPinned: mocks.call,
  adminRemoveCollectionItem: mocks.call,
}));
vi.mock('../../../server/services/admin-tags', () => ({
  adminUpsertTag: mocks.call,
  adminDeleteTag: mocks.call,
  adminMergeTags: mocks.call,
}));
vi.mock('../../../server/services/admin-apps', () => ({
  adminUpsertApp: mocks.call,
  adminDeleteApp: mocks.call,
  adminReorderApps: mocks.call,
}));
import {
  adminUpsertCollection,
  adminDeleteCollection,
  adminReorderCollection,
  adminSetPinned,
  adminRemoveCollectionItem,
} from '../../../server/actions/admin/collections';
import { adminUpsertTag, adminDeleteTag, adminMergeTags } from '../../../server/actions/admin/tags';
import {
  adminUpsertApp,
  adminDeleteApp,
  adminReorderApps,
} from '../../../server/actions/admin/apps';
const id = '11111111-aaaa-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222';
const calls = [
  [
    'upsert collection',
    () =>
      adminUpsertCollection({
        slug: 'test',
        kind: 'editorial',
        visibility: 'public',
        titleEn: 'Test',
        isPinned: false,
        sortOrder: 0,
      }),
  ],
  ['delete collection', () => adminDeleteCollection({ id })],
  ['reorder collection', () => adminReorderCollection({ collectionId: id, themeIds: [] })],
  ['pin', () => adminSetPinned({ id, pinned: true })],
  ['remove item', () => adminRemoveCollectionItem({ collectionId: id, themeId: other })],
  [
    'upsert tag',
    () =>
      adminUpsertTag({
        slug: 'test',
        kind: 'mood',
        nameEn: 'Test',
        nameAr: 'تجربة',
        sortOrder: 0,
        isActive: true,
      }),
  ],
  ['delete tag', () => adminDeleteTag({ id })],
  ['merge tags', () => adminMergeTags({ fromId: id, toId: other })],
  [
    'upsert app',
    () =>
      adminUpsertApp({
        slug: 'x',
        name: 'X',
        aliases: [],
        category: 'social',
        glyph: 'heart',
        rank: 1,
        isActive: true,
      }),
  ],
  ['delete app', () => adminDeleteApp({ id })],
  ['reorder apps', () => adminReorderApps({ ids: [] })],
] as const;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.guard.mockResolvedValue({ user: { id: 'trusted-admin', role: 'admin', banned: false } });
  mocks.call.mockResolvedValue({ data: { id }, tags: ['taxonomy', 'themes'] });
});
describe('admin content action authority and invalidation', () => {
  it.each(calls)(
    '%s refuses visitors and ordinary accounts before services',
    async (_name, call) => {
      for (const code of ['UNAUTHENTICATED', 'FORBIDDEN'] as const) {
        mocks.guard.mockRejectedValueOnce(new AppError(code));
        expect(await call()).toMatchObject({ ok: false, error: { code } });
      }
      expect(mocks.call).not.toHaveBeenCalled();
    },
  );
  it.each(calls)(
    '%s passes the guarded identity and invalidates returned dependencies',
    async (_name, call) => {
      expect(await call()).toEqual({ ok: true, data: { id } });
      expect(mocks.call).toHaveBeenCalledWith(expect.any(Object), {
        kind: 'user',
        userId: 'trusted-admin',
        role: 'admin',
        isCreator: false,
      });
      expect(mocks.invalidate).toHaveBeenCalledExactlyOnceWith(['taxonomy', 'themes'], 'update');
    },
  );
  it('validates privilege-bearing and malformed values before the guard', async () => {
    expect(
      await adminUpsertTag({
        id,
        slug: 'tag',
        kind: 'mood',
        nameEn: 'Tag',
        nameAr: 'وسم',
        sortOrder: 0,
        isActive: true,
        ownerId: 'foreign',
      }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(mocks.guard).not.toHaveBeenCalled();
  });
});
