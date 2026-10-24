import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getSessionCookie } from 'better-auth/cookies';
import { nextCookies } from 'better-auth/next-js';
import { admin, magicLink } from 'better-auth/plugins';
import { env } from '../lib/env.server';
import type { AuthRateLimitDecision } from '../lib/auth';
import { disabledAuthPaths } from '../lib/auth';
import { dbPool } from '../db/pool';
import * as schema from '../db/schema/index';

if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
  throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured together');
}

export const auth = betterAuth({
  appName: 'Vibeset',
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  disabledPaths: disabledAuthPaths,
  trustedOrigins: [env.NEXT_PUBLIC_SITE_URL, ...env.BETTER_AUTH_TRUSTED_ORIGINS],
  database: drizzleAdapter(dbPool, { provider: 'pg', schema }),
  emailAndPassword: { enabled: env.E2E_TEST_AUTH === '1' },
  socialProviders:
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            prompt: 'select_account',
          },
        }
      : {},
  session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
  rateLimit: {
    enabled: true,
    storage: 'database',
    customStorage: {
      consume: async (key, rule): Promise<AuthRateLimitDecision> => {
        const { consumeAuthRateLimit } = await import('./auth-rate-limit');
        return consumeAuthRateLimit(key, rule);
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (context) => {
      if (context.path === '/get-session' || context.path === '/sign-out') return;
      // Core account endpoints must not recover a revoked session from its cookie cache.
      if (context.headers && getSessionCookie(context.headers)) {
        const current = await getAuthoritativeSessionFromCtx(context);
        if (current?.user.banned === true) {
          throw new APIError('FORBIDDEN', {
            code: 'BANNED_USER',
            message: 'This account is unavailable',
          });
        }
      }
      return { context: { query: { ...context.query, disableCookieCache: true } } };
    }),
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session): Promise<{ data: typeof session }> => {
          const { hashAuthIdentifier } = await import('./auth-privacy');
          return {
            data: {
              ...session,
              ipAddress: session.ipAddress ? hashAuthIdentifier(session.ipAddress) : null,
            },
          };
        },
      },
    },
  },
  user: {
    additionalFields: {
      locale: { type: 'string', required: false, defaultValue: 'en', input: true },
    },
    deleteUser: {
      enabled: true,
      beforeDelete: async (user): Promise<void> => {
        const { deleteAccountAndContent } = await import('./services/account');
        const plan = await deleteAccountAndContent(user.id);
        // The user is already deleted by the confirmed transaction. Schedule
        // cleanup before Better Auth's idempotent adapter pass and cookie clear.
        try {
          const { scheduleAccountCleanup } = await import('./account-cleanup');
          await scheduleAccountCleanup(plan);
        } catch {
          console.error({ scope: 'account.storage-cleanup-scheduling', failed: true });
        }
      },
    },
  },
  plugins: [
    magicLink({
      expiresIn: 600,
      sendMagicLink: async ({ email, url }): Promise<void> => {
        const { sendMagicLinkEmail } = await import('./email');
        await sendMagicLinkEmail({ to: email, url });
      },
    }),
    admin({ defaultRole: 'user', adminRoles: ['admin'] }),
    nextCookies(),
  ],
});
