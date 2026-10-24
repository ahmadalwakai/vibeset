import { randomUUID } from 'node:crypto';
import { neon, type Pool } from '@neondatabase/serverless';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { user } from '../../db/schema/auth';
import { auditLog } from '../../db/schema/system';
import type { auth as Auth } from '../../server/auth';
import type * as Guards from '../../server/guards';
import type * as Users from '../../server/services/users';

vi.mock('server-only', () => ({}));
const holder = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock('next/headers', () => ({ headers: async (): Promise<Headers> => holder.headers }));
// Authority is the subject here; the independently tested limiter needs no fixture rows.
vi.mock('../../server/auth-rate-limit', () => ({
  consumeAuthRateLimit: async () => ({ allowed: true, retryAfter: null }),
}));
const testUrl = process.env.TEST_DATABASE_URL?.trim(),
  origin = 'http://localhost:3000';
const emails = new Set<string>(),
  ids = new Set<string>();

describe.skipIf(!testUrl)('moderation takes effect on the next authoritative request', () => {
  let database: ReturnType<typeof drizzle>,
    auth: typeof Auth,
    guards: typeof Guards,
    users: typeof Users,
    pool: Pool | undefined;
  beforeAll(async () => {
    expect(process.env.VERCEL_ENV).not.toBe('production');
    const url = z.url({ protocol: /^postgres(?:ql)?$/ }).parse(testUrl);
    const host = (value: string): string => new URL(value).hostname.replace(/-pooler(?=\.)/, '');
    for (const ordinary of [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED])
      if (ordinary) expect(host(url)).not.toBe(host(ordinary));
    database = drizzle({ client: neon(url) });
    for (const [key, value] of Object.entries({
      DATABASE_URL: url,
      DATABASE_URL_UNPOOLED: url,
      BETTER_AUTH_URL: origin,
      NEXT_PUBLIC_SITE_URL: origin,
      NEXT_PUBLIC_CDN_URL: 'https://cdn.example.invalid',
      BETTER_AUTH_SECRET: `${randomUUID()}${randomUUID()}`,
      IP_HASH_SALT: `${randomUUID()}${randomUUID()}`,
      CRON_SECRET: 'c'.repeat(32),
      INTERNAL_API_SECRET: 'i'.repeat(32),
      E2E_TEST_AUTH: '1',
      NODE_ENV: 'test',
    }))
      vi.stubEnv(key, value);
    for (const key of [
      'VERCEL_ENV',
      'SKIP_ENV_VALIDATION',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'RESEND_API_KEY',
      'BETTER_AUTH_TRUSTED_ORIGINS',
    ])
      vi.stubEnv(key, undefined);
    pool = (await import('../../db/pool')).pool;
    ({ auth } = await import('../../server/auth'));
    guards = await import('../../server/guards');
    users = await import('../../server/services/users');
  });
  afterAll(async () => {
    try {
      if (database && ids.size)
        await database.delete(auditLog).where(inArray(auditLog.entityId, [...ids]));
      if (database && emails.size)
        await database.delete(user).where(inArray(user.email, [...emails]));
    } finally {
      await pool?.end();
      vi.unstubAllEnvs();
    }
  });
  async function signUp(): Promise<{
    id: string;
    cookie: string;
    email: string;
    password: string;
  }> {
    const email = `p14-authority-${randomUUID()}@example.invalid`;
    emails.add(email);
    const password = `Fixture-${randomUUID()}!`;
    const response = await auth.handler(
      new Request(`${origin}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin, 'x-forwarded-for': '203.0.113.219' },
        body: JSON.stringify({ name: 'Disposable authority fixture', email, password }),
      }),
    );
    expect(response.status).toBe(200);
    const body = z
      .object({ user: z.object({ id: z.string().min(1) }) })
      .parse(await response.json());
    ids.add(body.user.id);
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(';', 1)[0] ?? '')
      .filter(Boolean)
      .join('; ');
    expect(/better-auth\.session_data(?:\.\d+)?=/.test(cookie)).toBe(true);
    return { id: body.user.id, cookie, email, password };
  }
  async function signIn(person: { email: string; password: string }): Promise<string> {
    const response = await auth.handler(
      new Request(`${origin}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin },
        body: JSON.stringify({ email: person.email, password: person.password }),
      }),
    );
    expect(response.status).toBe(200);
    return response.headers
      .getSetCookie()
      .map((value) => value.split(';', 1)[0] ?? '')
      .filter(Boolean)
      .join('; ');
  }
  it('rejects stale signed cookie caches after role change and ban', async () => {
    const admin = await signUp(),
      target = await signUp();
    // Exact disposable fixtures only; never elevate an existing account.
    await database
      .update(user)
      .set({ role: 'admin' })
      .where(inArray(user.id, [admin.id, target.id]));
    // Cache an actual admin role in the signed cookie before revoking it.
    const adminCookie = await signIn(target);
    holder.headers = new Headers({ cookie: adminCookie });
    expect((await guards.requireAdmin()).user.id).toBe(target.id);
    const actor = {
      kind: 'user' as const,
      userId: admin.id,
      role: 'admin' as const,
      isCreator: false,
    };
    await users.adminSetRole({ userId: target.id, role: 'user' }, actor);
    await expect(guards.requireAdmin()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    holder.headers = new Headers({ cookie: await signIn(target) });
    await expect(guards.requireAdmin()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const another = await signUp();
    holder.headers = new Headers({ cookie: another.cookie });
    expect((await guards.requireUser()).user.id).toBe(another.id);
    await users.adminBanUser({ userId: another.id, reason: 'Verified abuse' }, actor);
    await expect(guards.requireUser()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    const response = await auth.handler(
      new Request(`${origin}/api/auth/update-user?disableCookieCache=false`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin, cookie: another.cookie },
        body: JSON.stringify({ name: 'Unauthorized change' }),
      }),
    );
    expect(response.status).toBe(401);
    expect(
      (await database.select({ name: user.name }).from(user).where(eq(user.id, another.id)))[0]
        ?.name,
    ).toBe('Disposable authority fixture');
  }, 30_000);
});
