import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playgroundStateSchema, renderSampleSpec } from '../../../content/render-sample';
const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  ip: vi.fn(),
  update: vi.fn(),
  transition: vi.fn(),
  featured: vi.fn(),
  tag: vi.fn(),
  collection: vi.fn(),
  remove: vi.fn(),
  cleanup: vi.fn(),
  invalidate: vi.fn(),
  after: vi.fn(),
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
vi.mock('../../../server/services/settings', () => ({ getFeatures: vi.fn() }));
vi.mock('../../../server/cache', () => ({ invalidate: mocks.invalidate }));
vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('../../../server/services/admin-themes', () => ({
  adminUpdateTheme: mocks.update,
  adminTransitionThemes: mocks.transition,
  adminSetFeatured: mocks.featured,
  adminTagThemes: mocks.tag,
  adminAddToCollection: mocks.collection,
  adminDeleteThemes: mocks.remove,
  cleanupDeletedThemeAssets: mocks.cleanup,
}));
import {
  adminUpdateTheme,
  adminTransitionThemes,
  adminSetFeatured,
  adminTagThemes,
  adminAddToCollection,
  adminDeleteThemes,
} from '../../../server/actions/admin/themes';
import { AppError } from '../../../server/errors';

const id = '11111111-aaaa-4111-8111-111111111111';
const editing = {
  id,
  nameEn: 'Edited',
  tagSlugs: ['my-aesthetic'],
  isFeatured: true,
  spec: renderSampleSpec(playgroundStateSchema.parse({})),
};
const calls = [
  ['update', () => adminUpdateTheme(editing)],
  ['transition', () => adminTransitionThemes({ ids: [id], to: 'approved' })],
  ['featured', () => adminSetFeatured({ ids: [id], featured: true })],
  ['tag', () => adminTagThemes({ ids: [id], add: ['my-mood'], remove: [] })],
  ['collection', () => adminAddToCollection({ ids: [id], collectionId: id })],
  ['delete', () => adminDeleteThemes({ ids: [id] })],
] as const;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({
    user: { id: 'trusted-admin', role: 'admin', banned: false },
    session: { id: 'session' },
  });
  mocks.ip.mockResolvedValue('hash');
  for (const fn of [mocks.transition, mocks.featured, mocks.tag, mocks.collection, mocks.remove])
    fn.mockResolvedValue({ data: { count: 1, results: [{ id, ok: true }] }, tags: [] });
  mocks.update.mockResolvedValue({ data: { id, stale: true }, tags: ['themes'] });
});
describe('all admin theme action entrypoints', () => {
  it.each(calls)('%s denies visitors before reaching services', async (_name, call) => {
    mocks.admin.mockRejectedValue(new AppError('UNAUTHENTICATED'));
    expect(await call()).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
    for (const service of [
      mocks.update,
      mocks.transition,
      mocks.featured,
      mocks.tag,
      mocks.collection,
      mocks.remove,
    ])
      expect(service).not.toHaveBeenCalled();
  });
  it.each(calls)('%s denies ordinary users and creator-only accounts', async (_name, call) => {
    for (const role of ['user', 'creator']) {
      mocks.admin.mockRejectedValue(new AppError('FORBIDDEN', role));
      expect(await call()).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    }
    for (const service of [
      mocks.update,
      mocks.transition,
      mocks.featured,
      mocks.tag,
      mocks.collection,
      mocks.remove,
    ])
      expect(service).not.toHaveBeenCalled();
  });
  it('uses the guarded actor, normalized IDs and immediate public invalidation', async () => {
    expect(await adminUpdateTheme(editing)).toEqual({ ok: true, data: { id, stale: true } });
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith(editing, {
      kind: 'user',
      userId: 'trusted-admin',
      role: 'admin',
      isCreator: false,
    });
    expect(mocks.invalidate).toHaveBeenCalledExactlyOnceWith(['themes'], 'update');
    await adminSetFeatured({ ids: [id.toUpperCase(), id], featured: false });
    expect(mocks.featured).toHaveBeenCalledWith(
      { ids: [id], featured: false },
      expect.objectContaining({ userId: 'trusted-admin' }),
    );
  });
  it('schedules only confirmed deletions and returns mixed per-item outcomes unchanged', async () => {
    const result = {
      count: 1,
      results: [
        { id, ok: true },
        { id: '22222222-2222-4222-8222-222222222222', ok: false, code: 'INVALID_STATE' },
      ],
    };
    mocks.remove.mockResolvedValue({ data: result, tags: ['themes'], cleanup: { themeIds: [id] } });
    expect(await adminDeleteThemes({ ids: [id] })).toEqual({ ok: true, data: result });
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.cleanup).not.toHaveBeenCalled();
    const callback = mocks.after.mock.calls[0]?.[0] as (() => Promise<void>) | undefined;
    await callback?.();
    expect(mocks.cleanup).toHaveBeenCalledExactlyOnceWith([id]);
    mocks.after.mockClear();
    mocks.remove.mockResolvedValue({
      data: { count: 0, results: [{ id, ok: false, code: 'INTERNAL' }] },
      tags: [],
    });
    await adminDeleteThemes({ ids: [id] });
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it('passes the captured review precondition unchanged with the guarded actor', async () => {
    const reviewVersion = 'b'.repeat(64);
    const input = { ids: [id.toUpperCase(), id], to: 'approved', reviewVersion };
    expect(await adminTransitionThemes(input)).toMatchObject({ ok: true });
    expect(mocks.transition).toHaveBeenCalledExactlyOnceWith(
      { ids: [id], to: 'approved', reviewVersion },
      { kind: 'user', userId: 'trusted-admin', role: 'admin', isCreator: false },
    );
    mocks.transition.mockClear();
    for (const code of ['UNAUTHENTICATED', 'FORBIDDEN'] as const) {
      mocks.admin.mockRejectedValueOnce(new AppError(code));
      expect(await adminTransitionThemes(input)).toMatchObject({ ok: false, error: { code } });
    }
    expect(mocks.transition).not.toHaveBeenCalled();
  });
  it('rejects malformed or multi-theme review preconditions before guards and services', async () => {
    for (const input of [
      { ids: [id], to: 'approved', reviewVersion: 'bad' },
      {
        ids: [id, '22222222-2222-4222-8222-222222222222'],
        to: 'approved',
        reviewVersion: 'a'.repeat(64),
      },
    ])
      expect(await adminTransitionThemes(input)).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION' },
      });
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.transition).not.toHaveBeenCalled();
  });
  it('validates immutable fields before authorization', async () => {
    expect(await adminUpdateTheme({ ...editing, status: 'published' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
