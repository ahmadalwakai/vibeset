import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  requireCreator: vi.fn(),
  rateLimit: vi.fn(),
  getFeatures: vi.fn(),
  createWallpaper: vi.fn(),
  createAvatar: vi.fn(),
  finalizeWallpaper: vi.fn(),
  finalizeAvatar: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../../server/guards', () => ({
  requireCreator: mocks.requireCreator,
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock('../../../server/request', () => ({ getIpHash: async () => 'salted-hash' }));
vi.mock('../../../server/rate-limit', () => ({ rateLimit: mocks.rateLimit }));
vi.mock('../../../server/services/settings', () => ({ getFeatures: mocks.getFeatures }));
vi.mock('../../../server/services/uploads', () => ({
  createWallpaperUpload: mocks.createWallpaper,
  createAvatarUpload: mocks.createAvatar,
  finalizeWallpaperUpload: mocks.finalizeWallpaper,
  finalizeAvatarUpload: mocks.finalizeAvatar,
}));
import {
  createWallpaperUpload,
  createAvatarUpload,
  finalizeWallpaperUpload,
  finalizeAvatarUpload,
} from '../../../server/actions/uploads';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireCreator.mockResolvedValue({
    user: { id: 'owner', role: 'user', banned: false },
    session: { id: 'session' },
    creator: { status: 'approved' },
  });
  mocks.rateLimit.mockResolvedValue({ allowed: true, count: 1 });
  mocks.getFeatures.mockResolvedValue({ uploadsEnabled: true });
  for (const fn of [
    mocks.createWallpaper,
    mocks.createAvatar,
    mocks.finalizeWallpaper,
    mocks.finalizeAvatar,
  ])
    fn.mockResolvedValue({ data: { uploadId: '11111111-1111-4111-8111-111111111111' }, tags: [] });
});
describe('creator upload actions', () => {
  it('shares the20/hour account budget across wallpaper andavatar reservations', async () => {
    const input = { contentType: 'image/jpeg', bytes: 1024 };
    expect((await createWallpaperUpload(input)).ok).toBe(true);
    expect((await createAvatarUpload(input)).ok).toBe(true);
    expect(mocks.rateLimit.mock.calls).toEqual([
      ['creator-upload:owner', 20, 3600],
      ['creator-upload:owner', 20, 3600],
    ]);
    expect(mocks.createAvatar).toHaveBeenCalledWith(input, {
      kind: 'user',
      userId: 'owner',
      role: 'user',
      isCreator: true,
    });
    expect(mocks.requireCreator).toHaveBeenCalledTimes(2);
  });
  it('guards finalization andfeature availability without spending a second reservation budget', async () => {
    const input = { uploadId: '11111111-1111-4111-8111-111111111111' };
    expect((await finalizeWallpaperUpload(input)).ok).toBe(true);
    expect((await finalizeAvatarUpload(input)).ok).toBe(true);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    mocks.getFeatures.mockResolvedValueOnce({ uploadsEnabled: false });
    expect(await finalizeAvatarUpload(input)).toMatchObject({
      ok: false,
      error: { code: 'FEATURE_DISABLED' },
    });
    expect(mocks.finalizeAvatar).toHaveBeenCalledTimes(1);
  });
  it('refuses injected ownership andnon-raster reservations before authorization', async () => {
    expect(
      await createWallpaperUpload({ contentType: 'image/svg+xml', bytes: 1024 }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(
      await finalizeAvatarUpload({
        uploadId: '11111111-1111-4111-8111-111111111111',
        ownerId: 'victim',
      }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(mocks.requireCreator).not.toHaveBeenCalled();
  });
});
