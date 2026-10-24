import { createHash, randomUUID } from 'node:crypto';
import { neon, type Pool } from '@neondatabase/serverless';
import { eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import * as relations from '../../db/relations';
import * as tables from '../../db/schema';
import {
  account,
  collections,
  creatorProfiles,
  favorites,
  rateLimit,
  session,
  themes,
  user,
} from '../../db/schema';
import type { AccountCleanupPlan } from '../../lib/account';
import { specHash } from '../../lib/render/hash';
import { themeSpecSchema } from '../../lib/render/spec';

vi.mock('server-only', () => ({}));
const cleanup = vi.hoisted(() => ({ schedule: vi.fn() }));
vi.mock('../../server/account-cleanup', () => ({ scheduleAccountCleanup: cleanup.schedule }));

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim();
const schema = { ...tables, ...relations };

const signUpResponseSchema = z.object({
  token: z.string().min(1),
  user: z.object({
    id: z.string().min(1),
    email: z.email(),
    role: z.literal('user'),
    locale: z.literal('en'),
  }),
});

function sampleSpec() {
  return themeSpecSchema.parse({
    v: 1,
    palette: {
      mode: 'light',
      bg: '#faf8fc',
      surface: '#ffffff',
      primary: '#9734b1',
      accent: '#ff8b58',
      ink: '#16121d',
      inkMuted: '#665c76',
    },
    wallpaper: { kind: 'mesh', seed: 42, points: 5, softness: 0.5, grain: 0.08, colors: null },
    lockWallpaper: null,
    icons: {
      shape: 'squircle',
      fill: 'solid',
      bg: '#9734b1',
      bg2: null,
      glyphColor: '#ffffff',
      glyphWeight: 'regular',
      glyphScale: 0.55,
      border: null,
      sticker: null,
      shadow: false,
    },
    widgets: {
      style: 'glass',
      radius: 0.25,
      surface: '#ffffff',
      ink: '#16121d',
      accent: '#ff8b58',
    },
    type: { display: 'fraunces', body: 'readex-pro' },
    decor: ['sparkle', 'heart'],
  });
}

describe.skipIf(!TEST_DATABASE_URL)('Better Auth database integration', () => {
  let poolToClose: Pool | undefined;

  afterAll(async () => {
    try {
      await poolToClose?.end();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('creates a private session and deletes an account through its authenticated cleanup hook', async () => {
    const url = z.url({ protocol: /^postgres(?:ql)?$/ }).parse(TEST_DATABASE_URL);
    const db = drizzle({ client: neon(url), schema });
    const origin = 'http://localhost:3000';
    const ip = '203.0.113.42';
    const salt = `${randomUUID()}${randomUUID()}`;
    const email = `integration-${randomUUID()}@example.com`;
    const password = `Integration-${randomUUID()}!`;
    const draftId = randomUUID();
    const publishedId = randomUUID();
    const collectionId = randomUUID();
    const creatorHandle = `auth_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
    const hashIdentifier = (identifier: string): string =>
      createHash('sha256').update(identifier).update(salt).digest('hex');
    const rateKeys = ['/sign-up/email', '/delete-user'].map((path) =>
      hashIdentifier(`${ip}|${path}`),
    );

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

    try {
      const { pool } = await import('../../db/pool');
      poolToClose = pool;
      const { auth } = await import('../../server/auth');
      const headers = {
        'content-type': 'application/json',
        origin,
        'x-forwarded-for': ip,
      };
      const signUpResponse = await auth.handler(
        new Request(`${origin}/api/auth/sign-up/email`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ name: 'Integration account', email, password }),
        }),
      );

      expect(signUpResponse.status).toBe(200);
      const signedUp = signUpResponseSchema.parse(await signUpResponse.json());
      expect(signedUp.user.email).toBe(email);

      const cookie = signUpResponse.headers
        .getSetCookie()
        .map((value) => value.split(';', 1)[0] ?? '')
        .filter(Boolean)
        .join('; ');
      expect(cookie.length).toBeGreaterThan(0);

      expect(
        await db
          .select({ role: user.role, locale: user.locale })
          .from(user)
          .where(eq(user.id, signedUp.user.id)),
      ).toEqual([{ role: 'user', locale: 'en' }]);
      expect(
        await db
          .select({ ipAddress: session.ipAddress })
          .from(session)
          .where(eq(session.userId, signedUp.user.id)),
      ).toEqual([{ ipAddress: hashIdentifier(ip) }]);

      const spec = sampleSpec();
      const hash = await specHash(spec);
      const themeValues = {
        ownerId: signedUp.user.id,
        source: 'creator' as const,
        nameEn: 'Integration lavender',
        spec,
        specHash: hash,
      };
      await db.insert(themes).values([
        {
          ...themeValues,
          id: draftId,
          slug: `integration-draft-${draftId}`,
          status: 'draft',
        },
        {
          ...themeValues,
          id: publishedId,
          slug: `integration-published-${publishedId}`,
          status: 'published',
          publishedAt: new Date(),
        },
      ]);
      await db.insert(collections).values({
        id: collectionId,
        kind: 'user',
        ownerId: signedUp.user.id,
        titleEn: 'Integration private collection',
      });
      await db.insert(favorites).values({ userId: signedUp.user.id, themeId: publishedId });
      await db
        .insert(creatorProfiles)
        .values({
          userId: signedUp.user.id,
          handle: creatorHandle,
          displayName: 'Disposable auth creator',
          isAdult: true,
          status: 'approved',
        });
      const handedOff: {
        plan: AccountCleanupPlan;
        remainingAccounts: number;
        remainingDrafts: number;
      }[] = [];
      cleanup.schedule.mockImplementation(async (plan: AccountCleanupPlan) => {
        const remaining = await db
          .select({ id: user.id })
          .from(user)
          .where(eq(user.id, plan.userId));
        const drafts = await db
          .select({ id: themes.id })
          .from(themes)
          .where(eq(themes.id, draftId));
        handedOff.push({
          plan,
          remainingAccounts: remaining.length,
          remainingDrafts: drafts.length,
        });
      });

      const deleteResponse = await auth.handler(
        new Request(`${origin}/api/auth/delete-user`, {
          method: 'POST',
          headers: { ...headers, cookie },
          body: JSON.stringify({ password }),
        }),
      );

      expect(deleteResponse.status).toBe(200);
      expect(
        z
          .object({ success: z.literal(true), message: z.literal('User deleted') })
          .parse(await deleteResponse.json()),
      ).toEqual({ success: true, message: 'User deleted' });
      expect(cleanup.schedule).toHaveBeenCalledOnce();
      expect(handedOff).toEqual([
        {
          plan: {
            userId: signedUp.user.id,
            keys: [],
            prefixes: [`themes/${draftId}/`],
            tags: ['themes', 'collections', `creator:${creatorHandle}`],
          },
          remainingAccounts: 0,
          remainingDrafts: 0,
        },
      ]);
      expect(
        await db
          .select({ id: themes.id, ownerId: themes.ownerId, status: themes.status })
          .from(themes)
          .where(inArray(themes.id, [draftId, publishedId])),
      ).toEqual([{ id: publishedId, ownerId: null, status: 'published' }]);
      expect(
        await db.select({ id: user.id }).from(user).where(eq(user.id, signedUp.user.id)),
      ).toEqual([]);
      expect(await db.select().from(collections).where(eq(collections.id, collectionId))).toEqual(
        [],
      );
      expect(
        await db.select().from(favorites).where(eq(favorites.userId, signedUp.user.id)),
      ).toEqual([]);
      expect(
        await db
          .select({ id: session.id })
          .from(session)
          .where(eq(session.userId, signedUp.user.id)),
      ).toEqual([]);
      expect(
        await db
          .select({ id: account.id })
          .from(account)
          .where(eq(account.userId, signedUp.user.id)),
      ).toEqual([]);

      const buckets = await db
        .select({ key: rateLimit.key, count: rateLimit.count })
        .from(rateLimit)
        .where(inArray(rateLimit.key, rateKeys));
      expect(buckets.map(({ key }) => key).sort()).toEqual([...rateKeys].sort());
      for (const bucket of buckets) {
        expect(bucket.key).toMatch(/^[a-f0-9]{64}$/);
        expect(bucket.key.includes(ip)).toBe(false);
        expect(bucket.count).toBe(1);
      }
      expect(
        await db
          .select({ id: rateLimit.id })
          .from(rateLimit)
          .where(sql`${rateLimit.key} LIKE ${`%${ip}%`}`),
      ).toEqual([]);
    } finally {
      await db.delete(collections).where(eq(collections.id, collectionId));
      await db.delete(themes).where(inArray(themes.id, [draftId, publishedId]));
      await db.delete(user).where(eq(user.email, email));
      await db.delete(rateLimit).where(inArray(rateLimit.key, rateKeys));
    }
  }, 60_000);
});
