import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playgroundStateSchema, renderSampleSpec } from '../../../content/render-sample';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getIpHash: vi.fn(),
  rateLimit: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../../server/guards', () => ({
  requireUser: mocks.requireUser,
  getSession: vi.fn(),
  requireCreator: vi.fn(),
  requireAdmin: vi.fn(),
}));
vi.mock('../../../server/request', () => ({ getIpHash: mocks.getIpHash }));
vi.mock('../../../server/rate-limit', () => ({ rateLimit: mocks.rateLimit }));
vi.mock('../../../server/services/settings', () => ({ getFeatures: vi.fn() }));
vi.mock('../../../server/services/remixes', () => ({
  saveRemix: mocks.save,
  updateRemix: mocks.update,
  deleteRemix: mocks.remove,
}));
vi.mock('../../../server/cache', () => ({ invalidate: mocks.invalidate }));
import { AppError } from '../../../server/errors';
import { saveRemix, updateRemix, deleteRemix } from '../../../server/actions/studio';

const id = '11111111-1111-4111-8111-111111111111';
const spec = renderSampleSpec(playgroundStateSchema.parse({}));
const input = { spec, nameEn: 'My remix', remixOfSlug: 'public-theme' };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue({
    user: { id: 'trusted-owner', role: 'user', banned: false },
    session: { id: 'trusted-session' },
  });
  mocks.getIpHash.mockResolvedValue('hash');
  mocks.rateLimit.mockResolvedValue({ allowed: true, count: 1 });
  for (const fn of [mocks.save, mocks.update, mocks.remove])
    fn.mockResolvedValue({ data: { id }, tags: [] });
});

describe('guarded Studio actions', () => {
  it('passes only validated input and the trusted guarded account to the service', async () => {
    expect(await saveRemix({ ...input, nameEn: '  My remix  ' })).toEqual({
      ok: true,
      data: { id },
    });
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(input, {
      kind: 'user',
      userId: 'trusted-owner',
      role: 'user',
      isCreator: false,
    });
    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(mocks.rateLimit).toHaveBeenCalledExactlyOnceWith('studio-remix:trusted-owner', 30, 3600);
  });
  it('uses one account-scoped save/update budget and no delete limit', async () => {
    expect(await updateRemix({ id, spec, nameEn: 'Updated' })).toEqual({ ok: true, data: { id } });
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith(
      { id, spec, nameEn: 'Updated' },
      expect.objectContaining({ userId: 'trusted-owner' }),
    );
    expect(mocks.rateLimit).toHaveBeenCalledExactlyOnceWith('studio-remix:trusted-owner', 30, 3600);
    mocks.rateLimit.mockClear();
    expect(await deleteRemix({ id })).toEqual({ ok: true, data: { id } });
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(
      { id },
      expect.objectContaining({ userId: 'trusted-owner' }),
    );
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });
  it('rejects invalid or injected ownership fields before authentication', async () => {
    expect(await saveRemix({ ...input, ownerId: 'victim' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    expect(await updateRemix({ id, spec: {}, nameEn: 'Invalid' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each(['UNAUTHENTICATED', 'FORBIDDEN'] as const)(
    'does not call the service when guard returns %s',
    async (code) => {
      mocks.requireUser.mockRejectedValue(new AppError(code));
      expect(await saveRemix(input)).toMatchObject({ ok: false, error: { code } });
      expect(mocks.save).not.toHaveBeenCalled();
      expect(mocks.rateLimit).not.toHaveBeenCalled();
    },
  );
  it('stops at the rate limit and returns service photo authorization errors safely', async () => {
    mocks.rateLimit.mockResolvedValueOnce({ allowed: false, count: 31 });
    expect(await saveRemix(input)).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
    expect(mocks.save).not.toHaveBeenCalled();
    mocks.save.mockRejectedValueOnce(new AppError('FORBIDDEN'));
    expect(await saveRemix(input)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });
  it('invalidates returned tags before returning only the public mutation result', async () => {
    mocks.save.mockResolvedValue({ data: { id }, tags: ['themes'] });
    expect(await saveRemix(input)).toEqual({ ok: true, data: { id } });
    expect(mocks.invalidate).toHaveBeenCalledExactlyOnceWith(['themes'], 'update');
  });
});
