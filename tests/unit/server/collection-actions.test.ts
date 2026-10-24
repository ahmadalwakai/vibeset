import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  ip: vi.fn(),
  rate: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  add: vi.fn(),
  removeItem: vi.fn(),
  reorder: vi.fn(),
  list: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../../server/guards', () => ({
  requireUser: mocks.user,
  getSession: vi.fn(),
  requireCreator: vi.fn(),
  requireAdmin: vi.fn(),
}));
vi.mock('../../../server/request', () => ({ getIpHash: mocks.ip }));
vi.mock('../../../server/rate-limit', () => ({ rateLimit: mocks.rate }));
vi.mock('../../../server/services/settings', () => ({ getFeatures: vi.fn() }));
vi.mock('../../../server/services/collections', () => ({
  createCollection: mocks.create,
  updateCollection: mocks.update,
  deleteCollection: mocks.remove,
  addToCollection: mocks.add,
  removeFromCollection: mocks.removeItem,
  reorderCollection: mocks.reorder,
}));
vi.mock('../../../server/admin-queries/collections', () => ({ listMyCollections: mocks.list }));
import * as actions from '../../../server/actions/collections';
import { AppError } from '../../../server/errors';
const id = '11111111-1111-4111-8111-111111111111';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({
    user: { id: 'trusted-owner', role: 'user' },
    session: { id: 'session' },
  });
  mocks.ip.mockResolvedValue('ip-hash');
  mocks.rate.mockResolvedValue({ allowed: true, count: 1 });
  for (const call of [mocks.create, mocks.update, mocks.remove])
    call.mockResolvedValue({ data: { id }, tags: [] });
  for (const call of [mocks.add, mocks.removeItem])
    call.mockResolvedValue({ data: { itemCount: 1 }, tags: [] });
  mocks.reorder.mockResolvedValue({ data: { ok: true }, tags: [] });
  mocks.list.mockResolvedValue([]);
});
describe('collection action guards and budgets', () => {
  it('creates with a guarded account and 30/hour account budget', async () => {
    expect(await actions.createCollection({ titleEn: '  Title  ', visibility: 'private' })).toEqual(
      { ok: true, data: { id } },
    );
    expect(mocks.create).toHaveBeenCalledWith(
      { titleEn: 'Title', visibility: 'private' },
      { kind: 'user', userId: 'trusted-owner', role: 'user', isCreator: false },
    );
    expect(mocks.rate).toHaveBeenCalledWith('collections-create:trusted-owner', 30, 3600);
  });
  it('shares a 300/hour membership budget; update/delete/order remain unthrottled', async () => {
    await actions.addToCollection({ collectionId: id, themeId: id });
    await actions.removeFromCollection({ collectionId: id, themeId: id });
    expect(mocks.rate.mock.calls).toEqual([
      ['collections-items:trusted-owner', 300, 3600],
      ['collections-items:trusted-owner', 300, 3600],
    ]);
    mocks.rate.mockClear();
    await actions.updateCollection({ id, titleEn: 'Changed' });
    await actions.deleteCollection({ id });
    await actions.reorderCollection({ collectionId: id, themeIds: [] });
    expect(mocks.rate).not.toHaveBeenCalled();
  });
  it('reads only through the user guard and passes the optional theme ID to the private query', async () => {
    expect(await actions.listCollections({ themeId: id })).toEqual({
      ok: true,
      data: { collections: [] },
    });
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith(id);
    expect(mocks.rate).not.toHaveBeenCalled();
  });
  it('rejects injected ownership before auth and denies anonymous or limited calls before the service', async () => {
    expect(
      await actions.createCollection({
        titleEn: 'Title',
        visibility: 'private',
        ownerId: 'victim',
      }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(mocks.user).not.toHaveBeenCalled();
    mocks.user.mockRejectedValueOnce(new AppError('UNAUTHENTICATED'));
    expect(
      await actions.createCollection({ titleEn: 'Title', visibility: 'private' }),
    ).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
    mocks.rate.mockResolvedValueOnce({ allowed: false, count: 31 });
    expect(
      await actions.createCollection({ titleEn: 'Title', visibility: 'private' }),
    ).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
