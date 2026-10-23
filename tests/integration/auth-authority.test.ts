import { createHash, randomUUID } from 'node:crypto';
import { neon, type Pool } from '@neondatabase/serverless';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { rateLimit, session, user } from '../../db/schema/auth';
import type { auth as configuredAuth } from '../../server/auth';

vi.mock('server-only', () => ({}));

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();
const origin = 'http://localhost:3000';
const salt = `${randomUUID()}${randomUUID()}`;
const createdEmails = new Set<string>();
const createdRateKeys = new Set<string>();

function createDatabase(url: string) {
  return drizzle({ client: neon(url) });
}

const signUpSchema = z.object({
  token: z.string().min(1),
  user: z.object({ id: z.string().min(1), email: z.email() }),
});

// Explicit expected plugin surface, rather than deriving coverage from the disabled list.
const adminPaths = [
  '/admin/set-role',
  '/admin/get-user',
  '/admin/create-user',
  '/admin/update-user',
  '/admin/list-users',
  '/admin/list-user-sessions',
  '/admin/unban-user',
  '/admin/ban-user',
  '/admin/impersonate-user',
  '/admin/stop-impersonating',
  '/admin/revoke-user-session',
  '/admin/revoke-user-sessions',
  '/admin/remove-user',
  '/admin/set-user-password',
  '/admin/has-permission',
];

describe.skipIf(!TEST_DATABASE_URL)('authoritative Better Auth account endpoints', () => {
  let database: ReturnType<typeof createDatabase> | undefined;
  let auth: typeof configuredAuth;
  let poolToClose: Pool | undefined;

  beforeAll(async () => {
    const url = z.url({ protocol: /^postgres(?:ql)?$/ }).parse(TEST_DATABASE_URL);
    database = createDatabase(url);
    for (const [key, value] of Object.entries({
      DATABASE_URL: url,
      DATABASE_URL_UNPOOLED: url,
      BETTER_AUTH_URL: origin,
      NEXT_PUBLIC_SITE_URL: origin,
      BETTER_AUTH_SECRET: `${randomUUID()}${randomUUID()}`,
      IP_HASH_SALT: salt,
      CRON_SECRET: 'c'.repeat(32),
      INTERNAL_API_SECRET: 'i'.repeat(32),
      E2E_TEST_AUTH: '1',
      NODE_ENV: 'test',
    })) {
      vi.stubEnv(key, value);
    }
    vi.stubEnv('VERCEL_ENV', undefined);
    vi.stubEnv('SKIP_ENV_VALIDATION', undefined);
    vi.stubEnv('GOOGLE_CLIENT_ID', undefined);
    vi.stubEnv('GOOGLE_CLIENT_SECRET', undefined);
    vi.stubEnv('RESEND_API_KEY', undefined);
    vi.stubEnv('BETTER_AUTH_TRUSTED_ORIGINS', undefined);

    const { pool } = await import('../../db/pool');
    poolToClose = pool;
    ({ auth } = await import('../../server/auth'));
  });

  afterEach(async () => {
    if (!database) return;
    if (createdEmails.size > 0) {
      await database.delete(user).where(inArray(user.email, [...createdEmails]));
    }
    if (createdRateKeys.size > 0) {
      await database.delete(rateLimit).where(inArray(rateLimit.key, [...createdRateKeys]));
    }
    createdEmails.clear();
    createdRateKeys.clear();
  });

  afterAll(async () => {
    try {
      await poolToClose?.end();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  async function request(
    path: string,
    ip: string,
    body: Record<string, unknown>,
    cookie?: string,
  ): Promise<Response> {
    const pathname = new URL(path, origin).pathname;
    createdRateKeys.add(
      createHash('sha256').update(`${ip}|${pathname}`).update(salt).digest('hex'),
    );
    return auth.handler(
      new Request(`${origin}/api/auth${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin,
          'x-forwarded-for': ip,
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify(body),
      }),
    );
  }

  async function signUp(ip: string): Promise<{ id: string; cookie: string; name: string }> {
    const email = `integration-authority-${randomUUID()}@example.com`;
    const name = `Authority test ${randomUUID()}`;
    createdEmails.add(email);
    const response = await request('/sign-up/email', ip, {
      name,
      email,
      password: `Integration-${randomUUID()}!`,
    });
    expect(response.status).toBe(200);
    const result = signUpSchema.parse(await response.json());
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(';', 1)[0] ?? '')
      .filter(Boolean)
      .join('; ');
    expect(/better-auth\.session_data(?:\.\d+)?=/.test(cookie)).toBe(true);
    return { id: result.user.id, cookie, name };
  }

  it('rejects a revoked session even while its signed cookie cache remains valid', async () => {
    if (!database) throw new Error('An isolated test database is required');
    const ip = '203.0.113.61';
    const signedIn = await signUp(ip);
    await database.delete(session).where(eq(session.userId, signedIn.id));

    // An explicit false must not override the server's authoritative-session policy.
    const response = await request(
      '/update-user?disableCookieCache=false',
      ip,
      { name: 'Unauthorized change' },
      signedIn.cookie,
    );
    expect(response.status).toBe(401);
    expect(
      await database.select({ name: user.name }).from(user).where(eq(user.id, signedIn.id)),
    ).toEqual([{ name: signedIn.name }]);
  }, 30_000);

  it('blocks a freshly banned user but still permits sign-out', async () => {
    if (!database) throw new Error('An isolated test database is required');
    const ip = '203.0.113.62';
    const signedIn = await signUp(ip);
    await database.update(user).set({ banned: true }).where(eq(user.id, signedIn.id));

    const update = await request('/update-user', ip, { name: 'Banned change' }, signedIn.cookie);
    expect(update.status).toBe(403);
    expect(z.object({ code: z.literal('BANNED_USER') }).parse(await update.json())).toMatchObject({
      code: 'BANNED_USER',
    });
    expect(
      await database.select({ name: user.name }).from(user).where(eq(user.id, signedIn.id)),
    ).toEqual([{ name: signedIn.name }]);

    const signedOut = await request('/sign-out', ip, {}, signedIn.cookie);
    expect(signedOut.status).toBe(200);
    expect(z.object({ success: z.literal(true) }).parse(await signedOut.json())).toMatchObject({
      success: true,
    });
    expect(
      await database
        .select({ id: session.id })
        .from(session)
        .where(eq(session.userId, signedIn.id)),
    ).toEqual([]);
  }, 30_000);

  it('keeps every administration HTTP endpoint disabled for a disposable signed-in admin', async () => {
    if (!database) throw new Error('An isolated test database is required');
    const ip = '203.0.113.63';
    const signedIn = await signUp(ip);
    // Fixture-only role assignment: the selected row was created by this test.
    await database.update(user).set({ role: 'admin' }).where(eq(user.id, signedIn.id));
    const current = await auth.api.getSession({
      headers: new Headers({ cookie: signedIn.cookie }),
      query: { disableCookieCache: true },
    });
    expect(current?.user.role).toBe('admin');

    for (const path of [...adminPaths, '/admin/set-role/', '/admin/%73et-role']) {
      const response = await request(
        path,
        ip,
        { userId: signedIn.id, role: 'user' },
        signedIn.cookie,
      );
      expect(response.status, path).toBe(404);
    }
    expect(
      await database.select({ role: user.role }).from(user).where(eq(user.id, signedIn.id)),
    ).toEqual([{ role: 'admin' }]);
  }, 30_000);
});
