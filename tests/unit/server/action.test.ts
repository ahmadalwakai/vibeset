import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  requireUser: vi.fn(),
  requireCreator: vi.fn(),
  requireAdmin: vi.fn(),
  getIpHash: vi.fn(),
  rateLimit: vi.fn(),
  getFeatures: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/server/guards', () => mocks);
vi.mock('@/server/request', () => ({ getIpHash: mocks.getIpHash }));
vi.mock('@/server/rate-limit', () => ({ rateLimit: mocks.rateLimit }));
vi.mock('@/server/services/settings', () => ({ getFeatures: mocks.getFeatures }));

import { AppError } from '@/server/errors';
import { createAction } from '@/server/action';

const signedIn = {
  session: { id: 'session-id', userId: 'user-id' },
  user: { id: 'user-id', name: 'A user', role: 'user', banned: false },
};

describe('createAction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSession.mockResolvedValue(null);
    mocks.requireUser.mockResolvedValue(signedIn);
    mocks.requireAdmin.mockResolvedValue({
      ...signedIn,
      user: { ...signedIn.user, role: 'admin' },
    });
    mocks.requireCreator.mockResolvedValue({ ...signedIn, creator: { status: 'approved' } });
    mocks.getIpHash.mockResolvedValue('hashed-ip');
    mocks.rateLimit.mockResolvedValue({ allowed: true, count: 1 });
    mocks.getFeatures.mockResolvedValue({ reportsEnabled: true });
  });

  it('returns flattened field errors before calling authentication or the handler', async () => {
    const handler = vi.fn();
    const action = createAction({ input: z.object({ email: z.email() }), auth: 'user', handler });
    expect(await action({ email: 'bad' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', fieldErrors: { email: [expect.any(String)] } },
    });
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(['public', 'user', 'creator', 'admin'] as const)(
    'uses the %s auth level and passes only the guarded context',
    async (auth) => {
      const action = createAction({
        input: z.object({ count: z.coerce.number().int() }),
        auth,
        handler: async (input, context) => ({ ...input, context }),
      });
      const result = await action({ count: '2' });
      expect(result).toMatchObject({
        ok: true,
        data: { count: 2, context: { ipHash: 'hashed-ip' } },
      });
      const guard = {
        public: mocks.getSession,
        user: mocks.requireUser,
        creator: mocks.requireCreator,
        admin: mocks.requireAdmin,
      }[auth];
      expect(guard).toHaveBeenCalledOnce();
      if (auth === 'public') expect(result).toMatchObject({ data: { context: { user: null } } });
      if (auth === 'creator') {
        expect(result).toMatchObject({ data: { context: { creator: { status: 'approved' } } } });
      }
    },
  );

  it('maps a failed auth guard without calling the handler', async () => {
    mocks.requireUser.mockRejectedValue(new AppError('UNAUTHENTICATED'));
    const handler = vi.fn();
    const action = createAction({ input: z.object({}), auth: 'user', handler });
    expect(await action({})).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
    expect(handler).not.toHaveBeenCalled();
  });

  it('blocks a banned session even for a public mutation', async () => {
    mocks.getSession.mockResolvedValue({ ...signedIn, user: { ...signedIn.user, banned: true } });
    const handler = vi.fn();
    const action = createAction({ input: z.object({}), auth: 'public', handler });
    expect(await action({})).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(handler).not.toHaveBeenCalled();
  });

  it('checks a feature before consuming its mutation rate limit', async () => {
    mocks.getFeatures.mockResolvedValue({ reportsEnabled: false });
    const handler = vi.fn();
    const action = createAction({
      input: z.object({}),
      auth: 'user',
      feature: 'reportsEnabled',
      rateLimit: { key: (context) => `report:${context.user.id}`, limit: 5, windowSec: 3600 },
      handler,
    });
    expect(await action({})).toMatchObject({ ok: false, error: { code: 'FEATURE_DISABLED' } });
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('blocks a rate-limited request using the server-derived identity', async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false, count: 6 });
    const handler = vi.fn();
    const action = createAction({
      input: z.object({}),
      auth: 'public',
      rateLimit: {
        key: (context) => `report:${context.user?.id ?? context.ipHash}`,
        limit: 5,
        windowSec: 3600,
      },
      handler,
    });
    expect(await action({})).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
    expect(mocks.rateLimit).toHaveBeenCalledWith('report:hashed-ip', 5, 3600);
    expect(handler).not.toHaveBeenCalled();
  });

  it('preserves safe application error codes and field errors', async () => {
    const action = createAction({
      input: z.object({}),
      auth: 'public',
      handler: async () => {
        throw new AppError('CONFLICT', 'Already exists', { name: ['Unavailable'] });
      },
    });
    expect(await action({})).toEqual({
      ok: false,
      error: {
        code: 'CONFLICT',
        message: 'Already exists',
        fieldErrors: { name: ['Unavailable'] },
      },
    });
  });

  it('logs unexpected failures without exposing their details in the result', async () => {
    const error = new Error('private database detail');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const action = createAction({
        input: z.object({}),
        auth: 'public',
        handler: async () => {
          throw error;
        },
      });
      expect(await action({})).toEqual({
        ok: false,
        error: { code: 'INTERNAL', message: 'An internal error occurred' },
      });
      expect(log).toHaveBeenCalledWith({ scope: 'action', err: error });
    } finally {
      log.mockRestore();
    }
  });
});
