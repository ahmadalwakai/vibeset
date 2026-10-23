import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  session: vi.fn(),
  profile: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(),
  locale: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next-intl/server', () => ({ getLocale: mocks.locale }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock('@/server/auth', () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock('@/db', () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: mocks.profile }) }) }) },
}));

import {
  getSession,
  requireAdmin,
  requireAdminPage,
  requireCreator,
  requireCreatorPage,
  requireUser,
  requireUserPage,
} from '@/server/guards';

const signedIn = {
  session: { id: 'session', userId: 'user' },
  user: { id: 'user', role: 'user', banned: false },
};

describe('server authorization guards', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.headers.mockResolvedValue(new Headers({ cookie: 'better-auth.session_token=present' }));
    mocks.session.mockResolvedValue(signedIn);
    mocks.profile.mockResolvedValue([]);
    mocks.locale.mockResolvedValue('en');
    mocks.redirect.mockImplementation((path: string) => {
      throw new Error(`redirect:${path}`);
    });
    mocks.notFound.mockImplementation(() => {
      throw new Error('not-found');
    });
  });

  it('does not initialize auth or query the database without a session cookie', async () => {
    mocks.headers.mockResolvedValue(new Headers());
    expect(await getSession()).toBeNull();
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it('forces a fresh server session for revocation and role checks', async () => {
    expect(await requireUser()).toEqual(signedIn);
    expect(mocks.session).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      query: { disableCookieCache: true },
    });
    mocks.session.mockResolvedValue(null);
    await expect(requireUser()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it.each([requireUser, requireCreator, requireAdmin])(
    'blocks banned users at every role level',
    async (guard) => {
      mocks.session.mockResolvedValue({
        ...signedIn,
        user: { ...signedIn.user, role: 'admin', banned: true },
      });
      await expect(guard()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    },
  );

  it.each(['pending', 'rejected', 'suspended'])('refuses %s creator profiles', async (status) => {
    mocks.profile.mockResolvedValue([{ userId: 'user', status }]);
    await expect(requireCreator()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('allows an approved creator and an admin without a creator profile', async () => {
    mocks.profile.mockResolvedValue([{ userId: 'user', status: 'approved' }]);
    expect(await requireCreator()).toMatchObject({ creator: { status: 'approved' } });
    mocks.profile.mockResolvedValue([]);
    mocks.session.mockResolvedValue({ ...signedIn, user: { ...signedIn.user, role: 'admin' } });
    expect(await requireCreator()).toMatchObject({ creator: null });
    await expect(requireAdmin()).resolves.toMatchObject({ user: { role: 'admin' } });
  });

  it('does not treat a creator as an administrator', async () => {
    mocks.profile.mockResolvedValue([{ userId: 'user', status: 'approved' }]);
    await expect(requireAdmin()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('keeps locale and repeated query parameters in a safe page sign-in redirect', async () => {
    mocks.session.mockResolvedValue(null);
    mocks.locale.mockResolvedValue('ar');
    await expect(requireUserPage('/account?tag=a&tag=b')).rejects.toThrow('redirect:');
    expect(mocks.redirect).toHaveBeenCalledWith(
      '/ar/sign-in?next=%2Far%2Faccount%3Ftag%3Da%26tag%3Db',
    );
  });

  it.each([requireAdminPage, requireCreatorPage])('hides wrong-role pages', async (guard) => {
    await expect(guard()).rejects.toThrow('not-found');
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });
});
