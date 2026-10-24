import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playgroundStateSchema, renderSampleSpec } from '../../../content/render-sample';
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  creator: vi.fn(),
  ip: vi.fn(),
  rate: vi.fn(),
  features: vi.fn(),
  apply: vi.fn(),
  check: vi.fn(),
  profile: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  submit: vi.fn(),
  withdraw: vi.fn(),
  remove: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../../server/guards', () => ({
  requireUser: mocks.user,
  requireCreator: mocks.creator,
  getSession: vi.fn(),
  requireAdmin: vi.fn(),
}));
vi.mock('../../../server/request', () => ({ getIpHash: mocks.ip }));
vi.mock('../../../server/rate-limit', () => ({ rateLimit: mocks.rate }));
vi.mock('../../../server/services/settings', () => ({ getFeatures: mocks.features }));
vi.mock('../../../server/cache', () => ({ invalidate: mocks.invalidate }));
vi.mock('../../../server/services/creators', () => ({
  applyForCreator: mocks.apply,
  checkHandle: mocks.check,
  updateCreatorProfile: mocks.profile,
}));
vi.mock('../../../server/services/creator-themes', () => ({
  createCreatorTheme: mocks.create,
  updateCreatorTheme: mocks.update,
  submitTheme: mocks.submit,
  withdrawTheme: mocks.withdraw,
  deleteCreatorTheme: mocks.remove,
}));
import {
  applyForCreator,
  checkHandle,
  updateCreatorProfile,
  createCreatorTheme,
  updateCreatorTheme,
  submitTheme,
  withdrawTheme,
  deleteCreatorTheme,
} from '../../../server/actions/creator';
import { AppError } from '../../../server/errors';

const id = '11111111-1111-4111-8111-111111111111';
const application = { handle: 'artist_one', displayName: 'Artist', links: [], isAdult: true };
const theme = {
  nameEn: 'My design',
  spec: renderSampleSpec(playgroundStateSchema.parse({})),
  tagSlugs: ['my-aesthetic'],
};
beforeEach(() => {
  vi.resetAllMocks();
  const session = {
    user: { id: 'trusted-owner', role: 'user', banned: false },
    session: { id: 'session' },
  };
  mocks.user.mockResolvedValue(session);
  mocks.creator.mockResolvedValue({ ...session, creator: { status: 'approved' } });
  mocks.ip.mockResolvedValue('salted-hash');
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.features.mockResolvedValue({ creatorApplicationsOpen: true });
  mocks.apply.mockResolvedValue({ data: { status: 'pending' }, tags: [] });
  mocks.check.mockResolvedValue({ data: { available: true }, tags: [] });
  mocks.profile.mockResolvedValue({ data: { ok: true }, tags: ['themes', 'creator:artist_one'] });
  for (const fn of [mocks.create, mocks.update, mocks.remove])
    fn.mockResolvedValue({ data: { id }, tags: [] });
  mocks.submit.mockResolvedValue({ data: { status: 'pending_review' }, tags: [] });
  mocks.withdraw.mockResolvedValue({ data: { status: 'draft' }, tags: [] });
});
describe('creator action boundaries', () => {
  it('authenticates application users, checks the feature and uses the daily account budget', async () => {
    expect(await applyForCreator(application)).toEqual({ ok: true, data: { status: 'pending' } });
    expect(mocks.apply).toHaveBeenCalledExactlyOnceWith(application, {
      kind: 'user',
      userId: 'trusted-owner',
      role: 'user',
      isCreator: false,
    });
    expect(mocks.rate).toHaveBeenCalledExactlyOnceWith('creator-apply:trusted-owner', 3, 86400);
    mocks.features.mockResolvedValueOnce({ creatorApplicationsOpen: false });
    expect(await applyForCreator(application)).toMatchObject({
      ok: false,
      error: { code: 'FEATURE_DISABLED' },
    });
    expect(mocks.apply).toHaveBeenCalledOnce();
  });
  it('uses the creator guard, scopes all mutations and invalidates attribution on profile save', async () => {
    expect(await updateCreatorProfile({ displayName: 'Artist', links: [] })).toEqual({
      ok: true,
      data: { ok: true },
    });
    expect(mocks.profile).toHaveBeenCalledExactlyOnceWith(
      { displayName: 'Artist', links: [] },
      { kind: 'user', userId: 'trusted-owner', role: 'user', isCreator: true },
    );
    expect(mocks.invalidate).toHaveBeenCalledExactlyOnceWith(
      ['themes', 'creator:artist_one'],
      'update',
    );
    expect(await createCreatorTheme(theme)).toEqual({ ok: true, data: { id } });
    expect(mocks.rate).toHaveBeenCalledWith('creator-theme-create:trusted-owner', 30, 86400);
    await updateCreatorTheme({ id, ...theme });
    await deleteCreatorTheme({ id });
    expect(mocks.update).toHaveBeenCalledWith(
      { id, ...theme },
      expect.objectContaining({ userId: 'trusted-owner' }),
    );
    expect(mocks.remove).toHaveBeenCalledWith(
      { id },
      expect.objectContaining({ userId: 'trusted-owner' }),
    );
  });
  it('shares the submission/withdrawal budget and keeps availability behind a user guard', async () => {
    expect(await submitTheme({ id })).toMatchObject({
      ok: true,
      data: { status: 'pending_review' },
    });
    expect(await withdrawTheme({ id })).toMatchObject({ ok: true, data: { status: 'draft' } });
    expect(mocks.rate.mock.calls).toEqual([
      ['creator-theme-status:trusted-owner', 30, 86400],
      ['creator-theme-status:trusted-owner', 30, 86400],
    ]);
    mocks.rate.mockClear();
    expect(await checkHandle({ handle: 'artist_one' })).toEqual({
      ok: true,
      data: { available: true },
    });
    expect(mocks.rate).toHaveBeenCalledExactlyOnceWith('creator-handle:trusted-owner', 120, 60);
    expect(mocks.user).toHaveBeenCalledOnce();
  });
  it('rejects invalid or injected ownership before authentication and blocks guard/rate failures', async () => {
    expect(await createCreatorTheme({ ...theme, ownerId: 'victim' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    expect(mocks.creator).not.toHaveBeenCalled();
    mocks.creator.mockRejectedValueOnce(new AppError('FORBIDDEN'));
    expect(await submitTheme({ id })).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(mocks.submit).not.toHaveBeenCalled();
    mocks.rate.mockResolvedValueOnce({ allowed: false });
    expect(await createCreatorTheme(theme)).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('does not query handle availability after its per-user rate limit is exhausted', async () => {
    mocks.rate.mockResolvedValueOnce({ allowed: false });
    expect(await checkHandle({ handle: 'artist_one' })).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
    expect(mocks.check).not.toHaveBeenCalled();
  });
});
