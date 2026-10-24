import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { authClient } from '../../../lib/auth-client';

type Session = typeof authClient.$Infer.Session;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('single auth client with server-inferred admin fields', () => {
  it('retains plugin session fields without adding an admin permission runtime', () => {
    expectTypeOf<Session['user']['role']>().toEqualTypeOf<string | null | undefined>();
    expectTypeOf<Session['user']['banned']>().toEqualTypeOf<boolean | null | undefined>();
    expectTypeOf<Session['session']['impersonatedBy']>().toEqualTypeOf<string | null | undefined>();
  });

  it('keeps magic-link sign-in and sign-out requests functional on the same client', async () => {
    // Better Auth also resolves server-side test URLs from its environment.
    // Keep this transport-only test independent of any loaded app configuration.
    const origin = 'https://auth-client-fixture.example.invalid';
    vi.stubEnv('BETTER_AUTH_URL', origin);
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ status: true }), {
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { authClient: client } = await import('../../../lib/auth-client');
    expect(fetchMock).not.toHaveBeenCalled();

    const result = await client.signIn.magicLink({
      email: 'auth-client-fixture@example.invalid',
      callbackURL: '/en/saved',
    });
    expect(result.error).toBeNull();
    const signIn = fetchMock.mock.calls[0];
    expect(new URL(String(signIn?.[0])).href).toBe(`${origin}/api/auth/sign-in/magic-link`);
    expect(signIn?.[1]).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(JSON.parse(String(signIn?.[1]?.body))).toMatchObject({
      email: 'auth-client-fixture@example.invalid',
      callbackURL: '/en/saved',
    });

    expect((await client.signOut()).error).toBeNull();
    expect(new URL(String(fetchMock.mock.calls[1]?.[0])).href).toBe(`${origin}/api/auth/sign-out`);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
